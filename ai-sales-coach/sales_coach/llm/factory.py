"""Fournisseurs de modèles IA interchangeables.

- ``none``               : aucun modèle ; moteur « règles » seul (toujours disponible, hors ligne).
- ``ollama``             : modèle local via Ollama (http://localhost:11434) — aucune donnée ne sort.
- ``openai_compatible``  : toute API compatible OpenAI (/v1/chat/completions) : LM Studio, vLLM,
                           llama.cpp server (locaux), ou un service commercial (externe).
- ``anthropic``          : API Claude (externe).

Garde-fou : un fournisseur EXTERNE n'est utilisable que si ``ASC_ALLOW_EXTERNAL_API=true``.
Sinon, ``get_llm`` lève ``ExternalApiBlocked`` — aucun appel réseau n'est tenté.
Les clés API viennent uniquement de l'environnement (jamais du code).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import requests

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}


class LLMError(RuntimeError):
    pass


class ExternalApiBlocked(LLMError):
    pass


def provider_is_external(provider: str, base_url: str = "") -> bool:
    provider = (provider or "none").lower()
    if provider == "none":
        return False
    if provider == "anthropic":
        return True
    if provider == "ollama":
        host = urlparse(base_url or "http://localhost:11434").hostname or "localhost"
        return host not in LOCAL_HOSTS
    if provider == "openai_compatible":
        host = urlparse(base_url or "https://api.openai.com").hostname or ""
        return host not in LOCAL_HOSTS
    return True


@dataclass
class Message:
    role: str  # system | user | assistant
    content: str


class LLM:
    name = "none"
    model = ""
    external = False

    def chat(self, messages: list[Message], temperature: float = 0.3, max_tokens: int = 2000, json_mode: bool = False) -> str:
        raise NotImplementedError

    def chat_json(self, messages: list[Message], temperature: float = 0.1, max_tokens: int = 4000) -> dict:
        raw = self.chat(messages, temperature=temperature, max_tokens=max_tokens, json_mode=True)
        return parse_json(raw)

    @property
    def label(self) -> str:
        where = "externe" if self.external else "local"
        return f"{self.name}:{self.model} ({where})"


def parse_json(raw: str) -> dict:
    raw = raw.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if fence:
        raw = fence.group(1)
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise LLMError("Réponse du modèle sans JSON exploitable.")
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(f"JSON invalide renvoyé par le modèle : {exc}") from exc


class OllamaLLM(LLM):
    name = "ollama"

    def __init__(self, model: str, base_url: str = "", timeout: int = 120):
        self.model = model or "llama3.1:8b"
        self.base_url = (base_url or "http://localhost:11434").rstrip("/")
        self.timeout = timeout
        self.external = provider_is_external("ollama", self.base_url)

    def chat(self, messages, temperature=0.3, max_tokens=2000, json_mode=False):
        payload = {
            "model": self.model,
            "messages": [m.__dict__ for m in messages],
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if json_mode:
            payload["format"] = "json"
        try:
            r = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=self.timeout)
            r.raise_for_status()
        except requests.RequestException as exc:
            raise LLMError(f"Ollama injoignable sur {self.base_url} : {exc}") from exc
        return r.json()["message"]["content"]


class OpenAICompatibleLLM(LLM):
    name = "openai_compatible"

    def __init__(self, model: str, base_url: str = "", api_key: str = "", timeout: int = 120):
        self.model = model or "gpt-4o-mini"
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.external = provider_is_external("openai_compatible", self.base_url)

    def chat(self, messages, temperature=0.3, max_tokens=2000, json_mode=False):
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        payload = {"model": self.model, "messages": [m.__dict__ for m in messages], "temperature": temperature, "max_tokens": max_tokens}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            r = requests.post(f"{self.base_url}/chat/completions", json=payload, headers=headers, timeout=self.timeout)
            r.raise_for_status()
        except requests.RequestException as exc:
            raise LLMError(f"API {self.base_url} : {exc}") from exc
        return r.json()["choices"][0]["message"]["content"]


class AnthropicLLM(LLM):
    name = "anthropic"
    external = True

    def __init__(self, model: str, api_key: str, base_url: str = "", timeout: int = 120):
        if not api_key:
            raise LLMError("ASC_LLM_API_KEY manquant pour le fournisseur anthropic.")
        self.model = model or "claude-sonnet-5-5"
        self.api_key = api_key
        self.base_url = (base_url or "https://api.anthropic.com").rstrip("/")
        self.timeout = timeout

    def chat(self, messages, temperature=0.3, max_tokens=2000, json_mode=False):
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        convo = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]
        if json_mode:
            system += "\n\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour."
        payload = {"model": self.model, "max_tokens": max_tokens, "temperature": temperature, "messages": convo}
        if system:
            payload["system"] = system
        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
        try:
            r = requests.post(f"{self.base_url}/v1/messages", json=payload, headers=headers, timeout=self.timeout)
            r.raise_for_status()
        except requests.RequestException as exc:
            raise LLMError(f"API Anthropic : {exc}") from exc
        return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")


def get_llm(settings=None) -> LLM | None:
    """Retourne le modèle configuré, ou None en mode « règles seules »."""
    if settings is None:
        from sales_coach.config import get_settings

        settings = get_settings()
    provider = settings.llm_provider
    if provider in {"", "none", "off"}:
        return None
    if provider_is_external(provider, settings.llm_base_url) and not settings.allow_external_api:
        raise ExternalApiBlocked(
            f"Le fournisseur « {provider} » enverrait des données hors de cette machine. "
            "Activez explicitement ASC_ALLOW_EXTERNAL_API=true (après accord de conformité) ou utilisez Ollama en local."
        )
    if provider == "ollama":
        return OllamaLLM(settings.llm_model, settings.llm_base_url, settings.llm_timeout)
    if provider == "openai_compatible":
        return OpenAICompatibleLLM(settings.llm_model, settings.llm_base_url, settings.llm_api_key, settings.llm_timeout)
    if provider == "anthropic":
        return AnthropicLLM(settings.llm_model, settings.llm_api_key, settings.llm_base_url, settings.llm_timeout)
    raise LLMError(f"Fournisseur IA inconnu : {provider}")


MODE_LIMITATIONS = {
    "none": "Moteur « règles » : hors ligne, instantané, aucune donnée transmise. Détection par motifs explicites : "
            "fiable sur les formulations courantes, aveugle aux nuances (ironie, sous-entendus, formulations inhabituelles). "
            "Entraînement : client simulé par scénarios.",
    "ollama": "Modèle local via Ollama : aucune donnée ne sort de la machine. Matériel : ~8 Go de RAM pour un modèle 7-8B "
              "quantifié (CPU : 10 à 60 s par analyse) ; GPU 8 Go+ recommandé. Qualité inférieure aux grands modèles commerciaux, "
              "surtout en français nuancé. Les constats sont vérifiés contre la transcription.",
    "openai_compatible": "API compatible OpenAI : locale (LM Studio, vLLM, llama.cpp) ou externe. En mode externe, les transcriptions "
                         "sont envoyées au fournisseur : nécessite ASC_ALLOW_EXTERNAL_API=true et un accord de conformité.",
    "anthropic": "API Claude (externe) : meilleure compréhension du français et des nuances, coût par appel, transcriptions envoyées "
                 "au fournisseur : nécessite ASC_ALLOW_EXTERNAL_API=true et un accord de conformité. Anonymisation recommandée.",
}
