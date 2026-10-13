"""Redis/RQ integration. Skipped when no Redis server is reachable (set PCA_TEST_REDIS_URL)."""

import os

import pytest

from conftest import add_recording, get_call, recording_sid, webhook_params
from phonecall_agent.intake import handle_recording_event
from phonecall_agent.models import CallStatus
from phonecall_agent.twilio.webhook import parse_recording_status

REDIS_URL = os.environ.get("PCA_TEST_REDIS_URL", "redis://localhost:6379/15")


@pytest.fixture
def redis_conn():
    redis = pytest.importorskip("redis")
    conn = redis.Redis.from_url(REDIS_URL)
    try:
        conn.ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("no Redis server")
    conn.flushdb()
    yield conn
    conn.flushdb()


def test_rq_worker_processes_call(container, fake_twilio, redis_conn):
    from rq import SimpleWorker

    from phonecall_agent.jobs import RQQueue

    container.settings.redis_url = REDIS_URL
    queue = RQQueue(container.settings)
    add_recording(fake_twilio, container, 1)
    _, call_id = handle_recording_event(parse_recording_status(webhook_params(1)))
    queue.enqueue_process(call_id)
    queue.enqueue_process(call_id)  # same job id: not processed twice
    assert queue.queue.count == 1
    SimpleWorker([queue.queue], connection=redis_conn).work(burst=True)
    assert get_call(recording_sid(1)).status == CallStatus.NEEDS_REVIEW
    assert fake_twilio.media_requests == 1
