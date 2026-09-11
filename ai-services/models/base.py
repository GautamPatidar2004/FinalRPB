from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseModelEngine(ABC):
    """Abstract interface for AI/ML inference or estimation models."""

    @abstractmethod
    def predict(self, features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Compute predictions or inferences from input features."""
        pass
