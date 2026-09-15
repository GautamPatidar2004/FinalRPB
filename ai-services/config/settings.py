from pathlib import Path
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    service_name: str = "railway-planning-ai"
    version: str = "0.1.0"
    environment: str = Field(default="development", description="development, test, staging, production")
    host: str = "0.0.0.0"
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = "INFO"
    cors_origins: List[str] = ["*"]

    # Supabase Connection
    supabase_url: Optional[str] = None
    supabase_key: Optional[str] = None
    supabase_anon_key: Optional[str] = None
    supabase_service_role_key: Optional[str] = None

    # Model & Data Paths
    model_artifact_path: str = "models/artifacts/priority_model.joblib"
    training_csv_path: str = "data/training/historical_maintenance.csv"

    # LLM Dynamic Provider Settings (Gemini, Groq, OpenAI)
    llm_preferred_provider: str = Field(default="gemini", description="gemini, groq, or openai")
    llm_fallback_enabled: bool = True
    llm_timeout_seconds: float = 10.0
    llm_retry_limit: int = 1
    llm_cooldown_seconds: float = 60.0

    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_enabled: bool = True
    gemini_request_budget: int = 1000

    groq_api_key: Optional[str] = None
    groq_model: str = "llama-3.3-70b-versatile"
    groq_enabled: bool = True
    groq_request_budget: int = 1000

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    openai_enabled: bool = True
    openai_request_budget: int = 1000

    model_config = SettingsConfigDict(
        env_file=(
            str(SERVICE_ROOT / ".env"),
            str(SERVICE_ROOT.parent / ".env"),
            ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def effective_supabase_key(self) -> Optional[str]:
        """Provides prioritized fallback across service-role, anon, and general keys."""
        return self.supabase_service_role_key or self.supabase_anon_key or self.supabase_key

    @property
    def resolved_model_path(self) -> Path:
        """Resolves the trained model artifact path portably across environments."""
        p = Path(self.model_artifact_path)
        if not p.is_absolute():
            return (SERVICE_ROOT / p).resolve()
        return p

    @property
    def resolved_training_csv_path(self) -> Path:
        """Resolves the training CSV path portably across environments."""
        p = Path(self.training_csv_path)
        if not p.is_absolute():
            return (SERVICE_ROOT / p).resolve()
        return p

    def validate_production_readiness(self) -> List[str]:
        """Validates configuration for production deployments (e.g. on Render)."""
        issues = []
        if self.environment == "production":
            if not self.supabase_url:
                issues.append("SUPABASE_URL must be configured in production.")
            if not self.effective_supabase_key:
                issues.append("SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY must be configured in production.")
            if not self.resolved_model_path.exists():
                issues.append(f"Model artifact not found at: {self.resolved_model_path}")
        return issues

    def __repr__(self) -> str:
        """Mask sensitive keys from string representation and logs."""
        masked_url = self.supabase_url if self.supabase_url else "None"
        masked_key = "***" if self.effective_supabase_key else "None"
        return (
            f"Settings(service='{self.service_name}', env='{self.environment}', "
            f"port={self.port}, supabase_url='{masked_url}', supabase_key='{masked_key}')"
        )


settings = Settings()
