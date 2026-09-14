import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas.explainability import (
    NarrativeExplanation,
    ProviderHealthState,
    ProviderMetadata,
)
from explainability.providers import (
    BaseLLMProvider,
    DeterministicExplanationProvider,
    DynamicProviderOrchestrator,
    GeminiProvider,
    GroqProvider,
)
from config.settings import settings


@pytest.fixture
def mock_evidence():
    return {
        "planning_run_id": "TEST-PLAN-001",
        "selected_plan": {
            "plan_id": "TEST-PLAN-001",
            "selected_strategy": "priority_greedy",
            "is_feasible": True,
            "overall_score": 92.5,
            "scheduled_blocks_count": 3,
            "deferred_blocks_count": 0,
        },
        "score_breakdown": {
            "overall_score": 92.5,
            "asset_availability": 95.0,
            "risk_coverage": 90.0,
            "operational_impact": 85.0,
        },
        "scheduled_reasons": [
            {
                "request_id": "REQ-001",
                "decision": "SELECTED",
                "primary_reason": "Clear window",
                "evidence": ["No train conflict"],
                "slot": [60, 180],
            }
        ],
        "postponed_reasons": [],
        "grouping_reasons": [],
        "alternative_reasons": [],
        "constraint_results": [
            {"constraint_type": "TRAIN_TRAFFIC_CONFLICT", "canonical_type": "TRAIN_CONFLICT", "passed": True}
        ],
        "warnings": [],
    }


def _dummy_narrative(provider_tag: str) -> NarrativeExplanation:
    return NarrativeExplanation(
        executive_summary=f"Plan generated via {provider_tag}.",
        operational_context="Normal operating conditions.",
        key_tradeoffs=["Optimal track possession."],
        risk_mitigation="All high risk items covered.",
        recommendations=["Execute on time."],
    )


# -------------------------------------------------------------
# 1. Gemini Available Success
# -------------------------------------------------------------
def test_gemini_available_success(mock_evidence):
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    gemini.generate_explanation = MagicMock(return_value=_dummy_narrative("gemini"))

    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.generate_explanation = MagicMock()

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    with patch.object(settings, "llm_preferred_provider", "gemini"):
        narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "gemini"
    assert meta.fallback_used is False
    assert meta.provider_status == ProviderHealthState.AVAILABLE
    assert "gemini" in narrative.executive_summary
    assert gemini.generate_explanation.call_count == 1
    assert groq.generate_explanation.call_count == 0  # No unnecessary double calls


# -------------------------------------------------------------
# 2. Groq Available Success
# -------------------------------------------------------------
def test_groq_available_success(mock_evidence):
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    gemini.generate_explanation = MagicMock()

    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.generate_explanation = MagicMock(return_value=_dummy_narrative("groq"))

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    with patch.object(settings, "llm_preferred_provider", "groq"):
        narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "groq"
    assert meta.fallback_used is False
    assert "groq" in narrative.executive_summary
    assert groq.generate_explanation.call_count == 1
    assert gemini.generate_explanation.call_count == 0


# -------------------------------------------------------------
# 3. Gemini Unavailable -> Groq Fallback
# -------------------------------------------------------------
def test_gemini_unavailable_groq_fallback(mock_evidence):
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    gemini.generate_explanation = MagicMock(side_effect=RuntimeError("Gemini connection timed out"))

    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.generate_explanation = MagicMock(return_value=_dummy_narrative("groq"))

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    with patch.object(settings, "llm_preferred_provider", "gemini"):
        with patch.object(settings, "llm_fallback_enabled", True):
            narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "groq"
    assert meta.fallback_used is True
    assert "gemini" in meta.fallback_reason.lower()
    assert "groq" in narrative.executive_summary
    assert groq.generate_explanation.call_count == 1


# -------------------------------------------------------------
# 4. Groq Unavailable -> Gemini Fallback
# -------------------------------------------------------------
def test_groq_unavailable_gemini_fallback(mock_evidence):
    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.generate_explanation = MagicMock(side_effect=RuntimeError("Groq 500 error"))

    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    gemini.generate_explanation = MagicMock(return_value=_dummy_narrative("gemini"))

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    with patch.object(settings, "llm_preferred_provider", "groq"):
        with patch.object(settings, "llm_fallback_enabled", True):
            narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "gemini"
    assert meta.fallback_used is True
    assert "gemini" in narrative.executive_summary
    assert gemini.generate_explanation.call_count == 1


