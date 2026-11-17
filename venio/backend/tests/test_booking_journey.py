"""Parcours complet : inscription → page publique → questions → créneau → confirmation → espace entreprise."""
import io
from datetime import datetime

from PIL import Image

from conftest import GENERIC_ANSWERS, next_open_day, qualified_session, signup


async def _slots(client, slug, sess, day):
    r = await client.get(f"/api/public/{slug}/sessions/{sess['id']}/slots",
                         params={"from": day.isoformat(), "days": 1}, headers=sess["headers"])
    assert r.status_code == 200, r.text
    return r.json()


async def test_full_public_journey(client_factory):
    pro, visitor = client_factory(), client_factory()
    tenant = await signup(pro, "generique", "Atelier Lumière")
    slug = tenant["slug"]
    assert slug == "atelier-lumiere"

    page = (await visitor.get(f"/api/public/{slug}")).json()
    assert page["name"] == "Atelier Lumière" and page["accepting_bookings"]

    # Démarrage + une réponse invalide + une question pas encore accessible
    r = await visitor.post(f"/api/public/{slug}/sessions", json={})
    s = r.json()
    h = {"X-Resume-Token": s["resume_token"]}
    base = f"/api/public/{slug}/sessions/{s['session_id']}"
    assert (await visitor.put(f"{base}/answers", json={"step": "besoin", "value": "nope"}, headers=h)).status_code == 422
    assert (await visitor.put(f"{base}/answers", json={"step": "delai", "value": "au_plus_vite"}, headers=h)).status_code == 409
    assert (await visitor.put(f"{base}/answers", json={"step": "besoin", "value": "devis"}, headers={"X-Resume-Token": "faux"})).status_code == 404
    # Créneaux refusés tant que la qualification n'est pas finie
    assert (await visitor.get(f"{base}/slots", headers=h)).status_code == 409

    # Photo déposée : métadonnées supprimées, rattachée au parcours
    img = io.BytesIO()
    Image.new("RGB", (40, 30), "red").save(img, format="JPEG")
    up = await visitor.post(f"{base}/files", files={"file": ("cuisine.jpg", img.getvalue(), "image/jpeg")}, headers=h)
    assert up.status_code == 201, up.text
    bad = await visitor.post(f"{base}/files", files={"file": ("x.exe", b"MZ...", "application/octet-stream")}, headers=h)
    assert bad.status_code == 422

    answers = [(k, v) for k, v in GENERIC_ANSWERS]
    answers[3] = ("photos", [up.json()["id"]])
    for step, value in answers:
        r = await visitor.put(f"{base}/answers", json={"step": step, "value": value}, headers=h)
        assert r.status_code == 200, r.text
    assert r.json()["state"]["qualification_done"] and r.json()["state"]["service_key"] == "rendez_vous"

    # Reprise du parcours avec le jeton
    resumed = (await visitor.get(base, headers=h)).json()
    assert resumed["answers"]["besoin"] == "premier_rdv" and len(resumed["files"]) == 1

    day = next_open_day()
    sess = {"id": s["session_id"], "headers": h}
    slots = await _slots(visitor, slug, sess, day)
    first = slots["days"][0]["slots"][0]
    assert first["time"] == "08:30"

    assert (await visitor.post(f"{base}/confirm", headers=h, json={
        "first_name": "Léa", "email": "lea@venio-tests.fr", "accept_privacy": True})).status_code == 409  # pas de créneau bloqué

    hold = await visitor.post(f"{base}/hold", json={"start": first["start"]}, headers=h)
    assert hold.status_code == 200, hold.text
    # Le créneau bloqué disparaît pour les autres visiteurs
    other = await qualified_session(client_factory(), slug)
    other_slots = await _slots(visitor, slug, other, day)
    assert first["start"] not in [x["start"] for d in other_slots["days"] for x in d["slots"]]

    contact = {"first_name": "Léa", "last_name": "Durand", "email": "lea@venio-tests.fr", "phone": "06 12 34 56 78",
               "accept_privacy": True, "consent_sms_reminders": True}
    assert (await visitor.post(f"{base}/confirm", headers=h, json={**contact, "accept_privacy": False})).status_code == 422
    done = await visitor.post(f"{base}/confirm", headers=h, json=contact)
    assert done.status_code == 200, done.text
    view = done.json()
    assert view["booking"]["status"] == "confirmed" and view["can_modify"]
    again = await visitor.post(f"{base}/confirm", headers=h, json=contact)  # double clic → même réponse
    assert again.json()["booking"]["id"] == view["booking"]["id"]
    assert (await visitor.put(f"{base}/answers", json={"step": "besoin", "value": "devis"}, headers=h)).status_code == 409

    # Espace entreprise
    dash = (await pro.get("/api/dashboard")).json()
    assert dash["counts"]["new_requests"] == 1 and dash["counts"]["bookings"] == 1
    cases = (await pro.get("/api/case-files")).json()
    assert len(cases) == 1 and cases[0]["first_name"] == "Léa"
    detail = (await pro.get(f"/api/case-files/{cases[0]['id']}")).json()
    assert [a["step"] for a in detail["case"]["answers"]][:3] == ["besoin", "description", "delai"]
    assert "Un premier rendez-vous" in detail["case"]["summary"]
    assert len(detail["files"]) == 1
    f = await pro.get(f"/api/files/{detail['files'][0]['id']}")
    assert f.status_code == 200 and f.headers["content-type"] == "image/jpeg"
    keys = sorted(n["template_key"] for n in detail["notifications"])
    assert keys == ["business_new_booking", "client_confirmation", "client_reminder"]
    assert {c["channel"] for c in detail["consents"]} == {"email", "sms"}
    assert (await visitor.get(f"/api/files/{detail['files'][0]['id']}")).status_code == 401

    # Le worker traite les messages dus (fournisseur "log" : enregistrés, non envoyés)
    from venio.modules.notifications import run_due_jobs
    assert await run_due_jobs() >= 2
    statuses = {n["template_key"]: n["status"] for n in (await pro.get("/api/notifications")).json()}
    assert statuses["client_confirmation"] == "logged" and statuses["client_reminder"] == "scheduled"

    # Lien de gestion : report puis annulation
    token = view["manage_token"]
    m = (await visitor.get(f"/api/public/{slug}/manage/{token}")).json()
    assert m["booking"]["status"] == "confirmed"
    assert (await visitor.get(f"/api/public/{slug}/manage/{token[:-2]}xx")).status_code == 404
    new_slots = (await visitor.get(f"/api/public/{slug}/manage/{token}/slots",
                                   params={"from": day.isoformat(), "days": 1})).json()
    target = new_slots["days"][0]["slots"][3]["start"]
    moved = await visitor.post(f"/api/public/{slug}/manage/{token}/reschedule", json={"start": target})
    assert moved.status_code == 200, moved.text
    assert datetime.fromisoformat(moved.json()["booking"]["starts_at"]) == datetime.fromisoformat(target)
    cancelled = await visitor.post(f"/api/public/{slug}/manage/{token}/cancel")
    assert cancelled.json()["booking"]["status"] == "cancelled" and not cancelled.json()["can_modify"]
    assert (await pro.get("/api/case-files", params={"status": "cancelled"})).json()[0]["first_name"] == "Léa"
    notifs = (await pro.get("/api/notifications")).json()
    assert {"client_cancellation", "business_cancellation", "client_rescheduled"} <= {n["template_key"] for n in notifs}
    assert all(n["status"] != "scheduled" for n in notifs if n["template_key"] == "client_reminder")


