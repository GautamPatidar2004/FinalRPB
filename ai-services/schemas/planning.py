from typing import List, Optional
from pydantic import BaseModel, Field
from schemas.railway import GeneratedBlockPlanRecord
from schemas.evaluation import PlanEvaluationResult
from schemas.constraints import PlanFeasibilityResult


class CandidatePlanBundle(BaseModel):
    """Container for a generated candidate plan, its feasibility check, and quality evaluation."""
    strategy_name: str = Field(..., description="Name of generation strategy")
    plan: List[GeneratedBlockPlanRecord]
    evaluation: PlanEvaluationResult
    feasibility: Optional[PlanFeasibilityResult] = None
    rank: int = Field(default=1, ge=1)


class PlanningLoopResult(BaseModel):
    """Output of the candidate planning loop retaining top ranked plans."""
    candidates: List[CandidatePlanBundle]
    best_candidate: Optional[CandidatePlanBundle] = None
    total_generated: int = 0
