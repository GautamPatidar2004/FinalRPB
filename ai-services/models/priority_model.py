import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import joblib
import numpy as np

from config.settings import settings
from models.base import BaseModelEngine
from models.features import extract_request_features
from schemas.railway import Priority, PriorityScoreResult, RailwayPlanningDataset

MODEL_PATH = settings.resolved_model_path


def categorize_score(score: float) -> Priority:
    if score >= 70.0:
        return Priority.CRITICAL
    elif score >= 45.0:
        return Priority.HIGH
    elif score >= 25.0:
        return Priority.MEDIUM
    return Priority.LOW


class PriorityRiskModelEngine(BaseModelEngine):
    """
    Inference engine for calculating normalized priority/risk scores,
    rankings, and explainable factor breakdowns for railway maintenance requests.
    """

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = model_path or MODEL_PATH
        self.model = None
        self.feature_names: List[str] = []
        self._load_model()

    def _load_model(self):
        if self.model_path.exists():
            artifact = joblib.load(self.model_path)
            self.model = artifact["model"]
            self.feature_names = artifact["feature_names"]

    def predict(self, features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """BaseModelEngine contract implementation."""
        if not self.model or not self.feature_names:
            return None

        # Build feature vector
        vector = np.array([[features.get(col, 0.0) for col in self.feature_names]], dtype=np.float32)
        score = float(np.clip(self.model.predict(vector)[0], 0.0, 100.0))
        return {
            "score": round(score, 2),
            "category": categorize_score(score).value,
        }

    def score_dataset(self, dataset: RailwayPlanningDataset) -> List[PriorityScoreResult]:
        """
        Scores and ranks all maintenance block requests in the dataset.
        Returns a sorted list of PriorityScoreResult objects with explainable factors.
        """
        results: List[PriorityScoreResult] = []

        # Ensure model is pre-loaded; do NOT retrain during inference
        if self.model is None:
            raise RuntimeError(
                f"Trained priority model artifact not found at '{self.model_path}'. "
                "Ensure artifacts/priority_model.joblib exists prior to launching the inference service."
            )

        raw_scores = []
        for req in dataset.block_requests:
            feat_dict, factors, _ = extract_request_features(req, dataset)
            vector = np.array([[feat_dict.get(col, 0.0) for col in self.feature_names]], dtype=np.float32)
            predicted_score = float(np.clip(self.model.predict(vector)[0], 0.0, 100.0))
            raw_scores.append((req.request_id, predicted_score, factors))

        # Sort descending by priority_score for ranking
        raw_scores.sort(key=lambda x: x[1], reverse=True)

        for rank, (req_id, score, factors) in enumerate(raw_scores, start=1):
            results.append(
                PriorityScoreResult(
                    request_id=req_id,
                    priority_score=round(score, 2),
                    priority_category=categorize_score(score),
                    rank=rank,
                    factors=factors,
                )
            )

        return results
