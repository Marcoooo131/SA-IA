"""Modèles métier prêts à l'emploi : prestations, parcours et horaires par défaut.

Le moteur est générique ; ces modèles servent de point de départ et restent entièrement
modifiables par l'entreprise. Aucun contenu commercial (avis, labels, prix) n'est inventé :
ces éléments sont saisis par l'entreprise elle-même.
"""
from __future__ import annotations

from typing import Any

from .schema import FlowDefinition

DEFAULT_HOURS = [  # (jour ISO, début, fin)
    *[(d, "08:30", "12:00") for d in range(1, 6)],
    *[(d, "13:30", "18:00") for d in range(1, 6)],
]

DELAI_OPTIONS = [
    {"value": "au_plus_vite", "label": "Au plus vite", "icon": "⚡"},
    {"value": "moins_3_mois", "label": "Dans les 3 mois", "icon": "📅"},
    {"value": "trois_six_mois", "label": "Dans 3 à 6 mois", "icon": "🗓️"},
    {"value": "plus_6_mois", "label": "Plus tard", "icon": "⏳"},
    {"value": "je_me_renseigne", "label": "Je me renseigne", "icon": "💡"},
]


def _photos(step_id: str = "photos") -> dict[str, Any]:
    return {
        "id": step_id, "type": "photos", "required": False, "max_files": 6,
        "title": "Avez-vous des photos ou des documents ?",
        "help": "Facultatif, mais très utile pour préparer le rendez-vous.",
        "next": "precisions",
    }


PRECISIONS = {
    "id": "precisions", "type": "long_text", "required": False,
    "title": "Souhaitez-vous ajouter une précision ?",
    "placeholder": "Accès, contraintes, questions…",
}

