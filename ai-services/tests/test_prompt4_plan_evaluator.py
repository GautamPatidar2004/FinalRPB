import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from planning.evaluator import PlanQualityEvaluator, evaluate_candidate_plan
from schemas.evaluation import EvaluationWeights, PlanEvaluationResult
from schemas.railway import GeneratedBlockPlanRecord, Priority


def test_plan_evaluator_high_quality_vs_conflicted():
    dataset = generate_synthetic_dataset(num_requests=6, seed=42)
    reqs = dataset.block_requests

    # 1. High-quality plan: schedules all requests during clear night shadow slots (no train overlap, proper duration)
    # Stagger across hours 01:00-05:00 on non-conflicting corridors/times
    clean_plan = []
    for idx, req in enumerate(reqs, start=1):
        # Place in night shadow between 60 and 240 min where no trains run
        start_min = 60 + ((idx - 1) * 20)
        clean_plan.append(
            GeneratedBlockPlanRecord(
                plan_id=f"PLN-{idx:03d}",
                request_id=req.request_id,
                corridor_id=req.corridor_id,
                asset_id=req.asset_id,
                department=req.department,
                scheduled_start_minute=start_min,
                scheduled_end_minute=start_min + req.required_duration_minutes,
                allocated_duration_minutes=req.required_duration_minutes,
                status="SCHEDULED",
            )
        )

    clean_eval = evaluate_candidate_plan(clean_plan, dataset)
    assert isinstance(clean_eval, PlanEvaluationResult)
    assert 0.0 <= clean_eval.overall_score <= 100.0
    assert clean_eval.factor_scores.priority_coverage == 100.0
    assert clean_eval.factor_scores.unresolved_risk_score == 100.0
    assert clean_eval.factor_scores.duration_efficiency == 100.0
    assert len(clean_eval.strengths) > 0

    # 2. Conflicted/Poor plan:
    # Leaves critical requests unscheduled, puts block right into an express train path, underallocates duration
    train = dataset.trains[0]
    conflicted_plan = [
        GeneratedBlockPlanRecord(
            plan_id="PLN-BAD-1",
            request_id=reqs[0].request_id,
            corridor_id=train.corridor_id,
            asset_id=reqs[0].asset_id,
            department=reqs[0].department,
            scheduled_start_minute=train.entry_minute,
            scheduled_end_minute=train.exit_minute,
            allocated_duration_minutes=15,  # under-allocated
            status="SCHEDULED",
        )
    ]

    conflicted_eval = evaluate_candidate_plan(conflicted_plan, dataset)
    # Assert specific penalties and factor drops
    assert conflicted_eval.factor_scores.conflict_free_score < 100.0
    assert conflicted_eval.factor_scores.duration_efficiency < 100.0
    assert conflicted_eval.factor_scores.unresolved_risk_score < 100.0
    assert conflicted_eval.factor_scores.priority_coverage < clean_eval.factor_scores.priority_coverage
    assert any("Train conflict" in p for p in conflicted_eval.penalties)
    assert any("Under-allocated duration" in p for p in conflicted_eval.penalties)
    assert conflicted_eval.overall_score < clean_eval.overall_score
    print(f"[PASS] High-quality ({clean_eval.overall_score:.1f}) vs Conflicted ({conflicted_eval.overall_score:.1f}) plan evaluation check")


def test_evaluator_determinism_and_custom_weights():
    dataset = generate_synthetic_dataset(num_requests=6, seed=99)
    sample_plan = [
        GeneratedBlockPlanRecord(
            plan_id="PLN-01",
            request_id=dataset.block_requests[0].request_id,
            corridor_id=dataset.block_requests[0].corridor_id,
            asset_id=dataset.block_requests[0].asset_id,
            department=dataset.block_requests[0].department,
            scheduled_start_minute=120,
            scheduled_end_minute=120 + dataset.block_requests[0].required_duration_minutes,
            allocated_duration_minutes=dataset.block_requests[0].required_duration_minutes,
            status="SCHEDULED",
        )
    ]

    # Determinism
    eval_1 = evaluate_candidate_plan(sample_plan, dataset)
    eval_2 = evaluate_candidate_plan(sample_plan, dataset)
    assert eval_1.model_dump() == eval_2.model_dump(), "Evaluation must be strictly deterministic"

    # Custom weights focusing 100% on conflict score
    conflict_weights = EvaluationWeights(
        priority_coverage_weight=0.0,
        unresolved_risk_weight=0.0,
        conflict_penalty_weight=1.0,
        operational_disruption_weight=0.0,
        window_utilization_weight=0.0,
        duration_efficiency_weight=0.0,
    )
    custom_eval = evaluate_candidate_plan(sample_plan, dataset, weights=conflict_weights)
    assert custom_eval.overall_score == custom_eval.factor_scores.conflict_free_score
    print("[PASS] Evaluator determinism and custom weights check")


if __name__ == "__main__":
    test_plan_evaluator_high_quality_vs_conflicted()
    test_evaluator_determinism_and_custom_weights()
    print("All Prompt 4 checks passed successfully.")
