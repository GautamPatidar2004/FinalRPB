from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from schemas.railway import Department, Priority, MaintenanceBlockRequest


class AssetOperationalLog(BaseModel):
    """Historical telemetry and maintenance tracking per asset."""
    asset_id: str
    corridor_id: str
    department: Department
    last_overhaul_date: str  # YYYY-MM-DD
    operating_hours: float = 0.0
    gross_million_tonnes: float = Field(
        default=0.0,
        description="Cumulative track load (relevant for Civil/Track Engineering)"
    )
    recorded_fault_count: int = 0
    vibration_index: Optional[float] = Field(
        default=None,
        description="Optional sensor telemetry (0.0 to 1.0 anomaly index)"
    )


class PredictiveAdvisoryRecord(BaseModel):
    """Advisory output representing an anticipated asset failure/wear condition."""
    asset_id: str
    corridor_id: str
    department: Department
    risk_score: float = Field(..., ge=0.0, le=100.0)
    recommended_window_start_minute: int
    recommended_window_end_minute: int
    estimated_duration_minutes: int
    trigger_rule: str
    urgency: Priority
    generated_request: MaintenanceBlockRequest


class PredictiveMaintenanceReport(BaseModel):
    """Complete diagnostic report returned by the prediction service."""
    generated_at: str
    total_assets_evaluated: int
    high_risk_count: int
    advisories: List[PredictiveAdvisoryRecord]
    synthesized_requests: List[MaintenanceBlockRequest]