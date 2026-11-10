import sqlite3
from datetime import timedelta

import pytest
from conftest import load_sample

from sales_coach.analysis.analyzer import analyze
from sales_coach.config import get_settings
from sales_coach.security import auth
from sales_coach.security.anonymizer import Anonymizer, anonymize_transcript
from sales_coach.storage import repo
from sales_coach.storage.db import utcnow


def test_anonymizer_masks_personal_data():
    a = Anonymizer()
    out = a.anonymize("Je suis Monsieur Dupont, 06 12 34 56 78, jean.dupont@exemple.fr, 12 rue des Lilas 33000 Bordeaux, contrat n° AB123456, FR76 3000 6000 0112 3456 7890 189").text
    for leak in ["Dupont", "06 12", "jean.dupont", "Lilas", "33000", "AB123456", "FR76"]:
        assert leak not in out
    assert "Bordeaux" in out  # une ville seule n'identifie pas une personne
    assert a.anonymize("je suis muté à Bordeaux").text == "je suis muté à Bordeaux"


def test_anonymize_transcript_keeps_consistent_tokens():
    t = load_sample("appel_04_insatisfait_pression.txt")
    t, counts = anonymize_transcript(t)
    assert counts.get("TELEPHONE") == 1 and counts.get("NOM", 0) >= 1
    assert "Dupont" not in t.to_text()


def test_passwords_and_roles():
    h = auth.hash_password("un-mot-de-passe")
    assert auth.verify_password("un-mot-de-passe", h) and not auth.verify_password("autre", h)
    assert auth.can("admin", "manage_users") and not auth.can("manager", "manage_users")
    assert auth.can("agent", "training") and not auth.can("agent", "view_all")
    with pytest.raises(ValueError):
        auth.create_user("x", "court", "agent")
    auth.create_user("manager1", "mot-de-passe-long", "manager")
    assert auth.authenticate("manager1", "mot-de-passe-long").role == "manager"
    assert auth.authenticate("manager1", "faux") is None
    actions = [l.action for l in auth.read_audit()]
    assert "connexion" in actions and "échec de connexion" in actions


def _save(name="appel_04_insatisfait_pression.txt", **kw):
    t = load_sample(name)
    r = analyze(t)
    aid = repo.get_or_create_agent("Agent Test")
    return repo.save_analysis(aid, "test", t, r, consent=True, anonymized=False, **kw), t, r


def test_data_is_encrypted_at_rest():
    an_id, t, r = _save()
    db = get_settings().data_dir / "sales_coach.db"
    raw = sqlite3.connect(db).execute("select transcript_enc from calls").fetchone()[0]
    assert "Dupont" not in raw and "fausses alarmes" not in raw
    report, transcript, meta = repo.load_analysis(an_id)
    assert transcript.to_text() == t.to_text()
    assert report.total_score == r.total_score


def test_consent_required():
    t = load_sample("appel_01_budget_acceptation_rapide.txt")
    with pytest.raises(PermissionError):
        repo.save_analysis(repo.get_or_create_agent("A"), "x", t, analyze(t), consent=False, anonymized=True)


def test_audio_stored_encrypted_and_purged():
    an_id, _, _ = _save(audio=(b"RIFF-fake-audio", ".wav"), keep_audio=True)
    _, _, meta = repo.load_analysis(an_id)
    assert meta["has_audio"]
    files = list(get_settings().audio_dir.glob("*.enc"))
    assert files and b"RIFF" not in files[0].read_bytes()
    assert repo.load_audio(str(files[0])) == b"RIFF-fake-audio"
    n = repo.purge_expired(now=utcnow() + timedelta(days=91))
    assert n == 1 and not list(get_settings().audio_dir.glob("*.enc"))
    report, transcript, meta = repo.load_analysis(an_id)
    assert report is None and transcript is None and meta["purged"]
    rows = repo.list_analyses()
    assert rows[0]["total_score"] is not None  # les notes restent pour le suivi


def test_outcome_is_separate_from_score():
    an_id, _, _ = _save("appel_02_autre_region_excellent.txt")
    row = repo.list_analyses()[0]
    assert row["outcome"] is None
    repo.record_outcome(row["call_id"], "résilié", "parti malgré tout")
    row = repo.list_analyses()[0]
    assert row["outcome"] == "résilié" and row["total_score"] > 80
    with pytest.raises(ValueError):
        repo.record_outcome(row["call_id"], "inconnu")


def test_delete_call():
    an_id, _, _ = _save()
    _, _, meta = repo.load_analysis(an_id)
    repo.delete_call(meta["call_id"])
    assert repo.load_analysis(an_id)[0] is None
