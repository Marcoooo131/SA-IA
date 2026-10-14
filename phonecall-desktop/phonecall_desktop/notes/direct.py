"""Direct mode: the app calls the Claude API itself, with a key entered in the app.

- The key lives in the Windows Credential Manager (``secrets_store``); it is never written to a
  file, never logged and never sent back to the interface.
- Claude fills the general Phone Call template (``notes/template``) from the whole transcript;
  data of the PC override the model and the automatic check runs before display.
- Only the final transcript text leaves the PC (to Anthropic), when the note is generated.
  The audio never leaves the PC.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from ..config import Settings
from ..errors import AppError, ErrorCode
from ..transcript.assembler import Segment
from .client import NoteClient, NoteResult

log = logging.getLogger(__name__)

KEY_PREFIX = "sk-ant-"


def validate_key_format(key: str) -> str:
    key = (key or "").strip()
    if not key.startswith(KEY_PREFIX) or not 20 <= len(key) <= 256 or any(c.isspace() for c in key):
        raise AppError(ErrorCode.AI_KEY_FORMAT)
    return key


# USD per million tokens (input, output). Check current pricing before relying on cost metrics.
PRICING = {"claude-opus-5-5": (4.00, 20.00), "claude-sonnet-5-5": (2.00, 10.00), "claude-haiku-5-5": (0.10, 0.50)}
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    price_in, price_out = PRICING.get(model, (0.0, 0.0))
    return round(input_tokens / 1e6 * price_in + output_tokens / 1e6 * price_out, 6)


class DirectAINoteClient(NoteClient):
    """Fills the general Phone Call template with Claude (key from the Windows vault)."""

    name = "anthropic"

    def __init__(self, settings: Settings, key_provider: Callable[[], str | None],
                 client_factory: Callable[[str], object] | None = None, template=None, categories=None):
        from .business import load_categories
        from .template import load_template, template_path

        self.settings = settings
        self.key_provider = key_provider
        self.client_factory = client_factory or self._default_client
        self.template = template or load_template(template_path(settings))
        self.categories = categories if categories is not None else load_categories(settings)
        self._cached: tuple[str, object] | None = None  # (key, client)

    def _default_client(self, key: str):
        import anthropic

        return anthropic.Anthropic(api_key=key, timeout=self.settings.anthropic_timeout_s, max_retries=2)

    def _client(self, key: str):
        if self._cached is None or self._cached[0] != key:
            self._cached = (key, self.client_factory(key))
        return self._cached[1]

    # ------------------------------------------------------------------ API

    def generate(self, segments: list[Segment], duration_s: int, request_id: str, meta: dict | None = None) -> NoteResult:
        import anthropic

        from .local_summary import MIN_WORDS, NO_CONTENT_TEXT, metadata_text, transcript_text
        from .template import CallContext, check, points_to_verify, render
        from .template.ai import output_schema, parse, system_prompt, user_message

        key = self.key_provider()
        if not key:
            raise AppError(ErrorCode.AI_KEY_MISSING, retryable=True)  # retry once the key is saved
        meta = meta or {}
        ctx = CallContext(direction=meta.get("direction"), variant=meta.get("variant"), started_at=meta.get("started_at"),
                          duration_s=duration_s, agent_name=self.settings.agent_name)
        if sum(len(s.text.split()) for s in segments) < MIN_WORDS:
            return NoteResult(text=NO_CONTENT_TEXT, no_usable_content=True, prompt_version=self.template.version)

        kwargs = dict(
            model=self.settings.anthropic_model, max_tokens=16000,
            system=system_prompt(self.template),
            messages=[{"role": "user", "content": user_message(self.template, segments, ctx)}],
            output_config={"effort": self.settings.anthropic_effort,
                           "format": {"type": "json_schema", "schema": output_schema(self.template)}},
        )
        client = self._client(key)
        last_error: AppError | None = None
        for _attempt in range(2):  # a second try only when the output cannot be read
            try:
                response = client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
            except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
                raise AppError(ErrorCode.AI_KEY_INVALID, retryable=True) from exc
            except anthropic.BadRequestError as exc:
                raise AppError(ErrorCode.NOTE_REJECTED, "requête refusée") from exc
            except anthropic.APIConnectionError as exc:
                raise AppError(ErrorCode.NOTE_NETWORK, retryable=True) from exc
            except anthropic.RateLimitError as exc:
                raise AppError(ErrorCode.NOTE_SERVER, "quota atteint", retryable=True) from exc
            except anthropic.APIStatusError as exc:
                raise AppError(ErrorCode.NOTE_SERVER, f"HTTP {exc.status_code}", retryable=True) from exc
            if response.stop_reason == "refusal":
                raise AppError(ErrorCode.NOTE_REJECTED, "le modèle a décliné la demande")
            if response.stop_reason == "max_tokens":
                last_error = AppError(ErrorCode.NOTE_SERVER, "réponse tronquée", retryable=True)
                continue
            raw = next((b.text for b in response.content if b.type == "text"), "")
            try:
                note, flags = parse(self.template, raw, ctx, len(segments))
            except (ValueError, TypeError, AttributeError):
                last_error = AppError(ErrorCode.NOTE_SERVER, "réponse de l'IA non conforme", retryable=True)
                continue
            flags += check(note, transcript_text(segments), metadata_text(ctx))
            model = getattr(response, "model", None) or self.settings.anthropic_model
            usage = response.usage
            return NoteResult(text=render(note), category=note.variant, flags=flags,
                              points_to_verify=points_to_verify(note), prompt_version=self.template.version,
                              model=model, cost_usd=estimate_cost(model, usage.input_tokens, usage.output_tokens))
        assert last_error is not None
        raise last_error

    def describe(self) -> dict:
        """Self-test: SDK, template, prompt and schema available (no network, no API call)."""
        import anthropic

        from .template.ai import output_schema, system_prompt

        return {
            "model": self.settings.anthropic_model, "sdk": anthropic.__version__, "template": self.template.version,
            "fields": len(self.template.all_fields()), "prompt_chars": len(system_prompt(self.template)),
            "schema_fields": len(output_schema(self.template)["properties"]["fields"]["properties"]),
            "categories": len(self.categories), "key": "configured" if self.key_provider() else "absent",
        }

    def check_key(self, key: str) -> None:
        """Checks the key against the API without generating anything (no token cost)."""
        import anthropic

        try:
            self.client_factory(key).models.retrieve(self.settings.anthropic_model)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.NotFoundError) as exc:
            raise AppError(ErrorCode.AI_KEY_INVALID) from exc
        except anthropic.APIConnectionError as exc:
            raise AppError(ErrorCode.NOTE_NETWORK, retryable=True) from exc
        except anthropic.APIStatusError as exc:
            raise AppError(ErrorCode.NOTE_SERVER, f"HTTP {exc.status_code}", retryable=True) from exc
