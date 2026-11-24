"""Garde-fou : toute table portant des données d'entreprise doit avoir la RLS activée, forcée, et une politique.
Échoue si une future migration ajoute une table sans cloisonnement (audit de sécurité, document 08)."""
import asyncpg


async def test_every_tenant_table_is_isolated(database):
    conn = await asyncpg.connect(database["admin_url"])
    try:
        rows = await conn.fetch("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r'
              AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)""")
        # Exceptions documentées dans leurs migrations : tables « plateforme » SANS donnée personnelle, lues avant de
        # savoir de quelle entreprise il s'agit (file de tâches, jeton de webhook, lien court de SMS, journal Stripe),
        # et sessions (niveau du compte). Toute nouvelle exception doit être justifiée ici.
        allowed = {"user_session", "job", "telephony_endpoint", "recovery_link", "stripe_event"}
        bad = [r["relname"] for r in rows if r["relname"] not in allowed
               and not (r["relrowsecurity"] and r["relforcerowsecurity"] and r["policies"] > 0)]
        assert len(rows) > 20
        assert bad == [], f"Tables sans cloisonnement par entreprise : {bad}"
        # Le schéma des sauvegardes reste fermé à l'application.
        assert not await conn.fetchval("SELECT has_schema_privilege('venio_app', 'backup', 'USAGE')")
    finally:
        await conn.close()
