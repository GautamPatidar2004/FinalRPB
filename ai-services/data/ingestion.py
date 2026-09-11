import csv
import io
from typing import Any, Dict, List, Optional, Tuple
from schemas.railway import Department, Priority
from db.repository import repository
from data.csv_handler import CSV_REQUIRED_COLUMNS


def normalize_department(dept_str: str) -> Optional[Department]:
    """Normalizes informal department strings to official railway Department enums."""
    d = dept_str.strip().lower()
    if "eng" in d or "civil" in d or "track" in d:
        return Department.ENG
    if "trd" in d or "trac" in d or "ohe" in d or "electrical" in d:
        return Department.TRD
    if "snt" in d or "sig" in d or "tele" in d:
        return Department.SNT
    return None


def normalize_urgency(urg_str: str) -> Optional[Priority]:
    """Normalizes urgency string to Priority enum."""
    u = urg_str.strip().upper()
    try:
        return Priority(u)
    except ValueError:
        return None


def parse_bool(val: Any, default: bool = False) -> bool:
    """Parses various truthy representations into boolean."""
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("1", "true", "t", "yes", "y"):
        return True
    if s in ("0", "false", "f", "no", "n"):
        return False
    return default


def ingest_requests_csv(
    csv_text: str,
    skip_duplicates: bool = True,
    fail_on_first_error: bool = False,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Validates and ingests maintenance block requests from CSV text in-memory.
    Never persists the raw CSV to disk.
    Performs full relational and domain constraint checks.
    """
    clean_text = csv_text.strip()
    if not clean_text:
        return False, {"error": "CSV payload cannot be empty."}

    f = io.StringIO(clean_text)
    reader = csv.DictReader(f)

    headers = reader.fieldnames or []
    missing_cols = [col for col in CSV_REQUIRED_COLUMNS if col not in headers]
    if missing_cols:
        return False, {
            "error": f"Missing required columns in CSV: {', '.join(missing_cols)}",
            "required_columns": CSV_REQUIRED_COLUMNS,
            "found_columns": headers,
        }

    rows_to_insert = []
    row_errors = []
    seen_in_batch = set()
    skipped_duplicates = 0

    # Cache existing corridors and assets for relational validation
    corridors = {c["corridor_id"]: c for c in repository.list_corridors()}
    assets = {a["asset_id"]: a for a in repository.list_assets()}

    for row_idx, row in enumerate(reader, start=2):  # row 1 is header
        current_errors = []
        req_id = row.get("request_id", "").strip()
        if not req_id:
            current_errors.append("request_id cannot be blank.")

        # Duplicate check within batch
        if req_id in seen_in_batch:
            if skip_duplicates:
                skipped_duplicates += 1
                continue
            else:
                current_errors.append(f"Duplicate request_id '{req_id}' within CSV batch.")
        seen_in_batch.add(req_id)

        # Duplicate check against existing repository
        if repository.get_request(req_id):
            if skip_duplicates:
                skipped_duplicates += 1
                continue
            else:
                current_errors.append(f"Request '{req_id}' already exists in database.")

        # Department validation & normalization
        raw_dept = row.get("department", "")
        dept = normalize_department(raw_dept)
        if not dept:
            current_errors.append(f"Invalid department '{raw_dept}'. Must be Engineering, TRD, or Signalling & Telecom.")

        # Urgency validation & normalization
        raw_urgency = row.get("urgency", "")
        urgency = normalize_urgency(raw_urgency)
        if not urgency:
            current_errors.append(f"Invalid urgency '{raw_urgency}'. Must be CRITICAL, HIGH, MEDIUM, or LOW.")

        # Corridor existence
        corridor_id = row.get("corridor_id", "").strip()
        if not corridor_id:
            current_errors.append("corridor_id cannot be blank.")
        elif corridor_id not in corridors:
            current_errors.append(f"Corridor '{corridor_id}' does not exist.")

        # Asset existence & relationship to corridor
        asset_id = row.get("asset_id", "").strip()
        if not asset_id:
            current_errors.append("asset_id cannot be blank.")
        elif asset_id not in assets:
            current_errors.append(f"Asset '{asset_id}' does not exist.")
        else:
            asset_record = assets[asset_id]
            if corridor_id and asset_record.get("corridor_id") != corridor_id:
                current_errors.append(
                    f"Asset '{asset_id}' belongs to corridor '{asset_record.get('corridor_id')}', not '{corridor_id}'."
                )

        # Duration & Time Windows
        try:
            req_dur = int(float(row.get("required_duration_minutes", 0)))
            if req_dur < 15 or req_dur > 720:
                current_errors.append(f"required_duration_minutes ({req_dur}) must be between 15 and 720.")
        except ValueError:
            current_errors.append(f"Invalid integer for required_duration_minutes: '{row.get('required_duration_minutes')}'.")
            req_dur = 0

        try:
            earliest_start = int(float(row.get("earliest_start_minute", 0)))
            if earliest_start < 0:
                current_errors.append(f"earliest_start_minute ({earliest_start}) must be >= 0.")
        except ValueError:
            current_errors.append(f"Invalid integer for earliest_start_minute: '{row.get('earliest_start_minute')}'.")
            earliest_start = 0

        try:
            latest_end = int(float(row.get("latest_end_minute", 1440)))
            if latest_end > 1440:
                current_errors.append(f"latest_end_minute ({latest_end}) must be <= 1440.")
        except ValueError:
            current_errors.append(f"Invalid integer for latest_end_minute: '{row.get('latest_end_minute')}'.")
            latest_end = 1440

        if req_dur > 0 and latest_end - earliest_start < req_dur:
            current_errors.append(
                f"Required duration ({req_dur}m) exceeds available window ({latest_end - earliest_start}m "
                f"from {earliest_start} to {latest_end})."
            )

        if current_errors:
            row_errors.append({
                "row": row_idx,
                "request_id": req_id,
                "errors": current_errors,
            })
            if fail_on_first_error:
                break
        else:
            rows_to_insert.append({
                "request_id": req_id,
                "department": dept.value,
                "urgency": urgency.value,
                "corridor_id": corridor_id,
                "asset_id": asset_id,
                "required_duration_minutes": req_dur,
                "earliest_start_minute": earliest_start,
                "latest_end_minute": latest_end,
                "is_traffic_block_required": parse_bool(row.get("is_traffic_block_required"), default=True),
                "is_power_block_required": parse_bool(row.get("is_power_block_required"), default=False),
                "linked_defect_id": row.get("linked_defect_id", "").strip() or None,
            })

    if row_errors:
        return False, {
            "error": "CSV contains invalid or inconsistent records.",
            "total_rows_evaluated": row_idx - 1,
            "row_error_count": len(row_errors),
            "row_errors": row_errors,
        }

    # Persist validated records
    inserted_count = 0
    for record in rows_to_insert:
        repository.create_request(record)
        inserted_count += 1

    return True, {
        "status": "success",
        "total_rows_evaluated": len(rows_to_insert) + skipped_duplicates,
        "inserted_count": inserted_count,
        "skipped_duplicates": skipped_duplicates,
    }


def ingest_requests_batch(
    requests_data: List[Dict[str, Any]],
    skip_duplicates: bool = True,
) -> Tuple[bool, Dict[str, Any]]:
    """Validates and persists a batch of maintenance requests provided in JSON format."""
    if not requests_data:
        return False, {"error": "Batch requests list cannot be empty."}

    corridors = {c["corridor_id"]: c for c in repository.list_corridors()}
    assets = {a["asset_id"]: a for a in repository.list_assets()}

    rows_to_insert = []
    row_errors = []
    seen_in_batch = set()
    skipped_duplicates = 0

    for idx, item in enumerate(requests_data, start=1):
        errors = []
        req_id = item.get("request_id", "").strip()
        if not req_id:
            errors.append("request_id cannot be blank.")

        if req_id in seen_in_batch:
            if skip_duplicates:
                skipped_duplicates += 1
                continue
            else:
                errors.append(f"Duplicate request_id '{req_id}' in batch payload.")
        seen_in_batch.add(req_id)

        if repository.get_request(req_id):
            if skip_duplicates:
                skipped_duplicates += 1
                continue
            else:
                errors.append(f"Request '{req_id}' already exists in database.")

        # Department
        raw_dept = item.get("department", "")
        dept = normalize_department(str(raw_dept))
        if not dept:
            errors.append(f"Invalid department '{raw_dept}'.")

        # Urgency
        raw_urgency = item.get("urgency", "MEDIUM")
        urgency = normalize_urgency(str(raw_urgency))
        if not urgency:
            errors.append(f"Invalid urgency '{raw_urgency}'.")

        # Corridor
        corridor_id = item.get("corridor_id", "").strip()
        if not corridor_id or corridor_id not in corridors:
            errors.append(f"Corridor '{corridor_id}' does not exist.")

        # Asset
        asset_id = item.get("asset_id", "").strip()
        if not asset_id or asset_id not in assets:
            errors.append(f"Asset '{asset_id}' does not exist.")
        elif corridor_id and assets[asset_id].get("corridor_id") != corridor_id:
            errors.append(f"Asset '{asset_id}' does not belong to corridor '{corridor_id}'.")

        # Duration & Window
        req_dur = item.get("required_duration_minutes", 0)
        e_start = item.get("earliest_start_minute", 0)
        l_end = item.get("latest_end_minute", 1440)
        if req_dur < 15 or req_dur > 720:
            errors.append(f"required_duration_minutes ({req_dur}) out of range (15-720).")
        if l_end - e_start < req_dur:
            errors.append(f"Duration ({req_dur}m) exceeds available window ({l_end - e_start}m).")

        if errors:
            row_errors.append({"index": idx, "request_id": req_id, "errors": errors})
        else:
            rows_to_insert.append({
                "request_id": req_id,
                "department": dept.value,
                "urgency": urgency.value,
                "corridor_id": corridor_id,
                "asset_id": asset_id,
                "required_duration_minutes": req_dur,
                "earliest_start_minute": e_start,
                "latest_end_minute": l_end,
                "is_traffic_block_required": bool(item.get("is_traffic_block_required", True)),
                "is_power_block_required": bool(item.get("is_power_block_required", False)),
                "linked_defect_id": item.get("linked_defect_id"),
            })

    if row_errors:
        return False, {
            "error": "Batch contains invalid or inconsistent records.",
            "total_items": len(requests_data),
            "errors": row_errors,
        }

    inserted_count = 0
    for rec in rows_to_insert:
        repository.create_request(rec)
        inserted_count += 1

    return True, {
        "status": "success",
        "total_items": len(requests_data),
        "inserted_count": inserted_count,
        "skipped_duplicates": skipped_duplicates,
    }
