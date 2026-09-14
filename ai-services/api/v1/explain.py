from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field

from schemas.railway import (
    Department,
    MaintenanceBlockRequest,
    Priority,
    RailwayPlanningDataset,
)
from schemas.explainability import (
    PredictionExplanationResponse,
    UnifiedPlanExplanation,
)
from db.repository import repository
from planning.engine import PlanningEngine
from planning.optimizer import RailwayPlanOptimizer
from explainability.engine import ExplainabilityEngine

router = APIRouter(prefix="/explain", tags=["Explainability Engine"])

# Shared engine singletons
planning_engine = PlanningEngine()
plan_optimizer = RailwayPlanOptimizer(
    priority_model=planning_engine.priority_model,
    evaluator=planning_engine.evaluator,
    constraint_engine=planning_engine.constraint_engine,
)
explainability_engine = ExplainabilityEngine(
    priority_model=planning_engine.priority_model,
    constraint_engine=planning_engine.constraint_engine,
)


class ExplainPredictionRequest(BaseModel):
    request_id: Optional[str] = Field(None, description="Existing maintenance request ID to explain")
    corridor_id: Optional[str] = Field(None, description="Corridor ID if ad-hoc request")
    asset_id: Optional[str] = Field(None, description="Asset ID if ad-hoc request")
    department: Optional[Department] = Field(None, description="Department for ad-hoc request")
    required_duration_minutes: Optional[int] = Field(None, ge=15, le=1440)
    earliest_start_minute: Optional[int] = Field(None, ge=0, le=1440)
    latest_end_minute: Optional[int] = Field(None, ge=0, le=1440)
    is_traffic_block_required: Optional[bool] = Field(None)
    is_power_block_required: Optional[bool] = Field(None)
    urgency: Optional[Priority] = Field(None)
    linked_defect_id: Optional[str] = Field(None)


class ExplainPlanRequest(BaseModel):
    plan_id: Optional[str] = Field(None, description="Explain existing persisted block plan")
    corridor_id: Optional[str] = Field(None, description="Corridor for dynamic planning run")
    request_ids: Optional[List[str]] = Field(None, description="Specific request IDs to include")
    start_minute: Optional[int] = Field(0, ge=0, le=1440)
    end_minute: Optional[int] = Field(1440, ge=0, le=1440)
    use_llm: bool = Field(True, description="Enable Gemini/Groq narrative synthesis")


@router.post("/prediction", response_model=PredictionExplanationResponse)
def explain_prediction(payload: ExplainPredictionRequest):
    """
    POST /api/v1/explain/prediction
    Provides feature-level and domain-aspect SHAP/surrogate attributions for a maintenance request.
    """
    req_obj: Optional[MaintenanceBlockRequest] = None
    target_corridor_id = payload.corridor_id

    # 1. Resolve request object
    if payload.request_id:
        rec = repository.get_request(payload.request_id)
        if rec:
            req_obj = MaintenanceBlockRequest(
                request_id=rec["request_id"],
                corridor_id=rec["corridor_id"],
                asset_id=rec["asset_id"],
                department=rec["department"],
                requested_date=rec.get("requested_date", "2026-09-15"),
                required_duration_minutes=rec.get("required_duration_minutes", 120),
                earliest_start_minute=rec.get("earliest_start_minute", 60),
                latest_end_minute=rec.get("latest_end_minute", 360),
                is_traffic_block_required=rec.get("is_traffic_block_required", True),
                is_power_block_required=rec.get("is_power_block_required", False),
                urgency=rec.get("urgency", Priority.MEDIUM),
                linked_defect_id=rec.get("linked_defect_id"),
            )
            target_corridor_id = target_corridor_id or rec["corridor_id"]

    if not req_obj:
        if not (payload.request_id or payload.asset_id or payload.corridor_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Must specify request_id or complete request parameters for prediction explainability.",
            )
        req_obj = MaintenanceBlockRequest(
            request_id=payload.request_id or "REQ-ADHOC-001",
            corridor_id=payload.corridor_id or "COR-NDLS-GZB",
            asset_id=payload.asset_id or "AST-TRK-101",
            department=payload.department or Department.ENG,
            requested_date="2026-09-15",
            required_duration_minutes=payload.required_duration_minutes or 120,
            earliest_start_minute=payload.earliest_start_minute or 60,
            latest_end_minute=payload.latest_end_minute or 360,
            is_traffic_block_required=payload.is_traffic_block_required if payload.is_traffic_block_required is not None else True,
            is_power_block_required=payload.is_power_block_required if payload.is_power_block_required is not None else False,
            urgency=payload.urgency or Priority.MEDIUM,
            linked_defect_id=payload.linked_defect_id,
        )
        target_corridor_id = target_corridor_id or req_obj.corridor_id

    # 2. Build dataset context
    dataset = repository.build_planning_dataset(corridor_id=target_corridor_id)
    # Ensure req_obj is in dataset block_requests for relational features
    if not any(r.request_id == req_obj.request_id for r in dataset.block_requests):
        dataset.block_requests.append(req_obj)

    # 3. Generate explanation
    return explainability_engine.explain_prediction(req_obj, dataset)


