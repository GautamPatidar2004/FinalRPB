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
def reset_local_db():
    """Ensure consistent database state before each test."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()
    repository._local_profiles.clear()
    repository._ensure_default_seed()


# ====================================================================
# 1. CORRIDOR CRUD TESTS
# ====================================================================
def test_corridors_crud_lifecycle():
    # 1. List seeded corridors
    res = client.get("/api/v1/corridors")
    assert res.status_code == 200
    corridors = res.json()
    assert len(corridors) >= 2
    assert any(c["corridor_id"] == "COR-NDLS-GZB" for c in corridors)

    # 2. Create new corridor
    new_corridor = {
        "corridor_id": "COR-HWH-MGS",
        "name": "Howrah - Mughalsarai Trunk Route",
        "length_km": 680.0,
        "is_electrified": True,
        "available_start_minute": 60,
        "available_end_minute": 1380,
        "max_parallel_blocks": 3,
    }
    res = client.post("/api/v1/corridors", json=new_corridor)
    assert res.status_code == 201
    created = res.json()
    assert created["corridor_id"] == "COR-HWH-MGS"
    assert created["length_km"] == 680.0

    # 3. Duplicate creation conflict (409)
    res_dup = client.post("/api/v1/corridors", json=new_corridor)
    assert res_dup.status_code == 409

    # 4. Get corridor by ID
    res_get = client.get("/api/v1/corridors/COR-HWH-MGS")
    assert res_get.status_code == 200
    assert res_get.json()["name"] == "Howrah - Mughalsarai Trunk Route"

    # 5. Update corridor
    res_patch = client.patch("/api/v1/corridors/COR-HWH-MGS", json={"max_parallel_blocks": 4})
    assert res_patch.status_code == 200
    assert res_patch.json()["max_parallel_blocks"] == 4

    # 6. Delete corridor
    res_del = client.delete("/api/v1/corridors/COR-HWH-MGS")
    assert res_del.status_code == 200
    assert res_del.json()["status"] == "deleted"

    # 7. 404 after deletion
    res_gone = client.get("/api/v1/corridors/COR-HWH-MGS")
    assert res_gone.status_code == 404


# ====================================================================
# 2. ASSETS CRUD TESTS
# ====================================================================
def test_assets_crud_lifecycle():
    # 1. Validation error: corridor does not exist
    bad_asset = {
        "asset_id": "AST-INVALID",
        "corridor_id": "COR-NONEXISTENT",
        "department": "Engineering",
        "start_km": 10.0,
        "end_km": 15.0,
        "track_type": "UP",
    }
    res_bad = client.post("/api/v1/assets", json=bad_asset)
    assert res_bad.status_code == 400

    # 2. Validation error: end_km < start_km (422)
    bad_km_asset = {
        "asset_id": "AST-INV-KM",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 25.0,
        "end_km": 10.0,
        "track_type": "DOWN",
    }
    res_km = client.post("/api/v1/assets", json=bad_km_asset)
    assert res_km.status_code == 422

    # 3. Valid asset creation
    good_asset = {
        "asset_id": "AST-TRK-101",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 12.0,
        "end_km": 18.5,
        "track_type": "UP",
    }
    res_create = client.post("/api/v1/assets", json=good_asset)
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["asset_id"] == "AST-TRK-101"

    # 4. Get by ID
    res_get = client.get("/api/v1/assets/AST-TRK-101")
    assert res_get.status_code == 200
    assert res_get.json()["department"] == "Engineering"

    # 5. List assets with filter
    res_list = client.get("/api/v1/assets?corridor_id=COR-NDLS-GZB&department=Engineering")
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    # 6. Update asset
    res_patch = client.patch("/api/v1/assets/AST-TRK-101", json={"end_km": 20.0})
    assert res_patch.status_code == 200
    assert res_patch.json()["end_km"] == 20.0

    # 7. Delete asset
    res_del = client.delete("/api/v1/assets/AST-TRK-101")
    assert res_del.status_code == 200
    assert client.get("/api/v1/assets/AST-TRK-101").status_code == 404


# ====================================================================
# 3. TRAINS CRUD TESTS
# ====================================================================
def test_trains_crud_lifecycle():
    # 1. Validation: Corridor existence check
    bad_train = {
        "train_id": "TRN-12001",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NONEXISTENT",
        "entry_minute": 100,
        "exit_minute": 180,
        "priority_level": 1,
    }
    assert client.post("/api/v1/trains", json=bad_train).status_code == 400

    # 2. Validation: exit_minute < entry_minute
    bad_time_train = {
        "train_id": "TRN-12001",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 200,
        "exit_minute": 150,
        "priority_level": 1,
    }
    assert client.post("/api/v1/trains", json=bad_time_train).status_code == 422

    # 3. Create valid train
    good_train = {
        "train_id": "TRN-12002-SHATABDI",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 360,
        "exit_minute": 420,
        "priority_level": 1,
    }
    res_create = client.post("/api/v1/trains", json=good_train)
    assert res_create.status_code == 201

    # 4. Get by ID
    res_get = client.get("/api/v1/trains/TRN-12002-SHATABDI")
    assert res_get.status_code == 200
    assert res_get.json()["priority_level"] == 1

    # 5. Update train
    res_patch = client.patch("/api/v1/trains/TRN-12002-SHATABDI", json={"priority_level": 2})
    assert res_patch.status_code == 200
    assert res_patch.json()["priority_level"] == 2

    # 6. Delete train
    assert client.delete("/api/v1/trains/TRN-12002-SHATABDI").status_code == 200
    assert client.get("/api/v1/trains/TRN-12002-SHATABDI").status_code == 404


# ====================================================================
# 4. MAINTENANCE REQUESTS CRUD & LOGICAL DELETION TESTS
# ====================================================================
def test_maintenance_requests_crud_and_safe_delete():
    # Setup prerequisite asset
    client.post("/api/v1/assets", json={
        "asset_id": "AST-OHE-201",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Traction Distribution",
        "start_km": 5.0,
        "end_km": 8.0,
        "track_type": "BOTH",
    })

    # 1. Validation error: required duration exceeds available window
    bad_window_req = {
        "request_id": "REQ-BAD-WIN",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-201",
        "required_duration_minutes": 180,
        "earliest_start_minute": 100,
        "latest_end_minute": 200,  # span is 100m, duration is 180m
        "urgency": "HIGH",
    }
    res_bad = client.post("/api/v1/requests", json=bad_window_req)
    assert res_bad.status_code == 422

    # 2. Create valid maintenance request
    good_req = {
        "request_id": "REQ-OHE-001",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-201",
        "required_duration_minutes": 120,
        "earliest_start_minute": 120,
        "latest_end_minute": 480,
        "is_power_block_required": True,
        "is_traffic_block_required": True,
        "urgency": "CRITICAL",
    }
    res_create = client.post("/api/v1/requests", json=good_req)
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["status"] == "PENDING"
    assert created["urgency"] == "CRITICAL"

    # 3. Get request by ID
    res_get = client.get("/api/v1/requests/REQ-OHE-001")
    assert res_get.status_code == 200
    assert res_get.json()["required_duration_minutes"] == 120

    # 4. Filter requests
    res_filter = client.get("/api/v1/requests?department=Traction Distribution&status=PENDING")
    assert res_filter.status_code == 200
    assert len(res_filter.json()) == 1

    # 5. Update request status to SCHEDULED
    res_sched = client.patch("/api/v1/requests/REQ-OHE-001", json={"status": "SCHEDULED"})
    assert res_sched.status_code == 200
    assert res_sched.json()["status"] == "SCHEDULED"

    # 6. Enforce logical safety: CANNOT delete SCHEDULED request (400 Bad Request)
    res_unsafe_del = client.delete("/api/v1/requests/REQ-OHE-001")
    assert res_unsafe_del.status_code == 400
    assert "Cannot delete request" in res_unsafe_del.json()["detail"]

    # 7. Update status to REJECTED -> now safe to delete
    client.patch("/api/v1/requests/REQ-OHE-001", json={"status": "REJECTED"})
    res_safe_del = client.delete("/api/v1/requests/REQ-OHE-001")
    assert res_safe_del.status_code == 200
    assert client.get("/api/v1/requests/REQ-OHE-001").status_code == 404


# ====================================================================
# 5. BLOCK PLANS CRUD & APPROVAL WORKFLOW TESTS
# ====================================================================
def test_block_plans_lifecycle_and_approval_workflow():
    # 1. Create block plan with items
    plan_payload = {
        "plan_id": "BP-2026-09-12-001",
        "title": "Night Shift Track & OHE Maintenance",
        "overall_score": 92.5,
        "is_feasible": True,
        "selected_strategy": "SAFETY_FIRST",
        "evaluation_summary": {"coverage": 100.0, "disruption": 12.0},
        "items": [
            {
                "request_id": "REQ-ENG-501",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-101",
                "department": "Engineering",
                "scheduled_start_minute": 120,
                "scheduled_end_minute": 240,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
                "conflict_flags": [],
            }
        ],
    }
    res_create = client.post("/api/v1/plans", json=plan_payload)
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["status"] == "DRAFT"
    assert len(created["items"]) == 1

    # 2. Get plan by ID
    res_get = client.get("/api/v1/plans/BP-2026-09-12-001")
    assert res_get.status_code == 200
    assert res_get.json()["title"] == "Night Shift Track & OHE Maintenance"
    assert res_get.json()["items"][0]["request_id"] == "REQ-ENG-501"

    # 3. Approve plan
    approval_payload = {
        "status": "APPROVED",
        "approved_by": "controller-uuid-123",
    }
    res_approve = client.patch("/api/v1/plans/BP-2026-09-12-001/status", json=approval_payload)
    assert res_approve.status_code == 200
    approved_plan = res_approve.json()
    assert approved_plan["status"] == "APPROVED"
    assert approved_plan["approved_by"] == "controller-uuid-123"
    assert approved_plan["approved_at"] is not None

    # 4. Safe delete check: cannot delete APPROVED plan
    res_unsafe_del = client.delete("/api/v1/plans/BP-2026-09-12-001")
    assert res_unsafe_del.status_code == 400
    assert "Cannot delete plan" in res_unsafe_del.json()["detail"]

    # 5. Reject plan -> then safely delete
    client.patch("/api/v1/plans/BP-2026-09-12-001/status", json={
        "status": "REJECTED",
        "rejection_reason": "Emergency traffic priority",
    })
    res_del = client.delete("/api/v1/plans/BP-2026-09-12-001")
    assert res_del.status_code == 200
    assert client.get("/api/v1/plans/BP-2026-09-12-001").status_code == 404


# ====================================================================
# 6. PROFILES CRUD TESTS
# ====================================================================
def test_profiles_crud():
    profile_data = {
        "id": "usr-ctrl-001",
        "email": "chief.controller@railways.gov.in",
        "full_name": "R. K. Sharma",
        "department": "Operations",
        "role": "controller",
    }
    res_create = client.post("/api/v1/profiles", json=profile_data)
    assert res_create.status_code == 201
    assert res_create.json()["email"] == "chief.controller@railways.gov.in"

    res_get = client.get("/api/v1/profiles/usr-ctrl-001")
    assert res_get.status_code == 200
    assert res_get.json()["role"] == "controller"

    res_patch = client.patch("/api/v1/profiles/usr-ctrl-001", json={"role": "admin"})
    assert res_patch.status_code == 200
    assert res_patch.json()["role"] == "admin"

    res_del = client.delete("/api/v1/profiles/usr-ctrl-001")
    assert res_del.status_code == 200
    assert client.get("/api/v1/profiles/usr-ctrl-001").status_code == 404


# ====================================================================
# 7. AI ENGINE ENDPOINTS PRESERVATION TESTS
# ====================================================================
def test_ai_engine_endpoints_coexist_undisturbed():
    # Root health
    res_root_health = client.get("/health")
    assert res_root_health.status_code == 200
    assert res_root_health.json()["status"] in ("healthy", "degraded")

    # API v1 health
    res_v1_health = client.get("/api/v1/health")
    assert res_v1_health.status_code == 200
    assert res_v1_health.json()["status"] in ("healthy", "degraded")

    # CSV inference endpoint availability
    res_csv = client.post("/api/v1/plan/csv", content="")
    assert res_csv.status_code == 400
    assert "Uploaded CSV body cannot be empty" in res_csv.json()["detail"]
