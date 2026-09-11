import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from planning.constraints import RailwayConstraintEngine, validate_plan_feasibility
from planning.engine import PlanningEngine
from schemas.constraints import ConstraintType, PlanFeasibilityResult
from schemas.railway import GeneratedBlockPlanRecord, Department


def test_train_traffic_conflict_hard_constraint():
    dataset = generate_synthetic_dataset(num_requests=5, seed=42)
    req = dataset.block_requests[0]
    # Find a train on this request's corridor
    train = next(t for t in dataset.trains if t.corridor_id == req.corridor_id)

    # Force direct collision with train
    collision_block = GeneratedBlockPlanRecord(
        plan_id="PLN-COLLISION",
        request_id=req.request_id,
        corridor_id=req.corridor_id,
        asset_id=req.asset_id,
        department=req.department,
        scheduled_start_minute=train.entry_minute,
        scheduled_end_minute=train.exit_minute,
        allocated_duration_minutes=train.exit_minute - train.entry_minute,
        status="SCHEDULED",
    )

    feasibility = validate_plan_feasibility([collision_block], dataset)
    assert not feasibility.is_feasible, "Train collision must render plan infeasible"
    violation_types = [v.constraint_type for v in feasibility.violations]
    assert ConstraintType.TRAIN_TRAFFIC_CONFLICT in violation_types
    assert any(train.train_id in v.reason for v in feasibility.violations)
    print("[PASS] Train traffic collision hard constraint check")


def test_duration_and_window_hard_constraints():
    dataset = generate_synthetic_dataset(num_requests=5, seed=42)
    req = dataset.block_requests[0]

    # 1. Insufficient duration violation
    bad_duration_block = GeneratedBlockPlanRecord(
        plan_id="PLN-SHORT",
        request_id=req.request_id,
        corridor_id=req.corridor_id,
        asset_id=req.asset_id,
        department=req.department,
        scheduled_start_minute=req.earliest_start_minute,
        scheduled_end_minute=req.earliest_start_minute + 10,
        allocated_duration_minutes=10,  # required is e.g. 60+
        status="SCHEDULED",
    )
    res_dur = validate_plan_feasibility([bad_duration_block], dataset)
    assert not res_dur.is_feasible
    assert any(v.constraint_type == ConstraintType.INSUFFICIENT_DURATION for v in res_dur.violations)

    # 2. Request window violation (scheduled after latest_end_minute)
    outside_window_block = GeneratedBlockPlanRecord(
        plan_id="PLN-LATE",
        request_id=req.request_id,
        corridor_id=req.corridor_id,
        asset_id=req.asset_id,
        department=req.department,
        scheduled_start_minute=req.latest_end_minute + 10,
        scheduled_end_minute=req.latest_end_minute + 10 + req.required_duration_minutes,
        allocated_duration_minutes=req.required_duration_minutes,
        status="SCHEDULED",
    )
    res_win = validate_plan_feasibility([outside_window_block], dataset)
    assert not res_win.is_feasible
    assert any(v.constraint_type == ConstraintType.REQUEST_WINDOW_VIOLATION for v in res_win.violations)
    print("[PASS] Duration and time-window hard constraints check")


def test_corridor_capacity_and_asset_conflicts():
    dataset = generate_synthetic_dataset(num_requests=6, seed=42)
    reqs = dataset.block_requests
    corridor_id = reqs[0].corridor_id
    max_concurrent = dataset.constraints.max_concurrent_blocks_per_corridor

    # Create concurrent blocks on same corridor exceeding capacity
    overloaded_plan = []
    for idx in range(max_concurrent + 2):
        overloaded_plan.append(
            GeneratedBlockPlanRecord(
                plan_id=f"PLN-OVER-{idx}",
                request_id=reqs[idx].request_id,
                corridor_id=corridor_id,
                asset_id=reqs[idx].asset_id,
                department=reqs[idx].department,
                scheduled_start_minute=100,
                scheduled_end_minute=200,
                allocated_duration_minutes=100,
                status="SCHEDULED",
            )
        )
    res_cap = validate_plan_feasibility(overloaded_plan, dataset)
    assert not res_cap.is_feasible
    assert any(v.constraint_type == ConstraintType.CORRIDOR_CAPACITY_EXCEEDED for v in res_cap.violations)
    print("[PASS] Corridor capacity limit hard constraint check")


def test_feasibility_integration_in_planning_engine():
    dataset = generate_synthetic_dataset(num_requests=10, seed=123)
    engine = PlanningEngine()

    result = engine.run_planning_loop(dataset, top_k=3)
    assert result.total_generated > 0

    # Every candidate bundle must have feasibility evaluated
    for candidate in result.candidates:
        assert candidate.feasibility is not None
        assert isinstance(candidate.feasibility, PlanFeasibilityResult)
        assert isinstance(candidate.feasibility.is_feasible, bool)

    # Feasible candidates must be ranked before infeasible candidates
    feasible_flags = [c.feasibility.is_feasible for c in result.candidates]
    # Verify no True appears after False
    if False in feasible_flags:
        first_false = feasible_flags.index(False)
        assert not any(feasible_flags[first_false:]), "Infeasible candidate ranked above feasible candidate"

    print("[PASS] Planning engine feasibility integration and ranking check")


if __name__ == "__main__":
    test_train_traffic_conflict_hard_constraint()
    test_duration_and_window_hard_constraints()
    test_corridor_capacity_and_asset_conflicts()
    test_feasibility_integration_in_planning_engine()
    print("All Prompt 6 checks passed successfully.")
