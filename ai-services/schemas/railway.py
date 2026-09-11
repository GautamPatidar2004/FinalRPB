from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class Department(str, Enum):
    ENG = "Engineering"
    TRD = "Traction Distribution"
    SNT = "Signalling & Telecom"


class Priority(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class TrackType(str, Enum):
    UP = "UP"
    DOWN = "DOWN"
    SINGLE = "SINGLE"
    BOTH = "BOTH"


class RailwayAsset(BaseModel):
    asset_id: str = Field(..., description="Unique asset identifier")
    corridor_id: str = Field(..., description="Corridor/section identifier")
    department: Department
    start_km: float = Field(..., ge=0)
    end_km: float = Field(..., ge=0)
    track_type: TrackType = TrackType.BOTH


class MaintenanceDefect(BaseModel):
    defect_id: str = Field(..., description="Unique defect record ID")
    asset_id: str = Field(..., description="Referenced asset ID")
    severity: Priority
    days_overdue: int = Field(default=0, ge=0)
    description: str = ""


class MaintenanceBlockRequest(BaseModel):
    request_id: str = Field(..., description="Unique maintenance block request ID")
    department: Department
    corridor_id: str = Field(..., description="Target corridor identifier")
    asset_id: str = Field(..., description="Target asset identifier")
    required_duration_minutes: int = Field(..., ge=15, le=720)
    earliest_start_minute: int = Field(default=0, ge=0, description="Minutes from schedule baseline")
    latest_end_minute: int = Field(default=1440, le=1440, description="Schedule horizon limit in minutes")
    is_power_block_required: bool = False
    is_traffic_block_required: bool = True
    urgency: Priority = Priority.MEDIUM
    linked_defect_id: Optional[str] = None


class CorridorAvailability(BaseModel):
    corridor_id: str = Field(..., description="Corridor/section identifier")
    name: str
    length_km: float = Field(..., gt=0)
    is_electrified: bool = True
    available_start_minute: int = Field(default=0, ge=0)
    available_end_minute: int = Field(default=1440, le=1440)
    max_parallel_blocks: int = Field(default=2, ge=1)


class TrainTraffic(BaseModel):
    train_id: str = Field(..., description="Train number or identifier")
    train_type: str = Field(..., description="PASSENGER_EXPRESS, FREIGHT, SUBURBAN")
    corridor_id: str
    entry_minute: int = Field(..., ge=0, le=1440)
    exit_minute: int = Field(..., ge=0, le=1440)
    priority_level: int = Field(default=2, ge=1, le=5, description="1=Highest priority (e.g. Vande Bharat/Rajdhani), 5=Freight")


class PlanningConstraints(BaseModel):
    min_headway_minutes: int = Field(default=15, ge=5)
    max_concurrent_blocks_per_corridor: int = Field(default=2, ge=1)
    allow_joint_department_blocks: bool = Field(default=True, description="Allow concurrent ENG + TRD block on same segment")
    power_cutoff_buffer_minutes: int = Field(default=15, ge=0)


class GeneratedBlockPlanRecord(BaseModel):
    plan_id: str
    request_id: str
    corridor_id: str
    asset_id: str
    department: Department
    scheduled_start_minute: int
    scheduled_end_minute: int
    allocated_duration_minutes: int
    status: str = Field(default="SCHEDULED", description="SCHEDULED, DEFERRED, REJECTED")
    conflict_flags: List[str] = Field(default_factory=list)


class PriorityScoreResult(BaseModel):
    request_id: str
    priority_score: float = Field(..., ge=0.0, le=100.0, description="Calculated priority/risk score (0 to 100)")
    priority_category: Priority
    rank: int = Field(default=1, ge=1)
    factors: dict[str, float] = Field(default_factory=dict, description="Explainable feature breakdown of risk components")


class RailwayPlanningDataset(BaseModel):
    corridors: List[CorridorAvailability]
    assets: List[RailwayAsset]
    defects: List[MaintenanceDefect]
    trains: List[TrainTraffic]
    block_requests: List[MaintenanceBlockRequest]
    constraints: PlanningConstraints = Field(default_factory=PlanningConstraints)
