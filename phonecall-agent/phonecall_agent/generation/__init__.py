from ..config import Settings
from .base import GenerationResult, ReportGenerator
from .prompt import PROMPT_VERSION, GenerationContext


def build_generator(settings: Settings) -> ReportGenerator:
    if settings.generation_provider == "simulated":
        from .simulated import SimulatedReportGenerator

        return SimulatedReportGenerator()
    if settings.generation_provider == "anthropic":
        from .anthropic_generator import AnthropicReportGenerator

        return AnthropicReportGenerator(settings)
    raise ValueError(f"unknown generation provider {settings.generation_provider!r}")


__all__ = ["PROMPT_VERSION", "GenerationContext", "GenerationResult", "ReportGenerator", "build_generator"]
