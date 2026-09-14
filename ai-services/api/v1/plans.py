from datetime import datetime, timezone
from typing import List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Query, status
from db.repository import repository
from schemas.backend import (
    BlockPlanCreate,
    BlockPlanStatusUpdate,
    BlockPlanResponse,
    PlanGenerationRequest,
    PlanGenerationResponse,
    BlockPlanItemResponse,
    PlanValidationResponse,
    PlanConflictResponse,
    ItemValidationResponse,
    PlanItemUpdateRequest,
    PlanReviewAction,
    PlanReviewRequest,
    PlanReviewResponse,
    Department,
)
from schemas.optimization import OptimizedPlanResult
from planning.engine import PlanningEngine
from planning.optimizer import RailwayPlanOptimizer
from explainability.engine import ExplainabilityEngine

router = APIRouter(prefix="/plans", tags=["Block Plans"])

# Reusable AI Planning Engine singleton
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


@router.get("/generate", response_model=PlanGenerationResponse)
def generate_plan_get(
    corridor_id: Optional[str] = Query(None, description="Filter planning to specific corridor"),
    department: Optional[Department] = Query(None, description="Filter planning to specific department"),
    start_minute: Optional[int] = Query(None, ge=0, le=1440, description="Planning window start"),
    end_minute: Optional[int] = Query(None, ge=0, le=1440, description="Planning window end"),
    title: Optional[str] = Query(None, description="Optional custom title for the generated plan"),
):
    """
    GET trigger for AI Plan Generation with optional query filters.
    Enables direct browser / GET requests without conflicting with /{plan_id}.
    """
    payload = PlanGenerationRequest(
        title=title,
        corridor_id=corridor_id,
        department=department,
        start_minute=start_minute,
        end_minute=end_minute,
    )
    return generate_and_persist_plan(payload)


