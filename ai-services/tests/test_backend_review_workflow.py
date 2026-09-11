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
def setup_review_test_env():
    """Seed clean, controlled operational railway environment for review workflow tests."""
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

    # Train on COR-NDLS-GZB running [300, 360]
    repository.create_train({
        "train_id": "TRN-EXP-01",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 300,
        "exit_minute": 360,
        "priority_level": 1,
    })

    # Request on COR-NDLS-GZB
    repository.create_request({
        "request_id": "REQ-R-01",
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


def test_full_review_lifecycle_draft_to_approved():
    """Test 1, 2, 8, 13: Generate DRAFT plan -> Start review -> Approve feasible plan -> Verify history."""
    # 1. Generate DRAFT plan
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    assert gen_resp.status_code == 201, gen_resp.text
    plan_id = gen_resp.json()["plan_id"]
    assert gen_resp.json()["status"] == "DRAFT"

    # 2. Start Review (DRAFT -> UNDER_REVIEW)
    start_resp = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "start_review",
        "reviewer": "Traffic Controller Sharma",
        "comment": "Initial review started for night block schedule",
    })
    assert start_resp.status_code == 200, start_resp.text
    s_data = start_resp.json()
    assert s_data["status"] == "UNDER_REVIEW"
    assert s_data["reviewer"] == "Traffic Controller Sharma"
    assert len(s_data["review_history"]) == 1
    assert s_data["review_history"][0]["previous_status"] == "DRAFT"
    assert s_data["review_history"][0]["new_status"] == "UNDER_REVIEW"

    # 3. Approve (UNDER_REVIEW -> APPROVED)
    app_resp = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "approve",
        "reviewer": "Chief Controller Verma",
        "comment": "Feasible and verified against express train timetable",
    })
    assert app_resp.status_code == 200, app_resp.text
    a_data = app_resp.json()
    assert a_data["status"] == "APPROVED"
    assert a_data["approved_by"] == "Chief Controller Verma"
    assert a_data["approved_at"] is not None
    assert len(a_data["review_history"]) == 2


def test_modify_block_item_and_automatic_revalidation():
    """Test 3, 4: Modify a block item in UNDER_REVIEW and verify revalidation."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    plan_id = gen_resp.json()["plan_id"]
    item_id = gen_resp.json()["scheduled_blocks"][0]["id"]

    # Start review
    client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "start_review"})

    # Modify item within valid window [60, 180]
    patch_resp = client.patch(f"/api/v1/plans/{plan_id}/items/{item_id}", json={
        "scheduled_start_minute": 70,
        "scheduled_end_minute": 190,
        "allocated_duration_minutes": 120,
    })
    assert patch_resp.status_code == 200
    updated_item = patch_resp.json()
    assert updated_item["scheduled_start_minute"] == 70
    assert updated_item["conflict_flags"] == []

    # Verify plan stays UNDER_REVIEW (never auto-approved) and remains feasible
    plan = client.get(f"/api/v1/plans/{plan_id}").json()
    assert plan["status"] == "UNDER_REVIEW"
    assert plan["is_feasible"] is True


def test_conflict_detection_and_approval_rejection_for_infeasible_plan():
    """Test 5, 6, 7: Introduce conflict via modification -> verify detected -> attempt approval and verify rejection."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    plan_id = gen_resp.json()["plan_id"]
    item_id = gen_resp.json()["scheduled_blocks"][0]["id"]

    client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "start_review"})

    # Move item into direct train path [300, 360] -> conflict!
    patch_resp = client.patch(f"/api/v1/plans/{plan_id}/items/{item_id}", json={
        "scheduled_start_minute": 290,
        "scheduled_end_minute": 410,
        "allocated_duration_minutes": 120,
    })
    assert patch_resp.status_code == 200
    updated_item = patch_resp.json()
    assert "TRAIN_TRAFFIC_CONFLICT" in updated_item["conflict_flags"]

    # Verify plan marked infeasible
    plan = client.get(f"/api/v1/plans/{plan_id}").json()
    assert plan["is_feasible"] is False

    # Attempt to approve infeasible plan -> must be rejected with 400
    app_resp = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "approve",
        "reviewer": "Controller",
    })
    assert app_resp.status_code == 400
    assert "Hard constraint violations detected" in app_resp.json()["detail"]


def test_approved_plan_protection():
    """Test 9: Attempt modification or deletion of APPROVED plan and verify rejection."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    plan_id = gen_resp.json()["plan_id"]
    item_id = gen_resp.json()["scheduled_blocks"][0]["id"]

    # DRAFT -> UNDER_REVIEW -> APPROVED
    client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "start_review"})
    client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "approve", "reviewer": "Admin"})

    # Attempt modification of item on approved plan -> 400
    patch_resp = client.patch(f"/api/v1/plans/{plan_id}/items/{item_id}", json={
        "scheduled_start_minute": 80,
    })
    assert patch_resp.status_code == 400
    assert "already APPROVED" in patch_resp.json()["detail"]

    # Attempt deletion of approved plan -> 400
    del_resp = client.delete(f"/api/v1/plans/{plan_id}")
    assert del_resp.status_code == 400
    assert "Cannot delete plan" in del_resp.json()["detail"]

    # Attempt further review actions on approved plan -> 400
    rev_resp = client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "approve"})
    assert rev_resp.status_code == 400
    assert "already APPROVED" in rev_resp.json()["detail"]


def test_plan_rejection_workflow_and_validation():
    """Test 10, 11: Rejection requires a reason; rejection preserves plan without deletion."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    plan_id = gen_resp.json()["plan_id"]

    client.post(f"/api/v1/plans/{plan_id}/review", json={"action": "start_review"})

    # Attempt rejection without reason -> 400
    rej_fail = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "reject",
        "reviewer": "Safety Officer",
        "comment": "",
    })
    assert rej_fail.status_code == 400
    assert "A rejection reason is required" in rej_fail.json()["detail"]

    # Reject with valid reason -> 200
    rej_success = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "reject",
        "reviewer": "Safety Officer",
        "comment": "VIP special train scheduled during this corridor window",
    })
    assert rej_success.status_code == 200
    r_data = rej_success.json()
    assert r_data["status"] == "REJECTED"
    assert r_data["rejection_reason"] == "VIP special train scheduled during this corridor window"

    # Verify plan still exists in database (not deleted)
    persisted = client.get(f"/api/v1/plans/{plan_id}").json()
    assert persisted["status"] == "REJECTED"
    assert persisted["rejection_reason"] == "VIP special train scheduled during this corridor window"
    assert len(persisted["items"]) > 0


def test_invalid_status_transitions():
    """Test 12: Test invalid status transitions (e.g., DRAFT directly to APPROVED)."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-R-01"],
    })
    plan_id = gen_resp.json()["plan_id"]

    # Attempt directly approving DRAFT plan without start_review -> 400
    direct_app = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "approve",
        "reviewer": "Controller",
    })
    assert direct_app.status_code == 400
    assert "must be UNDER_REVIEW" in direct_app.json()["detail"]

    # Attempt directly rejecting DRAFT plan without start_review -> 400
    direct_rej = client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "reject",
        "comment": "Not needed",
    })
    assert direct_rej.status_code == 400
    assert "must be UNDER_REVIEW" in direct_rej.json()["detail"]
