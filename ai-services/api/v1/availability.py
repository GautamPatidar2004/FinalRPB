from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from db.repository import repository

router = APIRouter(prefix="/availability", tags=["Availability & Time Windows"])


class AvailabilityWindowResponse(BaseModel):
    corridor_id: str
    name: str
    is_electrified: bool
    available_start_minute: int
    available_end_minute: int
    max_parallel_blocks: int


class AvailabilityWindowUpdate(BaseModel):
    available_start_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    available_end_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    max_parallel_blocks: Optional[int] = Field(default=None, ge=1)
    is_electrified: Optional[bool] = None


@router.get("", response_model=List[AvailabilityWindowResponse])
def list_availability_windows(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor ID"),
):
    """Retrieve operational maintenance time windows across sections/corridors."""
    try:
        corridors = repository.list_corridors()
        if corridor_id:
            corridors = [c for c in corridors if c["corridor_id"] == corridor_id]
        return [
            AvailabilityWindowResponse(
                corridor_id=c["corridor_id"],
                name=c["name"],
                is_electrified=c.get("is_electrified", True),
                available_start_minute=c.get("available_start_minute", 0),
                available_end_minute=c.get("available_end_minute", 1440),
                max_parallel_blocks=c.get("max_parallel_blocks", 2),
            )
            for c in corridors
        ]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch availability windows: {str(exc)}")


@router.get("/{corridor_id}", response_model=AvailabilityWindowResponse)
def get_corridor_availability(corridor_id: str):
    """Retrieve the maintenance availability window for a specific section/corridor."""
    corridor = repository.get_corridor(corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corridor '{corridor_id}' not found."
        )
    return AvailabilityWindowResponse(
        corridor_id=corridor["corridor_id"],
        name=corridor["name"],
        is_electrified=corridor.get("is_electrified", True),
        available_start_minute=corridor.get("available_start_minute", 0),
        available_end_minute=corridor.get("available_end_minute", 1440),
        max_parallel_blocks=corridor.get("max_parallel_blocks", 2),
    )


@router.patch("/{corridor_id}", response_model=AvailabilityWindowResponse)
@router.put("/{corridor_id}", response_model=AvailabilityWindowResponse)
def update_corridor_availability(corridor_id: str, payload: AvailabilityWindowUpdate):
    """Update maintenance operational window and parallel block limits for a corridor."""
    corridor = repository.get_corridor(corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corridor '{corridor_id}' not found."
        )

    clean_updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not clean_updates:
        raise HTTPException(status_code=400, detail="No update values supplied.")

    # Time window range sanity check
    start = clean_updates.get("available_start_minute", corridor.get("available_start_minute", 0))
    end = clean_updates.get("available_end_minute", corridor.get("available_end_minute", 1440))
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"available_end_minute ({end}) must be greater than available_start_minute ({start})."
        )

    updated = repository.update_corridor(corridor_id, clean_updates)
    return AvailabilityWindowResponse(
        corridor_id=updated["corridor_id"],
        name=updated["name"],
        is_electrified=updated.get("is_electrified", True),
        available_start_minute=updated.get("available_start_minute", 0),
        available_end_minute=updated.get("available_end_minute", 1440),
        max_parallel_blocks=updated.get("max_parallel_blocks", 2),
    )
