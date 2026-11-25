"""`decouvrir` : relève dans les métadonnées du CRM les noms techniques à reporter dans assistant.toml.
Lecture seule. Le rapport (decouverte.txt) ne contient que des noms de tables et de champs, aucune
donnée client."""

from __future__ import annotations

import unicodedata

from .crm import DataverseGateway

MOTS_CASE = ("moving", "move", "mover", "completed", "street", "postal", "city", "installation", "contract", "contrat",
             "case type", "category", "reason", "coverage", "interested")
MOTS_WO = ("duration", "durée", "duree", "minutes", "activity number", "type of work order", "template", "description", "timeband", "booked", "start date",
           "end date", "case", "account", "status", "mobile")
MOTS_SMS = ("text", "message", "body", "mobile", "phone", "number", "regarding", "status")
MOTS_TABLES = ("work order", "sms", "installation", "contract", "contrat", "work order product", "service code",
               "postcode", "postal code", "code postal", "activity template")
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
                             "Valeurs", {"$select": "LogicalName", "$expand": "OptionSet,GlobalOptionSet"})
        except Exception:  # noqa: BLE001
            try:
                m = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/Attributes(LogicalName='{attr}')/Microsoft.Dynamics.CRM.{cast}",
                                 "Valeurs", {"$select": "LogicalName", "$expand": "OptionSet"})
            except Exception:  # noqa: BLE001
                return
        os_ = m.get("OptionSet") or {}
        if not (os_.get("Options") or os_.get("TrueOption")):
            os_ = m.get("GlobalOptionSet") or os_
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
        tables = g._get("EntityDefinitions", "Tables", {"$select": "LogicalName,EntitySetName,DisplayName,IsActivity,PrimaryIdAttribute,PrimaryNameAttribute"}).get("value", [])
        trouves: dict[str, str] = {}
        for t in sorted(tables, key=lambda t: t["LogicalName"]):
            lab = _label(t)
            if any(m in _n(lab) for m in MOTS_TABLES):
                trouves[t["LogicalName"]] = lab
                self.p(f"    « {lab} » → entite = {t['LogicalName']}, entity_set = {t['EntitySetName']}, "
                       f"clé = {t.get('PrimaryIdAttribute')}, nom_attr = {t.get('PrimaryNameAttribute')}, activité = {t.get('IsActivity')}")

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
            if "work order product" in n or ("product" in n and "work order" in n):
                self.p(f"\n[{lab} ({logical}) — liens]  → produits_set, produit_wo_nav, produit_nav")
                self._relations(logical)
            if any(m in n for m in ("installation", "contract", "contrat")) and "work order" not in n:
                self.p(f"\n[{lab} ({logical}) — lien vers le compte]  → compte_attr")
                rows = g._get(f"EntityDefinitions(LogicalName='{logical}')/ManyToOneRelationships", "Liens",
                              {"$select": "ReferencingAttribute,ReferencedEntity"}).get("value", [])
                for r in rows:
                    if r["ReferencedEntity"] == "account":
                        self.p(f"    compte_attr = {r['ReferencingAttribute']}")
            if "sms" in n:
                self.p(f"\n[{lab} ({logical}) — champs]")
                self._attributs(logical, MOTS_SMS)
                self.p(f"[{lab} ({logical}) — liens]")
                self._relations(logical)

        self.p("\n[Compte (account) — téléphones]  → compte.champ_mobile")
        rows = g._get("EntityDefinitions(LogicalName='account')/Attributes", "Champs du compte",
                      {"$select": "LogicalName,DisplayName,AttributeType"}).get("value", [])
        for a in sorted(rows, key=lambda r: r["LogicalName"]):
            lab = _label(a)
            if a.get("AttributeType") == "String" and any(m in _n(lab) for m in ("phone", "mobile", "portable")):
                self.p(f"    {a['LogicalName']:<45} « {lab} »")

        for lien in g.cfg.sms.liens:
            try:
                g._par_nom(lien["set"], lien["nom_attr"], lien["nom"])
                self.p(f"    SMS : « {lien['nom']} » trouvé dans {lien['set']}")
            except Exception as ex:  # noqa: BLE001
                self.p(f"    SMS : {ex}")

        e = g.cfg.email
        self.p("\n[Email]")
        t = g._get("templates", "Modèles", {"$select": "title", "$filter": f"title eq '{e.modele.replace(chr(39), chr(39) * 2)}'"}).get("value", [])
        self.p(f"    Modèle « {e.modele} » : {'trouvé' if len(t) == 1 else f'{len(t)} résultat(s)'}")
        if len(t) != 1:
            proches = g._get("templates", "Modèles proches", {"$select": "title",
                             "$filter": "contains(title,'menagement') or contains(title,'Mover') or contains(title,'capitulatif')"}).get("value", [])
            for x in proches:
                self.p(f"    modèle proche : « {x.get('title')} »  → à recopier dans email.modele")
        q = g._get("queues", "Files", {"$select": "name", "$filter": f"name eq '{e.file_expediteur}'"}).get("value", [])
        self.p(f"    File « {e.file_expediteur} » : {'trouvée' if len(q) == 1 else f'{len(q)} résultat(s)'}")
        self.p("    Zones surlignées du modèle : visibles à l'étape Email de l'assistant (à reporter dans [email.remplacements]).")

        if g.cfg.work_order.packs:
            self.p("\n[Produits des packs] (identifiant → work_order.packs.produit_id)")
            for pk in g.cfg.work_order.packs:
                mot = max(pk.nom.split(), key=len) if pk.nom else ""
                rows = g._get("products", "Produits", {"$select": "name,productnumber",
                              "$filter": f"contains(name,'{mot.replace(chr(39), chr(39) * 2)}') and statecode eq 0", "$top": "15"}).get("value", [])
                self.p(f"    « {pk.nom} » :")
                for r in rows:
                    self.p(f"        {r.get('productid')}  « {r.get('name')} » ({r.get('productnumber') or ''})")
                if not rows:
                    self.p("        aucun produit trouvé avec ce mot")

        noms = [o.nom for o in g.cfg.work_order.options] or ["DOC", "DMP", "DF", "SAVE"]
        self.p("\n[Produits complémentaires] (identifiant → work_order.options.produit_id)")
        for nom in noms:
            rows = g._get("products", "Produits", {"$select": "name,productnumber,price",
                          "$filter": f"contains(name,'{nom.replace(chr(39), chr(39) * 2)}') and statecode eq 0", "$top": "15"}).get("value", [])
            self.p(f"    « {nom} » :")
            for r in rows:
                self.p(f"        {r.get('productid')}  « {r.get('name')} » ({r.get('productnumber') or ''})  prix = {r.get('price')}")
            if not rows:
                self.p("        aucun produit trouvé")
        self.p("\n[Produit — colonnes de prix]  → work_order.prix_attr / mensualite_attr")
        rows = g._get("EntityDefinitions(LogicalName='product')/Attributes", "Champs produit",
                      {"$select": "LogicalName,DisplayName,AttributeType"}).get("value", [])
        for a in sorted(rows, key=lambda r: r["LogicalName"]):
            if a.get("AttributeType") in ("Money", "Decimal") and not a["LogicalName"].endswith("_base"):
                self.p(f"    {a['LogicalName']:<45} {a.get('AttributeType', ''):<8} « {_label(a)} »")

        self.p("\n[SMS — services d'envoi et modèles]  → sms.liens (nom exact)")
        for ent, attr in (("sa_smsservices", "sa_name"), ("log_smstemplates", "log_name")):
            try:
                for r in g._get(ent, ent, {"$select": attr, "$filter": "statecode eq 0", "$top": "30"}).get("value", []):
                    self.p(f"    {ent:<18} « {r.get(attr)} »")
            except Exception as ex:  # noqa: BLE001
                self.p(f"    {ent} : non lisible ({ex})")

        self.p("\n[Opportunité (opportunity) — Sold Date, statut]  → [opportunite]")
        try:
            self._attributs("opportunity", ("sold", "vente", "vendu", "won", "gagn", "resolve", "statuscode", "qualif"))
        except Exception as ex:  # noqa: BLE001
            self.p(f"    non lisible ({ex})")
        self.p("\n[Processus « Resolve Opp Won »]  → opportunite.workflow (catégorie : 0 = workflow lançable, 1 = dialogue, 3 = action)")
        try:
            wfs = g._get("workflows", "Processus", {"$select": "name,category,ondemand,primaryentity",
                         "$filter": "type eq 1 and statecode eq 1"}).get("value", [])
            hits = [w for w in wfs if (w.get("primaryentity") == "opportunity" or "opp" in _n(w.get("name", "")))
                    and any(m in _n(w.get("name", "")) for m in ("resolve", "won", "win", "gagn", "qualif", "sold", "vente"))]
            for w in hits:
                self.p(f"    « {w.get('name')} »  catégorie {w.get('category')}  à la demande = {w.get('ondemand')}  ({w.get('primaryentity')})")
            if not hits:
                self.p("    aucun processus trouvé : methode = \"win\" (action standard) ou \"assiste\".")
        except Exception as ex:  # noqa: BLE001
            self.p(f"    liste non lisible ({ex})")

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


