class PipelineError(Exception):
    """Base class. ``code`` is stored in ProcessingError; ``retryable`` drives job retries."""

    code = "pipeline_error"
    retryable = False

    def __init__(self, message: str = "", *, code: str | None = None):
        super().__init__(message or self.code)
        if code:
            self.code = code


class TransientError(PipelineError):
    code = "transient"
    retryable = True


class PermanentError(PipelineError):
    code = "permanent"
    retryable = False


class RecordingNotReady(TransientError):
    code = "recording_not_ready"


class RecordingUnavailable(PermanentError):
    code = "recording_unavailable"


class InvalidAudio(PermanentError):
    code = "invalid_audio"


class TranscriptionFailed(TransientError):
    code = "transcription_failed"


class GenerationFailed(TransientError):
    code = "generation_failed"


class InvalidAIResponse(TransientError):
    """The model answered but the content does not match the schema. Retried a limited number of times."""

    code = "invalid_ai_response"


class CRMUnavailable(TransientError):
    code = "crm_unavailable"


class CRMWriteUnverified(TransientError):
    code = "crm_write_unverified"
