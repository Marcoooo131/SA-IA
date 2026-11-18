"""Démonstration interactive (05 §B.3) : un espace jetable par visiteur, sur le vrai moteur.

Garanties, appliquées côté serveur et testées :
- données fictives, entreprise clairement nommée comme exemple ;
- aucun email ni SMS réel : toute notification d'un espace de démonstration est enregistrée sans être envoyée ;
- aucun paiement possible ;
- suppression automatique après 2 heures ;
- limite de fréquence par adresse IP et nombre maximal d'espaces actifs.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Response

from ..db import execute, fetch_one, j, tx
from ..errors import api_error
from ..ratelimit import limit
from ..security import hash_password, new_token, token_hash
from .identity import _open_session
from .provisioning import create_tenant

router = APIRouter(prefix="/api/demo", tags=["démonstration"])
MAX_ACTIVE = 300
DEMO_DOMAIN = "demo.venio.invalid"   # domaine réservé (RFC 2606) : aucun email ne peut y être livré
DEMO_NAME = "Rénovation Exemple"


async def purge(conn) -> int:
    return (await fetch_one(conn, "SELECT purge_demo_tenants() AS n"))["n"]


@router.post("/start", status_code=201, dependencies=[Depends(limit("demo_start", 6, 600))])
async def start(response: Response) -> dict:
    async with tx() as conn:
        await purge(conn)
        active = (await fetch_one(conn, "SELECT count(*) AS n FROM tenant WHERE is_demo"))
    if active and active["n"] >= MAX_ACTIVE:
        raise api_error(503, "demo_busy", "La démonstration est très demandée en ce moment. Réessayez dans quelques minutes.")
    email = f"visiteur-{secrets.token_hex(6)}@{DEMO_DOMAIN}"
    async with tx() as conn:
        user = await fetch_one(
            conn, "INSERT INTO app_user (email, full_name, password_hash) VALUES (:e, :n, :p) RETURNING id",
            e=email, n="Visiteur de la démo", p=hash_password(new_token()))
        tenant_id, slug = await create_tenant(
            conn, name=DEMO_NAME, vertical="renovation", owner_id=user["id"],
            owner_name="Camille (démo)", owner_email=email)
        profile = {"tagline": "Entreprise fictive de démonstration : aucune donnée réelle, aucun envoi.",
                   "reassurance": ["Devis gratuit", "Données fictives"], "service_area": "Démonstration"}
        await execute(
            conn, "UPDATE tenant SET is_demo = true, public_profile = public_profile || CAST(:p AS jsonb) WHERE id = :t",
            p=j(profile), t=tenant_id)
        await execute(
            conn, "INSERT INTO missed_call_settings (tenant_id, enabled, config) VALUES (:t, true, CAST(:c AS jsonb))",
            t=tenant_id, c=j({"sender": "RENOEXEMPLE"}))
        line = await fetch_one(
            conn, "INSERT INTO telephony_line (tenant_id, label, business_number, mode, provider)"
                  " VALUES (:t, 'Ligne de démonstration', '+33100000000', 'simulator', 'simulator') RETURNING id", t=tenant_id)
        await execute(conn, "INSERT INTO telephony_endpoint (token_hash, tenant_id, line_id) VALUES (:h, :t, :l)",
                      h=token_hash(new_token()), t=tenant_id, l=line["id"])
    await _open_session(response, user["id"], tenant_id)
    return {"slug": slug, "name": DEMO_NAME}
