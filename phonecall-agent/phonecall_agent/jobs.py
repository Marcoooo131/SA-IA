"""Job queue.

- ``rq``: Redis + RQ workers (production). Retries with increasing delays.
- ``inline``: synchronous execution in the web process (tests and local demo only).
"""

from __future__ import annotations

import logging
from typing import Protocol

from .config import Settings

log = logging.getLogger(__name__)

RETRY_INTERVALS = [30, 120, 600, 1800]  # seconds


class JobQueue(Protocol):
    def enqueue_process(self, call_id: str) -> None: ...
    def enqueue_crm_push(self, call_id: str) -> None: ...


# ----------------------------------------------------------------- job entry points (worker side)


def process_call_job(call_id: str) -> str | None:
    from .container import get_container
    from .pipeline import process_call

    status = process_call(call_id, get_container())
    return status.value if status else None


def crm_push_job(call_id: str) -> str | None:
    from .container import get_container
    from .crm_service import push_to_crm

    status = push_to_crm(call_id, get_container())
    return status.value if status else None


def purge_job() -> dict:
    from .container import get_container
    from .retention import purge_expired

    return purge_expired(get_container())


# ----------------------------------------------------------------- queue implementations


class InlineQueue:
    def __init__(self, container, max_attempts: int):
        self.container = container
        self.max_attempts = max_attempts

    def _run(self, func, call_id: str) -> None:
        from .pipeline import RetryLater

        for _ in range(self.max_attempts):
            try:
                func(call_id, self.container)
                return
            except RetryLater:
                continue

    def enqueue_process(self, call_id: str) -> None:
        from .pipeline import process_call

        self._run(process_call, call_id)

    def enqueue_crm_push(self, call_id: str) -> None:
        from .crm_service import push_to_crm

        self._run(push_to_crm, call_id)


class RQQueue:
    def __init__(self, settings: Settings):
        from redis import Redis
        from rq import Queue

        self.redis = Redis.from_url(settings.redis_url)
        self.queue = Queue("phonecall", connection=self.redis)
        self.max_attempts = settings.job_max_attempts

    def _retry(self):
        from rq import Retry

        return Retry(max=self.max_attempts - 1, interval=RETRY_INTERVALS)

    def _enqueue(self, func, call_id: str, job_id: str, timeout: int) -> None:
        from rq.exceptions import DuplicateJobError

        # unique job id: a job already queued or running for this call is not enqueued twice.
        # result_ttl=0 drops finished jobs, so a later legitimate retry is still possible.
        try:
            self.queue.enqueue(
                func, call_id, job_id=job_id, unique=True, retry=self._retry(), job_timeout=timeout, result_ttl=0,
                failure_ttl=86400,
            )
        except DuplicateJobError:
            log.info("job already queued", extra={"call_id": call_id})

    def enqueue_process(self, call_id: str) -> None:
        self._enqueue(process_call_job, call_id, f"process-{call_id}", 1800)

    def enqueue_crm_push(self, call_id: str) -> None:
        self._enqueue(crm_push_job, call_id, f"crm-{call_id}", 300)


def build_queue(container) -> JobQueue:
    settings = container.settings
    if settings.queue_backend == "inline":
        return InlineQueue(container, settings.job_max_attempts)
    if settings.queue_backend == "rq":
        return RQQueue(settings)
    raise ValueError(f"unknown queue backend {settings.queue_backend!r}")
