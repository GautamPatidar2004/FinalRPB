import sys
from pathlib import Path
from pydantic import ValidationError

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas.railway import (
    Department,
    Priority,
    TrackType,
    RailwayAsset,
    MaintenanceBlockRequest,
    RailwayPlanningDataset,
    GeneratedBlockPlanRecord,
)
from schemas.base import PipelineInputData
from pipeline.base import BasePipeline
from data.synthetic_generator import generate_synthetic_dataset, SyntheticRailwayDataGenerator
from main import app
from starlette.testclient import TestClient


def test_railway_schemas_validation():
    # 1. Valid Asset
    asset = RailwayAsset(
        asset_id="AST-001",
        corridor_id="COR-01",
        department=Department.ENG,
        start_km=10.5,
        end_km=12.0,
        track_type=TrackType.UP,
    )
    assert asset.asset_id == "AST-001"

    # 2. Invalid negative km should fail
    try:
        RailwayAsset(
            asset_id="AST-INV",
            corridor_id="COR-01",
            department=Department.ENG,
            start_km=-1.0,
            end_km=10.0,
        )
        assert False, "Should have raised ValidationError for negative start_km"
    except ValidationError:
        pass

    # 3. Invalid duration (> 720 min limit) should fail
    try:
        MaintenanceBlockRequest(
            request_id="REQ-INV",
            department=Department.TRD,
            corridor_id="COR-01",
            asset_id="AST-001",
            required_duration_minutes=9999,
        )
        assert False, "Should have raised ValidationError for duration exceeding limit"
    except ValidationError:
        pass

    # 4. Plan Record schema
    plan_record = GeneratedBlockPlanRecord(
        plan_id="PLN-001",
        request_id="REQ-001",
        corridor_id="COR-01",
        asset_id="AST-001",
        department=Department.ENG,
        scheduled_start_minute=120,
        scheduled_end_minute=240,
        allocated_duration_minutes=120,
        status="SCHEDULED",
        conflict_flags=[],
    )
    assert plan_record.status == "SCHEDULED"
    print("[PASS] Railway schemas validation check")


def test_synthetic_generator_interconnected_and_deterministic():
    # 1. Determinism check with seed
    ds1 = generate_synthetic_dataset(num_requests=20, seed=123)
    ds2 = generate_synthetic_dataset(num_requests=20, seed=123)
    ds3 = generate_synthetic_dataset(num_requests=20, seed=999)

    assert ds1.model_dump() == ds2.model_dump(), "Generator with same seed must be deterministic"
    assert ds1.model_dump() != ds3.model_dump(), "Generator with different seed should produce different data"

    # 2. Department coverage
    departments_present = {req.department for req in ds1.block_requests}
    assert Department.ENG in departments_present, "Engineering requests missing"
    assert Department.TRD in departments_present, "TRD requests missing"
    assert Department.SNT in departments_present, "S&T requests missing"

    # 3. Relational Interconnection Integrity
    corridor_ids = {c.corridor_id for c in ds1.corridors}
    asset_ids = {a.asset_id: a for a in ds1.assets}
    defect_ids = {d.defect_id: d for d in ds1.defects}

    # Every asset must map to a known corridor
    for asset in ds1.assets:
        assert asset.corridor_id in corridor_ids, f"Asset {asset.asset_id} references unknown corridor {asset.corridor_id}"

    # Every block request must map to a known asset & matching corridor
    for req in ds1.block_requests:
        assert req.asset_id in asset_ids, f"Request {req.request_id} references unknown asset {req.asset_id}"
        assert req.corridor_id == asset_ids[req.asset_id].corridor_id, "Corridor mismatch between request and asset"
        if req.linked_defect_id:
            assert req.linked_defect_id in defect_ids, f"Request {req.request_id} links to unknown defect {req.linked_defect_id}"

    # 4. Realistic variations
    durations = {req.required_duration_minutes for req in ds1.block_requests}
    assert len(durations) > 1, "Expected duration variations"
    overdue_defects = [d for d in ds1.defects if d.days_overdue > 0]
    assert len(overdue_defects) > 0, "Expected overdue defects to be simulated"
    assert any(d.severity == Priority.CRITICAL for d in ds1.defects), "Expected critical defects"
    print("[PASS] Synthetic generator interconnection, departments & determinism check")


def test_pipeline_and_api_integration():
    dataset = generate_synthetic_dataset(num_requests=10, seed=42)
    payload_dict = dataset.model_dump()

    # Direct pipeline execution
    pipeline = BasePipeline()
    input_data = PipelineInputData(payload=payload_dict)
    result = pipeline.run(input_data)
    assert result.status == "success"

    # API execution
    client = TestClient(app)
    response = client.post("/api/v1/plan", json={"payload": payload_dict})
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    print("[PASS] Pipeline and API integration with synthetic dataset check")


if __name__ == "__main__":
    test_railway_schemas_validation()
    test_synthetic_generator_interconnected_and_deterministic()
    test_pipeline_and_api_integration()
    print("All Prompt 2 checks passed successfully.")
