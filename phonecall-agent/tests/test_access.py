import pytest

from conftest import PASSWORD, add_recording, get_call, login, post_webhook, recording_sid, webhook_params
from phonecall_agent.models import CallStatus


@pytest.fixture
def call_id(client, container, fake_twilio):
    add_recording(fake_twilio, container, 1)
    post_webhook(client, webhook_params(1))
    return get_call(recording_sid(1)).id


def test_unauthenticated_access_redirects_or_401(client, call_id):
    assert client.get("/calls", follow_redirects=False).status_code == 303
    assert client.get(f"/calls/{call_id}", follow_redirects=False).headers["location"] == "/login"
    assert client.post(f"/calls/{call_id}/approve", data={"text": "x"}).status_code == 401
    assert client.get("/metrics").status_code == 401


@pytest.mark.parametrize(
    "user,path,method,expected",
    [
        ("alice", "/dashboard", "get", 403),
        ("alice", "/admin/audit", "get", 403),
        ("alice", "/calls/{id}/reject", "post", 403),
        ("alice", "/calls/{id}/regenerate", "post", 403),
        ("alice", "/admin/calls/{id}/delete", "post", 403),
        ("sam", "/dashboard", "get", 200),
        ("sam", "/admin/audit", "get", 403),
        ("sam", "/admin/calls/{id}/delete", "post", 403),
        ("ada", "/admin/audit", "get", 200),
    ],
)
def test_role_matrix(client, call_id, user, path, method, expected):
    csrf = login(client, user)
    url = path.replace("{id}", call_id)
    r = client.get(url) if method == "get" else client.post(url, data={"csrf": csrf}, follow_redirects=False)
    assert r.status_code == expected


def test_csrf_required(client, call_id):
    login(client, "alice")
    r = client.post(f"/calls/{call_id}/approve", data={"text": "ok", "csrf": "forged"})
    assert r.status_code == 403
    assert get_call(recording_sid(1)).status == CallStatus.NEEDS_REVIEW


def test_wrong_password_and_lockout(client):
    page = client.get("/login")
    import re

    csrf = re.search(r'name="csrf" value="([^"]+)"', page.text).group(1)
    for _ in range(5):
        r = client.post("/login", data={"login": "alice", "password": "nope", "csrf": csrf})
        assert "Identifiants invalides" in r.text
    # Locked even with the right password
    r = client.post("/login", data={"login": "alice", "password": PASSWORD, "csrf": csrf}, follow_redirects=False)
    assert r.status_code == 200 and "verrouillé" in r.text


def test_admin_delete_requires_confirmation_and_is_audited(client, call_id):
    csrf = login(client, "ada")
    assert client.post(f"/admin/calls/{call_id}/delete", data={"csrf": csrf}).status_code == 400
    r = client.post(f"/admin/calls/{call_id}/delete", data={"csrf": csrf, "confirm": "SUPPRIMER"}, follow_redirects=False)
    assert r.status_code == 303
    assert get_call(recording_sid(1)) is None
    audit_page = client.get("/admin/audit").text
    assert "delete_call_data" in audit_page


def test_views_are_audited(client, call_id):
    login(client, "alice")
    client.get(f"/calls/{call_id}")
    client.cookies.clear()
    login(client, "ada")
    assert "view_call" in client.get("/admin/audit").text


def test_metrics_token(client, call_id):
    assert client.get("/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 401
    r = client.get("/metrics", headers={"Authorization": "Bearer metrics-token"})
    assert r.status_code == 200 and "phonecall_calls_received 1" in r.text


def test_security_headers(client):
    r = client.get("/login")
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"


def test_audio_is_never_served(client, call_id):
    login(client, "ada")
    assert client.get("/static/../var/audio").status_code == 404
    page = client.get(f"/calls/{call_id}").text
    assert "<audio" not in page and "twilio.com" not in page


def test_blocking_flags_require_acknowledgement(client, container, fake_twilio):
    add_recording(fake_twilio, container, 30, ai="demenagement_hallucination")
    post_webhook(client, webhook_params(30))
    call = get_call(recording_sid(30))
    csrf = login(client, "alice")
    assert "ack_blocking" in client.get(f"/calls/{call.id}").text
    r = client.post(f"/calls/{call.id}/approve", data={"text": call.latest_report.text, "csrf": csrf})
    assert r.status_code == 400
    r = client.post(
        f"/calls/{call.id}/approve",
        data={"text": "Déménagement : rendez-vous technicien proposé, non fixé.", "csrf": csrf, "ack_blocking": "1"},
        follow_redirects=False,
    )
    assert r.status_code == 303
    assert get_call(recording_sid(30)).status == CallStatus.APPROVED
