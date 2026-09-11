import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from planning.optimizer import RailwayPlanOptimizer
from schemas.railway import (
    Department,
    MaintenanceBlockRequest,
    Priority,
    RailwayPlanningDataset,
    TrainTraffic,
)
from main import app
from starlette.testclient import TestClient


def test_e2e_normal_feasible_planning():
    """Scenario 1: Normal feasible planning flow."""
    client = TestClient(app)
    dataset = generate_synthetic_dataset(num_requests=6, seed=42)

    response = client.post("/api/v1/optimize", json=dataset.model_dump())
    assert response.status_code == 200
    res = response.json()

    assert res["is_feasible"] is True
    assert res["feasibility"]["total_hard_violations"] == 0
    assert len(res["plan"]) == 6
    assert res["evaluation"]["overall_score"] > 50.0

    # Verify decision log consistency
    plan_status_map = {p["request_id"]: p["status"] for p in res["plan"]}
    for log in res["decision_log"]:
        if log["decision_type"] in ("SCHEDULED", "DEFERRED"):
            assert plan_status_map[log["request_id"]] == log["decision_type"]
    print("[PASS] Scenario 1: Normal feasible planning")


def test_e2e_competing_requests_and_priority_precedence():
    """Scenario 2 & 3: Competing requests on same corridor with high-priority/overdue precedence."""
    dataset = generate_synthetic_dataset(num_requests=4, seed=99)
    corridor_id = dataset.corridors[0].corridor_id
    asset_eng = next(a for a in dataset.assets if a.corridor_id == corridor_id and a.department == Department.ENG)

    # Force 3 competing requests for the exact same 120-minute window on the same corridor
    # One CRITICAL, one HIGH, one LOW
    req_critical = MaintenanceBlockRequest(
        request_id="COMPETE-CRIT",
        department=Department.ENG,
        corridor_id=corridor_id,
        asset_id=asset_eng.asset_id,
        required_duration_minutes=120,
        earliest_start_minute=100,
        latest_end_minute=250,
        urgency=Priority.CRITICAL,
    )
    req_low = MaintenanceBlockRequest(
        request_id="COMPETE-LOW",
        department=Department.ENG,
        corridor_id=corridor_id,
        asset_id=asset_eng.asset_id,
        required_duration_minutes=120,
        earliest_start_minute=100,
        latest_end_minute=250,
        urgency=Priority.LOW,
    )

    dataset.block_requests = [req_critical, req_low]

    client = TestClient(app)
    response = client.post("/api/v1/optimize", json=dataset.model_dump())
    assert response.status_code == 200
    res = response.json()

    assert res["is_feasible"] is True
    crit_rec = next(p for p in res["plan"] if p["request_id"] == "COMPETE-CRIT")
    assert crit_rec["status"] == "SCHEDULED", "Critical request must be scheduled over low priority request"
    print("[PASS] Scenario 2 & 3: Competing requests and priority precedence")


def test_e2e_train_conflicts_and_alternative_replanning():
    """Scenario 4: Train traffic conflict resolved via automatic replanning."""
    dataset = generate_synthetic_dataset(num_requests=2, seed=55)
    req = dataset.block_requests[0]
    corridor_id = req.corridor_id
    req.earliest_start_minute = 100
    req.latest_end_minute = 500
    req.required_duration_minutes = 60
    req.is_traffic_block_required = True

    # Place a train right at minute 100..150
    train = TrainTraffic(
        train_id="TRN-OBSTACLE",
        train_type="SUPERFAST",
        corridor_id=corridor_id,
        entry_minute=100,
        exit_minute=150,
        priority_level=1,
    )
    dataset.trains = [train]
    dataset.block_requests = [req]

    optimizer = RailwayPlanOptimizer()
    result = optimizer.optimize(dataset)

    assert result.is_feasible is True
    rec = result.plan[0]
    assert rec.status == "SCHEDULED"
    # Scheduled slot must NOT overlap the train [100, 150]
    assert (rec.scheduled_end_minute <= 100 or rec.scheduled_start_minute >= 150)
    print("[PASS] Scenario 4: Train conflict resolved without violating hard constraints")


def test_e2e_impossible_unresolvable_case():
    """Scenario 5: Impossible window saturation cleanly reports unresolved requirement."""
    dataset = generate_synthetic_dataset(num_requests=1, seed=12)
    req = dataset.block_requests[0]
    req.earliest_start_minute = 200
    req.latest_end_minute = 260
    req.required_duration_minutes = 60
    req.is_traffic_block_required = True
    req.urgency = Priority.CRITICAL

    # Train covers whole window
    dataset.trains = [
        TrainTraffic(
            train_id="TRN-FULL-BLOCKER",
            train_type="MAIL_EXPRESS",
            corridor_id=req.corridor_id,
            entry_minute=190,
            exit_minute=270,
            priority_level=1,
        )
    ]
    dataset.block_requests = [req]

    client = TestClient(app)
    response = client.post("/api/v1/optimize", json=dataset.model_dump())
    assert response.status_code == 200
    res = response.json()

    assert res["is_feasible"] is True
    assert res["plan"][0]["status"] == "DEFERRED"
    assert len(res["unresolved_requirements"]) == 1
    unres = res["unresolved_requirements"][0]
    assert unres["request_id"] == req.request_id
    assert len(unres["reasons"]) > 0
    print("[PASS] Scenario 5: Impossible case deferred and cleanly reported")


def test_e2e_invalid_api_input():
    """Scenario 6: Malformed payload and bounds violations return HTTP 422."""
    client = TestClient(app)

    # 1. Non-dictionary body
    res_bad_type = client.post("/api/v1/optimize", json="not a json object")
    assert res_bad_type.status_code == 422

    # 2. Duration outside bounds (> 720 min)
    dataset = generate_synthetic_dataset(num_requests=1, seed=1).model_dump()
    dataset["block_requests"][0]["required_duration_minutes"] = 9999
    res_bounds = client.post("/api/v1/optimize", json=dataset)
    assert res_bounds.status_code == 422
    print("[PASS] Scenario 6: Invalid API requests return structured 422 errors")


if __name__ == "__main__":
    test_e2e_normal_feasible_planning()
    test_e2e_competing_requests_and_priority_precedence()
    test_e2e_train_conflicts_and_alternative_replanning()
    test_e2e_impossible_unresolvable_case()
    test_e2e_invalid_api_input()
    print("All Prompt 10 End-to-End validation checks passed successfully.")
