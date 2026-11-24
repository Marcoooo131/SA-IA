import copy

from conftest import next_open_day, qualified_session, signup


async def test_login_logout_and_errors(client_factory):
    c = client_factory()
    r = await c.post("/api/auth/signup", json={"email": "karim@venio-tests.fr", "password": "motdepasse-solide",
                                               "full_name": "Karim B", "company_name": "Rénov 92", "vertical": "renovation",
                                               "accept_terms": True})
    assert r.status_code == 201 and r.json()["slug"] == "renov-92"
    dup = await client_factory().post("/api/auth/signup", json={"email": "KARIM@venio-tests.fr", "password": "motdepasse-solide",
                                                                "full_name": "Kim", "company_name": "Autre", "vertical": "generique",
                                                                "accept_terms": True})
    assert dup.status_code == 409
    me = (await c.get("/api/auth/me")).json()
    assert me["role"] == "owner" and me["subscription"]["status"] == "trialing" and me["subscription"]["plan_code"] == "unique"
    assert me["public_url"].endswith("/r/renov-92")
    assert (await c.post("/api/auth/logout")).status_code == 200
    assert (await c.get("/api/auth/me")).status_code == 401
    bad = await c.post("/api/auth/login", json={"email": "karim@venio-tests.fr", "password": "mauvais-mot"})
    assert bad.status_code == 401
    assert (await c.post("/api/auth/login", json={"email": "karim@venio-tests.fr", "password": "motdepasse-solide"})).status_code == 200
    assert (await c.get("/api/auth/me")).status_code == 200
    assert (await client_factory().post("/api/auth/signup", json={"email": "x@venio-tests.fr", "password": "court",
            "full_name": "X", "company_name": "XX", "vertical": "generique", "accept_terms": True})).status_code == 422
    # Sans acceptation des conditions générales, pas de compte.
    refused = await client_factory().post("/api/auth/signup", json={"email": "y@venio-tests.fr", "password": "motdepasse-solide",
                                          "full_name": "Yann", "company_name": "YY", "vertical": "generique"})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "terms_required"


async def test_login_rate_limited(client_factory):
    c = client_factory()
    codes = [(await c.post("/api/auth/login", json={"email": "nobody@venio-tests.fr", "password": "x"})).status_code
             for _ in range(11)]
    assert codes[-1] == 429


async def test_availability_and_time_off_change_slots(client_factory):
    pro, visitor = client_factory(), client_factory()
    slug = (await signup(pro))["slug"]
    resource = (await pro.get("/api/settings/resources")).json()[0]
    day = next_open_day()
    rules = [{"weekday": day.isoweekday(), "start_time": "14:00", "end_time": "16:00"}]
    assert (await pro.put(f"/api/settings/resources/{resource['id']}/availability", json={"rules": rules})).status_code == 200
    overlap = rules + [{"weekday": day.isoweekday(), "start_time": "15:00", "end_time": "17:00"}]
    assert (await pro.put(f"/api/settings/resources/{resource['id']}/availability", json={"rules": overlap})).status_code == 422
    sess = await qualified_session(visitor, slug)
    url = f"/api/public/{slug}/sessions/{sess['id']}/slots"
    slots = (await visitor.get(url, params={"from": day.isoformat(), "days": 1}, headers=sess["headers"])).json()
    times = [s["time"] for s in slots["days"][0]["slots"]]
    assert times == ["14:00", "14:30", "15:00"]  # 45 min doivent tenir avant 16:00
    first = slots["days"][0]["slots"][0]["start"]
    r = await pro.post("/api/settings/time-off", json={"starts_at": first, "ends_at": slots["days"][0]["slots"][-1]["start"],
                                                       "reason": "Chantier"})
    assert r.status_code == 201
    slots = (await visitor.get(url, params={"from": day.isoformat(), "days": 1}, headers=sess["headers"])).json()
    assert [s["time"] for d in slots["days"] for s in d["slots"]] == ["15:00"]  # blocage 14:00–15:00


