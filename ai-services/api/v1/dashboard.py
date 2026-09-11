from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from db.repository import repository
from schemas.backend import (
    DashboardSummaryResponse,
    DashboardAssetResponse,
    DashboardCorridorResponse,
    DashboardPlanItemSummary,
    DashboardKpiResponse,
    DashboardActivityItem,
    DashboardAlertItem,
    MaintenanceRequestResponse,
)
from schemas.railway import Department, Priority, TrackType

router = APIRouter(prefix="/dashboard", tags=["Dashboard & Operations Monitoring"])


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary():
    """
    GET /api/v1/dashboard/summary
    Aggregates real operational data from the database layer:
    requests breakdown, assets, corridors, active traffic, and plans by status & feasibility.
    """
    try:
        requests = repository.list_requests()
        assets = repository.list_assets()
        corridors = repository.list_corridors()
        trains = repository.list_trains()
        plans = repository.list_plans()
        all_plan_items = repository.list_plan_items()

        # Request metrics
        pending_reqs = sum(1 for r in requests if r.get("status") == "PENDING")
        scheduled_reqs = sum(1 for r in requests if r.get("status") == "SCHEDULED")
        completed_reqs = sum(1 for r in requests if r.get("status") == "COMPLETED")
        critical_reqs = sum(1 for r in requests if r.get("urgency") == "CRITICAL")
        high_reqs = sum(1 for r in requests if r.get("urgency") == "HIGH")
        overdue_reqs = sum(1 for r in requests if int(r.get("days_overdue", 0)) > 0 or r.get("linked_defect_id") is not None)

        # Plan metrics
        draft_plans = sum(1 for p in plans if p.get("status") == "DRAFT")
        under_review_plans = sum(1 for p in plans if p.get("status") in ("UNDER_REVIEW", "PENDING_APPROVAL"))
        approved_plans = sum(1 for p in plans if p.get("status") == "APPROVED")
        rejected_plans = sum(1 for p in plans if p.get("status") == "REJECTED")
        feasible_plans = sum(1 for p in plans if p.get("is_feasible", True) is True)
        infeasible_plans = sum(1 for p in plans if p.get("is_feasible", True) is False)

        # Asset & Corridor operational state
        # An asset is deemed busy/unavailable if scheduled in an APPROVED or UNDER_REVIEW plan
        active_plan_ids = {p["plan_id"] for p in plans if p.get("status") in ("APPROVED", "UNDER_REVIEW")}
        busy_asset_ids = {
            it["asset_id"] for it in all_plan_items
            if it.get("plan_id") in active_plan_ids and it.get("status") == "SCHEDULED"
        }
        assets_unavailable = len(busy_asset_ids)

        total_corridors = len(corridors)
        # Corridors where available window is defined and > 0
        active_corridors = sum(
            1 for c in corridors
            if int(c.get("available_end_minute", 1440)) > int(c.get("available_start_minute", 0))
        )
        unavailable_corridors = total_corridors - active_corridors

        return DashboardSummaryResponse(
            total_requests=len(requests),
            pending_requests=pending_reqs,
            scheduled_requests=scheduled_reqs,
            completed_requests=completed_reqs,
            overdue_requests=overdue_reqs,
            critical_priority_requests=critical_reqs,
            high_priority_requests=high_reqs,
            total_assets=len(assets),
            assets_unavailable=assets_unavailable,
            total_corridors=total_corridors,
            active_corridors=active_corridors,
            unavailable_corridors=unavailable_corridors,
            total_trains=len(trains),
            total_plans=len(plans),
            draft_plans=draft_plans,
            under_review_plans=under_review_plans,
            approved_plans=approved_plans,
            rejected_plans=rejected_plans,
            feasible_plans=feasible_plans,
            infeasible_plans=infeasible_plans,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate dashboard summary: {str(exc)}")


@router.get("/requests", response_model=List[MaintenanceRequestResponse])
def get_dashboard_requests(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
    department: Optional[Department] = Query(None, description="Filter by department"),
    urgency: Optional[Priority] = Query(None, description="Filter by urgency level"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    asset_id: Optional[str] = Query(None, description="Filter by asset identifier"),
    start_minute: Optional[int] = Query(None, ge=0, le=1440, description="Window start minute"),
    end_minute: Optional[int] = Query(None, ge=0, le=1440, description="Window end minute"),
    overdue_only: Optional[bool] = Query(False, description="Return only requests linked to overdue defects"),
    limit: Optional[int] = Query(100, ge=1, le=500, description="Pagination limit"),
    offset: Optional[int] = Query(0, ge=0, description="Pagination offset"),
):
    """
    GET /api/v1/dashboard/requests
    Returns operational maintenance block requests formatted for table display with pagination and filters.
    """
    try:
        dept_str = department.value if department else None
        urg_str = urgency.value if urgency else None

        records = repository.list_requests(
            corridor_id=corridor_id,
            department=dept_str,
            status=status_filter,
            urgency=urg_str,
            asset_id=asset_id,
            start_minute=start_minute,
            end_minute=end_minute,
        )

        if overdue_only:
            records = [r for r in records if int(r.get("days_overdue", 0)) > 0 or r.get("linked_defect_id") is not None]

        # Apply pagination
        paginated = records[offset: offset + limit]
        return paginated
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard requests: {str(exc)}")


@router.get("/assets", response_model=List[DashboardAssetResponse])
def get_dashboard_assets(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
    department: Optional[Department] = Query(None, description="Filter by department"),
):
    """
    GET /api/v1/dashboard/assets
    Returns operational asset details along with current scheduled block load and availability.
    """
    try:
        dept_str = department.value if department else None
        assets = repository.list_assets(corridor_id=corridor_id, department=dept_str)
        all_plan_items = repository.list_plan_items(corridor_id=corridor_id)

        # Count scheduled blocks per asset
        asset_block_counts = {}
        for it in all_plan_items:
            if it.get("status") == "SCHEDULED":
                a_id = it.get("asset_id")
                asset_block_counts[a_id] = asset_block_counts.get(a_id, 0) + 1

        results = []
        for a in assets:
            a_id = a["asset_id"]
            scheduled_count = asset_block_counts.get(a_id, 0)
            results.append(
                DashboardAssetResponse(
                    asset_id=a_id,
                    corridor_id=a["corridor_id"],
                    department=Department(a["department"]),
                    start_km=float(a["start_km"]),
                    end_km=float(a["end_km"]),
                    track_type=TrackType(a.get("track_type", "BOTH")),
                    is_active=True,
                    scheduled_blocks_count=scheduled_count,
                    created_at=a.get("created_at"),
                )
            )
        return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard assets: {str(exc)}")


@router.get("/corridors", response_model=List[DashboardCorridorResponse])
def get_dashboard_corridors():
    """
    GET /api/v1/dashboard/corridors
    Returns corridor availability, total scheduled load, and timetable train counts.
    """
    try:
        corridors = repository.list_corridors()
        trains = repository.list_trains()
        all_plan_items = repository.list_plan_items()

        # Count trains per corridor
        train_counts = {}
        for t in trains:
            c_id = t["corridor_id"]
            train_counts[c_id] = train_counts.get(c_id, 0) + 1

        # Count scheduled blocks per corridor
        block_counts = {}
        for it in all_plan_items:
            if it.get("status") == "SCHEDULED":
                c_id = it.get("corridor_id")
                block_counts[c_id] = block_counts.get(c_id, 0) + 1

        results = []
        for c in corridors:
            c_id = c["corridor_id"]
            start_min = int(c.get("available_start_minute", 0))
            end_min = int(c.get("available_end_minute", 1440))
            is_active = (end_min > start_min)

            results.append(
                DashboardCorridorResponse(
                    corridor_id=c_id,
                    name=c["name"],
                    length_km=float(c["length_km"]),
                    is_electrified=bool(c.get("is_electrified", True)),
                    is_active=is_active,
                    available_start_minute=start_min,
                    available_end_minute=end_min,
                    max_parallel_blocks=int(c.get("max_parallel_blocks", 2)),
                    scheduled_blocks_count=block_counts.get(c_id, 0),
                    trains_count=train_counts.get(c_id, 0),
                    created_at=c.get("created_at"),
                )
            )
        return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard corridors: {str(exc)}")


@router.get("/plans", response_model=List[DashboardPlanItemSummary])
def get_dashboard_plans(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by plan status"),
    corridor_id: Optional[str] = Query(None, description="Filter by corridor"),
):
    """
    GET /api/v1/dashboard/plans
    Returns list of block plans with item counts and conflict statistics for monitoring.
    """
    try:
        raw_plans = repository.list_plans(status=status_filter, corridor_id=corridor_id)
        results = []

        for p in raw_plans:
            plan_id = p["plan_id"]
            full_plan = repository.get_plan(plan_id, include_items=True)
            items = full_plan.get("items", []) if full_plan else []

            # Determine violation count from evaluation_summary
            eval_summary = p.get("evaluation_summary") or {}
            feasibility = eval_summary.get("feasibility") or {}
            violations = feasibility.get("violations", [])

            results.append(
                DashboardPlanItemSummary(
                    plan_id=plan_id,
                    title=p["title"],
                    status=p.get("status", "DRAFT"),
                    is_feasible=bool(p.get("is_feasible", True)),
                    overall_score=p.get("overall_score"),
                    selected_strategy=p.get("selected_strategy"),
                    created_at=p.get("created_at", datetime.now(timezone.utc).isoformat()),
                    approved_by=p.get("approved_by"),
                    approved_at=p.get("approved_at"),
                    rejection_reason=p.get("rejection_reason"),
                    items_count=len(items),
                    violations_count=len(violations),
                )
            )
        return results
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard plans: {str(exc)}")


@router.get("/planning-kpis", response_model=DashboardKpiResponse)
def get_dashboard_planning_kpis():
    """
    GET /api/v1/dashboard/planning-kpis
    Calculates derived operational KPIs from persisted plans and maintenance requests.
    No fabricated or ungrounded statistics.
    """
    try:
        plans = repository.list_plans()
        requests = repository.list_requests()
        all_plan_items = repository.list_plan_items()
        corridors = repository.list_corridors()
        assets = repository.list_assets()

        total_plans = len(plans)
        feasible_count = sum(1 for p in plans if p.get("is_feasible", True) is True)
        feasible_pct = round((feasible_count / total_plans * 100.0), 2) if total_plans > 0 else 100.0

        scores = [p["overall_score"] for p in plans if p.get("overall_score") is not None]
        avg_score = round(sum(scores) / len(scores), 2) if scores else None

        # Scheduled requests analysis across all plans
        scheduled_req_ids = {it["request_id"] for it in all_plan_items if it.get("status") == "SCHEDULED"}
        req_map = {r["request_id"]: r for r in requests}

        requests_scheduled = len(scheduled_req_ids)
        requests_unscheduled = max(0, len(requests) - requests_scheduled)

        total_scheduled_duration = sum(
            int(it.get("allocated_duration_minutes", 0))
            for it in all_plan_items if it.get("status") == "SCHEDULED"
        )

        # Count total hard conflicts across all plans
        total_conflicts = 0
        for p in plans:
            eval_sum = p.get("evaluation_summary") or {}
            feas = eval_sum.get("feasibility") or {}
            total_conflicts += len(feas.get("violations", []))

        # Critical and Overdue requests scheduled
        critical_scheduled = sum(
            1 for req_id in scheduled_req_ids
            if req_id in req_map and req_map[req_id].get("urgency") == "CRITICAL"
        )
        overdue_scheduled = sum(
            1 for req_id in scheduled_req_ids
            if req_id in req_map and (int(req_map[req_id].get("days_overdue", 0)) > 0 or req_map[req_id].get("linked_defect_id"))
        )

        # Utilization rates
        corridor_utilization_pct = 0.0
        if corridors:
            active_corridors_count = len({it["corridor_id"] for it in all_plan_items if it.get("status") == "SCHEDULED"})
            corridor_utilization_pct = round((active_corridors_count / len(corridors)) * 100.0, 2)

        asset_utilization_pct = 0.0
        if assets:
            scheduled_assets_count = len({it["asset_id"] for it in all_plan_items if it.get("status") == "SCHEDULED"})
            asset_utilization_pct = round((scheduled_assets_count / len(assets)) * 100.0, 2)

        return DashboardKpiResponse(
            requests_scheduled=requests_scheduled,
            requests_unscheduled=requests_unscheduled,
            total_scheduled_duration_minutes=total_scheduled_duration,
            total_conflicts=total_conflicts,
            feasible_plan_percentage=feasible_pct,
            average_plan_score=avg_score,
            critical_requests_scheduled=critical_scheduled,
            overdue_requests_scheduled=overdue_scheduled,
            corridor_utilization_pct=min(100.0, corridor_utilization_pct),
            asset_utilization_pct=min(100.0, asset_utilization_pct),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to calculate planning KPIs: {str(exc)}")


@router.get("/recent-activity", response_model=List[DashboardActivityItem])
def get_dashboard_recent_activity(
    limit: Optional[int] = Query(20, ge=1, le=100, description="Max activities to return"),
):
    """
    GET /api/v1/dashboard/recent-activity
    Derives chronological audit activity feed from plans, reviews, and maintenance requests.
    """
    try:
        activities: List[DashboardActivityItem] = []
        plans = repository.list_plans()
        requests = repository.list_requests()

        # 1. Plan creation events
        for p in plans:
            created_at = p.get("created_at")
            if created_at:
                activities.append(
                    DashboardActivityItem(
                        activity_type="PLAN_GENERATED",
                        title=f"Plan Generated: {p['plan_id']}",
                        description=f"Plan '{p['title']}' created with status {p.get('status', 'DRAFT')}",
                        timestamp=created_at,
                        entity_id=p["plan_id"],
                        actor=p.get("created_by") or "AI Planner",
                    )
                )

            # 2. Plan Review history records
            eval_summary = p.get("evaluation_summary") or {}
            history = eval_summary.get("review_history", [])
            for h in history:
                action = h.get("action", "").upper()
                activities.append(
                    DashboardActivityItem(
                        activity_type=f"PLAN_{action}",
                        title=f"Plan {action}: {p['plan_id']}",
                        description=h.get("comment") or f"Transitioned from {h.get('previous_status')} to {h.get('new_status')}",
                        timestamp=h.get("timestamp", datetime.now(timezone.utc).isoformat()),
                        entity_id=p["plan_id"],
                        actor=h.get("reviewer") or "Traffic Controller",
                    )
                )

        # 3. Request creation events
        for r in requests:
            r_time = r.get("created_at")
            if r_time:
                activities.append(
                    DashboardActivityItem(
                        activity_type="REQUEST_SUBMITTED",
                        title=f"Request Submitted: {r['request_id']}",
                        description=f"{r.get('department')} submitted {r.get('urgency')} block request for {r.get('required_duration_minutes')}m",
                        timestamp=r_time,
                        entity_id=r["request_id"],
                        actor=r.get("created_by") or r.get("department"),
                    )
                )

        # Sort descending by timestamp
        activities.sort(key=lambda a: a.timestamp, reverse=True)
        return activities[:limit]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to assemble recent activity: {str(exc)}")


@router.get("/alerts", response_model=List[DashboardAlertItem])
def get_dashboard_alerts():
    """
    GET /api/v1/dashboard/alerts
    Returns actionable alerts:
    - Infeasible plans with hard constraint violations
    - Overdue critical maintenance requests
    - Conflicted corridor items
    """
    try:
        alerts: List[DashboardAlertItem] = []
        plans = repository.list_plans()
        requests = repository.list_requests()
        now_str = datetime.now(timezone.utc).isoformat()

        # 1. Infeasible plans & hard constraint violations
        for p in plans:
            if not p.get("is_feasible", True):
                eval_sum = p.get("evaluation_summary") or {}
                feas = eval_sum.get("feasibility") or {}
                violations = feas.get("violations", [])
                for v in violations:
                    alerts.append(
                        DashboardAlertItem(
                            alert_type="CONSTRAINT_VIOLATION",
                            severity="CRITICAL",
                            title=f"Hard Conflict in {p['plan_id']}",
                            message=v.get("reason", "Hard constraint violation detected"),
                            entity_id=p["plan_id"],
                            corridor_id=v.get("corridor_id"),
                            created_at=p.get("updated_at") or now_str,
                        )
                    )

        # 2. Overdue critical requests awaiting scheduling
        for r in requests:
            is_overdue = int(r.get("days_overdue", 0)) > 0 or r.get("linked_defect_id") is not None
            is_urgent = r.get("urgency") in ("CRITICAL", "HIGH")
            is_unscheduled = r.get("status") == "PENDING"

            if is_overdue and is_urgent and is_unscheduled:
                alerts.append(
                    DashboardAlertItem(
                        alert_type="OVERDUE_MAINTENANCE",
                        severity="WARNING" if r.get("urgency") == "HIGH" else "CRITICAL",
                        title=f"Overdue {r.get('urgency')} Request: {r['request_id']}",
                        message=f"Department {r.get('department')} request on corridor {r.get('corridor_id')} is overdue and unscheduled.",
                        entity_id=r["request_id"],
                        corridor_id=r.get("corridor_id"),
                        created_at=r.get("updated_at") or now_str,
                    )
                )

        return alerts
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate dashboard alerts: {str(exc)}")