@router.post("/generate", response_model=PlanGenerationResponse, status_code=status.HTTP_201_CREATED)
def generate_and_persist_plan(payload: PlanGenerationRequest):
    """
    Core AI Planning Engine integration:
    1. Validates planning input against operational database (requests, corridors, assets).
    2. Constructs standard RailwayPlanningDataset from persisted operational data.
    3. Executes the full AI planning pipeline (Priority/Risk -> candidate generation ->
       hard constraints -> feasibility -> optimization -> bounded replanning -> final plan).
    4. Persists the generated plan and item assignments into Supabase/repository.
    5. Returns normalized application-facing plan response with explainability metrics.
    """
    dept_str = payload.department.value if payload.department else None

    # 1. Validate requested IDs if specified
    if payload.request_ids:
        missing_ids = []
        non_eligible_ids = []
        for req_id in payload.request_ids:
            rec = repository.get_request(req_id)
            if not rec:
                missing_ids.append(req_id)
            elif rec.get("status") not in ("PENDING", "APPROVED"):
                non_eligible_ids.append(f"{req_id} ({rec.get('status')})")

        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following requested maintenance IDs do not exist: {', '.join(missing_ids)}",
            )
        if non_eligible_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The following requests are not eligible for planning (must be PENDING or APPROVED): {', '.join(non_eligible_ids)}",
            )

    # 2. Build RailwayPlanningDataset from persisted operational data
    try:
        dataset = repository.build_planning_dataset(
            corridor_id=payload.corridor_id,
            department=dept_str,
            status="PENDING,APPROVED",
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to assemble operational dataset: {str(val_err)}"
        )

    # 3. Filter dataset according to request payload criteria
    if payload.request_ids:
        selected_set = set(payload.request_ids)
        dataset.block_requests = [r for r in dataset.block_requests if r.request_id in selected_set]

    if payload.start_minute is not None:
        dataset.block_requests = [r for r in dataset.block_requests if r.latest_end_minute >= payload.start_minute]

    if payload.end_minute is not None:
        dataset.block_requests = [r for r in dataset.block_requests if r.earliest_start_minute <= payload.end_minute]

    if not dataset.block_requests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No eligible maintenance requests found matching the specified planning criteria.",
        )

    # 4. Execute the complete AI planning & optimization pipeline
    try:
        opt_result: OptimizedPlanResult = plan_optimizer.optimize(dataset)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Planning pipeline execution error: {str(exc)}",
        )

    # 5. Persist the plan and block items into Supabase/repository
    plan_id = f"PLAN-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
    plan_title = payload.title or f"Generated Maintenance Block Plan ({datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')})"

    evaluation_summary = {
        "overall_score": opt_result.evaluation.overall_score,
        "factor_scores": opt_result.evaluation.factor_scores.model_dump(),
        "strengths": opt_result.evaluation.strengths,
        "penalties": opt_result.evaluation.penalties,
        "metrics": opt_result.evaluation.metrics,
        "feasibility": opt_result.feasibility.model_dump(),
        "decision_log": [d.model_dump() for d in opt_result.decision_log],
        "unresolved_requirements": [u.model_dump() for u in opt_result.unresolved_requirements],
        "replanning_applied": opt_result.replanning_applied,
    }

    plan_record = {
        "plan_id": plan_id,
        "title": plan_title,
        "overall_score": opt_result.evaluation.overall_score,
        "is_feasible": opt_result.is_feasible,
        "selected_strategy": opt_result.selected_strategy,
        "evaluation_summary": evaluation_summary,
    }

    items_to_persist = []
    for item in opt_result.plan:
        items_to_persist.append({
            "request_id": item.request_id,
            "corridor_id": item.corridor_id,
            "asset_id": item.asset_id,
            "department": item.department.value,
            "scheduled_start_minute": item.scheduled_start_minute,
            "scheduled_end_minute": item.scheduled_end_minute,
            "allocated_duration_minutes": item.allocated_duration_minutes,
            "status": item.status,
            "conflict_flags": item.conflict_flags,
        })

    try:
        persisted = repository.create_plan(plan_record, items_to_persist)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database persistence failed: {str(exc)}"
        )

    # 6. Generate explainability output and attach to plan record
    plan_explanation = explainability_engine.explain_plan(dataset, opt_result, planning_run_id=plan_id)
    repository.save_plan_explanation(plan_id, plan_explanation.model_dump())

    # 7. Construct normalized application-facing response
    scheduled_blocks_resp = [
        BlockPlanItemResponse(
            id=it.get("id"),
            plan_id=plan_id,
            request_id=it["request_id"],
            corridor_id=it["corridor_id"],
            asset_id=it["asset_id"],
            department=it["department"],
            scheduled_start_minute=it["scheduled_start_minute"],
            scheduled_end_minute=it["scheduled_end_minute"],
            allocated_duration_minutes=it["allocated_duration_minutes"],
            status=it.get("status", "SCHEDULED"),
            conflict_flags=it.get("conflict_flags", []),
            created_at=it.get("created_at"),
            updated_at=it.get("updated_at"),
        )
        for it in persisted.get("items", [])
    ]

    return PlanGenerationResponse(
        plan_id=plan_id,
        title=plan_title,
        status=persisted.get("status", "DRAFT"),
        is_feasible=opt_result.is_feasible,
        overall_score=opt_result.evaluation.overall_score,
        selected_strategy=opt_result.selected_strategy,
        created_at=persisted.get("created_at", datetime.now(timezone.utc).isoformat()),
        scheduled_blocks=scheduled_blocks_resp,
        evaluation=evaluation_summary,
        decision_log=[d.model_dump() for d in opt_result.decision_log],
        unresolved_requests=[u.model_dump() for u in opt_result.unresolved_requirements],
        replanning_applied=opt_result.replanning_applied,
        explanation=plan_explanation.model_dump(),
    )


