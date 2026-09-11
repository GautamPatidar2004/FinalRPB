import csv
import io
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from schemas.railway import (
    Department,
    Priority,
    TrackType,
    MaintenanceBlockRequest,
    RailwayPlanningDataset,
)
from data.synthetic_generator import generate_synthetic_dataset
from models.features import extract_request_features

TRAINING_DATA_DIR = Path(__file__).resolve().parent / "training"
DEFAULT_TRAINING_CSV = TRAINING_DATA_DIR / "historical_maintenance.csv"

CSV_REQUIRED_COLUMNS = [
    "request_id",
    "department",
    "urgency",
    "corridor_id",
    "asset_id",
    "required_duration_minutes",
    "earliest_start_minute",
    "latest_end_minute",
    "is_traffic_block_required",
    "is_power_block_required",
]


def export_training_dataset_csv(
    filepath: Optional[Path] = None,
    dataset: Optional[RailwayPlanningDataset] = None,
) -> Path:
    """Exports a realistic, interconnected dataset into a standardized training CSV template."""
    out_path = filepath or DEFAULT_TRAINING_CSV
    out_path.parent.mkdir(parents=True, exist_ok=True)

    ds = dataset or generate_synthetic_dataset(num_requests=250, seed=42)
    defect_map = {d.defect_id: d for d in ds.defects}
    asset_map = {a.asset_id: a for a in ds.assets}

    rows = []
    for req in ds.block_requests:
        feat, factors, target_score = extract_request_features(req, ds)
        asset = asset_map.get(req.asset_id)
        defect = defect_map.get(req.linked_defect_id) if req.linked_defect_id else None

        rows.append({
            "request_id": req.request_id,
            "department": req.department.value,
            "urgency": req.urgency.value,
            "corridor_id": req.corridor_id,
            "asset_id": req.asset_id,
            "track_type": asset.track_type.value if asset else TrackType.BOTH.value,
            "required_duration_minutes": req.required_duration_minutes,
            "earliest_start_minute": req.earliest_start_minute,
            "latest_end_minute": req.latest_end_minute,
            "is_traffic_block_required": 1 if req.is_traffic_block_required else 0,
            "is_power_block_required": 1 if req.is_power_block_required else 0,
            "days_overdue": defect.days_overdue if defect else 0,
            "has_linked_defect": 1 if defect else 0,
            "conflicting_train_count": int(feat.get("conflicting_train_count", 0)),
            "target_priority_score": round(target_score, 2),
        })

    fieldnames = list(rows[0].keys())
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return out_path


