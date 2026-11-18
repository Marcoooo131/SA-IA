FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY venio ./venio
RUN pip install --no-cache-dir . && useradd --system --uid 10001 venio && mkdir -p /data/uploads && chown venio /data/uploads
USER venio
ENV VENIO_STORAGE_DIR=/data/uploads
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn venio.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
