import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from models.features import extract_request_features, extract_features_dataset
from models.priority_model import PriorityRiskModelEngine, categorize_score
from models.train import train_priority_model, MODEL_PATH
from schemas.railway import Priority, PriorityScoreResult


def test_feature_and_factor_extraction():
    dataset = generate_synthetic_dataset(num_requests=10, seed=42)
    req = dataset.block_requests[0]
    features, factors, target = extract_request_features(req, dataset)

    # Check factors present and non-negative
    required_factors = [
        "defect_severity",
        "maintenance_overdue",
        "asset_criticality",
        "operational_impact",
        "window_tightness",
        "traffic_conflict",
    ]
    for factor in required_factors:
        assert factor in factors, f"Missing factor {factor}"
        assert factors[factor] >= 0.0

    # Check target within bounds
    assert 0.0 <= target <= 100.0
    print("[PASS] Feature and factor extraction check")


def test_model_training_and_artifact_persistence():
    metrics = train_priority_model(seed=42)
    assert MODEL_PATH.exists(), f"Model artifact {MODEL_PATH} was not created"
    assert "mae" in metrics and "r2" in metrics
    # R2 on synthetic target should be strong
    assert metrics["r2"] > 0.85, f"R2 score too low: {metrics['r2']}"
    print(f"[PASS] Model training check: MAE={metrics['mae']:.2f}, R2={metrics['r2']:.3f}")


def test_priority_inference_and_ranking():
    dataset = generate_synthetic_dataset(num_requests=15, seed=77)
    engine = PriorityRiskModelEngine()

    scores: list[PriorityScoreResult] = engine.score_dataset(dataset)
    assert len(scores) == 15

    # Check sorted by priority score descending
    for i in range(len(scores) - 1):
        assert scores[i].priority_score >= scores[i + 1].priority_score, "Scores must be descending"
        assert scores[i].rank == i + 1

    # Check explainability factors attached
    for item in scores:
        assert item.priority_score >= 0.0 and item.priority_score <= 100.0
        assert item.priority_category in [Priority.CRITICAL, Priority.HIGH, Priority.MEDIUM, Priority.LOW]
        assert "defect_severity" in item.factors
        assert "asset_criticality" in item.factors

    # Check BaseModelEngine predict interface
    req = dataset.block_requests[0]
    feat, _, _ = extract_request_features(req, dataset)
    pred = engine.predict(feat)
    assert pred is not None
    assert "score" in pred and "category" in pred
    print("[PASS] Priority inference and explainable ranking check")


if __name__ == "__main__":
    test_feature_and_factor_extraction()
    test_model_training_and_artifact_persistence()
    test_priority_inference_and_ranking()
    print("All Prompt 3 checks passed successfully.")
