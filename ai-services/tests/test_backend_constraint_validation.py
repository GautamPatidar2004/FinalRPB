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
def setup_validation_test_env():
    """Seed clean, controlled operational railway environment for constraint validation tests."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()
    repository._local_profiles.clear()
    repository._ensure_default_seed()

    # Assets on COR-NDLS-GZB
    repository.create_asset({
        "asset_id": "AST-TRK-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 0.0,
        "end_km": 10.0,
        "track_type": "UP",
    })
    repository.create_asset({
        "asset_id": "AST-OHE-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Traction Distribution",
        "start_km": 0.0,
        "end_km": 10.0,
        "track_type": "BOTH",
    })

    # Train on COR-NDLS-GZB running between minute 300 and 360
    repository.create_train({
        "train_id": "TRN-EXPRESS-101",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 300,
        "exit_minute": 360,
        "priority_level": 1,
    })

    # Requests on COR-NDLS-GZB
    repository.create_request({
        "request_id": "REQ-V-01",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-01",
        "required_duration_minutes": 120,
        "earliest_start_minute": 60,
        "latest_end_minute": 240,
        "is_traffic_block_required": True,
        "is_power_block_required": False,
        "urgency": "HIGH",
    })
    repository.create_request({
        "request_id": "REQ-V-02",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-01",
        "required_duration_minutes": 90,
        "earliest_start_minute": 60,
        "latest_end_minute": 240,
        "is_traffic_block_required": True,
        "is_power_block_required": True,
        "urgency": "MEDIUM",
    })
    repository.create_request({
        "request_id": "REQ-V-03",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-01",
        "required_duration_minutes": 60,
        "earliest_start_minute": 60,
        "latest_end_minute": 240,
        "is_traffic_block_required": True,
        "is_power_block_required": False,
        "urgency": "LOW",
    })


def test_validate_known_feasible_plan():
    """1. Validate a known feasible generated plan: is_feasible=True, 0 violations."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-V-01"],
    })
    assert gen_resp.status_code == 201, gen_resp.text
    plan_id = gen_resp.json()["plan_id"]

    val_resp = client.post(f"/api/v1/plans/{plan_id}/validate")
    assert val_resp.status_code == 200, val_resp.text
    data = val_resp.json()
    assert data["plan_id"] == plan_id
    assert data["is_feasible"] is True
    assert data["total_hard_violations"] == 0
    assert len(data["violations"]) == 0
    assert "FEASIBLE" in data["summary"]


def test_validate_plan_with_train_traffic_conflict():
    """2. Validate a plan containing an intentional direct train collision."""
    # Create plan with block overlapping train TRN-EXPRESS-101 [300, 360]
    conflict_plan = {
        "plan_id": "PLAN-TRAIN-COLLISION",
        "title": "Train Conflict Test Plan",
        "overall_score": 50.0,
        "is_feasible": True,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 280,
                "scheduled_end_minute": 400,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            }
        ]
    }
    create_res = client.post("/api/v1/plans", json=conflict_plan)
    assert create_res.status_code == 201

    val_resp = client.post("/api/v1/plans/PLAN-TRAIN-COLLISION/validate")
    assert val_resp.status_code == 200
    data = val_resp.json()
    assert data["is_feasible"] is False
    assert data["total_hard_violations"] >= 1
    types = [v["constraint_type"] for v in data["violations"]]
    assert "TRAIN_TRAFFIC_CONFLICT" in types

    # Check conflicts endpoint
    conf_resp = client.get("/api/v1/plans/PLAN-TRAIN-COLLISION/conflicts")
    assert conf_resp.status_code == 200
    cdata = conf_resp.json()
    assert cdata["is_feasible"] is False
    assert cdata["total_conflicts"] >= 1
    assert any(c["constraint_type"] == "TRAIN_TRAFFIC_CONFLICT" for c in cdata["conflicts"])


def test_validate_corridor_capacity_conflict():
    """3. Validate corridor capacity conflict (max_concurrent_blocks_per_corridor exceeded)."""
    # Max concurrency per corridor in default PlanningConstraints is 2.
    # We schedule 3 concurrent blocks on COR-NDLS-GZB simultaneously.
    capacity_plan = {
        "plan_id": "PLAN-CAPACITY-EXCEEDED",
        "title": "Capacity Exceeded Plan",
        "overall_score": 40.0,
        "is_feasible": True,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 60,
                "scheduled_end_minute": 180,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            },
            {
                "request_id": "REQ-V-02",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-OHE-01",
                "department": "Traction Distribution",
                "scheduled_start_minute": 60,
                "scheduled_end_minute": 150,
                "allocated_duration_minutes": 90,
                "status": "SCHEDULED",
            },
            {
                "request_id": "REQ-V-03",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 80,
                "scheduled_end_minute": 140,
                "allocated_duration_minutes": 60,
                "status": "SCHEDULED",
            },
        ]
    }
    client.post("/api/v1/plans", json=capacity_plan)
    val_resp = client.post("/api/v1/plans/PLAN-CAPACITY-EXCEEDED/validate")
    assert val_resp.status_code == 200
    data = val_resp.json()
    assert data["is_feasible"] is False
    assert data["total_hard_violations"] >= 1
    types = [v["constraint_type"] for v in data["violations"]]
    assert "CORRIDOR_CAPACITY_EXCEEDED" in types


