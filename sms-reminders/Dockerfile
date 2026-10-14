FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN useradd --create-home --uid 10001 app
COPY pyproject.toml ./
COPY sms_reminders ./sms_reminders
RUN pip install .

USER app
EXPOSE 8000
# Default: web process. The "worker" service overrides the command.
CMD ["python", "-m", "sms_reminders.cli", "serve", "--host", "0.0.0.0", "--port", "8000"]
