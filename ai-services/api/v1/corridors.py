from typing import List
from fastapi import APIRouter, HTTPException, status
from db.repository import repository
from schemas.backend import CorridorCreate, CorridorUpdate, CorridorResponse

router = APIRouter(prefix="/corridors", tags=["Corridors"])


@router.get("", response_model=List[CorridorResponse])
def list_corridors():
    """Retrieve all operational corridors and sections."""
    try:
        return repository.list_corridors()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch corridors: {str(exc)}")


@router.post("", response_model=CorridorResponse, status_code=status.HTTP_201_CREATED)
def create_corridor(payload: CorridorCreate):
    """Register a new railway corridor or section."""
    existing = repository.get_corridor(payload.corridor_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Corridor '{payload.corridor_id}' already exists."
        )
    try:
        return repository.create_corridor(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create corridor: {str(exc)}")


@router.get("/{corridor_id}", response_model=CorridorResponse)
def get_corridor(corridor_id: str):
    """Retrieve details of a specific corridor by its unique ID."""
    corridor = repository.get_corridor(corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corridor '{corridor_id}' not found."
        )
    return corridor


@router.patch("/{corridor_id}", response_model=CorridorResponse)
@router.put("/{corridor_id}", response_model=CorridorResponse)
def update_corridor(corridor_id: str, updates: CorridorUpdate):
    """Update corridor attributes (availability windows, length, limits)."""
    clean_updates = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not clean_updates:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    updated = repository.update_corridor(corridor_id, clean_updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corridor '{corridor_id}' not found."
        )
    return updated


@router.delete("/{corridor_id}", status_code=status.HTTP_200_OK)
def delete_corridor(corridor_id: str):
    """Remove a corridor section if no active dependencies exist."""
    success = repository.delete_corridor(corridor_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Corridor '{corridor_id}' not found."
        )
    return {"status": "deleted", "corridor_id": corridor_id}
