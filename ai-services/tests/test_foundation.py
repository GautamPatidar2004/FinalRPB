import os
import sys
from pathlib import Path

# Ensure ai-services root is in sys.path
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from config.settings import Settings
from schemas.base import PipelineInputData, ValidationResult
from validation.validator import BaseValidator, DefaultValidator
from pipeline.base import BasePipeline
from main import app


def test_configuration():
    os.environ["PORT"] = "9090"
    os.environ["ENVIRONMENT"] = "testing"
    s = Settings()
    assert s.port == 9090, f"Expected port 9090, got {s.port}"
    assert s.environment == "testing", f"Expected environment testing, got {s.environment}"
    print("[PASS] Configuration check")


def test_validation_and_pipeline():
    # 1. Test validation pass
    pipeline = BasePipeline()
    valid_data = PipelineInputData(payload={"blocks": [1, 2, 3]})
    result = pipeline.run(valid_data)
    assert result.status == "success", f"Expected success, got {result.status}"
    assert result.diagnostics["has_model_engine"] is False

    # 2. Test custom validator failure handling
    class StrictValidator(BaseValidator):
        def validate(self, data: PipelineInputData) -> ValidationResult:
            if "required_key" not in data.payload:
                return ValidationResult(is_valid=False, errors=["Missing required_key."])
            return ValidationResult(is_valid=True)

    strict_pipeline = BasePipeline(validator=StrictValidator())
    invalid_data = PipelineInputData(payload={"other": 123})
    res_invalid = strict_pipeline.run(invalid_data)
    assert res_invalid.status == "validation_error"
    assert "Missing required_key." in res_invalid.diagnostics["errors"]
    print("[PASS] Validation and pipeline check")


def test_fastapi_endpoints():
    from starlette.testclient import TestClient

    client = TestClient(app)

    # 1. Root health endpoint
    res_root = client.get("/health")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "healthy"

    # 2. Prefixed health endpoint
    res_api_health = client.get("/api/v1/health")
    assert res_api_health.status_code == 200
    assert res_api_health.json()["status"] == "healthy"

    # 3. Plan endpoint execution
    res_plan = client.post("/api/v1/plan", json={"payload": {"block_id": "BLK-101"}})
    assert res_plan.status_code == 200
    data = res_plan.json()
    assert data["status"] == "success"
    print("[PASS] FastAPI endpoint response check")


if __name__ == "__main__":
    test_configuration()
    test_validation_and_pipeline()
    test_fastapi_endpoints()
    print("All foundation checks passed successfully.")
