"""Étapes 7 et 8 : compléter le WO « WO – Mover » (template Mover M, description, produits)."""

from __future__ import annotations

from .config import Config
from .models import Blocage, Dossier

DESCRIPTION_DEFAUT = """Mover vendu par : {agent}
Ancien HWID : {hwid}
Système : SAS
Type de contrat : Home
Contacter TST pour reprise centrale si SAS
Documents : Contrat / Mandat SEPA / Cerfa (uniquement pour les particuliers)
Matériel : {materiel}
Complément d'installation : {complement}
Nouvelle adresse : {adresse}"""


def description(cfg: Config, dossier: Dossier, agent: str = "", hwid: str = "", materiel: str = "", complement: str = "") -> str:
    modele = cfg.work_order.description_modele or DESCRIPTION_DEFAUT
    return modele.format(agent=agent, hwid=hwid, materiel=materiel, complement=complement,
                         adresse=dossier.adresse.texte() if dossier.adresse else "")


def complement(cfg: Config, options: dict[str, int], prix: dict[str, tuple[str, str]]) -> str:
    parts = []
    for o in cfg.work_order.options:
        q = options.get(o.nom, 0)
        if q:
            p, m = prix.get(o.nom, ("", ""))
            tarif = " + ".join(x for x in (p, f"{m}/mois" if m else "") if x)
            parts.append(f"{q}x {o.nom}" + (f" ({tarif})" if tarif else ""))
    return ", ".join(parts)


def completer(gw, cfg: Config, dossier: Dossier, texte: str, packs_choisis: list[str], produits_verifies: bool,
              options: dict[str, int] | None = None) -> None:
    options = {k: int(v) for k, v in (options or {}).items() if int(v) > 0}
    connues = {o.nom: o for o in cfg.work_order.options}
    if any(k not in connues for k in options):
        raise Blocage("Produit complémentaire inconnu.", reprise=False)
    if any(v > 10 for v in options.values()):
        raise Blocage("Quantité trop élevée (10 maximum par produit).", reprise=False)
    if not texte.strip():
        raise Blocage("La description du WO est vide.", reprise=False)
    packs = {p.nom: p for p in cfg.work_order.packs if p.produit_id or not hasattr(gw, "corps_produit")}
    inconnus = [n for n in packs_choisis if n not in packs]
    if inconnus:
        raise Blocage("Pack inconnu : " + ", ".join(inconnus), reprise=False)
    if not packs_choisis and not options and not produits_verifies:
        raise Blocage("Aucun produit choisi.", action="Choisissez un pack, ou ajoutez les produits dans le CRM et cochez « Produits vérifiés ».",
                      reprise=False)
    gw.completer_wo(dossier.wo, texte)
    for n in packs_choisis:
        gw.ajouter_produit(dossier.wo, packs[n])
    for n, q in options.items():
        for _ in range(q):            # une ligne produit par unité, comme une saisie à la main
            gw.ajouter_produit(dossier.wo, connues[n])
    dossier.options = options
    dossier.wo = gw.lire_wo(dossier.wo.id)
    if dossier.wo.description.strip() != texte.strip():
        raise Blocage("La description relue dans le CRM ne correspond pas à celle envoyée.", action="Vérifiez la fiche du WO.")