async def test_changing_answer_releases_hold_when_service_changes(client_factory):
    pro, visitor = client_factory(), client_factory()
    slug = (await signup(pro, "renovation"))["slug"]
    answers = [("projet", "autre"), ("autre_description", "Peinture séjour"), ("logement", "maison"),
               ("anciennete", True), ("delai", "au_plus_vite"), ("budget", None), ("photos", None), ("precisions", None)]
    sess = await qualified_session(visitor, slug, answers)
    base = f"/api/public/{slug}/sessions/{sess['id']}"
    day = next_open_day(4)
    slots = (await visitor.get(f"{base}/slots", params={"from": day.isoformat(), "days": 1}, headers=sess["headers"])).json()
    assert slots["service"]["key"] == "visite_technique"
    hold = await visitor.post(f"{base}/hold", json={"start": slots["days"][0]["slots"][0]["start"]}, headers=sess["headers"])
    assert hold.status_code == 200
    r = await visitor.put(f"{base}/answers", json={"step": "delai", "value": "je_me_renseigne"}, headers=sess["headers"])
    assert r.json()["state"]["service_key"] == "appel_decouverte" and r.json()["hold"] is None


async def test_on_site_requires_address_and_respects_area(client_factory):
    pro, visitor = client_factory(), client_factory()
    slug = (await signup(pro, "renovation"))["slug"]
    profile = (await pro.get("/api/settings/profile")).json()
    profile["settings"]["postal_prefixes"] = ["92"]
    assert (await pro.put("/api/settings/profile", json=profile)).status_code == 200
    answers = [("projet", "autre"), ("autre_description", "Mur"), ("logement", "maison"), ("anciennete", True),
               ("delai", "au_plus_vite"), ("budget", "moins_5k"), ("photos", None), ("precisions", None)]
    sess = await qualified_session(visitor, slug, answers)
    base = f"/api/public/{slug}/sessions/{sess['id']}"
    slots = (await visitor.get(f"{base}/slots", params={"from": next_open_day(4).isoformat(), "days": 1},
                               headers=sess["headers"])).json()
    await visitor.post(f"{base}/hold", json={"start": slots["days"][0]["slots"][0]["start"]}, headers=sess["headers"])
    contact = {"first_name": "Paul", "email": "paul@venio-tests.fr", "phone": "0612345678", "accept_privacy": True}
    r = await visitor.post(f"{base}/confirm", headers=sess["headers"], json=contact)
    assert r.json()["detail"]["code"] == "address_required"
    far = {**contact, "address": {"line": "1 rue X", "postal_code": "69001", "city": "Lyon"}}
    assert (await visitor.post(f"{base}/confirm", headers=sess["headers"], json=far)).json()["detail"]["code"] == "out_of_area"
    ok = {**contact, "address": {"line": "1 rue X", "postal_code": "92100", "city": "Boulogne"}}
    assert (await visitor.post(f"{base}/confirm", headers=sess["headers"], json=ok)).status_code == 200
