import sys
from pathlib import Path
import pytest
from starlette.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from schemas.railway import (
    Department,
    MaintenanceBlockRequest,
    Priority,
)
from schemas.explainability import (
    AspectExplanation,
    ConstraintExplanationRecord,
    DecisionReasonRecord,
    FeatureContribution,
    PredictionExplanationResponse,
    RequestDecisionTrace,
    ScoreBreakdown,
    UnifiedPlanExplanation,
)
from planning.engine import PlanningEngine
from planning.optimizer import RailwayPlanOptimizer
from explainability.engine import ExplainabilityEngine
from db.repository import repository
from main import app


@pytest.fixture
def dataset():
    return generate_synthetic_dataset(num_requests=6, seed=42)


@pytest.fixture
def planning_components():
    engine = PlanningEngine()
    optimizer = RailwayPlanOptimizer(
        priority_model=engine.priority_model,
        evaluator=engine.evaluator,
        constraint_engine=engine.constraint_engine,
    )
    explainability = ExplainabilityEngine(
        priority_model=engine.priority_model,
        constraint_engine=engine.constraint_engine,
    )
    return engine, optimizer, explainability


def test_shap_generation_and_fallback(dataset, planning_components):
    _, _, explainability = planning_components
    req = dataset.block_requests[0]

    resp = explainability.explain_prediction(req, dataset)

    assert isinstance(resp, PredictionExplanationResponse)
    assert resp.request_id == req.request_id
    assert resp.explanation_method in ("SHAP", "XGBOOST_TREE_SHAP", "TREE_CONTRIBUTIONS")
    assert len(resp.feature_contributions) > 0

    # Verify feature-level contract: feature, input_value, contribution, direction, importance_rank
    for idx, fc in enumerate(resp.feature_contributions, start=1):
        assert isinstance(fc, FeatureContribution)
        assert len(fc.feature) > 0
        assert isinstance(fc.input_value, float)
        assert isinstance(fc.contribution, float)
        assert fc.direction in ("POSITIVE", "NEGATIVE")
        assert fc.importance_rank == idx


def test_prediction_evidence_and_aspects(dataset, planning_components):
    _, _, explainability = planning_components
    req = dataset.block_requests[0]

    resp = explainability.explain_prediction(req, dataset)

    # Required domain aspects
    assert "maintenance_duration" in resp.aspects
    assert "asset_risk_priority" in resp.aspects
    assert "operational_impact" in resp.aspects

    for aspect_name, aspect in resp.aspects.items():
        assert isinstance(aspect, AspectExplanation)
        assert aspect.aspect == aspect_name
        assert len(aspect.summary) > 0
        assert isinstance(aspect.features, list)


def test_decision_trace_full_lineage(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)
    scored = explainability.priority_model.score_dataset(dataset)

    traces = explainability.build_decision_trace(dataset, scored, opt_result)

    assert len(traces) == len(dataset.block_requests)
    expected_stages = [
        "INPUT",
        "ML_PREDICTION",
        "CONSTRAINT_CHECK",
        "CANDIDATE_WINDOW",
        "CONFLICT_CHECK",
        "OPTIMIZATION",
        "SCORE",
        "FINAL_DECISION",
    ]

    for trace in traces:
        assert isinstance(trace, RequestDecisionTrace)
        assert trace.final_decision in ("SELECTED", "POSTPONED", "REJECTED")
        stage_names = [s.stage_name for s in trace.stages]
        for exp in expected_stages:
            assert exp in stage_names


def test_constraint_explanations_passed_and_failed(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)

    explanations = explainability.explain_constraints(opt_result.plan, dataset)
    assert len(explanations) > 0

    # Ensure canonical mappings exist
    canonical_types = {c.canonical_type for c in explanations}
    assert any(c in canonical_types for c in ("TRAIN_CONFLICT", "ASSET_OVERLAP", "INVALID_WINDOW", "RESOURCE_CONFLICT"))

    # Ensure passed flags are populated from actual engine results
    has_passed = any(c.passed for c in explanations)
    assert has_passed is True


def test_optimizer_evidence(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)

    opt_exp = explainability.explain_optimizer(opt_result)

    assert opt_exp.selected_strategy == opt_result.selected_strategy
    assert len(opt_exp.candidates_evaluated) == len(opt_result.candidates)

    selected_count = sum(1 for c in opt_exp.candidates_evaluated if c.is_selected)
    assert selected_count >= 1

    for cand in opt_exp.candidates_evaluated:
        assert cand.strategy_name in ("priority_greedy", "night_shadow_focused", "joint_corridor_batching", opt_result.selected_strategy)
        assert isinstance(cand.is_feasible, bool)
        assert isinstance(cand.score, float)
        assert isinstance(cand.hard_violations_count, int)


