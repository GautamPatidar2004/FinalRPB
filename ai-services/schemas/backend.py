from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from schemas.railway import Department, Priority, TrackType


# ==========================================
# PROFILES / USERS
# ==========================================
class ProfileCreate(BaseModel):
    id: Optional[str] = None
    email: str
    full_name: Optional[str] = None
    department: Optional[str] = "General"
    role: str = "operator"


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None


class ProfileResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    department: Optional[str] = None
    role: str = "operator"
    created_at: str
    updated_at: str


# ==========================================
# CORRIDORS / SECTIONS
# ==========================================
class CorridorCreate(BaseModel):
    corridor_id: str = Field(..., description="Unique corridor identifier, e.g. COR-NDLS-GZB")
    name: str = Field(..., description="Human-readable corridor section name")
    length_km: float = Field(..., gt=0, description="Section length in kilometers")
    is_electrified: bool = True
    available_start_minute: int = Field(default=0, ge=0, description="Daily operational window start minute")
    available_end_minute: int = Field(default=1440, le=1440, description="Daily operational window end minute")
    max_parallel_blocks: int = Field(default=2, ge=1, description="Maximum simultaneous maintenance blocks")


class CorridorUpdate(BaseModel):
    name: Optional[str] = None
    length_km: Optional[float] = Field(default=None, gt=0)
    is_electrified: Optional[bool] = None
    available_start_minute: Optional[int] = Field(default=None, ge=0)
    available_end_minute: Optional[int] = Field(default=None, le=1440)
    max_parallel_blocks: Optional[int] = Field(default=None, ge=1)


class CorridorResponse(BaseModel):
    corridor_id: str
    name: str
    length_km: float
    is_electrified: bool
    available_start_minute: int
    available_end_minute: int
    max_parallel_blocks: int
    created_at: str
    updated_at: str


# ==========================================
# ASSETS / LOCATIONS
# ==========================================
class AssetCreate(BaseModel):
    asset_id: str = Field(..., description="Unique asset identifier")
    corridor_id: str = Field(..., description="Parent corridor ID")
    department: Department = Field(..., description="Responsible railway department")
    start_km: float = Field(..., ge=0, description="Start chainage km")
    end_km: float = Field(..., ge=0, description="End chainage km")
    track_type: TrackType = TrackType.BOTH


class AssetUpdate(BaseModel):
    corridor_id: Optional[str] = None
    department: Optional[Department] = None
    start_km: Optional[float] = Field(default=None, ge=0)
    end_km: Optional[float] = Field(default=None, ge=0)
    track_type: Optional[TrackType] = None


class AssetResponse(BaseModel):
    asset_id: str
    corridor_id: str
    department: Department
    start_km: float
    end_km: float
    track_type: TrackType
    created_at: str
    updated_at: str


# ==========================================
# TRAINS / TRAFFIC INFORMATION
# ==========================================
class TrainCreate(BaseModel):
    train_id: str = Field(..., description="Unique train identifier or train number")
    train_type: str = Field(..., description="PASSENGER_EXPRESS, FREIGHT, SUBURBAN")
    corridor_id: str = Field(..., description="Traversed corridor ID")
    entry_minute: int = Field(..., ge=0, le=1440, description="Corridor entry time in minutes")
    exit_minute: int = Field(..., ge=0, le=1440, description="Corridor exit time in minutes")
    priority_level: int = Field(default=2, ge=1, le=5, description="1=Highest priority (Vande Bharat/Rajdhani), 5=Freight")


class TrainUpdate(BaseModel):
    train_type: Optional[str] = None
    corridor_id: Optional[str] = None
    entry_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    exit_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    priority_level: Optional[int] = Field(default=None, ge=1, le=5)


class TrainResponse(BaseModel):
    train_id: str
    train_type: str
    corridor_id: str
    entry_minute: int
    exit_minute: int
    priority_level: int
    created_at: str
    updated_at: str


# ==========================================
# MAINTENANCE BLOCK REQUESTS
# ==========================================
class MaintenanceRequestCreate(BaseModel):
    request_id: str = Field(..., description="Unique request identifier")
    department: Department
    corridor_id: str
    asset_id: str
    required_duration_minutes: int = Field(..., ge=15, le=720)
    earliest_start_minute: int = Field(default=0, ge=0)
    latest_end_minute: int = Field(default=1440, le=1440)
    is_power_block_required: bool = False
    is_traffic_block_required: bool = True
    urgency: Priority = Priority.MEDIUM
    linked_defect_id: Optional[str] = None
    status: Optional[str] = "PENDING"


class MaintenanceRequestUpdate(BaseModel):
    department: Optional[Department] = None
    corridor_id: Optional[str] = None
    asset_id: Optional[str] = None
    required_duration_minutes: Optional[int] = Field(default=None, ge=15, le=720)
    earliest_start_minute: Optional[int] = Field(default=None, ge=0)
    latest_end_minute: Optional[int] = Field(default=None, le=1440)
    is_power_block_required: Optional[bool] = None
    is_traffic_block_required: Optional[bool] = None
    urgency: Optional[Priority] = None
    linked_defect_id: Optional[str] = None
    status: Optional[str] = None


