from abc import ABC, abstractmethod
from schemas.base import PipelineInputData, ValidationResult


class BaseValidator(ABC):
    """Abstract validator interface for pipeline input."""

    @abstractmethod
    def validate(self, input_data: PipelineInputData) -> ValidationResult:
        """Validate input data before passing to planning/model stage."""
        pass


class DefaultValidator(BaseValidator):
    """Default minimal validator ensuring payload integrity."""

    def validate(self, input_data: PipelineInputData) -> ValidationResult:
        if not isinstance(input_data.payload, dict):
            return ValidationResult(is_valid=False, errors=["Payload must be a dictionary."])
        return ValidationResult(is_valid=True)
