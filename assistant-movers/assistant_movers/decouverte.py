"""`decouvrir` : relève dans les métadonnées du CRM les noms techniques à reporter dans assistant.toml.
Lecture seule. Le rapport (decouverte.txt) ne contient que des noms de tables et de champs, aucune
donnée client."""

from __future__ import annotations

import unicodedata

from .crm import DataverseGateway

MOTS_CASE = ("moving", "move", "mover", "completed", "street", "postal", "city", "installation", "contract", "contrat",
             "case type", "category", "reason", "coverage", "interested")
MOTS_WO = ("activity number", "type of work order", "template", "description", "timeband", "booked", "start date",
           "end date", "case", "account", "status", "mobile")
MOTS_SMS = ("text", "message", "body", "mobile", "phone", "number", "regarding", "status")
MOTS_TABLES = ("work order", "sms", "installation", "contract", "contrat", "work order product", "service code")
MOTS_ACTIONS = ("appoint", "book", "slot", "sam", "schedul", "rdv", "creneau")


def _n(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _label(meta: dict) -> str:
    try:
        return meta["DisplayName"]["UserLocalizedLabel"]["Label"]
    except (KeyError, TypeError):
        return ""


class Decouverte:
    def __init__(self, gw: DataverseGateway):
        self.gw = gw
        self.lignes: list[str] = []

    def p(self, s: str = "") -> None:
        print(s)
        self.lignes.append(s)

    def _attributs(self, entite: str, mots: tuple[str, ...]) -> None:
        rows = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/Attributes", f"Champs de {entite}",
                            {"$select": "LogicalName,DisplayName,AttributeType"}).get("value", [])
        for a in sorted(rows, key=lambda r: r["LogicalName"]):
            lab = _label(a)
            if any(m in _n(lab) or m.replace(" ", "") in a["LogicalName"] for m in mots):
                self.p(f"    {a['LogicalName']:<45} {a.get('AttributeType', ''):<10} « {lab} »")
                if a.get("AttributeType") in ("Picklist", "Boolean", "Status"):
                    self._options(entite, a["LogicalName"], a["AttributeType"])

    def _options(self, entite: str, attr: str, typ: str) -> None:
        cast = {"Picklist": "PicklistAttributeMetadata", "Boolean": "BooleanAttributeMetadata", "Status": "StatusAttributeMetadata"}[typ]
        try:
            m = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/Attributes(LogicalName='{attr}')/Microsoft.Dynamics.CRM.{cast}",
                             "Valeurs", {"$select": "LogicalName", "$expand": "OptionSet"})
        except Exception:  # noqa: BLE001
            return
        os_ = m.get("OptionSet") or {}
        opts = os_.get("Options") or [o for o in (os_.get("TrueOption"), os_.get("FalseOption")) if o]
        vals = []
        for o in opts:
            try:
                vals.append(f"{o['Value']}={o['Label']['UserLocalizedLabel']['Label']}")
            except (KeyError, TypeError):
                pass
        if vals:
            self.p(f"        valeurs : {', '.join(vals)}")

    def _relations(self, entite: str) -> None:
        rows = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/ManyToOneRelationships", f"Liens de {entite}",
                            {"$select": "ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName"}).get("value", [])
        for r in sorted(rows, key=lambda r: r["ReferencingAttribute"]):
            if r["ReferencedEntity"] in ("systemuser", "team", "businessunit", "transactioncurrency", "organization"):
                continue
            self.p(f"    {r['ReferencingAttribute']:<40} → {r['ReferencedEntity']:<28} nav = {r['ReferencingEntityNavigationPropertyName']}")

    def lancer(self) -> list[str]:
        g = self.gw
        self.p("DÉCOUVERTE DU CRM — noms techniques à reporter dans assistant.toml")
        self.p(f"Utilisateur connecté (WhoAmI) : OK")
        try:
            self.p(f"Version du CRM : {g._get('RetrieveVersion()', 'Version').get('Version', '?')}")
        except Exception as e:  # noqa: BLE001
            self.p(f"Version du CRM : non lue ({e})")

        self.p("\n[Tables à repérer] (nom affiché → nom logique / entity set)")
        tables = g._get("EntityDefinitions", "Tables", {"$select": "LogicalName,EntitySetName,DisplayName,IsActivity,PrimaryIdAttribute"}).get("value", [])
        trouves: dict[str, str] = {}
        for t in sorted(tables, key=lambda t: t["LogicalName"]):
            lab = _label(t)
            if any(m in _n(lab) for m in MOTS_TABLES):
                trouves[t["LogicalName"]] = lab
                self.p(f"    « {lab} » → entite = {t['LogicalName']}, entity_set = {t['EntitySetName']}, "
                       f"clé = {t.get('PrimaryIdAttribute')}, activité = {t.get('IsActivity')}")

        self.p("\n[Case (incident) — champs Movers]")
        self._attributs("incident", MOTS_CASE)
        self.p("\n[Case (incident) — liens]")
        self._relations("incident")

        for logical, lab in trouves.items():
            n = _n(lab)
            if "work order" in n and "product" not in n:
                self.p(f"\n[{lab} ({logical}) — champs]")
                self._attributs(logical, MOTS_WO)
                self.p(f"[{lab} ({logical}) — liens]")
                self._relations(logical)
            if "sms" in n:
                self.p(f"\n[{lab} ({logical}) — champs]")
                self._attributs(logical, MOTS_SMS)
                self.p(f"[{lab} ({logical}) — liens]")
                self._relations(logical)

        e = g.cfg.email
        self.p("\n[Email]")
        t = g._get("templates", "Modèles", {"$select": "title", "$filter": f"title eq '{e.modele.replace(chr(39), chr(39) * 2)}'"}).get("value", [])
        self.p(f"    Modèle « {e.modele} » : {'trouvé' if len(t) == 1 else f'{len(t)} résultat(s)'}")
        q = g._get("queues", "Files", {"$select": "name", "$filter": f"name eq '{e.file_expediteur}'"}).get("value", [])
        self.p(f"    File « {e.file_expediteur} » : {'trouvée' if len(q) == 1 else f'{len(q)} résultat(s)'}")
        self.p("    Zones surlignées du modèle : visibles à l'étape Email de l'assistant (à reporter dans [email.remplacements]).")

        self.p("\n[Actions CRM pouvant servir au booking]")
        try:
            acts = g._get("workflows", "Actions", {"$select": "name,uniquename", "$filter": "category eq 3 and type eq 1"}).get("value", [])
            hits = [a for a in acts if any(m in _n(a.get("name", "") + " " + (a.get("uniquename") or "")) for m in MOTS_ACTIONS)]
            for a in hits:
                self.p(f"    {a.get('uniquename') or '':<40} « {a.get('name')} »")
            if not hits:
                self.p("    aucune action au nom évocateur : lancez `decouvrir --observer-booking`.")
        except Exception as ex:  # noqa: BLE001
            self.p(f"    liste non lisible ({ex})")
        return self.lignes