def test_score_breakdown(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)

    sb = explainability.explain_score(opt_result.evaluation)

    assert isinstance(sb, ScoreBreakdown)
    assert sb.overall_score == opt_result.evaluation.overall_score
    assert sb.risk_coverage >= 0.0
    assert sb.asset_availability >= 0.0
    assert sb.train_conflict >= 0.0
    assert sb.operational_impact >= 0.0
    assert sb.resource_utilization >= 0.0


def test_decision_reasons_all_types(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)
    scored = explainability.priority_model.score_dataset(dataset)

    scheduled, postponed, grouping, alternative = explainability.generate_decision_reasons(
        dataset=dataset,
        scored_requests=scored,
        opt_result=opt_result,
    )

    # At least scheduled blocks must exist for feasible dataset
    assert len(scheduled) > 0
    for r in scheduled:
        assert isinstance(r, DecisionReasonRecord)
        assert r.decision == "SELECTED"
        assert len(r.evidence) > 0
        assert r.slot is not None

    for r in postponed:
        assert r.decision == "POSTPONED"
        assert len(r.evidence) > 0


def test_model_version_tracking(dataset, planning_components):
    _, optimizer, explainability = planning_components
    opt_result = optimizer.optimize(dataset)

    unified = explainability.explain_plan(dataset, opt_result)
    assert isinstance(unified, UnifiedPlanExplanation)
    assert "priority_risk_model" in unified.model_versions
    assert "constraint_engine" in unified.model_versions
    assert "optimizer" in unified.model_versions
    assert "explainability_engine" in unified.model_versions


def test_existing_planning_result_compatibility(dataset, planning_components):
    """Verifies that running explainability NEVER alters planning decisions or scores."""
    _, optimizer, explainability = planning_components

    opt_result = optimizer.optimize(dataset)

    original_plan_items = [(p.request_id, p.status, p.scheduled_start_minute, p.scheduled_end_minute) for p in opt_result.plan]
    original_score = opt_result.evaluation.overall_score
    original_strategy = opt_result.selected_strategy
    original_feasibility = opt_result.is_feasible

    # Run explainability
    explanation = explainability.explain_plan(dataset, opt_result)

    after_plan_items = [(p.request_id, p.status, p.scheduled_start_minute, p.scheduled_end_minute) for p in opt_result.plan]
    assert original_plan_items == after_plan_items
    assert original_score == opt_result.evaluation.overall_score
    assert original_strategy == opt_result.selected_strategy
    assert original_feasibility == opt_result.is_feasible
    assert explanation.selected_plan["overall_score"] == original_score


def test_missing_and_invalid_explanation_data(planning_components):
    _, _, explainability = planning_components
    client = TestClient(app)

    # 1. Invalid prediction request (empty request)
    bad_resp = client.post("/api/v1/explain/prediction", json={})
    assert bad_resp.status_code == 400

    # 2. Non-existent plan ID
    missing_plan_resp = client.get("/api/v1/explain/plan/PLAN-DOES-NOT-EXIST-999")
    assert missing_plan_resp.status_code == 404


def test_explainability_api_endpoints():
    client = TestClient(app)

    # 1. POST /api/v1/explain/prediction
    pred_res = client.post(
        "/api/v1/explain/prediction",
        json={
            "corridor_id": "COR-NDLS-GZB",
            "asset_id": "AST-TRK-101",
            "department": "Engineering",
            "required_duration_minutes": 120,
            "earliest_start_minute": 60,
            "latest_end_minute": 360,
            "is_traffic_block_required": True,
            "urgency": "HIGH",
        },
    )
    assert pred_res.status_code == 200
    data = pred_res.json()
    assert "feature_contributions" in data
    assert "aspects" in data
    assert data["predicted_score"] > 0

    # 2. POST /api/v1/explain/plan
    plan_res = client.post(
        "/api/v1/explain/plan",
        json={"corridor_id": "COR-NDLS-GZB"},
    )
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert "planning_run_id" in plan_data
    assert "decision_trace" in plan_data
    assert "score_breakdown" in plan_data
    run_id = plan_data["planning_run_id"]

    # 3. GET /api/v1/explain/plan/{planning_run_id}
    get_res = client.get(f"/api/v1/explain/plan/{run_id}")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["planning_run_id"] == run_id
    assert "optimizer_decisions" in get_data

    # 4. GET /api/v1/explain/providers
    prov_res = client.get("/api/v1/explain/providers")
    assert prov_res.status_code == 200
    prov_data = prov_res.json()
    assert "gemini" in prov_data
    assert "groq" in prov_data
    assert "deterministic" in prov_data