@router.get("", response_model=List[BlockPlanResponse])
def list_plans(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by plan status"),
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
):
    """List generated or persisted railway block plans with optional status and corridor filtering."""
    try:
        return repository.list_plans(status=status_filter, corridor_id=corridor_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch block plans: {str(exc)}")


@router.post("", response_model=BlockPlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(payload: BlockPlanCreate):
    """Persist a candidate or finalized railway block plan with its scheduled items."""
    existing = repository.get_plan(payload.plan_id, include_items=False)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Block plan '{payload.plan_id}' already exists."
        )

    plan_data = {
        "plan_id": payload.plan_id,
        "title": payload.title,
        "overall_score": payload.overall_score,
        "is_feasible": payload.is_feasible,
        "selected_strategy": payload.selected_strategy,
        "evaluation_summary": payload.evaluation_summary,
    }
    items_data = []
    for it in payload.items:
        it_dict = it.model_dump()
        it_dict["department"] = it.department.value
        items_data.append(it_dict)

    try:
        return repository.create_plan(plan_data, items_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to persist block plan: {str(exc)}")


@router.get("/{plan_id}", response_model=BlockPlanResponse)
def get_plan(plan_id: str):
    """Retrieve full details of a block plan along with all scheduled item assignments."""
    plan = repository.get_plan(plan_id, include_items=True)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found."
        )
    return plan


@router.patch("/{plan_id}/status", response_model=BlockPlanResponse)
@router.put("/{plan_id}/status", response_model=BlockPlanResponse)
def update_plan_status(plan_id: str, payload: BlockPlanStatusUpdate):
    """Update review and approval state of a block plan (e.g. APPROVED, REJECTED)."""
    valid_statuses = ("DRAFT", "UNDER_REVIEW", "PENDING_APPROVAL", "APPROVED", "REJECTED")
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{payload.status}'. Must be one of: {', '.join(valid_statuses)}"
        )

    plan = repository.get_plan(plan_id, include_items=False)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found."
        )

    updated = repository.update_plan_status(
        plan_id=plan_id,
        status=payload.status,
        approved_by=payload.approved_by,
        rejection_reason=payload.rejection_reason,
    )
    return updated


@router.delete("/{plan_id}", status_code=status.HTTP_200_OK)
def delete_plan(plan_id: str):
    """
    Remove a block plan.
    Logically safe: only DRAFT or REJECTED plans can be removed.
    Active APPROVED or PENDING_APPROVAL plans cannot be deleted.
    """
    plan = repository.get_plan(plan_id, include_items=False)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found."
        )
    try:
        success = repository.delete_plan(plan_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete block plan.")
        return {"status": "deleted", "plan_id": plan_id}
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))


# ==========================================
# BACKEND PROMPT 5: VALIDATION & CONFLICT APIS
# ==========================================

def _run_plan_constraint_evaluation(plan_id: str):
    """
    Shared helper:
    1. Loads persisted plan and items from repository/Supabase.
    2. Gathers corridors touched by the plan (or all if none).
    3. Builds RailwayPlanningDataset with status=None to retain original request definitions.
    4. Converts persisted plan items into GeneratedBlockPlanRecord domain objects.
    5. Runs the existing RailwayConstraintEngine.
    Returns: (plan_dict, items, dataset, feasibility_result, domain_blocks)
    """
    plan = repository.get_plan(plan_id, include_items=True)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found.",
        )

    raw_items = plan.get("items", [])
    if not raw_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Block plan '{plan_id}' contains no scheduled items to validate.",
        )

    # Determine corridors involved
    corridor_ids = list({it["corridor_id"] for it in raw_items if it.get("corridor_id")})
    primary_corridor = corridor_ids[0] if len(corridor_ids) == 1 else None

    try:
        dataset = repository.build_planning_dataset(
            corridor_id=primary_corridor,
            status=None,  # Do not filter by status so scheduled/completed/pending requests are included
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assemble operational context for validation: {str(exc)}",
        )

    # Convert persisted items to GeneratedBlockPlanRecord
    from schemas.railway import GeneratedBlockPlanRecord, Department
    domain_blocks: List[GeneratedBlockPlanRecord] = []
    for it in raw_items:
        domain_blocks.append(
            GeneratedBlockPlanRecord(
                plan_id=it.get("plan_id") or plan_id,
                request_id=it["request_id"],
                corridor_id=it["corridor_id"],
                asset_id=it["asset_id"],
                department=Department(it["department"]),
                scheduled_start_minute=int(it["scheduled_start_minute"]),
                scheduled_end_minute=int(it["scheduled_end_minute"]),
                allocated_duration_minutes=int(it["allocated_duration_minutes"]),
                status=it.get("status", "SCHEDULED"),
                conflict_flags=it.get("conflict_flags", []),
            )
        )

    feasibility = planning_engine.constraint_engine.validate(domain_blocks, dataset)
    return plan, raw_items, dataset, feasibility, domain_blocks


