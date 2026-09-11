from typing import Any, Dict, List
from pydantic import BaseModel, Field


class EvaluationWeights(BaseModel):
    """Configurable weights for multi-factor plan quality evaluation."""
    priority_coverage_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    unresolved_risk_weight: float = Field(default=0.20, ge=0.0, le=1.0)
    conflict_penalty_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    operational_disruption_weight: float = Field(default=0.10, ge=0.0, le=1.0)
    window_utilization_weight: float = Field(default=0.10, ge=0.0, le=1.0)
    duration_efficiency_weight: float = Field(default=0.10, ge=0.0, le=1.0)


class FactorScores(BaseModel):
    priority_coverage: float = Field(..., ge=0.0, le=100.0, description="Scheduled high/medium priority coverage")
    unresolved_risk_score: float = Field(..., ge=0.0, le=100.0, description="Score reflecting mitigation of critical/high risks")
    conflict_free_score: float = Field(..., ge=0.0, le=100.0, description="Freedom from train and corridor conflicts")
    operational_disruption_score: float = Field(..., ge=0.0, le=100.0, description="Minimization of passenger/freight disruption")
    window_utilization: float = Field(..., ge=0.0, le=100.0, description="Efficiency of corridor maintenance window usage")
    duration_efficiency: float = Field(..., ge=0.0, le=100.0, description="Adherence to requested work durations")


class PlanEvaluationResult(BaseModel):
    """Normalized evaluation output for a candidate railway maintenance plan."""
    overall_score: float = Field(..., ge=0.0, le=100.0, description="Composite normalized quality score (0 to 100)")
    factor_scores: FactorScores
    strengths: List[str] = Field(default_factory=list, description="Key operational advantages of this plan")
    penalties: List[str] = Field(default_factory=list, description="Penalties or constraint conflicts identified")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Raw quantifiable evaluation metrics")
