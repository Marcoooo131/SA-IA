"""Direct mode: the app calls the Claude API itself, with a key entered in the app.

- The key lives in the Windows Credential Manager (``secrets_store``); it is never written to a
  file, never logged and never sent back to the interface.
- Same versioned prompt, structured output and anti-invention checks as the company gateway
  (``phonecall_agent.note_service``): only the place where the call is made changes.
- Only the final transcript text leaves the PC (to Anthropic), when the note is generated.
  The audio never leaves the PC.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from ..config import Settings, install_dir
from ..errors import AppError, ErrorCode
from ..transcript.assembler import Segment
from .client import NoteClient, NoteResult, note_from_payload

log = logging.getLogger(__name__)

KEY_PREFIX = "sk-ant-"


def validate_key_format(key: str) -> str:
    key = (key or "").strip()
    if not key.startswith(KEY_PREFIX) or not 20 <= len(key) <= 256 or any(c.isspace() for c in key):
        raise AppError(ErrorCode.AI_KEY_FORMAT)
    return key


def business_config_path(settings: Settings) -> Path | None:
    """Explicit setting, then ``business.yaml`` next to the .exe, then the example of the sources."""
    candidates: list[Path] = []
    if settings.business_config:
        candidates.append(settings.business_config)
    if (d := install_dir()) is not None:
        candidates.append(d / "business.yaml")
    try:
        import phonecall_agent

        candidates.append(Path(phonecall_agent.__file__).resolve().parent.parent / "config" / "business.example.yaml")
    except ImportError:
        pass
    return next((p for p in candidates if p.is_file()), None)


class DirectAINoteClient(NoteClient):
    name = "anthropic"

    def __init__(self, settings: Settings, key_provider: Callable[[], str | None],
                 client_factory: Callable[[str], object] | None = None):
        self.settings = settings
        self.key_provider = key_provider
        self.client_factory = client_factory or self._default_client
        self._business = None
        self._cached: tuple[str, object] | None = None  # (key, generator)

    # ------------------------------------------------------------------ helpers

    def _default_client(self, key: str):
        import anthropic

        return anthropic.Anthropic(api_key=key, timeout=self.settings.anthropic_timeout_s, max_retries=2)

    def _load_business(self):
        if self._business is None:
            from phonecall_agent.config import BusinessConfig, load_business_config

            path = business_config_path(self.settings)
            self._business = load_business_config(path) if path else BusinessConfig()
            log.info("business config: %s", path or "defaults")
        return self._business

    def _generator(self, key: str):
        if self._cached is None or self._cached[0] != key:
            from phonecall_agent.config import Settings as AgentSettings
            from phonecall_agent.generation.anthropic_generator import AnthropicReportGenerator

            agent_settings = AgentSettings(
                _env_file=None, generation_provider="anthropic", anthropic_api_key=key,
                anthropic_model=self.settings.anthropic_model, anthropic_effort=self.settings.anthropic_effort,
                anthropic_server_fallback=True,
            )
            self._cached = (key, AnthropicReportGenerator(agent_settings, client=self.client_factory(key)))
        return self._cached[1]

    # ------------------------------------------------------------------ API

    def generate(self, segments: list[Segment], duration_s: int, request_id: str) -> NoteResult:
        key = self.key_provider()
        if not key:
            raise AppError(ErrorCode.AI_KEY_MISSING, retryable=True)  # retry once the key is saved
        try:
            from phonecall_agent.errors import InvalidAIResponse, PermanentError, PipelineError
            from phonecall_agent.note_service import NoteSegment, generate_note
        except ImportError as exc:
            raise AppError(ErrorCode.CONFIG, "module de génération absent (phonecall_agent)") from exc

        try:
            payload = generate_note(
                self._generator(key), self._load_business(),
                [NoteSegment(text=s.text, start=s.t_start, end=s.t_end, speaker=s.speaker, uncertain=s.uncertain)
                 for s in segments],
                speaker_labels=True, duration_s=duration_s, ai_max_attempts=2,
            )
        except InvalidAIResponse as exc:
            raise AppError(ErrorCode.NOTE_SERVER, "réponse de l'IA non conforme", retryable=True) from exc
        except PermanentError as exc:
            if exc.code in ("ai_auth", "ai_permission"):
                raise AppError(ErrorCode.AI_KEY_INVALID, retryable=True) from exc
            raise AppError(ErrorCode.NOTE_REJECTED, exc.code) from exc
        except PipelineError as exc:
            if exc.code == "ai_connection":
                raise AppError(ErrorCode.NOTE_NETWORK, retryable=True) from exc
            raise AppError(ErrorCode.NOTE_SERVER, exc.code, retryable=True) from exc
        return note_from_payload(payload)

    def describe(self) -> dict:
        """Self-test: the prompt, the business configuration and the SDK are present (no network)."""
        import anthropic
        from phonecall_agent.generation.prompt import build_system_prompt, prompt_version
        from phonecall_agent.generation.schema import report_json_schema

        business = self._load_business()
        return {
            "model": self.settings.anthropic_model, "sdk": anthropic.__version__,
            "prompt_version": prompt_version(business), "prompt_chars": len(build_system_prompt(business)),
            "schema_fields": len(report_json_schema()["properties"]),
            "business": str(business_config_path(self.settings) or "defaults"), "categories": len(business.categories),
            "key": "configured" if self.key_provider() else "absent",
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
