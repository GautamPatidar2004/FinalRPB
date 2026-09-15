import json
import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from config.settings import settings
from schemas.explainability import (
    NarrativeExplanation,
    ProviderHealthState,
    ProviderMetadata,
    UnifiedPlanExplanation,
)


class BaseLLMProvider(ABC):
    """Abstract base class for explainability LLM providers."""

    def __init__(self, name: str, model: str, enabled: bool, timeout: float, budget: int):
        self.name = name
        self.model = model
        self.enabled = enabled
        self.timeout = timeout
        self.budget = budget
        self.request_count = 0
        self.state = ProviderHealthState.AVAILABLE if enabled else ProviderHealthState.DISABLED
        self.last_failure_time: float = 0.0
        self.last_error_message: Optional[str] = None

    def is_available(self) -> bool:
        """Determines if the provider is currently eligible for request dispatch."""
        if not self.enabled:
            return False
        if not self._has_credentials():
            self.state = ProviderHealthState.AUTH_FAILED
            return False
        elif self.state == ProviderHealthState.AUTH_FAILED:
            # Credentials are now present; restore state to AVAILABLE
            self.state = ProviderHealthState.AVAILABLE

        if self.request_count >= self.budget:
            self.state = ProviderHealthState.QUOTA_EXCEEDED
            return False

        # Cooldown check for transient errors
        if self.state in (ProviderHealthState.UNAVAILABLE, ProviderHealthState.RATE_LIMITED, ProviderHealthState.DEGRADED):
            if time.time() - self.last_failure_time > settings.llm_cooldown_seconds:
                self.state = ProviderHealthState.AVAILABLE
            else:
                return False

        return self.state in (ProviderHealthState.AVAILABLE, ProviderHealthState.DEGRADED)

    @abstractmethod
    def _has_credentials(self) -> bool:
        pass

    @abstractmethod
    def health_check(self) -> Tuple[bool, ProviderHealthState, str]:
        """Probes provider readiness without consuming large token quotas."""
        pass

    @abstractmethod
    def generate_explanation(self, evidence: Dict[str, Any]) -> NarrativeExplanation:
        """Generates evidence-grounded structured narrative explanation."""
        pass

    def get_status(self) -> ProviderHealthState:
        if not self.enabled:
            return ProviderHealthState.DISABLED
        if not self._has_credentials():
            return ProviderHealthState.AUTH_FAILED
        if self.request_count >= self.budget:
            return ProviderHealthState.QUOTA_EXCEEDED
        return self.state

    def handle_provider_error(self, error: Exception) -> Tuple[ProviderHealthState, str]:
        """Categorizes exception into standardized provider health states."""
        self.last_failure_time = time.time()
        err_str = str(error).lower()

        if "401" in err_str or "auth" in err_str or "unauthorized" in err_str or "api_key" in err_str or "invalid api key" in err_str:
            new_state = ProviderHealthState.AUTH_FAILED
        elif "429" in err_str or "rate limit" in err_str or "resource_exhausted" in err_str or "too many requests" in err_str:
            new_state = ProviderHealthState.RATE_LIMITED
        elif "quota" in err_str or "exceeded" in err_str:
            new_state = ProviderHealthState.QUOTA_EXCEEDED
        elif "timeout" in err_str or "timed out" in err_str:
            new_state = ProviderHealthState.DEGRADED
        else:
            new_state = ProviderHealthState.UNAVAILABLE

        self.state = new_state
        self.last_error_message = str(error)
        return new_state, str(error)


