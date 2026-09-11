from typing import List
from fastapi import APIRouter, HTTPException, status
from db.repository import repository
from schemas.backend import ProfileCreate, ProfileUpdate, ProfileResponse

router = APIRouter(prefix="/profiles", tags=["Profiles"])


@router.get("", response_model=List[ProfileResponse])
def list_profiles():
    """List registered user profiles."""
    try:
        return repository.list_profiles()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profiles: {str(exc)}")


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def create_profile(payload: ProfileCreate):
    """Register or sync a user profile."""
    try:
        return repository.create_profile(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {str(exc)}")


@router.get("/{user_id}", response_model=ProfileResponse)
def get_profile(user_id: str):
    """Retrieve profile by user/auth UUID."""
    profile = repository.get_profile(user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{user_id}' not found."
        )
    return profile


@router.patch("/{user_id}", response_model=ProfileResponse)
def update_profile(user_id: str, updates: ProfileUpdate):
    """Update profile metadata, department, or operational role."""
    clean_updates = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not clean_updates:
        raise HTTPException(status_code=400, detail="No valid update fields provided.")

    updated = repository.update_profile(user_id, clean_updates)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{user_id}' not found."
        )
    return updated


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_profile(user_id: str):
    """Remove user profile."""
    success = repository.delete_profile(user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profile '{user_id}' not found."
        )
    return {"status": "deleted", "user_id": user_id}
