"""Centralised error handling: every error the user can see has a code and a French message."""

from __future__ import annotations

from enum import Enum


class ErrorCode(str, Enum):
    UNSUPPORTED_PLATFORM = "unsupported_platform"
    NO_DEVICE = "no_device"
    DEVICE_UNAVAILABLE = "device_unavailable"
    NO_SOURCE = "no_source"
    MIC_ACCESS_DENIED = "mic_access_denied"
    CAPTURE_INTERRUPTED = "capture_interrupted"
    CONSENT_REQUIRED = "consent_required"
    INVALID_STATE = "invalid_state"
    RECOGNIZER_UNAVAILABLE = "recognizer_unavailable"
    TRANSCRIPTION_TIMEOUT = "transcription_timeout"
    EMPTY_TRANSCRIPT = "empty_transcript"
    NOTE_NETWORK = "note_network"
    NOTE_AUTH = "note_auth"
    NOTE_REJECTED = "note_rejected"
    NOTE_SERVER = "note_server"
    NOTE_TIMEOUT = "note_timeout"
    AI_KEY_MISSING = "ai_key_missing"
    AI_KEY_INVALID = "ai_key_invalid"
    AI_KEY_FORMAT = "ai_key_format"
    CONFIG = "config"
    INTERNAL = "internal"


USER_MESSAGES = {
    ErrorCode.UNSUPPORTED_PLATFORM: "La capture du son de l'ordinateur n'est disponible que sous Windows.",
    ErrorCode.NO_DEVICE: "Aucun périphérique audio détecté.",
    ErrorCode.DEVICE_UNAVAILABLE: "Le périphérique audio sélectionné est indisponible.",
    ErrorCode.NO_SOURCE: "Aucune source audio n'a pu être ouverte. Vérifiez le casque et les périphériques sélectionnés.",
    ErrorCode.MIC_ACCESS_DENIED: "Windows bloque l'accès au micro (Paramètres › Confidentialité › Microphone).",
    ErrorCode.CAPTURE_INTERRUPTED: "La capture a été interrompue.",
    ErrorCode.CONSENT_REQUIRED: "Confirmez l'information de l'interlocuteur avant de démarrer.",
    ErrorCode.INVALID_STATE: "Action impossible dans l'état actuel.",
    ErrorCode.RECOGNIZER_UNAVAILABLE: "Le moteur de transcription n'a pas pu être chargé.",
    ErrorCode.TRANSCRIPTION_TIMEOUT: "La fin de la transcription a pris trop de temps ; la transcription est peut-être incomplète.",
    ErrorCode.EMPTY_TRANSCRIPT: "Aucune parole n'a été reconnue : pas de note générée.",
    ErrorCode.NOTE_NETWORK: "Service de génération injoignable (réseau). La transcription est conservée : réessayez.",
    ErrorCode.NOTE_AUTH: "Accès au service de génération refusé (jeton absent, expiré ou révoqué).",
    ErrorCode.NOTE_REJECTED: "Le service de génération a refusé la demande.",
    ErrorCode.NOTE_SERVER: "Le service de génération a rencontré une erreur. Réessayez.",
    ErrorCode.NOTE_TIMEOUT: "Le service de génération n'a pas répondu à temps. Réessayez.",
    ErrorCode.AI_KEY_MISSING: "Aucune clé API Claude enregistrée : cliquez sur « Clé API » pour la saisir, puis relancez la génération.",
    ErrorCode.AI_KEY_INVALID: "Clé API Claude refusée (invalide, révoquée ou sans accès au modèle) : vérifiez-la dans « Clé API ».",
    ErrorCode.AI_KEY_FORMAT: "Ce texte n'est pas une clé API Claude : une clé commence par « sk-ant- » (console.anthropic.com › API Keys).",
    ErrorCode.CONFIG: "Configuration invalide.",
    ErrorCode.INTERNAL: "Erreur interne.",
}


class AppError(Exception):
    def __init__(self, code: ErrorCode, detail: str = "", retryable: bool = False):
        super().__init__(detail or USER_MESSAGES[code])
        self.code = code
        self.detail = detail
        self.retryable = retryable

    @property
    def user_message(self) -> str:
        return USER_MESSAGES[self.code] + (f" ({self.detail})" if self.detail and self.detail not in USER_MESSAGES[self.code] else "")

    def to_dict(self) -> dict:
        return {"code": self.code.value, "message": self.user_message, "retryable": self.retryable}