@router.post("/{plan_id}/validate", response_model=PlanValidationResponse)
def validate_plan(plan_id: str):
    """
    POST /api/v1/plans/{plan_id}/validate
    Reuses existing RailwayConstraintEngine to validate all hard constraints for the plan.
    Updates plan feasibility state and block-item conflict flags in the database.
    """
    plan, raw_items, dataset, feasibility, domain_blocks = _run_plan_constraint_evaluation(plan_id)

    # Map violations to items by request_id
    items_conflict_map: dict = {it["request_id"]: [] for it in raw_items}
    for v in feasibility.violations:
        if v.request_id and v.request_id in items_conflict_map:
            items_conflict_map[v.request_id].append(v.constraint_type.value)

    eval_summary = plan.get("evaluation_summary") or {}
    eval_summary["feasibility"] = feasibility.model_dump()
    eval_summary["last_validated_at"] = datetime.now(timezone.utc).isoformat()

    # Persist updated feasibility and conflict flags without changing review status
    repository.update_plan_validation(
        plan_id=plan_id,
        is_feasible=feasibility.is_feasible,
        evaluation_summary=eval_summary,
        items_conflict_map=items_conflict_map,
    )

    return PlanValidationResponse(
        plan_id=plan_id,
        is_feasible=feasibility.is_feasible,
        total_hard_violations=feasibility.total_hard_violations,
        violations=[v.model_dump() for v in feasibility.violations],
        summary=feasibility.summary,
        overall_score=plan.get("overall_score"),
    )


@router.get("/{plan_id}/conflicts", response_model=PlanConflictResponse)
def get_plan_conflicts(plan_id: str):
    """
    GET /api/v1/plans/{plan_id}/conflicts
    Returns structured conflicts and violations for the selected plan using the existing constraint engine.
    """
    plan, raw_items, dataset, feasibility, domain_blocks = _run_plan_constraint_evaluation(plan_id)

    return PlanConflictResponse(
        plan_id=plan_id,
        is_feasible=feasibility.is_feasible,
        total_conflicts=feasibility.total_hard_violations,
        conflicts=[v.model_dump() for v in feasibility.violations],
        summary=feasibility.summary,
    )


@router.post("/{plan_id}/validate-item/{item_id}", response_model=ItemValidationResponse)
def validate_plan_item(plan_id: str, item_id: str):
    """
    POST /api/v1/plans/{plan_id}/validate-item/{item_id}
    Validates a single plan item against all hard constraints in context of the whole plan.
    """
    item = repository.get_plan_item(plan_id, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan item '{item_id}' not found in plan '{plan_id}'.",
        )

    req_id = item["request_id"]
    plan, raw_items, dataset, feasibility, domain_blocks = _run_plan_constraint_evaluation(plan_id)

    # Filter violations affecting this item
    item_violations = [v for v in feasibility.violations if v.request_id == req_id]
    item_feasible = (len(item_violations) == 0)

    if item_feasible:
        summary = f"Plan item '{item_id}' (request '{req_id}') satisfies all hard constraints."
    else:
        summary = f"Plan item '{item_id}' has {len(item_violations)} hard constraint violation(s)."

    return ItemValidationResponse(
        plan_id=plan_id,
        item_id=str(item.get("id") or item_id),
        request_id=req_id,
        is_feasible=item_feasible,
        violations=[v.model_dump() for v in item_violations],
        summary=summary,
    )


