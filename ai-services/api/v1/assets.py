from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from db.repository import repository
from schemas.backend import AssetCreate, AssetUpdate, AssetResponse
from schemas.railway import Department, TrackType

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.get("", response_model=List[AssetResponse])
def list_assets(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
    department: Optional[Department] = Query(None, description="Filter by department"),
    track_type: Optional[TrackType] = Query(None, description="Filter by track type"),
):
    """Retrieve all physical railway track/OHE/signalling assets."""
    try:
        dept_str = department.value if department else None
        track_str = track_type.value if track_type else None
        return repository.list_assets(corridor_id=corridor_id, department=dept_str, track_type=track_str)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch assets: {str(exc)}")


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetCreate):
    """Register a new railway asset for maintenance planning."""
    # Verify corridor exists
    corridor = repository.get_corridor(payload.corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create asset: Corridor '{payload.corridor_id}' does not exist."
        )

    existing = repository.get_asset(payload.asset_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Asset '{payload.asset_id}' already exists."
        )
    if payload.end_km < payload.start_km:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Asset end_km must be greater than or equal to start_km."
        )
    try:
        data = payload.model_dump()
        data["department"] = payload.department.value
        data["track_type"] = payload.track_type.value
        return repository.create_asset(data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create asset: {str(exc)}")


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: str):
    """Retrieve details of a specific asset by ID."""
    asset = repository.get_asset(asset_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset '{asset_id}' not found."
        )
    return asset


@router.patch("/{asset_id}", response_model=AssetResponse)
@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: str, updates: AssetUpdate):
    """Update asset metadata, department, or chainage boundaries."""
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

    updated = repository.update_asset(asset_id, clean_updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset '{asset_id}' not found."
        )
    return updated


@router.delete("/{asset_id}", status_code=status.HTTP_200_OK)
def delete_asset(asset_id: str):
    """Remove an asset record if safe."""
    success = repository.delete_asset(asset_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset '{asset_id}' not found."
        )
    return {"status": "deleted", "asset_id": asset_id}
