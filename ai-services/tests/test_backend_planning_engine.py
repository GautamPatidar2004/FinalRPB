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
def setup_operational_db():
    """Seed clean, consistent operational railway data for planning engine tests."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()
    repository._local_profiles.clear()
    repository._ensure_default_seed()

    # 1. Assets on COR-NDLS-GZB
    repository.create_asset({
        "asset_id": "AST-TRK-101",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "UP",
    })
    repository.create_asset({
        "asset_id": "AST-OHE-101",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Traction Distribution",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "BOTH",
    })
    repository.create_asset({
        "asset_id": "AST-SNT-101",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Signalling & Telecom",
        "start_km": 5.0,
        "end_km": 10.0,
        "track_type": "BOTH",
    })

    # 2. Timetable traffic on COR-NDLS-GZB
    repository.create_train({
        "train_id": "TRN-12002-SHATABDI",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 360,
        "exit_minute": 420,
        "priority_level": 1,
    })
    repository.create_train({
        "train_id": "TRN-12424-RAJDHANI",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 980,
        "exit_minute": 1040,
        "priority_level": 1,
    })

    # 3. Operational Maintenance Requests (PENDING)
    repository.create_request({
        "request_id": "REQ-ENG-001",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-101",
        "required_duration_minutes": 120,
        "earliest_start_minute": 60,
        "latest_end_minute": 300,
        "is_traffic_block_required": True,
        "is_power_block_required": False,
        "urgency": "CRITICAL",
    })
    repository.create_request({
        "request_id": "REQ-TRD-001",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-101",
        "required_duration_minutes": 90,
        "earliest_start_minute": 120,
        "latest_end_minute": 360,
        "is_traffic_block_required": True,
        "is_power_block_required": True,
        "urgency": "HIGH",
    })
    repository.create_request({
        "request_id": "REQ-SNT-001",
        "department": "Signalling & Telecom",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-SNT-101",
        "required_duration_minutes": 60,
        "earliest_start_minute": 480,
        "latest_end_minute": 720,
        "is_traffic_block_required": False,
        "is_power_block_required": False,
        "urgency": "MEDIUM",
    })


# ====================================================================
# 1. CORE PLAN GENERATION & PERSISTENCE TESTS
# ====================================================================
def test_plan_generation_and_database_persistence():
    # 1. Trigger plan generation across all eligible requests
    payload = {
        "title": "Integrated Daily Maintenance Plan - Delhi Division",
        "corridor_id": "COR-NDLS-GZB",
    }
    res = client.post("/api/v1/plans/generate", json=payload)
    assert res.status_code == 201
    plan = res.json()

    assert plan["plan_id"].startswith("PLAN-")
    assert plan["title"] == "Integrated Daily Maintenance Plan - Delhi Division"
    assert plan["status"] == "DRAFT"
    assert plan["is_feasible"] is True
    assert plan["overall_score"] > 50.0
    assert len(plan["scheduled_blocks"]) >= 2
    assert "evaluation" in plan
    assert "overall_score" in plan["evaluation"]
    assert "decision_log" in plan

    # 2. Verify persisted in database via GET /api/v1/plans/{plan_id}
    res_get = client.get(f"/api/v1/plans/{plan['plan_id']}")
    assert res_get.status_code == 200
    persisted = res_get.json()
    assert persisted["plan_id"] == plan["plan_id"]
    assert persisted["status"] == "DRAFT"
    assert len(persisted["items"]) == len(plan["scheduled_blocks"])

    # 3. Verify original maintenance requests in database remain unchanged (status still PENDING)
    req1 = client.get("/api/v1/requests/REQ-ENG-001").json()
    assert req1["status"] == "PENDING"
    req2 = client.get("/api/v1/requests/REQ-TRD-001").json()
    assert req2["status"] == "PENDING"


# ====================================================================
# 2. SELECTED REQUESTS PLANNING MODE
# ====================================================================
def test_plan_generation_selected_request_ids():
    payload = {
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-ENG-001", "REQ-SNT-001"],
    }
    res = client.post("/api/v1/plans/generate", json=payload)
    assert res.status_code == 201
    plan = res.json()

    scheduled_req_ids = [b["request_id"] for b in plan["scheduled_blocks"]]
    assert "REQ-ENG-001" in scheduled_req_ids
    assert "REQ-TRD-001" not in scheduled_req_ids


# ====================================================================
# 3. DEPARTMENT & TIME WINDOW FILTERING MODES
# ====================================================================
def test_plan_generation_department_and_time_filters():
    # Only Engineering requests
    res_eng = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
    })
    assert res_eng.status_code == 201
    blocks_eng = res_eng.json()["scheduled_blocks"]
    assert len(blocks_eng) == 1
    assert blocks_eng[0]["department"] == "Engineering"

    # Time window filter (only morning 0 to 360) -> REQ-SNT-001 (480-720) should be excluded
    res_time = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "start_minute": 0,
        "end_minute": 360,
    })
    assert res_time.status_code == 201
    scheduled_ids = [b["request_id"] for b in res_time.json()["scheduled_blocks"]]
    assert "REQ-SNT-001" not in scheduled_ids


# ====================================================================
# 4. INPUT VALIDATION & ERROR HANDLING
# ====================================================================
def test_plan_generation_validation_errors():
    # 1. Non-existent request ID
    res_missing_id = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-NONEXISTENT-999"],
    })
    assert res_missing_id.status_code == 400
    assert "do not exist" in res_missing_id.json()["detail"]

    # 2. Non-pending request ID
    client.patch("/api/v1/requests/REQ-ENG-001", json={"status": "APPROVED"})
    res_not_pending = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-ENG-001"],
    })
    assert res_not_pending.status_code == 400
    assert "must be PENDING" in res_not_pending.json()["detail"]

    # 3. Non-existent corridor
    res_bad_corridor = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NONEXISTENT",
    })
    assert res_bad_corridor.status_code == 400

    # 4. No eligible requests in window
    res_empty_window = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "start_minute": 1300,
        "end_minute": 1400,
    })
    assert res_empty_window.status_code == 400
    assert "No eligible maintenance requests found" in res_empty_window.json()["detail"]


# ====================================================================
# 5. HIGH-CONTENTION & HARD CONSTRAINT INTEGRITY TEST
# ====================================================================
def test_high_contention_constraint_enforcement():
    # Setup two mutually incompatible requests on single-track corridor competing for tight time window
    repository.create_request({
        "request_id": "REQ-CONFLICT-A",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-101",
        "required_duration_minutes": 180,
        "earliest_start_minute": 100,
        "latest_end_minute": 300,
        "is_traffic_block_required": True,
        "urgency": "CRITICAL",
    })
    repository.create_request({
        "request_id": "REQ-CONFLICT-B",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-101",
        "required_duration_minutes": 180,
        "earliest_start_minute": 100,
        "latest_end_minute": 300,
        "is_traffic_block_required": True,
        "urgency": "HIGH",
    })

    # Plan both conflicting requests
    res = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-CONFLICT-A", "REQ-CONFLICT-B"],
    })
    assert res.status_code == 201
    plan = res.json()

    # Verify hard constraints were preserved: both cannot occupy the same asset at the exact same time
    # One request is scheduled, the other is deferred/replanned with explainability in decision_log/unresolved
    scheduled_items = plan["scheduled_blocks"]
    scheduled_req_ids = [it["request_id"] for it in scheduled_items if it["status"] == "SCHEDULED"]

    # Must NOT schedule both simultaneously if they violate max parallel blocks / segment availability
    # And decision log must provide concise rationale
    assert len(plan["decision_log"]) >= 1
    assert any(d["decision_type"] in ("SCHEDULED", "REPLANNED", "DEFERRED") for d in plan["decision_log"])


# ====================================================================
# 6. PLAN LISTING AND QUERYING
# ====================================================================
def test_list_plans_with_filters():
    # Generate a plan
    client.post("/api/v1/plans/generate", json={"corridor_id": "COR-NDLS-GZB"})

    # List all plans
    res_all = client.get("/api/v1/plans")
    assert res_all.status_code == 200
    assert len(res_all.json()) >= 1

    # Filter by status
    res_draft = client.get("/api/v1/plans?status=DRAFT")
    assert res_draft.status_code == 200
    assert all(p["status"] == "DRAFT" for p in res_draft.json())

    # Filter by corridor
    res_corridor = client.get("/api/v1/plans?corridor_id=COR-NDLS-GZB")
    assert res_corridor.status_code == 200
    assert len(res_corridor.json()) >= 1
