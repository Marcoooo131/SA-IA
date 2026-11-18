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
    {"value": "au_plus_vite", "label": "Au plus vite", "icon": "zap"},
    {"value": "moins_3_mois", "label": "Dans les 3 mois", "icon": "calendar"},
    {"value": "trois_six_mois", "label": "Dans 3 à 6 mois", "icon": "calendar-range"},
    {"value": "plus_6_mois", "label": "Plus tard", "icon": "hourglass"},
    {"value": "je_me_renseigne", "label": "Je me renseigne", "icon": "lightbulb"},
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
                 {"value": "salle_de_bain", "label": "Salle de bain", "icon": "bath"},
                 {"value": "cuisine", "label": "Cuisine", "icon": "cooking-pot"},
                 {"value": "menuiseries", "label": "Fenêtres et portes", "icon": "app-window"},
                 {"value": "isolation", "label": "Isolation", "icon": "brick-wall"},
                 {"value": "autre", "label": "Autre projet", "icon": "wrench"}],
             "routes": [
                 {"when": {"field": "projet", "op": "eq", "value": "salle_de_bain"}, "goto": "sdb_travaux"},
                 {"when": {"field": "projet", "op": "eq", "value": "cuisine"}, "goto": "cuisine_travaux"},
                 {"when": {"field": "projet", "op": "eq", "value": "menuiseries"}, "goto": "menuiseries_type"},
                 {"when": {"field": "projet", "op": "eq", "value": "isolation"}, "goto": "isolation_type"}],
             "next": "autre_description"},
            {"id": "sdb_travaux", "type": "multi_choice", "title": "Quels travaux envisagez-vous ?",
             "help": "Plusieurs choix possibles.",
             "options": [
                 {"value": "renovation_complete", "label": "Rénovation complète", "icon": "sparkles"},
                 {"value": "douche_italienne", "label": "Douche à l'italienne", "icon": "shower-head"},
                 {"value": "baignoire", "label": "Baignoire", "icon": "bath"},
                 {"value": "meuble_vasque", "label": "Meuble vasque", "icon": "droplet"},
                 {"value": "carrelage", "label": "Carrelage / faïence", "icon": "grid-3x3"},
                 {"value": "accessibilite", "label": "Accessibilité / sécurité", "icon": "accessibility"}],
             "next": "surface"},
            {"id": "cuisine_travaux", "type": "single_choice", "title": "Quel type de projet cuisine ?",
             "options": [
                 {"value": "cuisine_complete", "label": "Cuisine neuve complète", "icon": "sparkles"},
                 {"value": "renovation_partielle", "label": "Rénovation partielle", "icon": "hammer"},
                 {"value": "pose_seule", "label": "Pose d'une cuisine déjà achetée", "icon": "package"}],
             "next": "surface"},
            {"id": "menuiseries_type", "type": "multi_choice", "title": "Que souhaitez-vous remplacer ou installer ?",
             "options": [
                 {"value": "fenetres", "label": "Fenêtres", "icon": "app-window"},
                 {"value": "porte_entree", "label": "Porte d'entrée", "icon": "door-open"},
                 {"value": "baie_vitree", "label": "Baie vitrée", "icon": "rectangle-horizontal"},
                 {"value": "volets", "label": "Volets", "icon": "blinds"}],
             "next": "menuiseries_nombre"},
            {"id": "menuiseries_nombre", "type": "number", "title": "Combien d'éléments au total ?",
             "min": 1, "max": 60, "unit": "élément(s)", "next": "logement"},
            {"id": "isolation_type", "type": "multi_choice", "title": "Quelles parties isoler ?",
             "options": [
                 {"value": "combles", "label": "Combles / toiture", "icon": "house"},
                 {"value": "murs_interieur", "label": "Murs par l'intérieur", "icon": "brick-wall"},
                 {"value": "murs_exterieur", "label": "Murs par l'extérieur", "icon": "fence"},
                 {"value": "planchers", "label": "Planchers", "icon": "layers"}],
             "next": "surface"},
            {"id": "autre_description", "type": "long_text", "title": "Décrivez votre projet en quelques mots",
             "placeholder": "Ex. : rénovation d'un séjour de 30 m²…", "next": "logement"},
            {"id": "surface", "type": "slider", "title": "Quelle est la surface approximative concernée ?",
             "min": 1, "max": 200, "step": 1, "unit": "m²", "next": "logement"},
            {"id": "logement", "type": "single_choice", "title": "Il s'agit…",
             "options": [
                 {"value": "maison", "label": "D'une maison", "icon": "house"},
                 {"value": "appartement", "label": "D'un appartement", "icon": "building-2"},
                 {"value": "local_pro", "label": "D'un local professionnel", "icon": "store"}],
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
                 {"value": "particulier", "label": "Votre logement", "icon": "house"},
                 {"value": "entreprise", "label": "Des locaux professionnels", "icon": "building-2"}],
             "next": "logement_depart"},
            {"id": "logement_depart", "type": "single_choice", "title": "Quel est le logement de départ ?",
             "options": [
                 {"value": "studio", "label": "Studio / T1", "icon": "bed-double"},
                 {"value": "t2", "label": "T2", "icon": "sofa"},
                 {"value": "t3", "label": "T3", "icon": "armchair"},
                 {"value": "t4_plus", "label": "T4 ou plus", "icon": "building"},
                 {"value": "maison", "label": "Maison", "icon": "house"}],
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
                 {"value": "meme_ville", "label": "Dans la même ville", "icon": "map-pin"},
                 {"value": "moins_100km", "label": "À moins de 100 km", "icon": "truck"},
                 {"value": "plus_100km", "label": "À plus de 100 km", "icon": "route"},
                 {"value": "international", "label": "À l'étranger", "icon": "globe"}],
             "next": "date_souhaitee"},
            {"id": "date_souhaitee", "type": "date", "title": "À quelle date souhaitez-vous déménager ?", "next": "flexibilite"},
            {"id": "flexibilite", "type": "single_choice", "title": "Cette date est-elle flexible ?",
             "options": [
                 {"value": "date_fixe", "label": "Date fixe", "icon": "pin"},
                 {"value": "plus_ou_moins_semaine", "label": "À une semaine près", "icon": "move-horizontal"},
                 {"value": "flexible", "label": "Très flexible", "icon": "leaf"}],
             "next": "prestations"},
            {"id": "prestations", "type": "multi_choice", "required": False,
             "title": "Avez-vous besoin de services complémentaires ?",
             "options": [
                 {"value": "emballage", "label": "Emballage des cartons", "icon": "package"},
                 {"value": "demontage", "label": "Démontage / remontage des meubles", "icon": "nut"},
                 {"value": "garde_meuble", "label": "Garde-meuble", "icon": "warehouse"},
                 {"value": "objets_lourds", "label": "Piano ou objets lourds", "icon": "piano"},
                 {"value": "nettoyage", "label": "Nettoyage", "icon": "spray-can"}],
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
                 {"value": "premier_rdv", "label": "Un premier rendez-vous", "icon": "hand"},
                 {"value": "devis", "label": "Une demande de devis", "icon": "notebook-pen"},
                 {"value": "suivi", "label": "Le suivi d'une demande en cours", "icon": "repeat"},
                 {"value": "autre", "label": "Autre", "icon": "message-circle"}],
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

