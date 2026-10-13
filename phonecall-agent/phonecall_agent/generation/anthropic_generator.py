"""Report generation with the Claude API (official ``anthropic`` SDK).

Data protection: the transcript is sent to Anthropic. This must be approved by the DPO
(sub-processor, DPA, region / retention options) before processing any real call.
"""

from __future__ import annotations

import logging

import anthropic

from ..config import Settings
from ..errors import GenerationFailed, PermanentError
from ..transcription.base import TranscriptResult
from .base import GenerationResult, ReportGenerator, parse_structured, render_text
from .prompt import GenerationContext, build_system_prompt, build_user_message
from .schema import report_json_schema

log = logging.getLogger(__name__)

# USD per million tokens (input, output). Check current pricing before relying on cost metrics.
PRICING = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}

FALLBACK_BETA = "server-side-fallback-2026-07-01"


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICING.get(model, (0.0, 0.0))
    return round(input_tokens / 1e6 * price_in + output_tokens / 1e6 * price_out, 6)


class AnthropicReportGenerator(ReportGenerator):
    name = "anthropic"

    def __init__(self, settings: Settings, client: anthropic.Anthropic | None = None):
        self.settings = settings
        self.model = settings.anthropic_model
        self.client = client or anthropic.Anthropic(
            api_key=settings.anthropic_api_key.get_secret_value() or None,
            timeout=120.0,
            max_retries=2,  # SDK retries 408/409/429/5xx and connection errors
        )

    def generate(self, transcript: TranscriptResult, ctx: GenerationContext) -> GenerationResult:
        kwargs = dict(
            model=self.model,
            max_tokens=16000,
            system=build_system_prompt(ctx.business),
            messages=[{"role": "user", "content": build_user_message(transcript, ctx)}],
            output_config={
                "effort": self.settings.anthropic_effort,
                "format": {"type": "json_schema", "schema": report_json_schema()},
            },
        )
        try:
            if self.settings.anthropic_server_fallback:
                response = self.client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
            else:
                response = self.client.messages.create(**kwargs)
        except anthropic.AuthenticationError as exc:
            raise PermanentError("Anthropic authentication failed", code="ai_auth") from exc
        except anthropic.PermissionDeniedError as exc:
            raise PermanentError("Anthropic permission denied", code="ai_permission") from exc
        except anthropic.BadRequestError as exc:
            raise PermanentError("Anthropic rejected the request", code="ai_bad_request") from exc
        except anthropic.RateLimitError as exc:
            raise GenerationFailed("rate limited", code="ai_rate_limited") from exc
        except anthropic.APIStatusError as exc:
            raise GenerationFailed(f"HTTP {exc.status_code}", code="ai_http") from exc
        except anthropic.APIConnectionError as exc:
            raise GenerationFailed("connection error", code="ai_connection") from exc

        if response.stop_reason == "refusal":
            raise PermanentError("model declined the request", code="ai_refusal")
        if response.stop_reason == "max_tokens":
            raise GenerationFailed("output truncated", code="ai_truncated")

        text = next((b.text for b in response.content if b.type == "text"), "")
        structured = parse_structured(text)
        usage = response.usage
        served_model = getattr(response, "model", self.model) or self.model
        return GenerationResult(
            structured=structured,
            text=render_text(structured, ctx.business.report.template),
            generator=self.name,
            model=served_model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=estimate_cost(served_model, usage.input_tokens, usage.output_tokens),
        )
