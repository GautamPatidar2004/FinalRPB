from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ConstraintType(str, Enum):
    TRAIN_TRAFFIC_CONFLICT = "TRAIN_TRAFFIC_CONFLICT"
    INSUFFICIENT_DURATION = "INSUFFICIENT_DURATION"
    CORRIDOR_WINDOW_VIOLATION = "CORRIDOR_WINDOW_VIOLATION"
    REQUEST_WINDOW_VIOLATION = "REQUEST_WINDOW_VIOLATION"
    CORRIDOR_CAPACITY_EXCEEDED = "CORRIDOR_CAPACITY_EXCEEDED"
    ASSET_CONFLICT = "ASSET_CONFLICT"
    INVALID_ASSET_REFERENCE = "INVALID_ASSET_REFERENCE"


class ConstraintViolation(BaseModel):
    """Detailed record of a single constraint violation."""
    constraint_type: ConstraintType
    severity: str = "HARD"
    plan_id: Optional[str] = None
    request_id: Optional[str] = None
    corridor_id: Optional[str] = None
    reason: str


class PlanFeasibilityResult(BaseModel):
    """Feasibility validation verdict for a candidate maintenance plan."""
    is_feasible: bool = Field(..., description="True only if zero hard constraint violations exist")
    total_hard_violations: int = Field(default=0, ge=0)
    violations: List[ConstraintViolation] = Field(default_factory=list)
    summary: str = Field(default="Plan is feasible")