GARAGE: dict[str, Any] = {
    "code": "garage",
    "label": "Garage et atelier automobile",
    "services": [
        {"key": "rdv_atelier", "name": "Rendez-vous atelier", "meeting_type": "at_location",
         "duration_min": 60, "min_notice_min": 240, "max_horizon_days": 30,
         "description": "Déposez votre véhicule à l'atelier à l'heure convenue."},
        {"key": "diagnostic", "name": "Diagnostic", "meeting_type": "at_location",
         "duration_min": 45, "min_notice_min": 120, "max_horizon_days": 21,
         "description": "Nous identifions l'origine du problème et vous remettons un devis."},
        {"key": "appel_conseil", "name": "Appel conseil", "meeting_type": "phone",
         "duration_min": 15, "min_notice_min": 60, "max_horizon_days": 14,
         "description": "Un échange rapide pour vous orienter avant de venir."},
    ],
    "flow": {
        "intro": "Bonjour ! Dites-nous ce dont votre véhicule a besoin, puis choisissez votre créneau.",
        "steps": [
            {"id": "besoin", "type": "single_choice", "title": "De quoi votre véhicule a-t-il besoin ?",
             "options": [
                 {"value": "entretien", "label": "Entretien / révision", "icon": "wrench"},
                 {"value": "panne", "label": "Panne ou bruit anormal", "icon": "circle-help"},
                 {"value": "pneus", "label": "Pneus", "icon": "car"},
                 {"value": "freins", "label": "Freins", "icon": "shield-check"},
                 {"value": "climatisation", "label": "Climatisation", "icon": "snowflake"},
                 {"value": "carrosserie", "label": "Carrosserie", "icon": "paint-roller"},
                 {"value": "controle_technique", "label": "Préparation au contrôle technique", "icon": "check"}],
             "routes": [{"when": {"field": "besoin", "op": "eq", "value": "panne"}, "goto": "symptomes"}],
             "next": "vehicule"},
            {"id": "symptomes", "type": "long_text", "title": "Décrivez ce que vous constatez",
             "placeholder": "Ex. : voyant moteur allumé, bruit en freinant, démarrage difficile…", "next": "roulant"},
            {"id": "roulant", "type": "yes_no", "title": "Le véhicule peut-il rouler jusqu'au garage ?",
             "help": "Si ce n'est pas le cas, nous vous rappelons pour organiser la suite.", "next": "vehicule"},
            {"id": "vehicule", "type": "text", "title": "Quel est votre véhicule ?",
             "placeholder": "Marque, modèle et année (ex. : Peugeot 208, 2019)", "next": "kilometrage"},
            {"id": "kilometrage", "type": "number", "required": False, "title": "Kilométrage approximatif",
             "min": 0, "max": 999999, "unit": "km", "next": "delai"},
            {"id": "delai", "type": "single_choice", "title": "Pour quand ?",
             "options": [
                 {"value": "au_plus_vite", "label": "Au plus vite", "icon": "zap"},
                 {"value": "cette_semaine", "label": "Cette semaine", "icon": "calendar"},
                 {"value": "flexible", "label": "Je suis flexible", "icon": "leaf"}],
             "next": "photos"},
            _photos(),
            PRECISIONS,
        ],
        "service_rules": [
            {"when": {"field": "roulant", "op": "eq", "value": False}, "service": "appel_conseil"},
            {"when": {"field": "besoin", "op": "eq", "value": "panne"}, "service": "diagnostic"},
            {"service": "rdv_atelier"},
        ],
    },
}