@router.post("/plan", response_model=UnifiedPlanExplanation)
def explain_plan(payload: ExplainPlanRequest):
    """
    POST /api/v1/explain/plan
    Generates or retrieves unified explainability for a plan run.
    """
    # 1. If plan_id specified, check repository first
    if payload.plan_id:
        cached = repository.get_plan_explanation(payload.plan_id)
        if cached:
            return UnifiedPlanExplanation.model_validate(cached)

        persisted = repository.get_plan(payload.plan_id, include_items=True)
        if not persisted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Plan with ID '{payload.plan_id}' not found.",
            )

        # Build dataset for persisted plan's corridor
        items = persisted.get("items", [])
        c_id = items[0]["corridor_id"] if items else "COR-NDLS-GZB"
        dataset = repository.build_planning_dataset(corridor_id=c_id)
        opt_result = plan_optimizer.optimize(dataset)
        explanation = explainability_engine.explain_plan(
            dataset,
            opt_result,
            planning_run_id=payload.plan_id,
            include_narrative=payload.use_llm,
        )
        repository.save_plan_explanation(payload.plan_id, explanation.model_dump())
        return explanation

    # 2. Dynamic planning run explanation
    c_id = payload.corridor_id or "COR-NDLS-GZB"
    dataset = repository.build_planning_dataset(corridor_id=c_id)
    if not dataset.block_requests:
        repository.seed_demo_operational_data(force=True)
        dataset = repository.build_planning_dataset(corridor_id=c_id)
    if payload.request_ids:
        req_set = set(payload.request_ids)
        dataset.block_requests = [r for r in dataset.block_requests if r.request_id in req_set]
    if not dataset.block_requests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No eligible maintenance requests found for corridor '{c_id}'.",
        )

    opt_result = plan_optimizer.optimize(dataset)
    run_id = f"PLAN-EXP-{dataset.block_requests[0].request_id}"
    explanation = explainability_engine.explain_plan(
        dataset,
        opt_result,
        planning_run_id=run_id,
        include_narrative=payload.use_llm,
    )
    repository.save_plan_explanation(run_id, explanation.model_dump())
    return explanation


@router.get("/plan/{planning_run_id}", response_model=UnifiedPlanExplanation)
def get_plan_explanation(planning_run_id: str = Path(..., description="Unique planning run or plan ID")):
    """
    GET /api/v1/explain/plan/{planning_run_id}
    Retrieves the persisted unified explainability output for a specific plan.
    """
    cached = repository.get_plan_explanation(planning_run_id)
    if cached:
        return UnifiedPlanExplanation.model_validate(cached)

    plan = repository.get_plan(planning_run_id, include_items=True)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan or explanation record '{planning_run_id}' not found.",
        )

    # If plan exists but explanation not yet computed, compute and cache it
    items = plan.get("items", [])
    c_id = items[0]["corridor_id"] if items else "COR-NDLS-GZB"
    dataset = repository.build_planning_dataset(corridor_id=c_id)
    opt_result = plan_optimizer.optimize(dataset)
    explanation = explainability_engine.explain_plan(dataset, opt_result, planning_run_id=planning_run_id)
    repository.save_plan_explanation(planning_run_id, explanation.model_dump())
    return explanation


@router.get("/providers")
def get_providers_status():
    """
    GET /api/v1/explain/providers
    Returns current health, model, and availability telemetry for Gemini and Groq providers.
    """
    return explainability_engine.orchestrator.get_providers_status()