class MaintenanceRequestResponse(BaseModel):
    request_id: str
    department: Department
    corridor_id: str
    asset_id: str
    required_duration_minutes: int
    earliest_start_minute: int
    latest_end_minute: int
    is_power_block_required: bool
    is_traffic_block_required: bool
    urgency: Priority
    linked_defect_id: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: str
    updated_at: str


# ==========================================
# BLOCK PLANS & PLAN ITEMS
# ==========================================
class BlockPlanItemCreate(BaseModel):
    request_id: str
    corridor_id: str
    asset_id: str
    department: Department
    scheduled_start_minute: int = Field(..., ge=0)
    scheduled_end_minute: int = Field(..., ge=0)
    allocated_duration_minutes: int = Field(..., ge=0)
    status: str = "SCHEDULED"
    conflict_flags: List[str] = Field(default_factory=list)


class BlockPlanItemResponse(BaseModel):
    id: Optional[str] = None
    plan_id: str
    request_id: str
    corridor_id: str
    asset_id: str
    department: Department
    scheduled_start_minute: int
    scheduled_end_minute: int
    allocated_duration_minutes: int
    status: str
    conflict_flags: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BlockPlanCreate(BaseModel):
    plan_id: str
    title: str
    overall_score: Optional[float] = None
    is_feasible: bool = True
    selected_strategy: Optional[str] = None
    evaluation_summary: Dict[str, Any] = Field(default_factory=dict)
    items: List[BlockPlanItemCreate] = Field(default_factory=list)


class BlockPlanStatusUpdate(BaseModel):
    status: str = Field(..., description="DRAFT, PENDING_APPROVAL, APPROVED, REJECTED")
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class BlockPlanResponse(BaseModel):
    plan_id: str
    title: str
    status: str
    overall_score: Optional[float] = None
    is_feasible: bool = True
    selected_strategy: Optional[str] = None
    evaluation_summary: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: str
    updated_at: str
    items: List[BlockPlanItemResponse] = Field(default_factory=list)


# ==========================================
# PLAN GENERATION (AI ENGINE INTEGRATION)
# ==========================================
class PlanGenerationRequest(BaseModel):
    title: Optional[str] = Field(default=None, description="Optional custom plan title")
    corridor_id: Optional[str] = Field(default=None, description="Optional corridor filter")
    department: Optional[Department] = Field(default=None, description="Optional department filter")
    request_ids: Optional[List[str]] = Field(default=None, description="Optional explicit list of request IDs to plan")
    start_minute: Optional[int] = Field(default=None, ge=0, le=1440, description="Planning window lower limit")
    end_minute: Optional[int] = Field(default=None, ge=0, le=1440, description="Planning window upper limit")


class PlanGenerationResponse(BaseModel):
    plan_id: str
    title: str
    status: str
    is_feasible: bool
    overall_score: float
    selected_strategy: str
    created_at: str
    scheduled_blocks: List[BlockPlanItemResponse] = Field(default_factory=list)
    evaluation: Dict[str, Any] = Field(default_factory=dict)
    decision_log: List[Dict[str, Any]] = Field(default_factory=list)
    unresolved_requests: List[Dict[str, Any]] = Field(default_factory=list)
    replanning_applied: bool = False


# ==========================================
# CONSTRAINT VALIDATION & CONFLICTS
# ==========================================
class PlanValidationResponse(BaseModel):
    plan_id: str
    is_feasible: bool
    total_hard_violations: int
    violations: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str
    overall_score: Optional[float] = None


class PlanConflictResponse(BaseModel):
    plan_id: str
    is_feasible: bool
    total_conflicts: int
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str


class ItemValidationResponse(BaseModel):
    plan_id: str
    item_id: str
    request_id: str
    is_feasible: bool
    violations: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str


class PlanItemUpdateRequest(BaseModel):
    scheduled_start_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    scheduled_end_minute: Optional[int] = Field(default=None, ge=0, le=1440)
    allocated_duration_minutes: Optional[int] = Field(default=None, ge=0, le=720)
    status: Optional[str] = Field(default=None, description="SCHEDULED, DEFERRED, REJECTED")


# ==========================================
# BACKEND PROMPT 6: REVIEW WORKFLOW
# ==========================================
class PlanReviewAction(str, Enum):
    START_REVIEW = "start_review"
    APPROVE = "approve"
    REJECT = "reject"


class PlanReviewRequest(BaseModel):
    action: PlanReviewAction = Field(..., description="start_review, approve, or reject")
    reviewer: Optional[str] = Field(default=None, description="Identifier/name/email of reviewer")
    comment: Optional[str] = Field(default=None, description="Optional review comment or mandatory rejection reason")


class PlanReviewHistoryRecord(BaseModel):
    action: str
    reviewer: Optional[str] = None
    timestamp: str
    comment: Optional[str] = None
    previous_status: str
    new_status: str


class PlanReviewResponse(BaseModel):
    plan_id: str
    status: str
    is_feasible: bool
    validation_summary: str
    action: str
    reviewer: Optional[str] = None
    comment: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    review_history: List[PlanReviewHistoryRecord] = Field(default_factory=list)