async def test_flow_versioning_does_not_disturb_started_sessions(client_factory):
    pro, visitor = client_factory(), client_factory()
    slug = (await signup(pro))["slug"]
    flow = (await pro.get("/api/settings/flow")).json()
    v1 = flow["published"]["definition"]

    started = await visitor.post(f"/api/public/{slug}/sessions", json={})
    s = started.json()

    v2 = copy.deepcopy(v1)
    v2["steps"][0]["title"] = "Que pouvons-nous faire pour vous ?"
    v2["steps"].insert(1, {"id": "urgence", "type": "yes_no", "title": "Est-ce urgent ?", "next": "description"})
    v2["steps"][0]["next"] = "urgence"
    bad = copy.deepcopy(v2)
    bad["service_rules"] = [{"service": "inexistante"}]
    r = await pro.put("/api/settings/flow/draft", json={"definition": bad})
    assert r.status_code == 422 and "inexistante" in r.json()["detail"]["message"]
    cyc = copy.deepcopy(v2)
    cyc["steps"][1]["next"] = "besoin"
    assert (await pro.put("/api/settings/flow/draft", json={"definition": cyc})).json()["detail"]["code"] == "invalid_flow"

    assert (await pro.put("/api/settings/flow/draft", json={"definition": v2})).status_code == 200
    assert (await pro.get(f"/api/public/{slug}/sessions/{s['session_id']}",
                          headers={"X-Resume-Token": s["resume_token"]})).json()["definition"]["steps"][1]["id"] == "description"
    assert (await pro.post("/api/settings/flow/publish")).json()["published_version"] == 2
    assert (await pro.post("/api/settings/flow/publish")).status_code == 409

    # Le parcours commencé reste sur la version 1 ; un nouveau démarre sur la version 2
    old = (await visitor.get(f"/api/public/{slug}/sessions/{s['session_id']}", headers={"X-Resume-Token": s["resume_token"]})).json()
    assert [x["id"] for x in old["definition"]["steps"]][:2] == ["besoin", "description"]
    new = (await visitor.post(f"/api/public/{slug}/sessions", json={})).json()
    assert [x["id"] for x in new["definition"]["steps"]][:2] == ["besoin", "urgence"]


async def test_business_can_reschedule_and_mark_no_show(client_factory):
    pro, visitor = client_factory(), client_factory()
    slug = (await signup(pro))["slug"]
    sess = await qualified_session(visitor, slug)
    base = f"/api/public/{slug}/sessions/{sess['id']}"
    day = next_open_day()
    slots = (await visitor.get(f"{base}/slots", params={"from": day.isoformat(), "days": 1}, headers=sess["headers"])).json()
    day_slots = slots["days"][0]["slots"]
    await visitor.post(f"{base}/hold", json={"start": day_slots[0]["start"]}, headers=sess["headers"])
    await visitor.post(f"{base}/confirm", headers=sess["headers"], json={"first_name": "Ana", "email": "ana@venio-tests.fr",
                                                                         "accept_privacy": True})
    bookings = (await pro.get("/api/bookings", params={"from": day.isoformat(), "to": day.isoformat()})).json()
    assert len(bookings) == 1
    bid = bookings[0]["id"]
    r = await pro.patch(f"/api/bookings/{bid}", json={"start": day_slots[4]["start"]})
    assert r.status_code == 200, r.text
    # Report avant l'envoi : la confirmation et l'alerte partent quand même, seuls les rappels sont recalculés.
    by_key = {}
    for n in (await pro.get("/api/notifications")).json():
        by_key.setdefault(n["template_key"], []).append(n["status"])
    assert by_key["client_confirmation"] == ["scheduled"] and by_key["business_new_booking"] == ["scheduled"]
    assert sorted(by_key["client_reminder"]) == ["cancelled", "scheduled"]
    r = await pro.patch(f"/api/bookings/{bid}", json={"status": "no_show"})
    assert r.json()["status"] == "no_show"
    case = (await pro.get("/api/case-files")).json()[0]
    assert case["status"] == "no_show"
    note = await pro.post(f"/api/case-files/{case['id']}/notes", json={"body": "Rappeler la semaine prochaine"})
    assert note.status_code == 201
    detail = (await pro.get(f"/api/case-files/{case['id']}")).json()
    assert detail["notes"][0]["author"] == "Camille Martin"
    assert [h["action"] for h in detail["history"]] == ["confirmed", "rescheduled", "no_show"]
    funnel = (await pro.get("/api/funnel")).json()
    assert funnel["totals"]["bookings"] == 1 and funnel["reliable"] is False
    assert funnel["steps"][0]["answered"] == 1
