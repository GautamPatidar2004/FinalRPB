import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from planning.optimizer import RailwayPlanOptimizer
from schemas.optimization import OptimizedPlanResult
from schemas.railway import MaintenanceBlockRequest, TrainTraffic, Priority
from main import app
from starlette.testclient import TestClient


def test_feasible_plan_optimization():
    dataset = generate_synthetic_dataset(num_requests=10, seed=42)
    optimizer = RailwayPlanOptimizer()

    result: OptimizedPlanResult = optimizer.optimize(dataset)
    assert isinstance(result, OptimizedPlanResult)
    assert result.is_feasible is True, "Optimized plan must be strictly feasible"
    assert result.feasibility.is_feasible is True
    assert result.evaluation.overall_score >= 0.0
    assert len(result.plan) == len(dataset.block_requests)
    assert len(result.decision_log) > 0

    # Ensure decision log explains decisions
    for log in result.decision_log:
        assert log.decision_type in ("SCHEDULED", "REPLANNED", "SWAPPED", "DEFERRED")
        assert len(log.rationale) > 0

    print(f"[PASS] Feasible plan optimization check (Strategy: {result.selected_strategy}, Score: {result.evaluation.overall_score:.1f})")


def test_automatic_replanning_on_conflict():
    dataset = generate_synthetic_dataset(num_requests=8, seed=105)
    optimizer = RailwayPlanOptimizer()

    result: OptimizedPlanResult = optimizer.optimize(dataset)
    assert result.is_feasible is True
    # If replanning was applied, check decision log includes replanned or swapped entries
    if result.replanning_applied:
        replan_entries = [d for d in result.decision_log if d.decision_type in ("REPLANNED", "SWAPPED")]
        assert len(replan_entries) > 0

    # Strict hard constraint check on final plan
    for block in result.plan:
        if block.status == "SCHEDULED":
            assert block.scheduled_end_minute - block.scheduled_start_minute == block.allocated_duration_minutes
            assert block.allocated_duration_minutes > 0

    print(f"[PASS] Automatic replanning on conflict check (Replanned: {result.replanning_applied})")


def test_impossible_case_unresolved_reporting():
    dataset = generate_synthetic_dataset(num_requests=4, seed=77)

    # Make request 0 impossible to schedule:
    # Requires 120 minutes inside window [200, 320]
    # But an express train covers [200, 320] on the same corridor
    target_req = dataset.block_requests[0]
    target_req.urgency = Priority.CRITICAL
    target_req.earliest_start_minute = 200
    target_req.latest_end_minute = 320
    target_req.required_duration_minutes = 120
    target_req.is_traffic_block_required = True

    blocking_train = TrainTraffic(
        train_id="TRN-BLOCKER",
        train_type="SUPERFAST_EXPRESS",
        corridor_id=target_req.corridor_id,
        entry_minute=190,
        exit_minute=330,
        priority_level=1,
    )
    dataset.trains.append(blocking_train)

    optimizer = RailwayPlanOptimizer()
    result: OptimizedPlanResult = optimizer.optimize(dataset)

    # 1. Final plan must remain feasible (never bypass hard constraint for bad schedule)
    assert result.is_feasible is True

    # 2. Target request must be cleanly deferred and reported as unresolved
    target_plan_record = next(p for p in result.plan if p.request_id == target_req.request_id)
    assert target_plan_record.status == "DEFERRED"

    unresolved_ids = [u.request_id for u in result.unresolved_requirements]
    assert target_req.request_id in unresolved_ids, "Impossible critical request must be in unresolved reports"

    unresolved_entry = next(u for u in result.unresolved_requirements if u.request_id == target_req.request_id)
    assert len(unresolved_entry.reasons) > 0
    assert "bounded_slot_search" in unresolved_entry.attempted_strategies
    print("[PASS] Impossible case unresolved requirement reporting check")


def test_api_end_to_end_optimized_plan():
    dataset = generate_synthetic_dataset(num_requests=6, seed=88)
    client = TestClient(app)

    response = client.post("/api/v1/plan", json={"payload": dataset.model_dump()})
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["status"] == "success"
    plan_data = res_json["plan"]
    assert "is_feasible" in plan_data
    assert "decision_log" in plan_data
    assert "evaluation" in plan_data
    assert "unresolved_requirements" in plan_data
    print("[PASS] API end-to-end optimized plan endpoint check")


if __name__ == "__main__":
    test_feasible_plan_optimization()
    test_automatic_replanning_on_conflict()
    test_impossible_case_unresolved_reporting()
    test_api_end_to_end_optimized_plan()
    print("All Prompt 7 checks passed successfully.")
