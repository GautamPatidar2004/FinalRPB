from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from schemas.railway import GeneratedBlockPlanRecord, Priority
from schemas.evaluation import PlanEvaluationResult
from schemas.constraints import PlanFeasibilityResult


class DecisionLogRecord(BaseModel):
    """Explainable record of an important planning/optimization decision."""
    decision_type: str = Field(..., description="SCHEDULED, REPLANNED, SWAPPED, or DEFERRED")
    request_id: str
    plan_id: Optional[str] = None
    priority_category: Priority
    rationale: str


class UnresolvedRequirementReport(BaseModel):
    """Detailed report for high/medium priority requirements that could not be feasibly scheduled."""
    request_id: str
    priority_category: Priority
    priority_score: float
    reasons: List[str] = Field(default_factory=list)
    attempted_strategies: List[str] = Field(default_factory=list)


from schemas.planning import CandidatePlanBundle


class OptimizedPlanResult(BaseModel):
    """Final output of the optimization and replanning engine."""
    plan_id: str
    selected_strategy: str
    is_feasible: bool
    plan: List[GeneratedBlockPlanRecord]
    evaluation: PlanEvaluationResult
    feasibility: PlanFeasibilityResult
    decision_log: List[DecisionLogRecord] = Field(default_factory=list)
    unresolved_requirements: List[UnresolvedRequirementReport] = Field(default_factory=list)
    replanning_applied: bool = False
    candidates: List[CandidatePlanBundle] = Field(default_factory=list)
    best_candidate: Optional[CandidatePlanBundle] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
