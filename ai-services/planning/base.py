from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BasePlanningEngine(ABC):
    """Abstract interface for planning and optimization engines."""

    @abstractmethod
    def generate_plan(self, data: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate an optimized operational schedule or plan."""
        pass