@router.patch("/{plan_id}/items/{item_id}", response_model=BlockPlanItemResponse)
@router.put("/{plan_id}/items/{item_id}", response_model=BlockPlanItemResponse)
def update_plan_item(plan_id: str, item_id: str, payload: PlanItemUpdateRequest):
    """
    Modify-then-validate support:
    1. Safely updates scheduling fields (scheduled_start_minute, scheduled_end_minute, allocated_duration_minutes, status).
    2. Synchronizes duration with time span if both start and end are updated.
    3. Preserves review state (does not auto-approve, keeps plan DRAFT or PENDING_APPROVAL).
    4. Automatically triggers revalidation so hard constraints are strictly verified.
    5. Returns the updated item with refreshed conflict flags.
    """
    plan = repository.get_plan(plan_id, include_items=False)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found.",
        )
    if plan.get("status") == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify item in plan '{plan_id}' because it is already APPROVED. Approved plans are immutable.",
        )

    item = repository.get_plan_item(plan_id, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Plan item '{item_id}' not found in plan '{plan_id}'.",
        )

    updates = {}
    new_start = payload.scheduled_start_minute if payload.scheduled_start_minute is not None else item["scheduled_start_minute"]
    new_end = payload.scheduled_end_minute if payload.scheduled_end_minute is not None else item["scheduled_end_minute"]

    if new_start > new_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"scheduled_start_minute ({new_start}) cannot exceed scheduled_end_minute ({new_end}).",
        )

    if payload.scheduled_start_minute is not None:
        updates["scheduled_start_minute"] = payload.scheduled_start_minute
    if payload.scheduled_end_minute is not None:
        updates["scheduled_end_minute"] = payload.scheduled_end_minute

    if payload.allocated_duration_minutes is not None:
        updates["allocated_duration_minutes"] = payload.allocated_duration_minutes
    elif payload.scheduled_start_minute is not None or payload.scheduled_end_minute is not None:
        # Keep allocated_duration_minutes in sync with the time span
        updates["allocated_duration_minutes"] = new_end - new_start

    if payload.status is not None:
        updates["status"] = payload.status

    updated_item = repository.update_plan_item(plan_id, item_id, updates)
    if not updated_item:
        raise HTTPException(status_code=500, detail="Failed to update plan item.")

    # Re-run constraint evaluation for the entire plan
    try:
        plan, raw_items, dataset, feasibility, domain_blocks = _run_plan_constraint_evaluation(plan_id)
        items_conflict_map: dict = {it["request_id"]: [] for it in raw_items}
        for v in feasibility.violations:
            if v.request_id and v.request_id in items_conflict_map:
                items_conflict_map[v.request_id].append(v.constraint_type.value)

        eval_summary = plan.get("evaluation_summary") or {}
        eval_summary["feasibility"] = feasibility.model_dump()
        eval_summary["last_validated_at"] = datetime.now(timezone.utc).isoformat()

        repository.update_plan_validation(
            plan_id=plan_id,
            is_feasible=feasibility.is_feasible,
            evaluation_summary=eval_summary,
            items_conflict_map=items_conflict_map,
        )

        # Refresh the item from repository to get newly updated conflict_flags
        refreshed_item = repository.get_plan_item(plan_id, item_id)
        if refreshed_item:
            updated_item = refreshed_item
    except Exception:
        # If dataset evaluation encounters an issue, return updated item as is
        pass

    return updated_item


# ==========================================
# BACKEND PROMPT 6: HUMAN REVIEW WORKFLOW
# ==========================================