# -------------------------------------------------------------
# 5. Both Unavailable -> Deterministic Fallback
# -------------------------------------------------------------
def test_both_unavailable_deterministic_fallback(mock_evidence):
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    gemini.generate_explanation = MagicMock(side_effect=RuntimeError("Gemini down"))

    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.generate_explanation = MagicMock(side_effect=RuntimeError("Groq down"))

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "deterministic"
    assert meta.fallback_used is True
    assert meta.provider_status == ProviderHealthState.AVAILABLE
    assert isinstance(narrative, NarrativeExplanation)
    assert len(narrative.executive_summary) > 0
    assert len(narrative.key_tradeoffs) > 0


# -------------------------------------------------------------
# 6. Quota and Rate Limit Handling
# -------------------------------------------------------------
# -------------------------------------------------------------
# 6. Quota and Rate Limit Handling
# -------------------------------------------------------------
def test_quota_and_rate_limit_handling():
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    state, msg = gemini.handle_provider_error(Exception("429 Too Many Requests: Resource has been exhausted"))
    assert state == ProviderHealthState.RATE_LIMITED
    assert gemini.is_available() is False

    # Budget exceeded
    groq = GroqProvider(api_key=settings.groq_api_key, budget=5)
    groq.request_count = 5
    assert groq.is_available() is False
    assert groq.get_status() == ProviderHealthState.QUOTA_EXCEEDED


# -------------------------------------------------------------
# 7. Authentication Failure Handling
# -------------------------------------------------------------
def test_authentication_failure_handling():
    gemini = GeminiProvider(api_key="")
    assert gemini.is_available() is False
    assert gemini.get_status() == ProviderHealthState.AUTH_FAILED

    # Error string parsing
    state, msg = gemini.handle_provider_error(Exception("401 Unauthorized - invalid api key"))
    assert state == ProviderHealthState.AUTH_FAILED


# -------------------------------------------------------------
# 8. Timeout Handling
# -------------------------------------------------------------
def test_timeout_handling():
    groq = GroqProvider(api_key=settings.groq_api_key)
    state, msg = groq.handle_provider_error(TimeoutError("Request timed out after 10.0s"))
    assert state == ProviderHealthState.DEGRADED


# -------------------------------------------------------------
# 9. Malformed LLM Response Handling
# -------------------------------------------------------------
def test_malformed_llm_response_handling(mock_evidence):
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    # Returns invalid non-JSON output
    gemini.generate_explanation = MagicMock(side_effect=ValueError("Invalid JSON returned by model"))

    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini)
    narrative, meta = orchestrator.generate_narrative_explanation(mock_evidence)

    assert meta.provider == "deterministic"
    assert meta.fallback_used is True
    assert isinstance(narrative, NarrativeExplanation)


# -------------------------------------------------------------
# 10. Configured Provider Disabled
# -------------------------------------------------------------
def test_configured_provider_disabled():
    gemini = GeminiProvider(api_key=settings.gemini_api_key, enabled=False)
    assert gemini.is_available() is False
    assert gemini.get_status() == ProviderHealthState.DISABLED


# -------------------------------------------------------------
# 11. Provider Health and Cooldown
# -------------------------------------------------------------
def test_provider_health_and_cooldown():
    groq = GroqProvider(api_key=settings.groq_api_key)
    groq.handle_provider_error(Exception("503 Service Unavailable"))
    assert groq.is_available() is False

    # Simulate cooldown expiration
    groq.last_failure_time = time.time() - 120.0
    with patch.object(settings, "llm_cooldown_seconds", 60.0):
        assert groq.is_available() is True


# -------------------------------------------------------------
# 12. Provider Status Telemetry (No Secrets Exposed)
# -------------------------------------------------------------
def test_provider_telemetry_no_secrets():
    gemini = GeminiProvider(api_key=settings.gemini_api_key)
    groq = GroqProvider(api_key=settings.groq_api_key)
    orchestrator = DynamicProviderOrchestrator(gemini_provider=gemini, groq_provider=groq)

    status = orchestrator.get_providers_status()
    status_str = str(status)

    if settings.gemini_api_key:
        assert settings.gemini_api_key not in status_str
    if settings.groq_api_key:
        assert settings.groq_api_key not in status_str
    assert "gemini" in status
    assert "groq" in status
    assert "deterministic" in status
    assert "model" in status["gemini"]
    assert "status" in status["gemini"]
