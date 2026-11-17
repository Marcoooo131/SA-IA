"""Réservations simultanées sur le même créneau : un seul gagnant, jamais de doublon."""
import asyncio

from conftest import next_open_day, qualified_session, signup


async def test_simultaneous_holds_single_winner(client_factory):
    pro = client_factory()
    slug = (await signup(pro))["slug"]
    sessions = [await qualified_session(client_factory(), slug) for _ in range(15)]
    c = client_factory()
    day = next_open_day()
    slots = (await c.get(f"/api/public/{slug}/sessions/{sessions[0]['id']}/slots",
                         params={"from": day.isoformat(), "days": 1}, headers=sessions[0]["headers"])).json()
    start = slots["days"][0]["slots"][2]["start"]

    async def attempt(sess):
        return await c.post(f"/api/public/{slug}/sessions/{sess['id']}/hold", json={"start": start}, headers=sess["headers"])

    results = await asyncio.gather(*(attempt(s) for s in sessions))
    codes = sorted(r.status_code for r in results)
    assert codes.count(200) == 1 and codes.count(409) == 14, codes
    assert all(r.json()["detail"]["code"] == "slot_taken" for r in results if r.status_code == 409)


async def test_overlapping_slots_with_buffers_never_double_book(client_factory):
    """Créneaux différents mais chevauchants (tampon de trajet) : la base refuse le second."""
    pro = client_factory()
    slug = (await signup(pro, "renovation"))["slug"]
    answers = [("projet", "autre"), ("autre_description", "Mur"), ("logement", "maison"), ("anciennete", True),
               ("delai", "au_plus_vite"), ("budget", None), ("photos", None), ("precisions", None)]
    s1 = await qualified_session(client_factory(), slug, answers)
    s2 = await qualified_session(client_factory(), slug, answers)
    c = client_factory()
    day = next_open_day(4)
    slots = (await c.get(f"/api/public/{slug}/sessions/{s1['id']}/slots", params={"from": day.isoformat(), "days": 1},
                         headers=s1["headers"])).json()["days"][0]["slots"]
    # 60 min + 30 min de tampon : 08:30 et 09:00 se chevauchent
    r1, r2 = await asyncio.gather(
        c.post(f"/api/public/{slug}/sessions/{s1['id']}/hold", json={"start": slots[0]["start"]}, headers=s1["headers"]),
        c.post(f"/api/public/{slug}/sessions/{s2['id']}/hold", json={"start": slots[1]["start"]}, headers=s2["headers"]),
    )
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