def test_validate_invalid_maintenance_duration_and_window():
    """4. Validate invalid maintenance duration and window mismatches."""
    invalid_plan = {
        "plan_id": "PLAN-INVALID-WINDOW-DURATION",
        "title": "Invalid Window/Duration Plan",
        "overall_score": 30.0,
        "is_feasible": True,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                # REQ-V-01 requires 120m and latest_end_minute is 240
                # Here start=200, end=260 (span 60m != allocated 120m, span < required 120m, end 260 > latest 240)
                "scheduled_start_minute": 200,
                "scheduled_end_minute": 260,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            }
        ]
    }
    client.post("/api/v1/plans", json=invalid_plan)
    val_resp = client.post("/api/v1/plans/PLAN-INVALID-WINDOW-DURATION/validate")
    assert val_resp.status_code == 200
    data = val_resp.json()
    assert data["is_feasible"] is False
    types = [v["constraint_type"] for v in data["violations"]]
    assert "INSUFFICIENT_DURATION" in types
    assert "REQUEST_WINDOW_VIOLATION" in types


def test_validate_asset_conflict():
    """5. Validate asset conflict between overlapping blocks on the same asset."""
    # REQ-V-01 and REQ-V-03 are both Engineering on AST-TRK-01
    asset_conflict_plan = {
        "plan_id": "PLAN-ASSET-COLLISION",
        "title": "Asset Overlap Plan",
        "overall_score": 40.0,
        "is_feasible": True,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 60,
                "scheduled_end_minute": 180,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            },
            {
                "request_id": "REQ-V-03",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 100,
                "scheduled_end_minute": 160,
                "allocated_duration_minutes": 60,
                "status": "SCHEDULED",
            },
        ]
    }
    client.post("/api/v1/plans", json=asset_conflict_plan)
    val_resp = client.post("/api/v1/plans/PLAN-ASSET-COLLISION/validate")
    assert val_resp.status_code == 200
    data = val_resp.json()
    assert data["is_feasible"] is False
    types = [v["constraint_type"] for v in data["violations"]]
    assert "ASSET_CONFLICT" in types


def test_validate_individual_plan_item():
    """6. Validate an individual plan item via POST /validate-item/{item_id}."""
    plan_data = {
        "plan_id": "PLAN-ITEM-VAL-TEST",
        "title": "Item Validation Test",
        "overall_score": 75.0,
        "is_feasible": True,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 60,
                "scheduled_end_minute": 180,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            },
            {
                "request_id": "REQ-V-02",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-OHE-01",
                "department": "Traction Distribution",
                "scheduled_start_minute": 290,
                "scheduled_end_minute": 380,
                "allocated_duration_minutes": 90,
                "status": "SCHEDULED",  # overlaps train [300, 360]
            }
        ]
    }
    created = client.post("/api/v1/plans", json=plan_data).json()
    items = created["items"]
    item_v1 = items[0]
    item_v2 = items[1]

    # Item 1 is feasible
    res1 = client.post(f"/api/v1/plans/PLAN-ITEM-VAL-TEST/validate-item/{item_v1['id']}")
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["is_feasible"] is True
    assert len(data1["violations"]) == 0

    # Item 2 has a train conflict and window violation
    res2 = client.post(f"/api/v1/plans/PLAN-ITEM-VAL-TEST/validate-item/{item_v2['id']}")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["is_feasible"] is False
    assert len(data2["violations"]) >= 1
    types = [v["constraint_type"] for v in data2["violations"]]
    assert "TRAIN_TRAFFIC_CONFLICT" in types
    assert "REQUEST_WINDOW_VIOLATION" in types


def test_modify_plan_item_and_revalidate():
    """7. Modify a plan item via PATCH and verify automatic revalidation."""
    # Start with conflicting item overlapping train [300, 360]
    plan_data = {
        "plan_id": "PLAN-MODIFY-TEST",
        "title": "Modify Revalidate Test",
        "overall_score": 60.0,
        "is_feasible": False,
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 280,
                "scheduled_end_minute": 400,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            }
        ]
    }
    created = client.post("/api/v1/plans", json=plan_data).json()
    item_id = created["items"][0]["id"]

    # Before edit: validate confirms infeasible
    val_before = client.post("/api/v1/plans/PLAN-MODIFY-TEST/validate").json()
    assert val_before["is_feasible"] is False

    # Modify item to feasible window [60, 180]
    patch_resp = client.patch(
        f"/api/v1/plans/PLAN-MODIFY-TEST/items/{item_id}",
        json={
            "scheduled_start_minute": 60,
            "scheduled_end_minute": 180,
            "allocated_duration_minutes": 120,
        }
    )
    assert patch_resp.status_code == 200
    updated_item = patch_resp.json()
    assert updated_item["scheduled_start_minute"] == 60
    assert updated_item["scheduled_end_minute"] == 180
    assert updated_item["conflict_flags"] == []

    # Verify plan revalidated state
    get_plan = client.get("/api/v1/plans/PLAN-MODIFY-TEST").json()
    assert get_plan["is_feasible"] is True
    assert get_plan["status"] == "DRAFT"  # Review state preserved, not auto-approved


def test_hard_violations_cannot_be_marked_feasible():
    """8. Verify hard constraint violations strictly prevent plan from being feasible."""
    plan_data = {
        "plan_id": "PLAN-STRICT-HARD",
        "title": "Strict Hard Infeasible Test",
        "overall_score": 90.0,
        "is_feasible": True,  # Client claims feasible
        "items": [
            {
                "request_id": "REQ-V-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 300,
                "scheduled_end_minute": 420,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            }
        ]
    }
    client.post("/api/v1/plans", json=plan_data)

    # Validation must overwrite feasibility to False
    val_resp = client.post("/api/v1/plans/PLAN-STRICT-HARD/validate")
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["is_feasible"] is False
    assert val_data["total_hard_violations"] > 0

    # Get plan must reflect is_feasible = False
    plan_resp = client.get("/api/v1/plans/PLAN-STRICT-HARD").json()
    assert plan_resp["is_feasible"] is False