class Verification:
    """`verifier` : contrôle, dans les métadonnées du vrai CRM, chaque nom recopié dans assistant.toml.
    Lecture seule. Affiche ✅ / ❌ ligne par ligne, avec la section du fichier à corriger."""

    def __init__(self, gw: DataverseGateway):
        self.gw = gw
        self.lignes: list[str] = []
        self.erreurs = 0

    def p(self, ok: bool | None, quoi: str, detail: str = "") -> None:
        mark = {True: "OK  ", False: "NON ", None: "--  "}[ok]
        if ok is False:
            self.erreurs += 1
        s = f"  [{mark}] {quoi}" + (f" — {detail}" if detail else "")
        print(s)
        self.lignes.append(s)

    def titre(self, t: str) -> None:
        print("\n" + t)
        self.lignes.append("\n" + t)

    def _attrs(self, entite: str) -> set[str]:
        rows = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/Attributes", f"Champs de {entite}",
                            {"$select": "LogicalName"}).get("value", [])
        return {r["LogicalName"] for r in rows}

    def _navs(self, entite: str) -> dict[str, str]:
        rows = self.gw._get(f"EntityDefinitions(LogicalName='{entite}')/ManyToOneRelationships", f"Liens de {entite}",
                            {"$select": "ReferencedEntity,ReferencingEntityNavigationPropertyName"}).get("value", [])
        return {r["ReferencingEntityNavigationPropertyName"]: r["ReferencedEntity"] for r in rows}

    def _sets(self) -> dict[str, str]:
        rows = self.gw._get("EntityDefinitions", "Tables", {"$select": "LogicalName,EntitySetName"}).get("value", [])
        return {r["EntitySetName"]: r["LogicalName"] for r in rows}

    def _champ(self, attrs: set[str], section: str, cle: str, nom: str, requis: bool = True) -> None:
        if not nom:
            self.p(False if requis else None, f"{section}.{cle}", "vide" + (" (obligatoire)" if requis else " (facultatif)"))
        else:
            self.p(nom in attrs, f"{section}.{cle} = {nom}", "" if nom in attrs else "champ inexistant dans le CRM")

    def lancer(self) -> list[str]:
        cfg = self.gw.cfg
        self.titre("VÉRIFICATION DE assistant.toml (lecture seule)")
        sets = self._sets()

        self.titre("[case]")
        inc, navs = self._attrs("incident"), self._navs("incident")
        for k in cfg.case.REQUIS:
            self._champ(inc, "case.champs", k, cfg.case.champs.get(k, ""))
        for k in cfg.case.VALEURS_REQUISES:
            self.p(k in cfg.case.valeurs, f"case.valeurs.{k}", "" if k in cfg.case.valeurs else "vide (obligatoire)")
        for nom in cfg.case.fixes:
            self.p(nom in inc, f"case.fixes.{nom}", "" if nom in inc else "champ inexistant")
        for cle, lk in (("installation", cfg.case.installation), ("contrat", cfg.case.contrat), ("code_postal", cfg.case.code_postal)):
            if not lk.nav:
                self.p(False if cle == "installation" else None, f"case.{cle}.nav", "vide")
                continue
            self.p(lk.nav in navs, f"case.{cle}.nav = {lk.nav}", "" if lk.nav in navs else "lien inexistant sur le case")
            self.p(lk.set in sets, f"case.{cle}.set = {lk.set}", "" if lk.set in sets else "table inexistante")
            if lk.set in sets and lk.compte_attr:
                self._champ(self._attrs(sets[lk.set]), f"case.{cle}", "compte_attr", lk.compte_attr, requis=False)

        self.titre("[work_order]")
        w = cfg.work_order
        ok_set = sets.get(w.entity_set) == w.entite and bool(w.entite)
        self.p(ok_set, f"work_order.entite / entity_set = {w.entite} / {w.entity_set}", "" if ok_set else "ne correspondent pas à une table")
        if ok_set:
            wa = self._attrs(w.entite)
            for cle in ("case_attr", "numero", "description", "booked_start", "booked_end"):
                self._champ(wa, "work_order", cle, getattr(w, cle))
            for cle in ("compte_attr", "type_attr", "timeband", "date_debut_recherche", "date_fin_recherche", "statut_attr"):
                self._champ(wa, "work_order", cle, getattr(w, cle), requis=False)
            if w.template_nav:
                self.p(w.template_nav in self._navs(w.entite), f"work_order.template_nav = {w.template_nav}")
        o = cfg.opportunite
        if o.methode:
            self.titre("[opportunite]")
            self.p(o.methode in ("win", "workflow", "assiste"), f"opportunite.methode = {o.methode}")
            if o.date_vente_attr:
                self._champ(self._attrs("opportunity"), "opportunite", "date_vente_attr", o.date_vente_attr)
            if o.methode == "workflow":
                try:
                    self.gw._par_nom_workflow(o.workflow)
                    self.p(True, f"opportunite.workflow = {o.workflow}")
                except Exception as e:  # noqa: BLE001
                    self.p(False, f"opportunite.workflow = {o.workflow}", str(e))
        if w.produits_set:
            self.p(w.produits_set in sets, f"work_order.produits_set = {w.produits_set}")
        for pk in list(w.packs) + list(w.options):
            if pk.numero and not pk.produit_id:
                try:
                    self.gw.produit_par_numero(pk.numero)
                    self.p(True, f"produit « {pk.nom} » (n° {pk.numero})")
                except Exception as e:  # noqa: BLE001
                    self.p(False, f"produit « {pk.nom} » (n° {pk.numero})", str(e))
            elif pk.produit_id:
                try:
                    self.gw._get(f"products({pk.produit_id})", "Produit", {"$select": "name"})
                    self.p(True, f"pack « {pk.nom} »")
                except Exception:  # noqa: BLE001
                    self.p(False, f"pack « {pk.nom} »", "produit introuvable")
            else:
                self.p(None, f"pack « {pk.nom} »", "sans produit_id : l'agent ajoutera le produit à la main")

        self.titre("[sms]")
        s = cfg.sms
        ent = sets.get(s.entity_set)
        self.p(bool(ent), f"sms.entity_set = {s.entity_set}", "" if ent else "table inexistante")
        if ent:
            sa = self._attrs(ent)
            for cle in ("texte", "mobile", "sujet"):
                self._champ(sa, "sms", cle, getattr(s, cle))
            if s.regarding_nav:
                self.p(s.regarding_nav in self._navs(ent), f"sms.regarding_nav = {s.regarding_nav}")
            else:
                self.p(False, "sms.regarding_nav", "vide (obligatoire)")

        self.titre("[email]")
        e = cfg.email
        t = self.gw._get("templates", "Modèles", {"$select": "title", "$filter": f"title eq '{e.modele.replace(chr(39), chr(39) * 2)}'"}).get("value", [])
        self.p(len(t) == 1, f"email.modele « {e.modele} »", "" if len(t) == 1 else f"{len(t)} modèle(s) trouvé(s)")
        q = self.gw._get("queues", "Files", {"$select": "name", "$filter": f"name eq '{e.file_expediteur}'"}).get("value", [])
        self.p(len(q) == 1, f"email.file_expediteur « {e.file_expediteur} »")
        self.p(bool(e.remplacements) or None, "email.remplacements", f"{len(e.remplacements)} zone(s)" if e.remplacements
               else "vide : à remplir en mode Test, étape Email (zones encore surlignées)")

        self.titre(f"RÉSULTAT : {'tout est bon, le mode Supervisé peut être essayé sur un dossier de test.' if not self.erreurs else f'{self.erreurs} point(s) à corriger.'}")
        return self.lignes
