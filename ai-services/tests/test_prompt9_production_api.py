import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from data.synthetic_generator import generate_synthetic_dataset
from main import app
from starlette.testclient import TestClient
from config.settings import Settings


def test_production_health_probes():
    client = TestClient(app)

    # 1. Root health check
    res_root = client.get("/health")
    assert res_root.status_code == 200
    data_root = res_root.json()
    assert data_root["status"] == "healthy"
    assert data_root["model_loaded"] is True
    assert "service" in data_root
    assert "version" in data_root

    # 2. API v1 health check
    res_v1 = client.get("/api/v1/health")
    assert res_v1.status_code == 200
    assert res_v1.json()["model_loaded"] is True
    print("[PASS] Production health & readiness probes check")


def test_production_optimize_endpoint_valid():
    client = TestClient(app)
    dataset = generate_synthetic_dataset(num_requests=8, seed=42)

    response = client.post("/api/v1/optimize", json=dataset.model_dump())
    assert response.status_code == 200

    data = response.json()
    assert "plan_id" in data
    assert "is_feasible" in data
    assert data["is_feasible"] is True
    assert "plan" in data and len(data["plan"]) == len(dataset.block_requests)
    assert "evaluation" in data
    assert "decision_log" in data
    assert len(data["decision_log"]) > 0
    assert "unresolved_requirements" in data
    print("[PASS] Production optimize endpoint valid payload check")


def test_production_optimize_endpoint_validation_errors():
    client = TestClient(app)

    # 1. Missing required fields
    res_empty = client.post("/api/v1/optimize", json={"corridors": []})
    assert res_empty.status_code == 422
    err_body = res_empty.json()
    assert "detail" in err_body
    field_errors = [e["loc"][-1] for e in err_body["detail"]]
    assert "assets" in field_errors or "block_requests" in field_errors

    # 2. Invalid data types / negative km bounds
    bad_dataset = generate_synthetic_dataset(num_requests=3, seed=12).model_dump()
    bad_dataset["assets"][0]["start_km"] = -50.0  # violates ge=0
    res_bad = client.post("/api/v1/optimize", json=bad_dataset)
    assert res_bad.status_code == 422
    assert any("start_km" in str(e["loc"]) for e in res_bad.json()["detail"])
    print("[PASS] Production API validation & error handling check")


def test_render_environment_config_handling():
    # Test dynamic environment variable handling for Render
    test_port = "10000"
    test_env = "production-render"
    os.environ["PORT"] = test_port
    os.environ["ENVIRONMENT"] = test_env

    s = Settings()
    assert s.port == int(test_port)
    assert s.environment == test_env
    assert s.host == "0.0.0.0"
    print("[PASS] Render environment variable configuration check")


if __name__ == "__main__":
    test_production_health_probes()
    test_production_optimize_endpoint_valid()
    test_production_optimize_endpoint_validation_errors()
    test_render_environment_config_handling()
    print("All Prompt 9 checks passed successfully.")
