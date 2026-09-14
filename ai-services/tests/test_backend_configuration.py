import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import pytest
from fastapi.testclient import TestClient
from main import app
from config.settings import Settings, settings
from db.repository import repository

client = TestClient(app)


def test_settings_defaults_and_types():
    """Verify typed settings loaded with valid defaults and types."""
    assert settings.service_name == "railway-planning-ai"
    assert settings.environment in ("development", "test", "production")
    assert isinstance(settings.port, int)
    assert 1 <= settings.port <= 65535
    assert isinstance(settings.cors_origins, list)


def test_portable_path_resolution():
    """Verify model and data paths resolve portably relative to the service root."""
    assert settings.resolved_model_path.is_absolute()
    assert settings.resolved_model_path.name == "priority_model.joblib"
    assert settings.resolved_model_path.exists(), f"Model artifact missing at {settings.resolved_model_path}"

    assert settings.resolved_training_csv_path.is_absolute()
    assert settings.resolved_training_csv_path.name == "historical_maintenance.csv"


def test_secret_masking_in_repr():
    """Verify secrets are never exposed in string representations or logs."""
    test_settings = Settings(
        supabase_url="https://xyzcompany.supabase.co",
        supabase_anon_key="public-anon-key-123",
        supabase_service_role_key="secret-service-role-key-456",
    )
    repr_str = repr(test_settings)
    assert "secret-service-role-key-456" not in repr_str
    assert "public-anon-key-123" not in repr_str
    assert "***" in repr_str


def test_effective_supabase_key_priority():
    """Verify fallback priority: service-role > anon > general key."""
    s1 = Settings(supabase_service_role_key="srv-key", supabase_anon_key="anon-key")
    assert s1.effective_supabase_key == "srv-key"

    s2 = Settings(supabase_anon_key="anon-key")
    assert s2.effective_supabase_key == "anon-key"

    s3 = Settings(supabase_key="gen-key", supabase_anon_key=None, supabase_service_role_key=None)
    assert s3.effective_supabase_key == "gen-key"

    s4 = Settings(supabase_key=None, supabase_anon_key=None, supabase_service_role_key=None)
    assert s4.effective_supabase_key is None


def test_production_readiness_validation():
    """Verify production readiness validation detects missing credentials."""
    # Production without Supabase credentials should report issues
    prod_settings_incomplete = Settings(
        environment="production",
        supabase_url=None,
        supabase_anon_key=None,
    )
    issues = prod_settings_incomplete.validate_production_readiness()
    assert len(issues) >= 2
    assert any("SUPABASE_URL" in i for i in issues)

    # Production with proper credentials reports zero issues
    prod_settings_complete = Settings(
        environment="production",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-key",
        model_artifact_path=str(settings.resolved_model_path),
    )
    assert len(prod_settings_complete.validate_production_readiness()) == 0


def test_health_endpoints_do_not_leak_secrets():
    """Verify health endpoints return readiness without leaking environment secrets."""
    res_root = client.get("/health")
    assert res_root.status_code == 200
    data_root = res_root.json()
    assert data_root["status"] in ("healthy", "degraded")
    assert "supabase" not in str(data_root).lower()
    assert "key" not in str(data_root).lower()

    res_v1 = client.get("/api/v1/health")
    assert res_v1.status_code == 200
    data_v1 = res_v1.json()
    assert data_v1["status"] in ("healthy", "degraded")
    assert "supabase" not in str(data_v1).lower()
    assert "key" not in str(data_v1).lower()


def test_env_files_and_gitignore_exist():
    """Verify .env.example, .env, and .gitignore exist in both root and ai-services."""
    root_dir = SERVICE_ROOT.parent

    # Root files
    assert (root_dir / ".env.example").exists()
    assert (root_dir / ".env").exists()
    assert (root_dir / ".gitignore").exists()

    # Service files
    assert (SERVICE_ROOT / ".env.example").exists()
    assert (SERVICE_ROOT / ".env").exists()
    assert (SERVICE_ROOT / ".gitignore").exists()

    # Ensure .env is explicitly ignored in .gitignore
    root_gitignore_content = (root_dir / ".gitignore").read_text(encoding="utf-8")
    assert ".env" in root_gitignore_content
