import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from models.priority_model import PriorityRiskModelEngine
from planning.candidate_generator import CandidatePlanGenerator
from planning.engine import PlanningEngine
from schemas.planning import PlanningLoopResult
from main import app
from starlette.testclient import TestClient


def test_candidate_generation_strategies():
    dataset = generate_synthetic_dataset(num_requests=12, seed=42)
    priority_model = PriorityRiskModelEngine()
    scored = priority_model.score_dataset(dataset)

    generator = CandidatePlanGenerator(dataset, scored)
    candidates = generator.generate_all_candidates()

    # 1. Multiple strategies generated
    expected_strategies = ["priority_greedy", "night_shadow_focused", "joint_corridor_batching"]
    for strat in expected_strategies:
        assert strat in candidates, f"Strategy {strat} missing from candidate generation"
        assert len(candidates[strat]) == len(dataset.block_requests)

    # 2. Distinct scheduling alternatives
    greedy_starts = [p.scheduled_start_minute for p in candidates["priority_greedy"] if p.status == "SCHEDULED"]
    night_starts = [p.scheduled_start_minute for p in candidates["night_shadow_focused"] if p.status == "SCHEDULED"]
    assert greedy_starts != night_starts, "Strategies must generate distinct scheduling alternatives"

    # 3. Joint block combination in joint_corridor_batching
    joint_plan = candidates["joint_corridor_batching"]
    joint_blocks = [p for p in joint_plan if any("JOINT_BLOCK" in f for f in p.conflict_flags)]
    assert len(joint_blocks) > 0, "Joint block strategy must combine compatible ENG and TRD requests"

    # Verify co-scheduled start times for joint blocks on same corridor
    grouped_by_time = {}
    for jb in joint_blocks:
        grouped_by_time.setdefault((jb.corridor_id, jb.scheduled_start_minute), []).append(jb)
    co_scheduled = any(len(items) >= 2 for items in grouped_by_time.values())
    assert co_scheduled, "Compatible joint blocks must share scheduled start time"
    print("[PASS] Candidate generation strategies & joint combination check")


def test_planning_loop_evaluation_and_retention():
    dataset = generate_synthetic_dataset(num_requests=15, seed=101)
    engine = PlanningEngine()

    result: PlanningLoopResult = engine.run_planning_loop(dataset, top_k=2)

    assert result.total_generated == 3
    assert len(result.candidates) == 2, "Must retain exactly top_k candidates"
    assert result.best_candidate is not None

    # Check ranking
    assert result.candidates[0].rank == 1
    assert result.candidates[1].rank == 2
    assert result.candidates[0].evaluation.overall_score >= result.candidates[1].evaluation.overall_score
    assert result.best_candidate.strategy_name == result.candidates[0].strategy_name

    # Check that evaluations are populated
    for cand in result.candidates:
        assert 0.0 <= cand.evaluation.overall_score <= 100.0
        assert cand.evaluation.factor_scores is not None
        assert len(cand.plan) == len(dataset.block_requests)

    print(f"[PASS] Planning loop ranking check (Best: {result.best_candidate.strategy_name}, Score: {result.best_candidate.evaluation.overall_score:.1f})")


def test_api_inference_pipeline_with_planning_engine():
    dataset = generate_synthetic_dataset(num_requests=8, seed=55)
    client = TestClient(app)

    response = client.post("/api/v1/plan", json={"payload": dataset.model_dump()})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["plan"] is not None
    assert "best_candidate" in res_data["plan"]
    assert "candidates" in res_data["plan"]
    print("[PASS] End-to-end API inference pipeline with PlanningEngine check")


if __name__ == "__main__":
    test_candidate_generation_strategies()
    test_planning_loop_evaluation_and_retention()
    test_api_inference_pipeline_with_planning_engine()
    print("All Prompt 5 checks passed successfully.")
