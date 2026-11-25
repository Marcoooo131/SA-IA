"""Passerelle vers le CRM : uniquement l'API Web officielle (celle qu'utilise l'interface du CRM),
avec la session de l'agent. Les tables standard (account, incident, email, queue, template) gardent
leurs noms Microsoft ; les tables et champs propres à Sector Alarm (Work Order, SMS, champs Movers)
viennent de la configuration, relevée avec `decouvrir`.

Chaque écriture est suivie d'une relecture. Toute réponse inattendue lève une erreur : le parcours
s'arrête au lieu de deviner.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time
from typing import Protocol
from zoneinfo import ZoneInfo

from .config import Config, Pack
from .models import Compte, CrmError, Creneau, NouvelleAdresse, Ref, SessionExpired, WorkOrder

PARIS = ZoneInfo("Europe/Paris")
ANNOT = 'odata.include-annotations="*"'
FMT = "@OData.Community.Display.V1.FormattedValue"
_GUID = re.compile(r"^[0-9a-fA-F-]{36}$")
_MOBILE = re.compile(r"^(?:0|\+33|0033)[67]\d{8}$")


class Gateway(Protocol):
    writes: int

    def whoami(self) -> str: ...
    def chercher_compte(self, numero: str) -> Compte: ...
    def creer_case(self, compte: Compte, installation_id: str, contrat_id: str, adresse: NouvelleAdresse) -> tuple[str, str]: ...
    def terminer_move_out(self, case_id: str) -> None: ...
    def wo_du_case(self, case_id: str) -> WorkOrder | None: ...
    def lire_wo(self, wo_id: str) -> WorkOrder: ...
    def completer_wo(self, wo: WorkOrder, description: str) -> None: ...
    def ajouter_produit(self, wo: WorkOrder, pack: Pack) -> None: ...
    def fenetre_booking(self, wo: WorkOrder, debut: date, fin: date) -> None: ...
    def creneaux(self, wo: WorkOrder) -> list[Creneau]: ...
    def reserver(self, wo: WorkOrder, creneau: Creneau) -> None: ...
    def sms_du_case(self, case_id: str, wo_id: str = "") -> list[str]: ...
    def envoyer_sms(self, case_id: str, mobile: str, texte: str) -> str: ...
    def preparer_email(self, case_id: str) -> tuple[str, str]: ...
    def envoyer_email(self, case_id: str, compte: Compte, sujet: str, html: str) -> str: ...
    def ouvrir_fiche(self, entite: str, record_id: str) -> None: ...
    def agent_nom(self) -> str: ...
    def composants_installation(self, installation_id: str) -> str: ...
    def prix_produit(self, produit_id: str) -> tuple[str, str]: ...
    def duree_wo(self, wo_id: str) -> str: ...


def _guid(v: str) -> str:
    if not _GUID.match(v or ""):
        raise CrmError(f"Identifiant invalide : {v!r}")
    return v.lower()


def _q(v: str) -> str:
    return v.replace("'", "''")


def _dt(v: str | None) -> datetime | None:
    if not v:
        return None
    return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(PARIS)


class DataverseGateway:
    def __init__(self, cfg: Config, transport):
        self.cfg = cfg
        self.t = transport
        self.writes = 0
        self._formats: dict[tuple[str, str], str] = {}

    def _valeur_date(self, entite: str, attr: str, d: date) -> str:
        """Date au format attendu par le champ : « 2026-12-08 » pour un champ date seule, sinon midi heure de Paris
        en UTC (évite tout décalage de jour). Le format est lu une fois dans les métadonnées (lecture seule)."""
        cle = (entite, attr)
        if cle not in self._formats:
            try:
                m = self._get(f"EntityDefinitions(LogicalName='{entite}')/Attributes(LogicalName='{attr}')"
                              "/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "Format de date",
                              {"$select": "Format,DateTimeBehavior"})
                beh = (m.get("DateTimeBehavior") or {}).get("Value", "")
                self._formats[cle] = "date" if beh == "DateOnly" else "datetime"
            except CrmError:
                self._formats[cle] = "datetime"
        if self._formats[cle] == "date":
            return d.isoformat()
        return datetime.combine(d, time(12, 0), PARIS).astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _code_postal(self, cp: str, ville: str) -> str:
        lk = self.cfg.case.code_postal
        champ = lk.nom_attr or "log_name"
        rows = self._get(lk.set, "Code postal", {"$filter": f"{champ} eq '{_q(cp)}'", "$top": "20"}).get("value", [])
        if not rows:
            raise CrmError(f"Code postal {cp} inconnu dans le CRM : vérifiez-le, ou saisissez l'adresse à la main.")
        if len(rows) > 1:
            villes = [r for r in rows if ville and ville.upper() in " ".join(str(v) for v in r.values() if isinstance(v, str)).upper()]
            if len(villes) == 1:
                rows = villes
            else:
                raise CrmError(f"Plusieurs fiches pour le code postal {cp} dans le CRM : choisissez-la à la main dans le case.")
        cle = lk.set[:-1] + "id" if lk.set.endswith("s") else ""
        rid = rows[0].get(cle) or next((v for k, v in rows[0].items() if k.endswith("id") and isinstance(v, str) and _GUID.match(v)), "")
        return _guid(rid)

    # ---------------------------------------------------------------- bas niveau
    def _err(self, r, quoi: str) -> CrmError:
        msg = ""
        if isinstance(r.body, dict):
            msg = (r.body.get("error") or {}).get("message", "")
        if r.status == 401:
            return SessionExpired(f"Session CRM expirée ({quoi}).", 401)
        return CrmError(f"{quoi} : HTTP {r.status}" + (f" — {msg[:200]}" if msg else ""), r.status)

    def _get(self, path: str, quoi: str, params: dict | None = None) -> dict:
        r = self.t.request("GET", path, params=params, headers={"Prefer": ANNOT})
        if r.status != 200:
            raise self._err(r, quoi)
        return r.body or {}

    def _post(self, path: str, body: dict, quoi: str, representation: bool = False) -> tuple[dict, str]:
        h = {"Prefer": "return=representation"} if representation else None
        r = self.t.request("POST", path, json=body, headers=h)
        if r.status not in (200, 201, 204):
            raise self._err(r, quoi)
        self.writes += 1
        new_id = ""
        loc = r.headers.get("odata-entityid", "")
        m = re.search(r"\(([0-9a-fA-F-]{36})\)\s*$", loc)
        if m:
            new_id = m.group(1).lower()
        return (r.body or {}), new_id

    def _patch(self, path: str, body: dict, quoi: str) -> None:
        r = self.t.request("PATCH", path, json=body, headers={"If-Match": "*"})
        if r.status not in (200, 204):
            raise self._err(r, quoi)
        self.writes += 1

    def whoami(self) -> str:
        return self._get("WhoAmI", "Identité").get("UserId", "")

    # ---------------------------------------------------------------- 1-3 compte
    def chercher_compte(self, numero: str) -> Compte:
        champ = self.cfg.compte_champ_numero
        mob = self.cfg.compte_champ_mobile
        cols = ["accountid", "name", champ, "telephone1", "telephone2", "telephone3", "emailaddress1", "address1_composite"]
        if mob and mob not in cols:
            cols.append(mob)
        rows = self._get("accounts", "Recherche du compte", {
            "$select": ",".join(cols),
            "$filter": f"{champ} eq '{_q(numero)}' and statecode eq 0",
            "$expand": "primarycontactid($select=contactid,fullname,mobilephone,emailaddress1)",
            "$top": "3"}).get("value", [])
        if not rows:
            raise CrmError(f"Aucun compte actif avec le numéro {numero}.")
        if len(rows) > 1:
            raise CrmError(f"Plusieurs comptes actifs avec le numéro {numero} : vérifiez dans le CRM.")
        a = rows[0]
        contact = a.get("primarycontactid") or {}
        mobiles = self._mobiles_du_compte(a, contact)
        c = Compte(id=a["accountid"].lower(), numero=a.get(champ, numero), nom=a.get("name", ""),
                   mobile=mobiles[0] if mobiles else "", mobiles=mobiles,
                   email=contact.get("emailaddress1") or a.get("emailaddress1") or "",
                   adresse=a.get("address1_composite") or "")
        c.installations = self._liste_liee(self.cfg.case.installation, c.id)
        c.contrats = self._liste_liee(self.cfg.case.contrat, c.id)
        for inst in c.installations:
            try:
                c.composants[inst.id] = self.composants_installation(inst.id)
            except CrmError:
                c.composants[inst.id] = ""
        cases = self._get("incidents", "Cases du compte", {
            "$select": "incidentid,title,ticketnumber",
            "$filter": f"_customerid_value eq {c.id} and statecode eq 0"}).get("value", [])
        c.cases_movers_ouverts = [Ref(x["incidentid"], f"{x.get('ticketnumber', '')} {x.get('title', '')}".strip())
                                  for x in cases if "mover" in (x.get("title") or "").lower()]
        w = self.cfg.work_order
        if w.compte_attr and w.entity_set:
            rows = self._get(w.entity_set, "Work Orders du compte", {
                "$select": f"{w.numero}", "$filter": f"_{w.compte_attr}_value eq {c.id} and statecode eq 0"}).get("value", [])
            c.wo_ouverts = [Ref("", x.get(w.numero, "")) for x in rows]
        return c

    def _mobiles_du_compte(self, a: dict, contact: dict) -> list[str]:
        """Tous les numéros en 06/07 de la fiche client, dans l'ordre : colonne imposée, colonnes dont le nom contient
        « mobile » (Mobile Phone, puis Mobile Phone 2…), contact principal, puis toute autre colonne texte du compte.
        La fiche complète est relue (lecture seule) car Sector Alarm range les mobiles dans ses propres colonnes."""
        mob = self.cfg.compte_champ_mobile
        complet = self._get(f"accounts({a['accountid']})", "Fiche du compte")
        texte = {k: v for k, v in complet.items() if isinstance(v, str) and "@" not in k}
        ordre = ([mob] if mob else []) + sorted((k for k in texte if "mobile" in k.lower()), key=lambda k: (len(k), k))
        valeurs = [texte.get(k) for k in ordre] + [contact.get("mobilephone")] + [texte[k] for k in sorted(texte) if k not in ordre]
        out: list[str] = []
        vus: set[str] = set()
        for v in valeurs:
            if not v:
                continue
            brut = re.sub(r"[\s.\-()]", "", v)
            norm = re.sub(r"^(\+33|0033)", "0", brut)
            if _MOBILE.match(brut) and norm not in vus:
                vus.add(norm)
                out.append(v.strip())
        return out

    def _liste_liee(self, lk, compte_id: str) -> list[Ref]:
        if not (lk.set and lk.compte_attr):
            return []
        cle = lk.set[:-1] + "id" if lk.set.endswith("s") else ""
        sel = ",".join(x for x in (lk.nom_attr,) if x)
        rows = self._get(lk.set, "Liste liée au compte", {
            **({"$select": sel} if sel else {}),
            "$filter": f"_{lk.compte_attr}_value eq {compte_id} and statecode eq 0"}).get("value", [])
        out = []
        for x in rows:
            rid = x.get(cle) or next((v for k, v in x.items() if k.endswith("id") and isinstance(v, str) and _GUID.match(v)), "")
            out.append(Ref(rid.lower(), x.get(lk.nom_attr, "") if lk.nom_attr else rid))
        return out

    # ---------------------------------------------------------------- 5-6 case
    def _cle(self, section: str, d: dict, cle: str):
        v = d.get(cle)
        if v in (None, ""):
            raise CrmError(f"Configuration : {section}.{cle} manquant (voir TUTORIEL.md, partie découverte).")
        return v

    def corps_case(self, compte, installation_id, contrat_id, adresse) -> dict:
        k = self.cfg.case
        body: dict = {"title": k.titre, f"{k.client_nav}@odata.bind": f"/accounts({_guid(compte.id)})"}
        if installation_id:
            if not k.installation.ok:
                raise CrmError("Configuration : case.installation (nav, set) manquant.")
            body[f"{k.installation.nav}@odata.bind"] = f"/{k.installation.set}({_guid(installation_id)})"
        if contrat_id and k.contrat.ok:
            body[f"{k.contrat.nav}@odata.bind"] = f"/{k.contrat.set}({_guid(contrat_id)})"
        c = lambda x: self._cle("case.champs", k.champs, x)  # noqa: E731
        v = lambda x: self._cle("case.valeurs", k.valeurs, x)  # noqa: E731
        body[c("moving_out_or_in")] = v("moving_out_or_in_out")
        body[c("moving_out_interested")] = v("interesse_oui")
        body[c("new_street")] = adresse.rue
        if k.code_postal.ok:
            body[f"{k.code_postal.nav}@odata.bind"] = f"/{k.code_postal.set}({self._code_postal(adresse.code_postal, adresse.ville)})"
        else:
            body[c("new_postcode")] = adresse.code_postal
        body[c("new_city")] = adresse.ville
        body[c("moving_out_date")] = self._valeur_date("incident", c("moving_out_date"), adresse.date_demenagement)
        body.update(k.fixes)
        return body

    def corps_move_out(self) -> dict:
        k = self.cfg.case
        return {self._cle("case.champs", k.champs, "completed_move_out"): self._cle("case.valeurs", k.valeurs, "oui")}

    def creer_case(self, compte, installation_id, contrat_id, adresse) -> tuple[str, str]:
        body = self.corps_case(compte, installation_id, contrat_id, adresse)
        data, new_id = self._post("incidents?$select=incidentid,ticketnumber", body, "Création du case", representation=True)
        case_id = (data.get("incidentid") or new_id or "").lower()
        if not case_id:
            raise CrmError("Case créé mais identifiant non renvoyé : vérifiez dans le CRM avant de recommencer.")
        lu = self._get(f"incidents({case_id})", "Relecture du case", {"$select": "ticketnumber,title"})
        return case_id, lu.get("ticketnumber", "")

    def terminer_move_out(self, case_id: str) -> None:
        self._patch(f"incidents({_guid(case_id)})", self.corps_move_out(), "Completed Move Out Info")

    # ---------------------------------------------------------------- 7-8 work order
    def _wo_select(self) -> str:
        w = self.cfg.work_order
        cols = [w.numero, w.description, w.booked_start, w.booked_end, w.statut_attr]
        if w.type_attr:
            cols.append(w.type_attr)
        return ",".join(c for c in cols if c)

    def _wo(self, row: dict) -> WorkOrder:
        w = self.cfg.work_order
        rid = next((v for k, v in row.items() if k == f"{w.entite}id" or k == "activityid"), "")
        return WorkOrder(id=str(rid).lower(), numero=row.get(w.numero, ""),
                         type_nom=row.get(f"{w.type_attr}{FMT}", "") if w.type_attr else "",
                         statut=row.get(f"{w.statut_attr}{FMT}", ""), description=row.get(w.description) or "",
                         debut=_dt(row.get(w.booked_start)), fin=_dt(row.get(w.booked_end)))

    def wo_du_case(self, case_id: str) -> WorkOrder | None:
        w = self.cfg.work_order
        flt = f"_{w.case_attr}_value eq {_guid(case_id)}"
        if w.type_attr and w.type_installation is not None:
            flt += f" and {w.type_attr} eq {w.type_installation}"
        rows = self._get(w.entity_set, "Work Order du case", {"$select": self._wo_select(), "$filter": flt}).get("value", [])
        if len(rows) > 1:
            raise CrmError("Plusieurs Work Orders Installation sur ce case : à vérifier dans le CRM.")
        return self._wo(rows[0]) if rows else None

    def lire_wo(self, wo_id: str) -> WorkOrder:
        w = self.cfg.work_order
        return self._wo(self._get(f"{w.entity_set}({_guid(wo_id)})", "Relecture du WO", {"$select": self._wo_select()}))

    def _wo_path(self, wo_id: str) -> str:
        w = self.cfg.work_order
        if not w.entity_set:
            raise CrmError("Configuration : work_order.entity_set manquant.")
        return f"{w.entity_set}({wo_id if wo_id.startswith('sim-') else _guid(wo_id)})"

    def corps_wo(self, wo_id: str, description: str) -> tuple[str, dict]:
        w = self.cfg.work_order
        if not w.description:
            raise CrmError("Configuration : work_order.description manquant.")
        body: dict = {w.description: description}
        if w.template_nav and w.template_set and w.template_mover_m_id:
            body[f"{w.template_nav}@odata.bind"] = f"/{w.template_set}({_guid(w.template_mover_m_id)})"
        return self._wo_path(wo_id), body

    def corps_produit(self, wo_id: str, pack) -> tuple[str, dict]:
        w = self.cfg.work_order
        nav = pack.nav or w.produit_nav
        if not (w.produits_set and w.produit_wo_nav and nav and pack.produit_id):
            raise CrmError("Configuration : ajout de produit incomplet (work_order.produits_set / produit_wo_nav / produit_nav / packs.produit_id).")
        return w.produits_set, {f"{w.produit_wo_nav}@odata.bind": "/" + self._wo_path(wo_id),
                                f"{nav}@odata.bind": f"/products({_guid(pack.produit_id)})"}

    def completer_wo(self, wo, description) -> None:
        path, body = self.corps_wo(wo.id, description)
        self._patch(path, body, "Mise à jour du WO")

    def ajouter_produit(self, wo, pack) -> None:
        path, body = self.corps_produit(wo.id, pack)
        self._post(path, body, "Ajout du produit")

    # ---------------------------------------------------------------- 9-11 booking
    def corps_fenetre(self, wo_id: str, debut, fin) -> tuple[str, dict]:
        w = self.cfg.work_order
        body: dict = {}
        if w.timeband and w.timeband_valeur is not None:
            body[w.timeband] = w.timeband_valeur
        if w.date_debut_recherche:
            body[w.date_debut_recherche] = self._valeur_date(w.entite, w.date_debut_recherche, debut)
        if w.date_fin_recherche:
            body[w.date_fin_recherche] = self._valeur_date(w.entite, w.date_fin_recherche, fin)
        return self._wo_path(wo_id), body

    def fenetre_booking(self, wo, debut, fin) -> None:
        path, body = self.corps_fenetre(wo.id, debut, fin)
        if body:
            self._patch(path, body, "Période de recherche du booking")

    def creneaux(self, wo) -> list[Creneau]:
        raise CrmError("Récupération directe des créneaux pas encore branchée : elle dépend de l'action CRM derrière "
                       "« Get appointments », à relever avec `decouvrir --observer-booking`. Utilisez booking.methode = \"assiste\".")

    def reserver(self, wo, creneau) -> None:
        raise CrmError("Réservation directe pas encore branchée (voir `decouvrir --observer-booking`).")

    # ---------------------------------------------------------------- 12 SMS
    def sms_du_case(self, case_id: str, wo_id: str = "") -> list[str]:
        s = self.cfg.sms
        flt = [f"_regardingobjectid_value eq {_guid(case_id)}"]
        if wo_id and not wo_id.startswith("sim-"):
            flt.append(f"_regardingobjectid_value eq {_guid(wo_id)}")
            if s.wo_attr:
                flt.append(f"_{s.wo_attr}_value eq {_guid(wo_id)}")
        rows = self._get(s.entity_set, "SMS du case et du WO", {
            "$select": f"{s.texte},createdon", "$filter": " or ".join(flt),
            "$orderby": "createdon desc", "$top": "10"}).get("value", [])
        return [r.get(s.texte) or "" for r in rows]

    def corps_sms(self, case_id: str, mobile: str, texte: str) -> tuple[str, dict]:
        s = self.cfg.sms
        manque = s.manquants()
        if manque:
            raise CrmError("Configuration : " + ", ".join(manque) + " manquant.")
        cible = case_id if case_id.startswith("sim-") else _guid(case_id)
        corps = {s.texte: texte, s.mobile: mobile, s.sujet: "Confirmation rendez-vous Movers",
                 f"{s.regarding_nav}@odata.bind": f"/incidents({cible})"}
        for lien in s.liens:
            corps[f"{lien['nav']}@odata.bind"] = f"/{lien['set']}({self._par_nom(lien['set'], lien['nom_attr'], lien['nom'])})"
        return s.entity_set, corps

    def _par_nom(self, entity_set: str, nom_attr: str, nom: str) -> str:
        """Identifiant d'une fiche active retrouvée par son nom exact (lecture seule, gardé pour la session)."""
        cle = ("nom", entity_set, nom)
        if cle not in self._formats:
            rows = self._get(entity_set, f"Fiche « {nom} »", {"$filter": f"{nom_attr} eq '{_q(nom)}' and statecode eq 0", "$top": "2"}).get("value", [])
            if not rows:   # nom approchant, sinon la seule fiche active de la table
                actives = self._get(entity_set, f"Fiches de {entity_set}", {"$select": nom_attr, "$filter": "statecode eq 0", "$top": "50"}).get("value", [])
                proches = [r for r in actives if nom.lower() in (r.get(nom_attr) or "").lower()]
                rows = proches if len(proches) == 1 else (actives if len(actives) == 1 else [])
                if not rows:
                    noms = ", ".join(f"« {r.get(nom_attr)} »" for r in actives[:10]) or "aucune fiche active"
                    raise CrmError(f"« {nom} » introuvable dans {entity_set} (fiches actives : {noms}) : corrigez sms.liens.")
            if len(rows) != 1:
                raise CrmError(f"« {nom} » en double dans {entity_set} : vérifiez sms.liens.")
            pk = entity_set[:-1] + "id" if entity_set.endswith("s") else ""
            rid = rows[0].get(pk) or next((v for k, v in rows[0].items() if k.endswith("id") and isinstance(v, str) and _GUID.match(v)), "")
            self._formats[cle] = _guid(rid)
        return self._formats[cle]

    def envoyer_sms(self, case_id, mobile, texte) -> str:
        s = self.cfg.sms
        path, body = self.corps_sms(case_id, mobile, texte)
        _, new_id = self._post(path, body, "Création du SMS")
        if not new_id:
            raise CrmError("SMS créé mais identifiant non renvoyé : vérifiez les activités du case.")
        if s.envoi:
            self._patch(f"{s.entity_set}({new_id})", dict(s.envoi), "Déclenchement de l'envoi du SMS")
        lu = self._get(f"{s.entity_set}({new_id})", "Relecture du SMS", {"$select": "statuscode"})
        return lu.get(f"statuscode{FMT}", "créé")

    # ---------------------------------------------------------------- 13 email
    def preparer_email(self, case_id: str) -> tuple[str, str]:
        e = self.cfg.email
        t = self._get("templates", "Modèle d'email", {"$select": "templateid,title",
                                                     "$filter": f"title eq '{_q(e.modele)}'"}).get("value", [])
        if len(t) != 1:
            raise CrmError(f"Modèle d'email « {e.modele} » introuvable (ou en double).")
        r = self.t.request("POST", "InstantiateTemplate", json={
            "TemplateId": t[0]["templateid"], "ObjectType": "incident", "ObjectId": _guid(case_id)})
        if r.status != 200 or not (r.body or {}).get("value"):
            raise self._err(r, "Préparation de l'email depuis le modèle")
        v = r.body["value"][0]
        return v.get("subject", ""), v.get("description", "")

    def file_expediteur(self) -> str:
        e = self.cfg.email
        q = self._get("queues", "File expéditrice", {"$select": "queueid", "$filter": f"name eq '{_q(e.file_expediteur)}'"}).get("value", [])
        if len(q) != 1:
            raise CrmError(f"File « {e.file_expediteur} » introuvable.")
        return q[0]["queueid"]

    def corps_email(self, case_id: str, compte, sujet: str, html: str, queue_id: str) -> dict:
        cible = case_id if case_id.startswith("sim-") else _guid(case_id)
        return {"subject": sujet, "description": html,
                "regardingobjectid_incident@odata.bind": f"/incidents({cible})",
                "email_activity_parties": [
                    {"partyid_queue@odata.bind": f"/queues({queue_id})", "participationtypemask": 1},
                    {"partyid_account@odata.bind": f"/accounts({_guid(compte.id)})", "participationtypemask": 2}]}

    def envoyer_email(self, case_id, compte, sujet, html) -> str:
        body = self.corps_email(case_id, compte, sujet, html, self.file_expediteur())
        _, email_id = self._post("emails", body, "Création de l'email")
        if not email_id:
            raise CrmError("Email créé mais identifiant non renvoyé : vérifiez les activités du case.")
        r = self.t.request("POST", f"emails({email_id})/Microsoft.Dynamics.CRM.SendEmail", json={"IssueSend": True})
        if r.status not in (200, 204):
            raise self._err(r, "Envoi de l'email")
        self.writes += 1
        lu = self._get(f"emails({email_id})", "Relecture de l'email", {"$select": "statuscode"})
        return lu.get(f"statuscode{FMT}", "")

    def ouvrir_fiche(self, entite: str, record_id: str) -> None:
        self.t.ouvrir_fiche(entite, _guid(record_id))

    # ---------------------------------------------------------------- lectures d'aide (description, email)
    def agent_nom(self) -> str:
        uid = self.whoami()
        if not uid:
            return ""
        return self._get(f"systemusers({_guid(uid)})", "Utilisateur connecté", {"$select": "fullname"}).get("fullname", "")

    def composants_installation(self, installation_id: str) -> str:
        """Matériel posé sur l'installation (table des composants), regroupé : « 2x Sirène intérieure, 1x DOC »."""
        k = self.cfg.case
        cle = ("composants", k.composants_entite)
        if cle not in self._formats:
            rels = self._get(f"EntityDefinitions(LogicalName='{k.composants_entite}')/ManyToOneRelationships", "Liens des composants",
                             {"$select": "ReferencingAttribute,ReferencedEntity"}).get("value", [])
            inst = next((r["ReferencingAttribute"] for r in rels if r["ReferencedEntity"] == k.installation.set[:-1]), "")
            prod = next((r["ReferencingAttribute"] for r in rels if r["ReferencedEntity"] == "product"), "")
            self._formats[cle] = f"{inst}|{prod}"
        inst, prod = self._formats[cle].split("|")
        if not inst:
            raise CrmError("Lien composant → installation introuvable.")
        rows = self._get(k.composants_set, "Composants de l'installation",
                         {"$filter": f"_{inst}_value eq {_guid(installation_id)} and statecode eq 0"}).get("value", [])
        compte: dict[str, float] = {}
        for r in rows:
            nom = (r.get(f"_{prod}_value{FMT}") if prod else "") or r.get("log_name") or ""
            qte = next((v for kk, v in r.items() if "quantit" in kk.lower() and isinstance(v, (int, float)) and "@" not in kk), 1) or 1
            if nom:
                compte[nom] = compte.get(nom, 0) + qte
        return ", ".join(f"{int(q) if float(q).is_integer() else q}x {n}" for n, q in compte.items())

    def prix_produit(self, produit_id: str) -> tuple[str, str]:
        w = self.cfg.work_order
        cols = [c for c in (w.prix_attr, w.mensualite_attr) if c]
        if not cols:
            return "", ""
        r = self._get(f"products({_guid(produit_id)})", "Prix du produit", {"$select": ",".join(cols)})
        f = lambda c: (r.get(f"{c}{FMT}") or (f"{r[c]:.2f} €".replace(".", ",") if isinstance(r.get(c), (int, float)) else "")) if c else ""  # noqa: E731
        return f(w.prix_attr), f(w.mensualite_attr)

    def duree_wo(self, wo_id: str) -> str:
        """Durée d'intervention portée par le WO (colonne configurée, sinon première colonne « durée » renseignée)."""
        w = self.cfg.work_order
        r = self._get(self._wo_path(wo_id), "Durée du WO")
        cles = [w.duree_attr] if w.duree_attr else [kk for kk in r if re.search(r"dur(ation|ee)", kk.lower()) and "@" not in kk]
        for kk in cles:
            v = r.get(kk)
            if isinstance(v, (int, float)) and v > 0:
                return str(int(v))
        return ""
