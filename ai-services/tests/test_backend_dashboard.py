import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import pytest
from fastapi.testclient import TestClient
from main import app
from db.repository import repository

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_dashboard_test_env():
    """Seed clean, controlled operational railway environment for dashboard tests."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()
    repository._local_profiles.clear()
    repository._ensure_default_seed()

    # 1. Assets
    repository.create_asset({
        "asset_id": "AST-TRK-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Engineering",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "UP",
    })
    repository.create_asset({
        "asset_id": "AST-OHE-01",
        "corridor_id": "COR-NDLS-GZB",
        "department": "Traction Distribution",
        "start_km": 0.0,
        "end_km": 15.0,
        "track_type": "BOTH",
    })
    repository.create_asset({
        "asset_id": "AST-SNT-01",
        "corridor_id": "COR-CSMT-KYN",
        "department": "Signalling & Telecom",
        "start_km": 0.0,
        "end_km": 10.0,
        "track_type": "BOTH",
    })

    # 2. Trains
    repository.create_train({
        "train_id": "TRN-101",
        "train_type": "PASSENGER_EXPRESS",
        "corridor_id": "COR-NDLS-GZB",
        "entry_minute": 300,
        "exit_minute": 360,
        "priority_level": 1,
    })

    # 3. Requests
    repository.create_request({
        "request_id": "REQ-D-01",
        "department": "Engineering",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-TRK-01",
        "required_duration_minutes": 120,
        "earliest_start_minute": 60,
        "latest_end_minute": 240,
        "is_traffic_block_required": True,
        "is_power_block_required": False,
        "urgency": "CRITICAL",
        "days_overdue": 5,
        "linked_defect_id": "DEF-001",
    })
    repository.create_request({
        "request_id": "REQ-D-02",
        "department": "Traction Distribution",
        "corridor_id": "COR-NDLS-GZB",
        "asset_id": "AST-OHE-01",
        "required_duration_minutes": 90,
        "earliest_start_minute": 100,
        "latest_end_minute": 300,
        "is_traffic_block_required": True,
        "is_power_block_required": True,
        "urgency": "HIGH",
    })


def test_dashboard_summary_real_aggregation():
    """1. Test GET /api/v1/dashboard/summary real aggregated values."""
    # Generate a plan to populate plans data
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-D-01"],
    })
    assert gen_resp.status_code == 201

    res = client.get("/api/v1/dashboard/summary")
    assert res.status_code == 200
    data = res.json()

    assert data["total_requests"] == 2
    assert data["critical_priority_requests"] == 1
    assert data["high_priority_requests"] == 1
    assert data["overdue_requests"] >= 1
    assert data["total_assets"] == 3
    assert data["total_corridors"] >= 2
    assert data["active_corridors"] >= 2
    assert data["unavailable_corridors"] == 0
    assert data["total_trains"] == 1
    assert data["total_plans"] == 1
    assert data["draft_plans"] == 1
    assert data["feasible_plans"] == 1
    assert data["infeasible_plans"] == 0


def test_dashboard_requests_filtering_and_pagination():
    """2. Test GET /api/v1/dashboard/requests filtering and pagination."""
    # Filter by department
    res_eng = client.get("/api/v1/dashboard/requests?department=Engineering")
    assert res_eng.status_code == 200
    items_eng = res_eng.json()
    assert len(items_eng) == 1
    assert items_eng[0]["request_id"] == "REQ-D-01"

    # Filter overdue only
    res_overdue = client.get("/api/v1/dashboard/requests?overdue_only=true")
    assert res_overdue.status_code == 200
    assert len(res_overdue.json()) == 1

    # Filter by corridor
    res_cor = client.get("/api/v1/dashboard/requests?corridor_id=COR-NDLS-GZB")
    assert res_cor.status_code == 200
    assert len(res_cor.json()) == 2

    # Test pagination
    res_page = client.get("/api/v1/dashboard/requests?limit=1&offset=0")
    assert res_page.status_code == 200
    assert len(res_page.json()) == 1


def test_dashboard_assets_and_corridors_operational_state():
    """3. Test GET /api/v1/dashboard/assets and GET /api/v1/dashboard/corridors."""
    # Assets
    res_assets = client.get("/api/v1/dashboard/assets")
    assert res_assets.status_code == 200
    assets = res_assets.json()
    assert len(assets) == 3
    assert all("scheduled_blocks_count" in a for a in assets)

    # Filter assets by corridor
    res_cor_assets = client.get("/api/v1/dashboard/assets?corridor_id=COR-NDLS-GZB")
    assert res_cor_assets.status_code == 200
    assert len(res_cor_assets.json()) == 2

    # Corridors
    res_corridors = client.get("/api/v1/dashboard/corridors")
    assert res_corridors.status_code == 200
    corridors = res_corridors.json()
    assert len(corridors) >= 2
    delhi_cor = next(c for c in corridors if c["corridor_id"] == "COR-NDLS-GZB")
    assert delhi_cor["trains_count"] == 1
    assert delhi_cor["is_active"] is True


def test_dashboard_plans_monitoring():
    """4. Test GET /api/v1/dashboard/plans."""
    client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-D-01"],
    })

    res = client.get("/api/v1/dashboard/plans")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) == 1
    p = plans[0]
    assert p["status"] == "DRAFT"
    assert p["is_feasible"] is True
    assert p["items_count"] == 1
    assert p["violations_count"] == 0


def test_dashboard_planning_kpis_calculation():
    """5. Test GET /api/v1/dashboard/planning-kpis mathematically valid metrics."""
    # Generate plan
    client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-D-01"],
    })

    res = client.get("/api/v1/dashboard/planning-kpis")
    assert res.status_code == 200
    kpis = res.json()

    assert kpis["requests_scheduled"] == 1
    assert kpis["requests_unscheduled"] == 1
    assert kpis["total_scheduled_duration_minutes"] == 120
    assert kpis["total_conflicts"] == 0
    assert kpis["feasible_plan_percentage"] == 100.0
    assert kpis["critical_requests_scheduled"] == 1
    assert kpis["overdue_requests_scheduled"] == 1
    assert kpis["corridor_utilization_pct"] > 0.0
    assert kpis["asset_utilization_pct"] > 0.0


def test_dashboard_recent_activity_chronology():
    """6. Test GET /api/v1/dashboard/recent-activity."""
    gen_resp = client.post("/api/v1/plans/generate", json={
        "corridor_id": "COR-NDLS-GZB",
        "request_ids": ["REQ-D-01"],
    })
    plan_id = gen_resp.json()["plan_id"]

    # Start review and approve to generate audit trail
    client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "start_review",
        "reviewer": "Controller Gupta",
    })
    client.post(f"/api/v1/plans/{plan_id}/review", json={
        "action": "approve",
        "reviewer": "Chief Controller Verma",
    })

    res = client.get("/api/v1/dashboard/recent-activity")
    assert res.status_code == 200
    activities = res.json()
    assert len(activities) >= 3

    types = [a["activity_type"] for a in activities]
    assert "PLAN_GENERATED" in types
    assert "PLAN_START_REVIEW" in types
    assert "PLAN_APPROVE" in types


def test_dashboard_alerts_detection():
    """7. Test GET /api/v1/dashboard/alerts real alerts."""
    # Overdue request REQ-D-01 is unscheduled -> should trigger an alert
    res_before = client.get("/api/v1/dashboard/alerts")
    assert res_before.status_code == 200
    alerts = res_before.json()
    assert len(alerts) >= 1
    assert any(a["alert_type"] == "OVERDUE_MAINTENANCE" for a in alerts)

    # Create an infeasible plan with train conflict
    conflict_plan = {
        "plan_id": "PLAN-DASH-CONFLICT",
        "title": "Conflict Plan",
        "overall_score": 30.0,
        "is_feasible": False,
        "evaluation_summary": {
            "feasibility": {
                "violations": [
                    {
                        "constraint_type": "TRAIN_TRAFFIC_CONFLICT",
                        "corridor_id": "COR-NDLS-GZB",
                        "reason": "Direct train collision detected on corridor COR-NDLS-GZB",
                    }
                ]
            }
        },
        "items": [
            {
                "request_id": "REQ-D-01",
                "corridor_id": "COR-NDLS-GZB",
                "asset_id": "AST-TRK-01",
                "department": "Engineering",
                "scheduled_start_minute": 300,
                "scheduled_end_minute": 420,
                "allocated_duration_minutes": 120,
                "status": "SCHEDULED",
            }
        ]
    }
    client.post("/api/v1/plans", json=conflict_plan)

    res_after = client.get("/api/v1/dashboard/alerts")
    assert res_after.status_code == 200
    alerts_after = res_after.json()
    conflict_alerts = [a for a in alerts_after if a["alert_type"] == "CONSTRAINT_VIOLATION"]
    assert len(conflict_alerts) >= 1
    assert conflict_alerts[0]["severity"] == "CRITICAL"


def test_dashboard_empty_state_resilience():
    """8. Test dashboard endpoints with empty state."""
    repository._local_corridors.clear()
    repository._local_assets.clear()
    repository._local_trains.clear()
    repository._local_requests.clear()
    repository._local_plans.clear()
    repository._local_plan_items.clear()

    res_summary = client.get("/api/v1/dashboard/summary")
    assert res_summary.status_code == 200
    assert res_summary.json()["total_requests"] == 0

    res_kpis = client.get("/api/v1/dashboard/planning-kpis")
    assert res_kpis.status_code == 200
    assert res_kpis.json()["requests_scheduled"] == 0
    assert res_kpis.json()["feasible_plan_percentage"] == 100.0

    res_alerts = client.get("/api/v1/dashboard/alerts")
    assert res_alerts.status_code == 200
    assert len(res_alerts.json()) == 0

    res_activity = client.get("/api/v1/dashboard/recent-activity")
    assert res_activity.status_code == 200
    assert len(res_activity.json()) == 0
