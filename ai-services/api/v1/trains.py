from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from db.repository import repository
from schemas.backend import TrainCreate, TrainUpdate, TrainResponse

router = APIRouter(prefix="/trains", tags=["Trains"])


@router.get("", response_model=List[TrainResponse])
def list_trains(
    corridor_id: Optional[str] = Query(None, description="Filter by corridor identifier"),
    start_minute: Optional[int] = Query(None, ge=0, le=1440, description="Active window start"),
    end_minute: Optional[int] = Query(None, ge=0, le=1440, description="Active window end"),
):
    """Retrieve scheduled train paths and corridor occupancies with optional time window filtering."""
    try:
        return repository.list_trains(corridor_id=corridor_id, start_minute=start_minute, end_minute=end_minute)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trains: {str(exc)}")


@router.post("", response_model=TrainResponse, status_code=status.HTTP_201_CREATED)
def create_train(payload: TrainCreate):
    """Register a train timetable path on a corridor section."""
    corridor = repository.get_corridor(payload.corridor_id)
    if not corridor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create train: Corridor '{payload.corridor_id}' does not exist."
        )

    existing = repository.get_train(payload.train_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Train '{payload.train_id}' already exists."
        )
    if payload.exit_minute < payload.entry_minute:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Train exit_minute must be greater than or equal to entry_minute."
        )
    try:
        return repository.create_train(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create train: {str(exc)}")


@router.get("/{train_id}", response_model=TrainResponse)
def get_train(train_id: str):
    """Retrieve timetable details of a specific train by ID."""
    train = repository.get_train(train_id)
    if not train:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train '{train_id}' not found."
        )
    return train


@router.patch("/{train_id}", response_model=TrainResponse)
@router.put("/{train_id}", response_model=TrainResponse)
def update_train(train_id: str, updates: TrainUpdate):
    """Update train window timings or priority."""
    clean_updates = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not clean_updates:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    updated = repository.update_train(train_id, clean_updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train '{train_id}' not found."
        )
    return updated


@router.delete("/{train_id}", status_code=status.HTTP_200_OK)
def delete_train(train_id: str):
    """Remove a train schedule path."""
    success = repository.delete_train(train_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Train '{train_id}' not found."
        )
    return {"status": "deleted", "train_id": train_id}
