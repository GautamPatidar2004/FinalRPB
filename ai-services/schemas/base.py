from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PipelineInputData(BaseModel):
    """Base input wrapper for AI/planning pipeline requests."""
    payload: Dict[str, Any] = Field(default_factory=dict, description="Input data payload to be validated and processed")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Contextual request metadata")


class ValidationResult(BaseModel):
    """Result of validating pipeline input data."""
    is_valid: bool = True
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class PipelineResult(BaseModel):
    """Standardized output structure for planning engine runs."""
    status: str = "success"
    plan: Optional[Dict[str, Any]] = None
    diagnostics: Dict[str, Any] = Field(default_factory=dict)
