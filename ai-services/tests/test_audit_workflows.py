import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.csv_handler import (
    DEFAULT_TRAINING_CSV,
    load_and_validate_training_csv,
    export_training_dataset_csv,
)
from models.train import train_priority_model, MODEL_PATH
from models.priority_model import PriorityRiskModelEngine
from main import app
from starlette.testclient import TestClient


def test_complete_training_workflow_from_csv():
    """Verify: training CSV -> validation -> preprocessing -> training -> evaluation -> model artifact"""
    # 1. Verify training CSV exists and validates
    assert DEFAULT_TRAINING_CSV.exists()
    X, y, feature_names = load_and_validate_training_csv(DEFAULT_TRAINING_CSV)
    assert len(y) > 0
    assert len(feature_names) == 14

    # 2. Run training script and check artifact generation
    metrics = train_priority_model(csv_path=DEFAULT_TRAINING_CSV, seed=42)
    assert metrics["r2"] > 0.85
    assert metrics["mae"] < 5.0
    assert MODEL_PATH.exists()

    # 3. Verify artifact is cleanly loaded into inference engine
    engine = PriorityRiskModelEngine(model_path=MODEL_PATH)
    assert engine.model is not None
    assert len(engine.feature_names) == 14
    print(f"[PASS] Complete training workflow from CSV check (R^2={metrics['r2']:.3f})")


def test_training_csv_validation_failure():
    """Verify invalid CSV formats trigger actionable validation errors."""
    bad_csv = SERVICE_ROOT / "data" / "training" / "bad_test.csv"
    with open(bad_csv, "w", encoding="utf-8") as f:
        f.write("request_id,random_column\nREQ-1,abc\n")

    try:
        load_and_validate_training_csv(bad_csv)
        assert False, "Should have raised ValueError for missing columns"
    except ValueError as ex:
        assert "missing required column" in str(ex)
    finally:
        if bad_csv.exists():
            bad_csv.unlink()
    print("[PASS] Training CSV validation error detection check")


def test_production_csv_inference_endpoint():
    """Verify: Railway CSV input -> validation -> existing model -> planning engine -> optimized plan"""
    client = TestClient(app)

    sample_csv = """request_id,department,urgency,corridor_id,asset_id,required_duration_minutes,earliest_start_minute,latest_end_minute,is_traffic_block_required,is_power_block_required
REQ-CSV-01,Engineering,HIGH,COR-DEL-GZB,AST-DEL-01,90,120,360,1,0
REQ-CSV-02,Traction Distribution,CRITICAL,COR-DEL-GZB,AST-DEL-02,120,120,360,0,1
"""
    # Valid CSV request
    res = client.post(
        "/api/v1/plan/csv",
        content=sample_csv,
        headers={"Content-Type": "text/csv"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_feasible"] is True
    assert len(data["plan"]) == 2
    assert "decision_log" in data
    assert "evaluation" in data

    # Invalid CSV request (missing columns)
    bad_csv = "random_col1,random_col2\nval1,val2\n"
    res_bad = client.post(
        "/api/v1/plan/csv",
        content=bad_csv,
        headers={"Content-Type": "text/csv"},
    )
    assert res_bad.status_code == 422
    assert "missing required column" in res_bad.json()["detail"]
    print("[PASS] Production CSV inference endpoint and validation check")


def test_inference_does_not_retrain_without_artifact():
    """Verify that inference does not silently retrain when artifact is missing."""
    missing_path = SERVICE_ROOT / "models" / "artifacts" / "non_existent.joblib"
    engine = PriorityRiskModelEngine(model_path=missing_path)

    try:
        from data.synthetic_generator import generate_synthetic_dataset
        ds = generate_synthetic_dataset(num_requests=2, seed=1)
        engine.score_dataset(ds)
        assert False, "Should raise RuntimeError rather than retraining during inference"
    except RuntimeError as ex:
        assert "not found" in str(ex)
    print("[PASS] Inference separation (no retraining) check")


if __name__ == "__main__":
    test_complete_training_workflow_from_csv()
    test_training_csv_validation_failure()
    test_production_csv_inference_endpoint()
    test_inference_does_not_retrain_without_artifact()
    print("All Audit and Workflow checks passed successfully.")
