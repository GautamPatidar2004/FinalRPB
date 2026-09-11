from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ModelEvaluationMetrics(BaseModel):
    """Quality metrics for the Priority/Risk model on validation/test datasets."""
    mae: float = Field(..., description="Mean Absolute Error of predicted priority score")
    rmse: float = Field(..., description="Root Mean Squared Error")
    r2_score: float = Field(..., description="Coefficient of determination R^2")
    samples_evaluated: int = Field(..., ge=1)


class PlanningQualityMetrics(BaseModel):
    """Quality metrics for the planning engine across evaluated datasets."""
    mean_overall_score: float = Field(..., ge=0.0, le=100.0)
    feasible_plan_rate_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of datasets yielding a feasible final plan")
    high_priority_coverage_pct: float = Field(..., ge=0.0, le=100.0, description="Percentage of CRITICAL/HIGH requests scheduled")
    unresolved_requirement_rate_pct: float = Field(..., ge=0.0, le=100.0)
    night_shadow_utilization_pct: float = Field(..., ge=0.0, le=100.0)
    total_hard_violations: int = Field(default=0, ge=0)


class PipelinePerformanceBenchmark(BaseModel):
    """Execution performance and scalability benchmark metrics."""
    total_runtime_seconds: float = Field(..., ge=0.0)
    mean_planning_time_ms: float = Field(..., ge=0.0)
    datasets_evaluated: int = Field(..., ge=1)
    total_requests_processed: int = Field(..., ge=1)
    candidates_evaluated_count: int = Field(..., ge=0)
    replanning_occurred_count: int = Field(..., ge=0)
    successful_plan_generation_rate_pct: float = Field(..., ge=0.0, le=100.0)


class EvaluationBenchmarkReport(BaseModel):
    """Unified machine-readable evaluation and benchmark report."""
    timestamp: str
    model_metrics: ModelEvaluationMetrics
    planning_metrics: PlanningQualityMetrics
    performance_benchmark: PipelinePerformanceBenchmark
