from ..config import Settings
from .base import GenerationResult, ReportGenerator
from .prompt import GenerationContext, prompt_version


def build_generator(settings: Settings) -> ReportGenerator:
    if settings.generation_provider == "simulated":
        from .simulated import SimulatedReportGenerator

        return SimulatedReportGenerator()
    if settings.generation_provider == "anthropic":
        from .anthropic_generator import AnthropicReportGenerator

        return AnthropicReportGenerator(settings)
    raise ValueError(f"unknown generation provider {settings.generation_provider!r}")


__all__ = ["prompt_version", "GenerationContext", "GenerationResult", "ReportGenerator", "build_generator"]