def load_and_validate_training_csv(
    filepath: Optional[Path] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Validates and preprocesses training CSV data into feature matrix X and target y.
    Raises ValueError with detailed error messages if required columns are missing or malformed.
    """
    csv_path = filepath or DEFAULT_TRAINING_CSV
    if not csv_path.exists():
        # Generate initial template if missing
        export_training_dataset_csv(csv_path)

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        header = reader.fieldnames or []
        for col in CSV_REQUIRED_COLUMNS:
            if col not in header:
                raise ValueError(f"Training CSV '{csv_path}' is missing required column: '{col}'.")

        all_features = []
        all_targets = []

        for row_idx, row in enumerate(reader, start=2):
            try:
                # Preprocess fields
                req_dur = float(row["required_duration_minutes"])
                e_start = float(row["earliest_start_minute"])
                l_end = float(row["latest_end_minute"])
                w_dur = max(15.0, l_end - e_start)
                tightness = min(1.0, req_dur / w_dur)

                dept = row.get("department", "").strip()
                urgency = row.get("urgency", "").strip().upper()
                track = row.get("track_type", "").strip().upper()

                days_overdue = float(row.get("days_overdue", 0))
                has_defect = float(row.get("has_linked_defect", 1 if days_overdue > 0 else 0))
                train_conflicts = float(row.get("conflicting_train_count", 0))

                feat_dict = {
                    "is_traffic_block": float(row.get("is_traffic_block_required", 1)),
                    "is_power_block": float(row.get("is_power_block_required", 0)),
                    "required_duration": req_dur,
                    "window_duration": w_dur,
                    "tightness_ratio": tightness,
                    "days_overdue": days_overdue,
                    "has_linked_defect": has_defect,
                    "conflicting_train_count": train_conflicts,
                    "dept_eng": 1.0 if "Engineering" in dept or dept == "ENG" else 0.0,
                    "dept_trd": 1.0 if "Traction" in dept or dept == "TRD" else 0.0,
                    "dept_snt": 1.0 if "Signalling" in dept or dept == "SNT" else 0.0,
                    "track_both": 1.0 if track in ("BOTH", "SINGLE") else 0.0,
                    "urgency_critical": 1.0 if urgency == "CRITICAL" else 0.0,
                    "urgency_high": 1.0 if urgency == "HIGH" else 0.0,
                }

                # Target calculation
                if "target_priority_score" in row and row["target_priority_score"]:
                    target = float(row["target_priority_score"])
                else:
                    # Domain heuristic fallback target
                    base_sev = 40.0 if urgency == "CRITICAL" else (25.0 if urgency == "HIGH" else 15.0)
                    target = min(100.0, base_sev + min(25.0, days_overdue * 0.8) + (feat_dict["is_traffic_block"] * 10.0))

                all_features.append(feat_dict)
                all_targets.append(target)
            except Exception as ex:
                raise ValueError(f"Malformed data in CSV row {row_idx}: {str(ex)}")

    if not all_features:
        raise ValueError(f"Training CSV '{csv_path}' contains no data rows.")

    feature_names = list(all_features[0].keys())
    X = np.array([[row[col] for col in feature_names] for row in all_features], dtype=np.float32)
    y = np.array(all_targets, dtype=np.float32)

    return X, y, feature_names


def discover_and_load_training_csvs(
    data_dir: Optional[Path] = None,
    explicit_csv: Optional[Path] = None,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray, List[str], Dict[str, Any]]:
    """
    Discovers all valid training CSVs in `data_dir` (or uses `explicit_csv`),
    validates required columns, preprocesses them using standard domain logic,
    safely removes duplicate records, deterministically shuffles,
    and returns (X, y, feature_names, summary_report).
    """
    target_dir = data_dir or TRAINING_DATA_DIR

    # 1. Determine files to process
    candidate_files: List[Path] = []
    if explicit_csv:
        explicit_path = Path(explicit_csv)
        if not explicit_path.exists():
            raise FileNotFoundError(f"Specified training CSV does not exist: {explicit_path}")
        candidate_files = [explicit_path]
    else:
        if not target_dir.exists():
            target_dir.mkdir(parents=True, exist_ok=True)
        # Scan for .csv files
        found_csvs = sorted(list(target_dir.glob("*.csv")))
        if not found_csvs:
            # Generate default template if none exist
            export_training_dataset_csv(DEFAULT_TRAINING_CSV)
            found_csvs = [DEFAULT_TRAINING_CSV]
        candidate_files = found_csvs

    # 2. Filter valid training CSVs by inspecting header
    valid_csv_files: List[Path] = []
    skipped_files: List[Tuple[str, str]] = []

    for fpath in candidate_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                header = reader.fieldnames or []
                missing = [c for c in CSV_REQUIRED_COLUMNS if c not in header]
                if missing:
                    skipped_files.append((fpath.name, f"Missing required columns: {missing}"))
                    continue
                valid_csv_files.append(fpath)
        except Exception as exc:
            skipped_files.append((fpath.name, f"Could not read file: {str(exc)}"))

    if not valid_csv_files:
        raise ValueError(
            f"No valid training CSV files found in '{target_dir}'. "
            f"Candidate files were skipped due to schema mismatch or corruption: {skipped_files}"
        )

    # 3. Process and merge records
    raw_records: List[Dict[str, Any]] = []
    seen_keys = set()
    duplicates_count = 0

    for fpath in valid_csv_files:
        with open(fpath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row_idx, row in enumerate(reader, start=2):
                try:
                    req_id = row.get("request_id", "").strip()
                    dept = row.get("department", "").strip()
                    corridor_id = row.get("corridor_id", "").strip()
                    asset_id = row.get("asset_id", "").strip()
                    req_dur = float(row["required_duration_minutes"])
                    e_start = float(row["earliest_start_minute"])
                    l_end = float(row["latest_end_minute"])
                    urgency = row.get("urgency", "").strip().upper()
                    track = row.get("track_type", "").strip().upper()
                    is_traf = float(row.get("is_traffic_block_required", 1))
                    is_pow = float(row.get("is_power_block_required", 0))
                    days_overdue = float(row.get("days_overdue", 0))
                    has_defect = float(row.get("has_linked_defect", 1 if days_overdue > 0 else 0))
                    train_conflicts = float(row.get("conflicting_train_count", 0))

                    # Deduplication key across files
                    dedup_key = (
                        req_id,
                        dept,
                        corridor_id,
                        asset_id,
                        req_dur,
                        e_start,
                        l_end,
                        urgency,
                        days_overdue,
                    )
                    if dedup_key in seen_keys:
                        duplicates_count += 1
                        continue
                    seen_keys.add(dedup_key)

                    w_dur = max(15.0, l_end - e_start)
                    tightness = min(1.0, req_dur / w_dur)

                    feat_dict = {
                        "is_traffic_block": is_traf,
                        "is_power_block": is_pow,
                        "required_duration": req_dur,
                        "window_duration": w_dur,
                        "tightness_ratio": tightness,
                        "days_overdue": days_overdue,
                        "has_linked_defect": has_defect,
                        "conflicting_train_count": train_conflicts,
                        "dept_eng": 1.0 if "Engineering" in dept or dept == "ENG" else 0.0,
                        "dept_trd": 1.0 if "Traction" in dept or dept == "TRD" else 0.0,
                        "dept_snt": 1.0 if "Signalling" in dept or dept == "SNT" else 0.0,
                        "track_both": 1.0 if track in ("BOTH", "SINGLE") else 0.0,
                        "urgency_critical": 1.0 if urgency == "CRITICAL" else 0.0,
                        "urgency_high": 1.0 if urgency == "HIGH" else 0.0,
                    }

                    if "target_priority_score" in row and row["target_priority_score"]:
                        target = float(row["target_priority_score"])
                    else:
                        base_sev = 40.0 if urgency == "CRITICAL" else (25.0 if urgency == "HIGH" else 15.0)
                        target = min(100.0, base_sev + min(25.0, days_overdue * 0.8) + (is_traf * 10.0))

                    raw_records.append({
                        "features": feat_dict,
                        "target": target,
                        "source_file": fpath.name,
                    })
                except Exception as ex:
                    raise ValueError(f"Malformed data in '{fpath.name}' row {row_idx}: {str(ex)}")

    if not raw_records:
        raise ValueError("All discovered training CSV files contained no valid data records.")

    # 4. Deterministic shuffle using seed
    rng = np.random.RandomState(seed)
    indices = np.arange(len(raw_records))
    rng.shuffle(indices)
    shuffled_records = [raw_records[i] for i in indices]

    feature_names = list(shuffled_records[0]["features"].keys())
    X = np.array(
        [[rec["features"][col] for col in feature_names] for rec in shuffled_records],
        dtype=np.float32,
    )
    y = np.array([rec["target"] for rec in shuffled_records], dtype=np.float32)

    summary_report = {
        "num_csv_files": len(valid_csv_files),
        "csv_filenames": [f.name for f in valid_csv_files],
        "skipped_files": skipped_files,
        "total_records_merged": len(shuffled_records),
        "duplicates_removed": duplicates_count,
        "feature_count": len(feature_names),
    }

    return X, y, feature_names, summary_report



def parse_production_requests_csv(
    csv_text: str,
    base_dataset: Optional[RailwayPlanningDataset] = None,
) -> RailwayPlanningDataset:
    """
    Parses a production CSV of maintenance requests and constructs a validated RailwayPlanningDataset.
    """
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    for col in CSV_REQUIRED_COLUMNS:
        if col not in (reader.fieldnames or []):
            raise ValueError(f"Uploaded Railway CSV is missing required column '{col}'.")

    # Use existing synthetic dataset as corridor/asset infrastructure template if not supplied
    ds = base_dataset or generate_synthetic_dataset(num_requests=2, seed=1)

    corridor_ids = {c.corridor_id for c in ds.corridors}
    asset_map = {a.asset_id: a for a in ds.assets}

    block_requests: List[MaintenanceBlockRequest] = []

    for idx, row in enumerate(reader, start=1):
        dept_str = row["department"].strip()
        if "Eng" in dept_str or dept_str == "ENG":
            dept = Department.ENG
        elif "Trac" in dept_str or dept_str == "TRD":
            dept = Department.TRD
        else:
            dept = Department.SNT

        urg_str = row["urgency"].strip().upper()
        urgency = Priority(urg_str) if urg_str in Priority.__members__ else Priority.MEDIUM

        corridor_id = row["corridor_id"].strip()
        asset_id = row["asset_id"].strip()

        # If corridor/asset is new, synthesize matching corridor/asset record so hard constraints pass
        if corridor_id not in corridor_ids:
            from schemas.railway import CorridorAvailability
            ds.corridors.append(
                CorridorAvailability(
                    corridor_id=corridor_id,
                    name=f"Corridor {corridor_id}",
                    length_km=50.0,
                    is_electrified=True,
                )
            )
            corridor_ids.add(corridor_id)

        if asset_id not in asset_map:
            from schemas.railway import RailwayAsset
            new_asset = RailwayAsset(
                asset_id=asset_id,
                corridor_id=corridor_id,
                department=dept,
                start_km=5.0,
                end_km=10.0,
                track_type=TrackType.BOTH,
            )
            ds.assets.append(new_asset)
            asset_map[asset_id] = new_asset

        block_requests.append(
            MaintenanceBlockRequest(
                request_id=row.get("request_id", f"CSV-{idx:03d}").strip(),
                department=dept,
                corridor_id=corridor_id,
                asset_id=asset_id,
                required_duration_minutes=int(row["required_duration_minutes"]),
                earliest_start_minute=int(row["earliest_start_minute"]),
                latest_end_minute=int(row["latest_end_minute"]),
                is_traffic_block_required=str(row.get("is_traffic_block_required", "1")).strip() in ("1", "true", "True"),
                is_power_block_required=str(row.get("is_power_block_required", "0")).strip() in ("1", "true", "True"),
                urgency=urgency,
            )
        )

    ds.block_requests = block_requests
    return ds