RENOVATION: dict[str, Any] = {
    "code": "renovation",
    "label": "Rénovation de l'habitat",
    "services": [
        {"key": "visite_technique", "name": "Visite technique et devis", "meeting_type": "on_site",
         "duration_min": 60, "buffer_after_min": 30, "min_notice_min": 1440, "max_horizon_days": 45,
         "description": "Nous venons chez vous pour étudier votre projet et établir un devis."},
        {"key": "appel_decouverte", "name": "Appel découverte", "meeting_type": "phone",
         "duration_min": 20, "min_notice_min": 120, "max_horizon_days": 30,
         "description": "Un premier échange téléphonique pour répondre à vos questions."},
    ],
    "flow": {
        "intro": "Bonjour ! Décrivez votre projet en quelques questions, puis choisissez votre rendez-vous.",
        "steps": [
            {"id": "projet", "type": "single_choice", "title": "Quel est votre projet ?",
             "options": [
                 {"value": "salle_de_bain", "label": "Salle de bain", "icon": "🛁"},
                 {"value": "cuisine", "label": "Cuisine", "icon": "🍳"},
                 {"value": "menuiseries", "label": "Fenêtres et portes", "icon": "🪟"},
                 {"value": "isolation", "label": "Isolation", "icon": "🧱"},
                 {"value": "autre", "label": "Autre projet", "icon": "🔧"}],
             "routes": [
                 {"when": {"field": "projet", "op": "eq", "value": "salle_de_bain"}, "goto": "sdb_travaux"},
                 {"when": {"field": "projet", "op": "eq", "value": "cuisine"}, "goto": "cuisine_travaux"},
                 {"when": {"field": "projet", "op": "eq", "value": "menuiseries"}, "goto": "menuiseries_type"},
                 {"when": {"field": "projet", "op": "eq", "value": "isolation"}, "goto": "isolation_type"}],
             "next": "autre_description"},
            {"id": "sdb_travaux", "type": "multi_choice", "title": "Quels travaux envisagez-vous ?",
             "help": "Plusieurs choix possibles.",
             "options": [
                 {"value": "renovation_complete", "label": "Rénovation complète", "icon": "✨"},
                 {"value": "douche_italienne", "label": "Douche à l'italienne", "icon": "🚿"},
                 {"value": "baignoire", "label": "Baignoire", "icon": "🛁"},
                 {"value": "meuble_vasque", "label": "Meuble vasque", "icon": "🪞"},
                 {"value": "carrelage", "label": "Carrelage / faïence", "icon": "🔲"},
                 {"value": "accessibilite", "label": "Accessibilité / sécurité", "icon": "♿"}],
             "next": "surface"},
            {"id": "cuisine_travaux", "type": "single_choice", "title": "Quel type de projet cuisine ?",
             "options": [
                 {"value": "cuisine_complete", "label": "Cuisine neuve complète", "icon": "✨"},
                 {"value": "renovation_partielle", "label": "Rénovation partielle", "icon": "🛠️"},
                 {"value": "pose_seule", "label": "Pose d'une cuisine déjà achetée", "icon": "📦"}],
             "next": "surface"},
            {"id": "menuiseries_type", "type": "multi_choice", "title": "Que souhaitez-vous remplacer ou installer ?",
             "options": [
                 {"value": "fenetres", "label": "Fenêtres", "icon": "🪟"},
                 {"value": "porte_entree", "label": "Porte d'entrée", "icon": "🚪"},
                 {"value": "baie_vitree", "label": "Baie vitrée", "icon": "🏞️"},
                 {"value": "volets", "label": "Volets", "icon": "🏠"}],
             "next": "menuiseries_nombre"},
            {"id": "menuiseries_nombre", "type": "number", "title": "Combien d'éléments au total ?",
             "min": 1, "max": 60, "unit": "élément(s)", "next": "logement"},
            {"id": "isolation_type", "type": "multi_choice", "title": "Quelles parties isoler ?",
             "options": [
                 {"value": "combles", "label": "Combles / toiture", "icon": "🏠"},
                 {"value": "murs_interieur", "label": "Murs par l'intérieur", "icon": "🧱"},
                 {"value": "murs_exterieur", "label": "Murs par l'extérieur", "icon": "🏡"},
                 {"value": "planchers", "label": "Planchers", "icon": "🟫"}],
             "next": "surface"},
            {"id": "autre_description", "type": "long_text", "title": "Décrivez votre projet en quelques mots",
             "placeholder": "Ex. : rénovation d'un séjour de 30 m²…", "next": "logement"},
            {"id": "surface", "type": "slider", "title": "Quelle est la surface approximative concernée ?",
             "min": 1, "max": 200, "step": 1, "unit": "m²", "next": "logement"},
            {"id": "logement", "type": "single_choice", "title": "Il s'agit…",
             "options": [
                 {"value": "maison", "label": "D'une maison", "icon": "🏡"},
                 {"value": "appartement", "label": "D'un appartement", "icon": "🏢"},
                 {"value": "local_pro", "label": "D'un local professionnel", "icon": "🏪"}],
             "next": "anciennete"},
            {"id": "anciennete", "type": "yes_no", "title": "Le bâtiment a-t-il plus de 2 ans ?",
             "help": "Cela peut changer le taux de TVA applicable aux travaux.", "next": "delai"},
            {"id": "delai", "type": "single_choice", "title": "Quand souhaitez-vous réaliser les travaux ?",
             "options": DELAI_OPTIONS, "next": "budget"},
            {"id": "budget", "type": "single_choice", "required": False,
             "title": "Avez-vous une enveloppe budgétaire en tête ?",
             "help": "Facultatif : cela nous aide à vous proposer des solutions adaptées.",
             "options": [
                 {"value": "moins_5k", "label": "Moins de 5 000 €"},
                 {"value": "de_5_a_15k", "label": "5 000 à 15 000 €"},
                 {"value": "de_15_a_30k", "label": "15 000 à 30 000 €"},
                 {"value": "plus_30k", "label": "Plus de 30 000 €"},
                 {"value": "ne_sait_pas", "label": "Je ne sais pas encore"}],
             "next": "photos"},
            _photos(),
            PRECISIONS,
        ],
        "service_rules": [
            {"when": {"field": "delai", "op": "eq", "value": "je_me_renseigne"}, "service": "appel_decouverte"},
            {"service": "visite_technique"},
        ],
    },
}

