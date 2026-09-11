from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from db.repository import repository
from schemas.backend import (
    MaintenanceRequestCreate,
    MaintenanceRequestUpdate,
    MaintenanceRequestResponse,
)
from schemas.railway import Department, Priority

router = APIRouter(prefix="/requests", tags=["Maintenance Requests"])


@router.get("", response_model=List[MaintenanceRequestResponse])
def list_requests(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
    department: Optional[Department] = Query(None, description="Filter by railway department"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by request status"),
    urgency: Optional[Priority] = Query(None, description="Filter by urgency level"),
    asset_id: Optional[str] = Query(None, description="Filter by asset identifier"),
    start_minute: Optional[int] = Query(None, ge=0, le=1440, description="Active window start minute"),
    end_minute: Optional[int] = Query(None, ge=0, le=1440, description="Active window end minute"),
):
    """List operational maintenance block requests with comprehensive query filtering."""
    try:
        dept_str = department.value if department else None
        urg_str = urgency.value if urgency else None
        return repository.list_requests(
            corridor_id=corridor_id,
            department=dept_str,
            status=status_filter,
            urgency=urg_str,
            asset_id=asset_id,
            start_minute=start_minute,
            end_minute=end_minute,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch requests: {str(exc)}")


@router.post("", response_model=MaintenanceRequestResponse, status_code=status.HTTP_201_CREATED)
def create_request(payload: MaintenanceRequestCreate):
    """Submit a new departmental maintenance block request."""
    # 1. Verify corridor exists
    corridor = repository.get_corridor(payload.corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Corridor '{payload.corridor_id}' does not exist."
        )

    # 2. Verify asset exists and belongs to corridor
    asset = repository.get_asset(payload.asset_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset '{payload.asset_id}' does not exist."
        )
    if asset.get("corridor_id") != payload.corridor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset '{payload.asset_id}' belongs to corridor '{asset.get('corridor_id')}', not '{payload.corridor_id}'."
        )

    # 3. Verify duplicate request ID
    existing = repository.get_request(payload.request_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request '{payload.request_id}' already exists."
        )

    # 4. Verify time window feasibility
    window_span = payload.latest_end_minute - payload.earliest_start_minute
    if payload.required_duration_minutes > window_span:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Required duration ({payload.required_duration_minutes}m) exceeds available window "
                f"({window_span}m from minute {payload.earliest_start_minute} to {payload.latest_end_minute})."
            )
        )

    try:
        data = payload.model_dump()
        data["department"] = payload.department.value
        data["urgency"] = payload.urgency.value
        return repository.create_request(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create maintenance request: {str(exc)}")


@router.get("/{request_id}", response_model=MaintenanceRequestResponse)
def get_request(request_id: str):
    """Retrieve details of a maintenance block request by ID."""
    req = repository.get_request(request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance request '{request_id}' not found."
        )
    return req


@router.patch("/{request_id}", response_model=MaintenanceRequestResponse)
@router.put("/{request_id}", response_model=MaintenanceRequestResponse)
def update_request(request_id: str, updates: MaintenanceRequestUpdate):
    """Update maintenance request details, schedule window, or review status."""
    raw = updates.model_dump()
    clean_updates = {}
    for k, v in raw.items():
        if v is not None:
            if hasattr(v, "value"):
                clean_updates[k] = v.value
            else:
                clean_updates[k] = v

    if not clean_updates:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    # Validate asset if updated
    if "asset_id" in clean_updates:
        asset = repository.get_asset(clean_updates["asset_id"])
        if not asset:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target asset '{clean_updates['asset_id']}' does not exist."
            )

    updated = repository.update_request(request_id, clean_updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance request '{request_id}' not found."
        )
    return updated


@router.delete("/{request_id}", status_code=status.HTTP_200_OK)
def delete_request(request_id: str):
    """
    Remove a maintenance block request.
    Enforces logical safety: only PENDING or REJECTED requests can be deleted.
    Active SCHEDULED or APPROVED requests cannot be removed.
    """
    req = repository.get_request(request_id)
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Maintenance request '{request_id}' not found."
        )
    try:
        success = repository.delete_request(request_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete maintenance request.")
        return {"status": "deleted", "request_id": request_id}
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