IMMOBILIER: dict[str, Any] = {
    "code": "immobilier",
    "label": "Agence immobilière",
    "services": [
        {"key": "estimation", "name": "Estimation sur place", "meeting_type": "on_site",
         "duration_min": 60, "buffer_after_min": 30, "min_notice_min": 1440, "max_horizon_days": 30,
         "description": "Un conseiller visite votre bien et vous remet une estimation argumentée."},
        {"key": "rdv_agence", "name": "Rendez-vous en agence", "meeting_type": "at_location",
         "duration_min": 45, "min_notice_min": 240, "max_horizon_days": 30,
         "description": "Un échange en agence pour préparer votre projet."},
        {"key": "appel_conseil", "name": "Appel avec un conseiller", "meeting_type": "phone",
         "duration_min": 20, "min_notice_min": 120, "max_horizon_days": 21,
         "description": "Un premier échange téléphonique."},
    ],
    "flow": {
        "intro": "Bonjour ! Quelques questions sur votre projet immobilier, puis choisissez votre rendez-vous.",
        "steps": [
            {"id": "projet", "type": "single_choice", "title": "Quel est votre projet ?",
             "options": [
                 {"value": "vendre", "label": "Vendre un bien", "icon": "euro"},
                 {"value": "mettre_en_location", "label": "Mettre un bien en location", "icon": "key-round"},
                 {"value": "acheter", "label": "Acheter", "icon": "house"},
                 {"value": "louer", "label": "Louer un logement", "icon": "building"}],
             "routes": [{"when": {"field": "projet", "op": "in", "value": ["acheter", "louer"]}, "goto": "recherche"}],
             "next": "type_bien"},
            {"id": "type_bien", "type": "single_choice", "title": "De quel type de bien s'agit-il ?",
             "options": [
                 {"value": "appartement", "label": "Appartement", "icon": "building-2"},
                 {"value": "maison", "label": "Maison", "icon": "house"},
                 {"value": "terrain", "label": "Terrain", "icon": "trees"},
                 {"value": "local", "label": "Local professionnel", "icon": "store"}],
             "next": "surface"},
            {"id": "surface", "type": "slider", "title": "Quelle est sa surface approximative ?",
             "min": 10, "max": 500, "step": 5, "unit": "m²", "next": "pieces"},
            {"id": "pieces", "type": "number", "required": False, "title": "Combien de pièces ?",
             "min": 1, "max": 20, "next": "delai"},
            {"id": "recherche", "type": "long_text", "title": "Décrivez le bien que vous recherchez",
             "placeholder": "Secteur, type de bien, surface, budget…", "next": "delai"},
            {"id": "delai", "type": "single_choice", "title": "Dans quel délai ?", "options": DELAI_OPTIONS,
             "next": "photos"},
            _photos(),
            PRECISIONS,
        ],
        "service_rules": [
            {"when": {"field": "delai", "op": "eq", "value": "je_me_renseigne"}, "service": "appel_conseil"},
            {"when": {"field": "projet", "op": "in", "value": ["vendre", "mettre_en_location"]}, "service": "estimation"},
            {"service": "rdv_agence"},
        ],
    },
}

TEMPLATES: dict[str, dict[str, Any]] = {t["code"]: t for t in (RENOVATION, DEMENAGEMENT, GARAGE, IMMOBILIER, GENERIQUE)}


def get_template(code: str) -> dict[str, Any]:
    return TEMPLATES.get(code, GENERIQUE)


def template_flow(code: str) -> FlowDefinition:
    return FlowDefinition.model_validate(get_template(code)["flow"])