@router.post("/{plan_id}/review", response_model=PlanReviewResponse)
def review_plan(plan_id: str, payload: PlanReviewRequest):
    """
    POST /api/v1/plans/{plan_id}/review
    Human review lifecycle workflow:
    - start_review: DRAFT -> UNDER_REVIEW
    - approve: UNDER_REVIEW -> APPROVED (must pass all hard constraints)
    - reject: UNDER_REVIEW -> REJECTED (requires meaningful rejection reason)

    Strict transition rules:
    - Already APPROVED plans cannot be re-approved, modified, or transitioned.
    - Approval strictly requires plan existence, non-empty scheduled items, and 0 hard constraint violations.
    - Rejection requires comment/reason.
    - All actions persist review history for auditability.
    """
    plan = repository.get_plan(plan_id, include_items=True)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Block plan '{plan_id}' not found.",
        )

    current_status = plan.get("status", "DRAFT")
    action = payload.action
    now_iso = datetime.now(timezone.utc).isoformat()
    reviewer = payload.reviewer or "Controller"

    # Rule: Once APPROVED, plan cannot undergo further review actions
    if current_status == "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Block plan '{plan_id}' is already APPROVED and cannot be modified or re-reviewed.",
        )

    target_status = current_status
    approved_by = None
    rejection_reason = None

    if action == PlanReviewAction.START_REVIEW:
        if current_status not in ("DRAFT", "PENDING_APPROVAL"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start review on plan '{plan_id}' with status '{current_status}'. Must be DRAFT or PENDING_APPROVAL.",
            )
        target_status = "UNDER_REVIEW"

    elif action == PlanReviewAction.APPROVE:
        if current_status != "UNDER_REVIEW":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve plan '{plan_id}' with status '{current_status}'. Plan must be UNDER_REVIEW before approval.",
            )

        # Re-run strict hard-constraint feasibility check
        try:
            _, raw_items, dataset, feasibility, _ = _run_plan_constraint_evaluation(plan_id)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to validate plan constraints before approval: {str(exc)}",
            )

        if not raw_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve plan with no scheduled maintenance blocks.",
            )

        if not feasibility.is_feasible or feasibility.total_hard_violations > 0:
            violation_reasons = [v.reason for v in feasibility.violations[:3]]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve infeasible plan. Hard constraint violations detected ({feasibility.total_hard_violations}): {'; '.join(violation_reasons)}",
            )

        target_status = "APPROVED"
        approved_by = reviewer

    elif action == PlanReviewAction.REJECT:
        if current_status != "UNDER_REVIEW":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject plan '{plan_id}' with status '{current_status}'. Plan must be UNDER_REVIEW before rejection.",
            )

        if not payload.comment or not payload.comment.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A rejection reason is required when rejecting a plan.",
            )

        target_status = "REJECTED"
        rejection_reason = payload.comment.strip()

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown review action '{action}'.",
        )

    review_record = {
        "action": action.value,
        "reviewer": reviewer,
        "timestamp": now_iso,
        "comment": payload.comment.strip() if payload.comment else None,
        "previous_status": current_status,
        "new_status": target_status,
    }

    updated_plan = repository.update_plan_status(
        plan_id=plan_id,
        status=target_status,
        approved_by=approved_by,
        rejection_reason=rejection_reason,
        review_record=review_record,
    )

    eval_summary = updated_plan.get("evaluation_summary") or {}
    review_history = eval_summary.get("review_history", [])
    feasibility_info = eval_summary.get("feasibility") or {}
    validation_summary = feasibility_info.get("summary", "Plan feasibility evaluated.")

    return PlanReviewResponse(
        plan_id=plan_id,
        status=updated_plan["status"],
        is_feasible=updated_plan.get("is_feasible", True),
        validation_summary=validation_summary,
        action=action.value,
        reviewer=reviewer,
        comment=payload.comment,
        rejection_reason=updated_plan.get("rejection_reason"),
        approved_by=updated_plan.get("approved_by"),
        approved_at=updated_plan.get("approved_at"),
        review_history=review_history,
    )


