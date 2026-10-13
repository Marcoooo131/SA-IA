FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN useradd --create-home --uid 10001 app
COPY pyproject.toml ./
COPY phonecall_agent ./phonecall_agent
COPY config ./config
RUN pip install . && mkdir -p /app/var/audio && chown -R app:app /app/var

USER app
EXPOSE 8000
# Default: web process. Override the command for the worker and the maintenance loop.
CMD ["python", "-m", "phonecall_agent.cli", "serve", "--host", "0.0.0.0", "--port", "8000"]