DEMENAGEMENT: dict[str, Any] = {
    "code": "demenagement",
    "label": "Déménagement",
    "services": [
        {"key": "visite_estimation", "name": "Visite d'estimation du volume", "meeting_type": "on_site",
         "duration_min": 45, "buffer_after_min": 30, "min_notice_min": 1440, "max_horizon_days": 45,
         "description": "Un conseiller évalue le volume à déménager et prépare votre devis."},
        {"key": "visio_estimation", "name": "Estimation en visio", "meeting_type": "video",
         "duration_min": 30, "min_notice_min": 240, "max_horizon_days": 30,
         "description": "Faites-nous visiter votre logement par vidéo depuis votre téléphone."},
    ],
    "flow": {
        "intro": "Bonjour ! Quelques questions sur votre déménagement, puis choisissez votre rendez-vous d'estimation.",
        "steps": [
            {"id": "client", "type": "single_choice", "title": "Vous déménagez…",
             "options": [
                 {"value": "particulier", "label": "Votre logement", "icon": "🏠"},
                 {"value": "entreprise", "label": "Des locaux professionnels", "icon": "🏢"}],
             "next": "logement_depart"},
            {"id": "logement_depart", "type": "single_choice", "title": "Quel est le logement de départ ?",
             "options": [
                 {"value": "studio", "label": "Studio / T1", "icon": "🛏️"},
                 {"value": "t2", "label": "T2", "icon": "🚪"},
                 {"value": "t3", "label": "T3", "icon": "🏠"},
                 {"value": "t4_plus", "label": "T4 ou plus", "icon": "🏘️"},
                 {"value": "maison", "label": "Maison", "icon": "🏡"}],
             "next": "surface"},
            {"id": "surface", "type": "slider", "title": "Quelle est la surface approximative ?",
             "min": 10, "max": 400, "step": 5, "unit": "m²", "next": "etage_depart"},
            {"id": "etage_depart", "type": "number", "title": "À quel étage se trouve le logement de départ ?",
             "help": "0 pour un rez-de-chaussée ou une maison de plain-pied.", "min": 0, "max": 40,
             "routes": [{"when": {"field": "etage_depart", "op": "gt", "value": 0}, "goto": "ascenseur_depart"}],
             "next": "distance"},
            {"id": "ascenseur_depart", "type": "yes_no", "title": "Y a-t-il un ascenseur au départ ?", "next": "distance"},
            {"id": "distance", "type": "single_choice", "title": "Où déménagez-vous ?",
             "options": [
                 {"value": "meme_ville", "label": "Dans la même ville", "icon": "📍"},
                 {"value": "moins_100km", "label": "À moins de 100 km", "icon": "🚚"},
                 {"value": "plus_100km", "label": "À plus de 100 km", "icon": "🛣️"},
                 {"value": "international", "label": "À l'étranger", "icon": "🌍"}],
             "next": "date_souhaitee"},
            {"id": "date_souhaitee", "type": "date", "title": "À quelle date souhaitez-vous déménager ?", "next": "flexibilite"},
            {"id": "flexibilite", "type": "single_choice", "title": "Cette date est-elle flexible ?",
             "options": [
                 {"value": "date_fixe", "label": "Date fixe", "icon": "📌"},
                 {"value": "plus_ou_moins_semaine", "label": "À une semaine près", "icon": "↔️"},
                 {"value": "flexible", "label": "Très flexible", "icon": "🌿"}],
             "next": "prestations"},
            {"id": "prestations", "type": "multi_choice", "required": False,
             "title": "Avez-vous besoin de services complémentaires ?",
             "options": [
                 {"value": "emballage", "label": "Emballage des cartons", "icon": "📦"},
                 {"value": "demontage", "label": "Démontage / remontage des meubles", "icon": "🔩"},
                 {"value": "garde_meuble", "label": "Garde-meuble", "icon": "🏬"},
                 {"value": "objets_lourds", "label": "Piano ou objets lourds", "icon": "🎹"},
                 {"value": "nettoyage", "label": "Nettoyage", "icon": "🧽"}],
             "next": "photos"},
            _photos(),
            PRECISIONS,
        ],
        "service_rules": [
            {"when": {"field": "logement_depart", "op": "in", "value": ["studio", "t2"]}, "service": "visio_estimation"},
            {"service": "visite_estimation"},
        ],
    },
}

GENERIQUE: dict[str, Any] = {
    "code": "generique",
    "label": "Autre activité",
    "services": [
        {"key": "rendez_vous", "name": "Premier rendez-vous", "meeting_type": "at_location",
         "duration_min": 45, "min_notice_min": 240, "max_horizon_days": 60,
         "description": "Un premier échange pour comprendre votre besoin."},
        {"key": "appel", "name": "Appel téléphonique", "meeting_type": "phone",
         "duration_min": 20, "min_notice_min": 120, "max_horizon_days": 30,
         "description": "Un échange rapide par téléphone."},
    ],
    "flow": {
        "intro": "Bonjour ! Je vais vous aider à organiser votre rendez-vous. Pour commencer, quel est votre besoin ?",
        "steps": [
            {"id": "besoin", "type": "single_choice", "title": "Quel est l'objet de votre demande ?",
             "options": [
                 {"value": "premier_rdv", "label": "Un premier rendez-vous", "icon": "👋"},
                 {"value": "devis", "label": "Une demande de devis", "icon": "📝"},
                 {"value": "suivi", "label": "Le suivi d'une demande en cours", "icon": "🔁"},
                 {"value": "autre", "label": "Autre", "icon": "💬"}],
             "next": "description"},
            {"id": "description", "type": "long_text", "title": "Décrivez votre besoin en quelques mots",
             "next": "delai"},
            {"id": "delai", "type": "single_choice", "title": "Dans quel délai ?", "options": DELAI_OPTIONS,
             "next": "photos"},
            _photos(),
            PRECISIONS,
        ],
        "service_rules": [
            {"when": {"field": "besoin", "op": "eq", "value": "suivi"}, "service": "appel"},
            {"service": "rendez_vous"},
        ],
    },
}

TEMPLATES: dict[str, dict[str, Any]] = {t["code"]: t for t in (RENOVATION, DEMENAGEMENT, GENERIQUE)}


def get_template(code: str) -> dict[str, Any]:
    return TEMPLATES.get(code, GENERIQUE)


def template_flow(code: str) -> FlowDefinition:
    return FlowDefinition.model_validate(get_template(code)["flow"])
