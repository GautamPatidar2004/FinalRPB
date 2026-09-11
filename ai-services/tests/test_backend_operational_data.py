import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import pytest
from fastapi.testclient import TestClient
from main import app
from db.repository import repository

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_db():
    """Ensure clean isolated operational state before each test."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()
    repository._local_profiles.clear()
    repository._ensure_default_seed()

    # Add default assets to COR-NDLS-GZB for operational tests
    repository.create_asset({
        "asset_id": "AST-TRK-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "UP",
    })
    repository.create_asset({
        "asset_id": "AST-OHE-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Traction Distribution",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "BOTH",
    })


# ====================================================================
# 1. AVAILABILITY & TIME WINDOWS API TESTS
# ====================================================================
def test_corridor_availability_endpoints():
    # 1. List availability windows
    res = client.get("/api/v1/availability")
    assert res.status_code == 200
    windows = res.json()
    assert len(windows) >= 2
    delhi_win = next(w for w in windows if w["corridor_id"] == "COR-NDLS-GZB")
    assert delhi_win["available_start_minute"] == 0
    assert delhi_win["available_end_minute"] == 1440
    assert delhi_win["max_parallel_blocks"] == 2

    # 2. Get specific corridor availability
    res_get = client.get("/api/v1/availability/COR-NDLS-GZB")
    assert res_get.status_code == 200
    assert res_get.json()["name"] == "New Delhi - Ghaziabad Main Line"

    # 3. 404 for nonexistent corridor
    assert client.get("/api/v1/availability/COR-NONEXISTENT").status_code == 404

    # 4. Update availability window (valid)
    patch_payload = {
        "available_start_minute": 60,
        "available_end_minute": 480,
        "max_parallel_blocks": 3,
    }
    res_patch = client.patch("/api/v1/availability/COR-NDLS-GZB", json=patch_payload)
    assert res_patch.status_code == 200
    assert res_patch.json()["available_start_minute"] == 60
    assert res_patch.json()["available_end_minute"] == 480
    assert res_patch.json()["max_parallel_blocks"] == 3

    # 5. Invalid availability window (end <= start -> 422)
    bad_window = {"available_start_minute": 500, "available_end_minute": 400}
    res_bad = client.patch("/api/v1/availability/COR-NDLS-GZB", json=bad_window)
    assert res_bad.status_code == 422


# ====================================================================
# 2. BULK CSV INGESTION TESTS
# ====================================================================
def test_csv_ingestion_success_and_duplicate_handling():
    valid_csv = (
        "request_id,department,urgency,corridor_id,asset_id,required_duration_minutes,earliest_start_minute,latest_end_minute,is_traffic_block_required,is_power_block_required\n"
        "REQ-INGEST-01,Engineering,HIGH,COR-NDLS-GZB,AST-TRK-01,90,120,360,1,0\n"
        "REQ-INGEST-02,Traction Distribution,CRITICAL,COR-NDLS-GZB,AST-OHE-01,120,60,300,1,1\n"
    )
    res = client.post("/api/v1/ingest/csv", content=valid_csv)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "success"
    assert data["inserted_count"] == 2
    assert data["skipped_duplicates"] == 0

    # Ingesting the same CSV with skip_duplicates=True should skip them without error
    res_dup = client.post("/api/v1/ingest/csv?skip_duplicates=true", content=valid_csv)
    assert res_dup.status_code == 201
    assert res_dup.json()["inserted_count"] == 0
    assert res_dup.json()["skipped_duplicates"] == 2

    # Verify records exist in database
    get_req = client.get("/api/v1/requests/REQ-INGEST-01")
    assert get_req.status_code == 200
    assert get_req.json()["department"] == "Engineering"
    assert get_req.json()["urgency"] == "HIGH"


def test_csv_ingestion_rejection_with_row_level_errors():
    # 1. Missing required columns
    bad_header_csv = "request_id,department,urgency\nREQ-01,Engineering,HIGH"
    res_hdr = client.post("/api/v1/ingest/csv", content=bad_header_csv)
    assert res_hdr.status_code == 422
    assert "Missing required columns" in res_hdr.json()["detail"]["error"]

    # 2. Row level errors: invalid department, invalid urgency, nonexistent asset, duration > window
    malformed_csv = (
        "request_id,department,urgency,corridor_id,asset_id,required_duration_minutes,earliest_start_minute,latest_end_minute,is_traffic_block_required,is_power_block_required\n"
        "REQ-ERR-01,InvalidDept,SUPER_URGENT,COR-NDLS-GZB,AST-TRK-01,60,0,300,1,0\n"
        "REQ-ERR-02,Engineering,MEDIUM,COR-NDLS-GZB,AST-NONEXISTENT,60,0,300,1,0\n"
        "REQ-ERR-03,Engineering,HIGH,COR-NDLS-GZB,AST-TRK-01,200,0,100,1,0\n"
    )
    res_malformed = client.post("/api/v1/ingest/csv", content=malformed_csv)
    assert res_malformed.status_code == 422
    detail = res_malformed.json()["detail"]
    assert detail["row_error_count"] == 3
    assert any("Invalid department" in str(e["errors"]) for e in detail["row_errors"])
    assert any("does not exist" in str(e["errors"]) for e in detail["row_errors"])
    assert any("exceeds available window" in str(e["errors"]) for e in detail["row_errors"])


# ====================================================================
# 3. JSON BATCH INGESTION TESTS
# ====================================================================
def test_batch_ingestion_success_and_validation():
    batch_payload = {
        "requests": [
            {
                "request_id": "REQ-BATCH-01",
                "department": "Engineering",
                "urgency": "HIGH",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "required_duration_minutes": 90,
                "earliest_start_minute": 100,
                "latest_end_minute": 300,
                "is_traffic_block_required": True,
                "is_power_block_required": False,
            },
            {
                "request_id": "REQ-BATCH-02",
                "department": "TRD",  # checks normalization
                "urgency": "CRITICAL",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-OHE-01",
                "required_duration_minutes": 120,
                "earliest_start_minute": 60,
                "latest_end_minute": 360,
                "is_traffic_block_required": True,
                "is_power_block_required": True,
            },
        ],
        "skip_duplicates": True,
    }
    res = client.post("/api/v1/ingest/batch", json=batch_payload)
    assert res.status_code == 201
    assert res.json()["inserted_count"] == 2

    # Verify TRD was normalized to Traction Distribution
    req2 = client.get("/api/v1/requests/REQ-BATCH-02").json()
    assert req2["department"] == "Traction Distribution"

    # Batch with invalid asset
    bad_batch = {
        "requests": [
            {
                "request_id": "REQ-BATCH-BAD",
                "department": "Engineering",
                "urgency": "LOW",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-MISSING",
                "required_duration_minutes": 60,
                "earliest_start_minute": 0,
                "latest_end_minute": 200,
            }
        ]
    }
    res_bad = client.post("/api/v1/ingest/batch", json=bad_batch)
    assert res_bad.status_code == 422


# ====================================================================
# 4. QUERY SUPPORT TESTS (FILTERS)
# ====================================================================
def test_advanced_query_filtering():
    # Setup test requests
    client.post("/api/v1/requests", json={
        "request_id": "REQ-Q-01",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-01",
        "required_duration_minutes": 60,
        "earliest_start_minute": 100,
        "latest_end_minute": 200,
        "urgency": "CRITICAL",
    })
    client.post("/api/v1/requests", json={
        "request_id": "REQ-Q-02",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-01",
        "required_duration_minutes": 120,
        "earliest_start_minute": 300,
        "latest_end_minute": 600,
        "urgency": "LOW",
    })

    # Filter by urgency
    res_urg = client.get("/api/v1/requests?urgency=CRITICAL")
    assert res_urg.status_code == 200
    assert len(res_urg.json()) == 1
    assert res_urg.json()[0]["request_id"] == "REQ-Q-01"

    # Filter by asset_id
    res_ast = client.get("/api/v1/requests?asset_id=AST-OHE-01")
    assert res_ast.status_code == 200
    assert len(res_ast.json()) == 1
    assert res_ast.json()[0]["request_id"] == "REQ-Q-02"

    # Filter by time window (start_minute=250, end_minute=700) -> matches REQ-Q-02
    res_time = client.get("/api/v1/requests?start_minute=250&end_minute=700")
    assert res_time.status_code == 200
    assert any(r["request_id"] == "REQ-Q-02" for r in res_time.json())


# ====================================================================
# 5. AI ENGINE COMPATIBILITY & DATASET ORCHESTRATION
# ====================================================================
def test_ai_dataset_conversion_and_optimization_bridge():
    # Setup test train and request
    client.post("/api/v1/trains", json={
        "train_id": "TRN-RAJ-2001",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 30,
        "exit_minute": 75,
        "priority_level": 1,
    })
    client.post("/api/v1/requests", json={
        "request_id": "REQ-AI-001",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-01",
        "required_duration_minutes": 90,
        "earliest_start_minute": 100,
        "latest_end_minute": 400,
        "urgency": "CRITICAL",
    })

    # 1. Test GET /api/v1/dataset (converts DB records into RailwayPlanningDataset)
    res_ds = client.get("/api/v1/dataset?corridor_id=COR-NDLS-GZB")
    assert res_ds.status_code == 200
    dataset = res_ds.json()
    assert "corridors" in dataset
    assert "assets" in dataset
    assert "trains" in dataset
    assert "block_requests" in dataset
    req_ids = [item["request_id"] for item in dataset["block_requests"]]
    assert "REQ-AI-001" in req_ids
    train_ids = [item["train_id"] for item in dataset["trains"]]
    assert "TRN-RAJ-2001" in train_ids

    # 2. Test POST /api/v1/dataset/optimize (runs existing AI planning engine on persisted DB data)
    res_opt = client.post("/api/v1/dataset/optimize?corridor_id=COR-NDLS-GZB")
    assert res_opt.status_code == 200
    plan_result = res_opt.json()
    assert "plan_id" in plan_result
    assert "selected_strategy" in plan_result
    assert plan_result["is_feasible"] is True
    assert len(plan_result["plan"]) >= 1
    scheduled_item = plan_result["plan"][0]
    assert scheduled_item["request_id"] == "REQ-AI-001"
    assert scheduled_item["status"] == "SCHEDULED"
    assert "evaluation" in plan_result
    assert plan_result["evaluation"]["overall_score"] > 0