class GeminiProvider(BaseLLMProvider):
    """Google Gemini LLM provider implementation."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        enabled: Optional[bool] = None,
        timeout: Optional[float] = None,
        budget: Optional[int] = None,
    ):
        super().__init__(
            name="gemini",
            model=model or settings.gemini_model,
            enabled=enabled if enabled is not None else settings.gemini_enabled,
            timeout=timeout or settings.llm_timeout_seconds,
            budget=budget if budget is not None else settings.gemini_request_budget,
        )
        self.api_key = api_key

    def _get_api_key(self) -> str:
        if self.api_key is not None:
            return self.api_key.strip()
        val = os.getenv("GEMINI_API_KEY")
        if val and val.strip():
            return val.strip()
        if settings.gemini_api_key and settings.gemini_api_key.strip():
            return settings.gemini_api_key.strip()
        try:
            from dotenv import dotenv_values
            env_file = Path(__file__).resolve().parent.parent / ".env"
            if env_file.exists():
                v = dotenv_values(env_file).get("GEMINI_API_KEY")
                if v and v.strip():
                    return v.strip()
        except Exception:
            pass
        return ""

    def _has_credentials(self) -> bool:
        return bool(self._get_api_key())

    def health_check(self) -> Tuple[bool, ProviderHealthState, str]:
        if not self.enabled:
            return False, ProviderHealthState.DISABLED, "Gemini provider is disabled in settings."
        if not self._has_credentials():
            return False, ProviderHealthState.AUTH_FAILED, "Gemini API key is not configured."
        if self.request_count >= self.budget:
            return False, ProviderHealthState.QUOTA_EXCEEDED, "Gemini configured budget reached."
        return True, ProviderHealthState.AVAILABLE, "Gemini provider ready."

    def generate_explanation(self, evidence: Dict[str, Any]) -> NarrativeExplanation:
        if not self.is_available():
            raise RuntimeError(f"Gemini provider unavailable (status: {self.get_status().value})")

        prompt = _build_grounded_prompt(evidence)
        self.request_count += 1

        try:
            from google import genai
            from google.genai import types
            key = self._get_api_key()
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            raw_text = response.text
            parsed = json.loads(raw_text)
            return NarrativeExplanation.model_validate(parsed)
        except Exception as exc:
            self.handle_provider_error(exc)
            raise exc


class GroqProvider(BaseLLMProvider):
    """Groq Cloud LLM provider implementation."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        enabled: Optional[bool] = None,
        timeout: Optional[float] = None,
        budget: Optional[int] = None,
    ):
        super().__init__(
            name="groq",
            model=model or settings.groq_model,
            enabled=enabled if enabled is not None else settings.groq_enabled,
            timeout=timeout or settings.llm_timeout_seconds,
            budget=budget if budget is not None else settings.groq_request_budget,
        )
        self.api_key = api_key

    def _get_api_key(self) -> str:
        if self.api_key is not None:
            return self.api_key.strip()
        val = os.getenv("GROQ_API_KEY")
        if val and val.strip():
            return val.strip()
        if settings.groq_api_key and settings.groq_api_key.strip():
            return settings.groq_api_key.strip()
        try:
            from dotenv import dotenv_values
            env_file = Path(__file__).resolve().parent.parent / ".env"
            if env_file.exists():
                v = dotenv_values(env_file).get("GROQ_API_KEY")
                if v and v.strip():
                    return v.strip()
        except Exception:
            pass
        return ""

    def _has_credentials(self) -> bool:
        return bool(self._get_api_key())

    def health_check(self) -> Tuple[bool, ProviderHealthState, str]:
        if not self.enabled:
            return False, ProviderHealthState.DISABLED, "Groq provider is disabled in settings."
        if not self._has_credentials():
            return False, ProviderHealthState.AUTH_FAILED, "Groq API key is not configured."
        if self.request_count >= self.budget:
            return False, ProviderHealthState.QUOTA_EXCEEDED, "Groq configured budget reached."
        return True, ProviderHealthState.AVAILABLE, "Groq provider ready."

    def generate_explanation(self, evidence: Dict[str, Any]) -> NarrativeExplanation:
        if not self.is_available():
            raise RuntimeError(f"Groq provider unavailable (status: {self.get_status().value})")

        prompt = _build_grounded_prompt(evidence)
        self.request_count += 1

        try:
            from groq import Groq
            key = self._get_api_key()
            client = Groq(api_key=key, timeout=self.timeout)
            completion = client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a specialized Railway Operations Planning Assistant. Output valid JSON strictly matching the requested schema.",
                    },
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            raw_text = completion.choices[0].message.content
            parsed = json.loads(raw_text)
            return NarrativeExplanation.model_validate(parsed)
        except Exception as exc:
            self.handle_provider_error(exc)
            raise exc


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM provider implementation (e.g. GPT-4o, GPT-4o-mini)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        enabled: Optional[bool] = None,
        timeout: Optional[float] = None,
        budget: Optional[int] = None,
    ):
        super().__init__(
            name="openai",
            model=model or settings.openai_model,
            enabled=enabled if enabled is not None else settings.openai_enabled,
            timeout=timeout or settings.llm_timeout_seconds,
            budget=budget if budget is not None else settings.openai_request_budget,
        )
        self.api_key = api_key

    def _get_api_key(self) -> str:
        if self.api_key is not None:
            return self.api_key.strip()
        val = os.getenv("OPENAI_API_KEY")
        if val and val.strip():
            return val.strip()
        if settings.openai_api_key and settings.openai_api_key.strip():
            return settings.openai_api_key.strip()
        try:
            from dotenv import dotenv_values
            env_file = Path(__file__).resolve().parent.parent / ".env"
            if env_file.exists():
                v = dotenv_values(env_file).get("OPENAI_API_KEY")
                if v and v.strip():
                    return v.strip()
        except Exception:
            pass
        return ""

    def _has_credentials(self) -> bool:
        return bool(self._get_api_key())

    def health_check(self) -> Tuple[bool, ProviderHealthState, str]:
        if not self.enabled:
            return False, ProviderHealthState.DISABLED, "OpenAI provider is disabled in settings."
        if not self._has_credentials():
            return False, ProviderHealthState.AUTH_FAILED, "OpenAI API key is not configured."
        if self.request_count >= self.budget:
            return False, ProviderHealthState.QUOTA_EXCEEDED, "OpenAI configured budget reached."
        return True, ProviderHealthState.AVAILABLE, "OpenAI provider ready."

    def generate_explanation(self, evidence: Dict[str, Any]) -> NarrativeExplanation:
        if not self.is_available():
            raise RuntimeError(f"OpenAI provider unavailable (status: {self.get_status().value})")

        prompt = _build_grounded_prompt(evidence)
        self.request_count += 1
        key = self._get_api_key()

        try:
            # 1. Try official openai library if installed
            try:
                import openai
                client = openai.OpenAI(api_key=key, timeout=self.timeout)
                completion = client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a specialized Railway Operations Planning Assistant. Output valid JSON strictly matching the requested schema.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )
                raw_text = completion.choices[0].message.content
                parsed = json.loads(raw_text)
                return NarrativeExplanation.model_validate(parsed)
            except ImportError:
                # 2. Standard httpx client fallback
                import httpx
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": self.model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a specialized Railway Operations Planning Assistant. Output valid JSON strictly matching the requested schema.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                }
                with httpx.Client(timeout=self.timeout) as http_client:
                    resp = http_client.post(
                        "https://api.openai.com/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    raw_text = data["choices"][0]["message"]["content"]
                    parsed = json.loads(raw_text)
                    return NarrativeExplanation.model_validate(parsed)
        except Exception as exc:
            self.handle_provider_error(exc)
            raise exc


class DeterministicExplanationProvider:
    """
    Deterministic rule-based narrative synthesizer.
    Guarantees 100% reliable narrative explanations directly from Prompt 1 evidence
    without external API calls or token costs.
    """

    def generate_explanation(self, evidence: Dict[str, Any]) -> NarrativeExplanation:
        plan = evidence.get("selected_plan", {})
        score = evidence.get("score_breakdown", {})
        scheduled = evidence.get("scheduled_reasons", [])
        postponed = evidence.get("postponed_reasons", [])
        grouping = evidence.get("grouping_reasons", [])
        alternatives = evidence.get("alternative_reasons", [])
        constraints = evidence.get("constraint_results", [])
        warnings = evidence.get("warnings", [])

        overall_score = plan.get("overall_score", 0.0)
        strategy = plan.get("selected_strategy", "multi_strategy")
        sched_count = plan.get("scheduled_blocks_count", len(scheduled))
        post_count = plan.get("deferred_blocks_count", len(postponed))

        # 1. Executive Summary
        exec_summary = (
            f"Maintenance plan optimized using {strategy} strategy with composite quality score {overall_score:.1f}/100. "
            f"Successfully scheduled {sched_count} maintenance blocks while postponing {post_count} due to operational saturation. "
            f"{'All hard safety constraints satisfied.' if plan.get('is_feasible') else 'Hard constraint violations detected.'}"
        )

        # 2. Operational Context
        passed_train_checks = [c for c in constraints if c.get("canonical_type") == "TRAIN_CONFLICT" and c.get("passed")]
        op_context = (
            f"Corridor window utilization achieved {score.get('asset_availability', 0):.1f}%. "
            f"Timetable integrity preserved with {len(passed_train_checks)} verified train deconfliction checks. "
            f"Operational disruption index scored at {score.get('operational_impact', 0):.1f} points."
        )

        # 3. Key Trade-offs
        tradeoffs = []
        if grouping:
            tradeoffs.append(f"Joint multi-departmental execution utilized for {len(grouping)} tasks to compress track possession windows.")
        if alternatives:
            tradeoffs.append(f"{len(alternatives)} tasks time-shifted from initial requested times to bypass express train corridors.")
        if postponed:
            tradeoffs.append(f"{len(postponed)} low/medium priority tasks deferred to protect passenger timetable headway.")
        if not tradeoffs:
            tradeoffs.append("Balanced high-priority defect remediation against passenger timetable availability.")

        # 4. Risk Mitigation
        risk_mitigation = (
            f"Critical risk coverage scored at {score.get('risk_coverage', 0):.1f}%. "
            f"High-priority infrastructure wear and overdue items prioritized in low-disruption night shadow intervals."
        )

        # 5. Recommendations
        recommendations = [
            "Confirm possession permits with Divisional Railway Operating Center before commencement.",
            "Coordinate Traction Distribution isolation co-terminus with Engineering tamping operations.",
        ]
        if postponed:
            recommendations.append(f"Reschedule {len(postponed)} deferred maintenance tasks in the subsequent planning window.")
        if warnings:
            recommendations.extend(warnings[:2])

        return NarrativeExplanation(
            executive_summary=exec_summary,
            operational_context=op_context,
            key_tradeoffs=tradeoffs,
            risk_mitigation=risk_mitigation,
            recommendations=recommendations,
        )


class DynamicProviderOrchestrator:
    """
    Intelligent LLM provider orchestrator with health probes, budget tracking,
    lightweight state cooldowns, and automatic deterministic failover.
    Supports Gemini, Groq, and OpenAI dynamically.
    """

    def __init__(
        self,
        gemini_provider: Optional[GeminiProvider] = None,
        groq_provider: Optional[GroqProvider] = None,
        openai_provider: Optional[OpenAIProvider] = None,
        deterministic_provider: Optional[DeterministicExplanationProvider] = None,
    ):
        self.gemini = gemini_provider or GeminiProvider()
        self.groq = groq_provider or GroqProvider()
        self.openai = openai_provider or OpenAIProvider()
        self.deterministic = deterministic_provider or DeterministicExplanationProvider()

    def get_providers_status(self) -> Dict[str, Any]:
        """Returns health and availability telemetry without exposing API keys."""
        return {
            "preferred_provider": settings.llm_preferred_provider,
            "fallback_enabled": settings.llm_fallback_enabled,
            "gemini": {
                "name": "gemini",
                "model": self.gemini.model,
                "enabled": self.gemini.enabled,
                "status": self.gemini.get_status().value,
                "is_available": self.gemini.is_available(),
                "request_count": self.gemini.request_count,
                "budget": self.gemini.budget,
                "last_error": self.gemini.last_error_message,
            },
            "groq": {
                "name": "groq",
                "model": self.groq.model,
                "enabled": self.groq.enabled,
                "status": self.groq.get_status().value,
                "is_available": self.groq.is_available(),
                "request_count": self.groq.request_count,
                "budget": self.groq.budget,
                "last_error": self.groq.last_error_message,
            },
            "openai": {
                "name": "openai",
                "model": self.openai.model,
                "enabled": self.openai.enabled,
                "status": self.openai.get_status().value,
                "is_available": self.openai.is_available(),
                "request_count": self.openai.request_count,
                "budget": self.openai.budget,
                "last_error": self.openai.last_error_message,
            },
            "deterministic": {
                "name": "deterministic",
                "status": "AVAILABLE",
                "is_available": True,
            },
        }

    def generate_narrative_explanation(
        self,
        evidence: Dict[str, Any],
    ) -> Tuple[NarrativeExplanation, ProviderMetadata]:
        """
        Executes provider selection with priority:
        Preferred Available Provider -> Fallback Providers (in order) -> Deterministic Engine
        """
        start_time = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        all_providers: Dict[str, BaseLLMProvider] = {
            "gemini": self.gemini,
            "groq": self.groq,
            "openai": self.openai,
        }

        pref_key = (settings.llm_preferred_provider or "gemini").lower()
        preferred = all_providers.get(pref_key, self.gemini)

        # Candidates in order: preferred first, then remaining enabled providers
        candidates: List[BaseLLMProvider] = [preferred]
        if settings.llm_fallback_enabled:
            for k, p in all_providers.items():
                if p != preferred:
                    candidates.append(p)

        fallback_used = False
        failure_reasons = []

        for idx, provider in enumerate(candidates):
            if provider.is_available():
                try:
                    narrative = self._call_with_retry(provider, evidence)
                    latency = round((time.time() - start_time) * 1000, 2)
                    is_fb = (idx > 0)
                    fb_reason = "; ".join(failure_reasons) if is_fb else None
                    return narrative, ProviderMetadata(
                        provider=provider.name,
                        provider_status=provider.get_status(),
                        fallback_used=is_fb,
                        fallback_reason=fb_reason,
                        model=provider.model,
                        request_timestamp=now_iso,
                        latency_ms=latency,
                    )
                except Exception as err:
                    fallback_used = True
                    failure_reasons.append(f"{provider.name} failed ({str(err)})")
            elif provider.enabled:
                fallback_used = True
                failure_reasons.append(f"{provider.name} not eligible (status: {provider.get_status().value})")

        # Deterministic Grounded Narrative Fallback
        narrative = self.deterministic.generate_explanation(evidence)
        latency = round((time.time() - start_time) * 1000, 2)
        fb_reason = "; ".join(failure_reasons) if failure_reasons else "All external LLM providers unavailable or unconfigured"
        return narrative, ProviderMetadata(
            provider="deterministic",
            provider_status=ProviderHealthState.AVAILABLE,
            fallback_used=True,
            fallback_reason=fb_reason,
            model="deterministic-rule-engine",
            request_timestamp=now_iso,
            latency_ms=latency,
        )

    def _call_with_retry(self, provider: BaseLLMProvider, evidence: Dict[str, Any]) -> NarrativeExplanation:
        """Invokes provider with configured retry limit."""
        attempts = 1 + max(0, settings.llm_retry_limit)
        last_exc = None
        for attempt in range(attempts):
            try:
                return provider.generate_explanation(evidence)
            except Exception as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    time.sleep(0.5)
        raise last_exc or RuntimeError(f"Failed to generate explanation with {provider.name}")


def _build_grounded_prompt(evidence: Dict[str, Any]) -> str:
    """Formats structured Prompt 1 evidence into a strict prompt."""
    evidence_json = json.dumps(evidence, indent=2, default=str)
    return (
        "You are an AI explainability engine for a mission-critical railway block maintenance system.\n"
        "Generate a structured narrative explanation strictly grounded in the operational evidence provided below.\n\n"
        "CRITICAL CONSTRAINTS:\n"
        "1. Ground all statements ONLY in the provided evidence. Do NOT invent railway facts, trains, or metrics.\n"
        "2. Do NOT suggest changing the plan, altering scores, or bypassing constraints.\n"
        "3. Output MUST be a valid JSON object matching the schema:\n"
        "{\n"
        '  "executive_summary": "High-level summary of scheduled tasks and operational score",\n'
        '  "operational_context": "Corridor window and train timetable impact analysis",\n'
        '  "key_tradeoffs": ["List of trade-offs made during optimization"],\n'
        '  "risk_mitigation": "How critical infrastructure risks were addressed",\n'
        '  "recommendations": ["Actionable operational execution guidance"]\n'
        "}\n\n"
        f"OPERATIONAL EVIDENCE:\n{evidence_json}"
    )
