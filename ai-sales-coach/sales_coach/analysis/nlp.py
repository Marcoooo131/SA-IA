"""Analyse linguistique française des conversations (heuristiques transparentes, sans modèle).

Toutes les détections reposent sur des motifs explicites et vérifiables : elles servent au moteur
d'analyse « règles », qui fonctionne hors ligne. Les motifs sont volontairement prudents ; un
moteur IA peut compléter l'analyse (voir analysis/llm_analyzer.py) mais ses constats sont vérifiés
contre la transcription.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass


def fold(text: str) -> str:
    """Minuscule, sans accents, apostrophes normalisées."""
    text = text.replace("’", "'").replace("`", "'").lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def has_any(text: str, patterns: list[str]) -> bool:
    f = fold(text)
    return any(re.search(p, f) for p in patterns)


def first_match(text: str, patterns: list[str]) -> str | None:
    f = fold(text)
    for p in patterns:
        if re.search(p, f):
            return p
    return None


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+(?:'[a-z0-9]+)?", fold(text))


_SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+")


def sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]


# --------------------------------------------------------------------------- questions

OPEN_STARTERS = [
    r"^(et )?(alors )?comment\b", r"^(et )?(alors )?pourquoi\b", r"^(et )?qu'est-ce qu(i|e|')", r"^(et )?que (pensez|souhaitez|voulez|recherchez|attendez|preferez|retenez|aimeriez)",
    r"^(et )?qu'(attendez|esperez|aimeriez|entendez|imaginez)", r"\bdans quelle mesure\b", r"^(et )?en quoi\b", r"^(et )?a quoi\b",
    r"^(et )?de quoi\b", r"\b(racontez|expliquez|decrivez|parlez)[- ]moi\b", r"\bdites[- ]m'en\b", r"^(et )?qu'est-ce qui",
    r"^(et )?quel(le)?s? (sont|est) (vos|votre|les|la|le) (attentes|besoins|raisons|priorites|criteres|projets?|contexte|situation|preoccupations|inquietudes|motivations?|raison)",
    r"^(et )?quel(le)?s? (raison|importance|place|souvenir|experience|usage)", r"\bqu'est-ce qui (vous|a|fait|motive|amene)",
    r"^(et )?ou en (etes|est)", r"^(et )?comment (ca|cela|se|vous|avez|voyez|imaginez)",
    r"^(et )?qu'en (pensez|dites)-vous", r"\bqu'est-ce que vous en (pensez|dites)\b",
    r"\b(puis-je|je peux|pouvez-vous|pourriez-vous) (vous demander|me dire|m'expliquer|me decrire|me raconter|m'en dire plus) (ce qu|comment|pourquoi|ce qui|quel|ou |quand|en quoi|a quoi|sur)",
]
WELCOME = [r"\b(que|comment|en quoi) (puis-je|je peux) (faire pour vous|vous aider|vous etre utile)\b", r"\bqu'est-ce que je peux faire pour vous\b"]
INFO_STARTERS = [
    r"^(et )?quel(le)?s? ", r"^(et )?(ou|quand|combien|a quelle date|a quel moment|depuis quand)\b",
    r"\bc'est (pour )?quand\b", r"\bvous (demenagez|partez|allez) (ou|quand)\b",
]
CLOSED_STARTERS = [
    r"^(et )?est-ce qu", r"^(et )?(avez|etes|voulez|souhaitez|pouvez|seriez|aimeriez|accepteriez|savez|connaissez|pensez|desirez|preferez)-vous\b",
    r"^(et )?(vous )?(avez|etes|voulez|souhaitez|pouvez|seriez|savez|connaissez|pensez|desirez|preferez|confirmez)\b",
    r"^(et )?(c'est|ca va|ca vous|il y a|y a-t-il|est-il|a-t-il|on|je peux|je vous)\b", r"^(et )?(d'accord|ok|oui|non)\s*\?",
    r"^(et )?(il|elle|ils|elles) (a|ont|est|sont)\b",
]
LEADING_NEGATIVE = [
    r"\bvous ne (voulez|souhaitez|desirez|pensez) (donc )?(pas|plus)\b", r"\bpas interesse", r"\bvous (voulez|souhaitez) (donc )?(resilier|arreter|annuler)\b",
    r"\bje (lance|procede a|fais|enregistre) (donc )?la resiliation\b.*\?", r"\bvous n'(avez|etes) (donc )?(pas|plus) (besoin|interesse)",
    r"\bc'est (donc )?(definitif|decide)\s*\?", r"\brien (a faire|ne vous fera)",
]
REFORMULATION_MARKERS = [
    r"\bsi je (comprends|resume) bien\b", r"\bsi j'ai bien compris\b", r"\bsi je vous suis bien\b", r"\bsi je resume\b",
    r"\bvous me dites (donc )?que\b", r"\bautrement dit\b", r"\ben resume\b", r"\bvous voulez dire que\b",
    r"\bsi je reformule\b", r"\bc'est bien (ca|cela)\b", r"\bje retiens que\b", r"\bdonc,? pour vous,?\b",
]


@dataclass
class Question:
    utterance_index: int
    text: str
    kind: str  # accueil | ouverte | information | fermée | fermée orientée négativement | reformulation


def classify_question(sentence: str) -> str:
    f = fold(sentence).strip(" «»\"'-")
    if any(re.search(p, f) for p in WELCOME):
        return "accueil"
    if any(re.search(p, f) for p in REFORMULATION_MARKERS):
        return "reformulation"
    if any(re.search(p, f) for p in LEADING_NEGATIVE):
        return "fermée orientée négativement"
    if any(re.search(p, f) for p in OPEN_STARTERS):
        return "ouverte"
    if any(re.search(p, f) for p in INFO_STARTERS):
        return "information"
    return "fermée"


def is_question(sentence: str) -> bool:
    s = sentence.strip()
    if s.endswith("?"):
        return True
    f = fold(s)
    return bool(re.search(r"\b(racontez|expliquez|decrivez|parlez)[- ]moi\b", f)) or bool(re.match(r"^(est-ce qu|qu'est-ce qu)", f))


def extract_questions(utterance_index: int, text: str) -> list[Question]:
    out = []
    for s in sentences(text):
        # Une phrase peut contenir plusieurs questions : « Vous partez où ? Quand ? »
        for part in re.split(r"(?<=\?)\s+", s):
            if is_question(part):
                out.append(Question(utterance_index, part.strip(), classify_question(part)))
    return out


# --------------------------------------------------------------------------- objections & signaux client

OBJECTIONS: dict[str, dict] = {
    "budget": {
        "label": "Budget / prix",
        "patterns": [r"\btrop cher", r"\bbudget\b", r"\b(plus |pas )?les moyens\b", r"\bpayer\b", r"\bargent\b", r"\bcout(e|ent)?\b",
                     r"\bprix\b", r"\beconomies?\b", r"\bfactures?\b", r"\bchomage\b", r"\bdepenses?\b", r"\bserrer la ceinture\b", r"\bmensualite"],
    },
    "deja_equipe": {
        "label": "Nouveau logement déjà équipé",
        "patterns": [r"\bdeja (une alarme|un systeme|equipe|installe|protege)", r"\by a deja (une alarme|un systeme|ce qu'il faut|tout ce qu'il faut|une installation)", r"\bdeja une alarme", r"\bsysteme (deja )?en place\b",
                     r"\b(alarme|systeme) (du|de l'ancien|des anciens) (proprietaire|occupant|locataire)"],
    },
    "plus_besoin": {
        "label": "Plus besoin d'alarme",
        "patterns": [r"\bplus besoin\b", r"\bpas besoin\b", r"\bne sert (a|à) rien\b", r"\binutile\b", r"\bjamais servi\b", r"\bplus d'alarme\b",
                     r"\bne (veux|veut|souhaite) plus (d'alarme|de systeme|d'abonnement)", r"\bpas (vraiment )?utile\b", r"\bpas necessaire\b"],
    },
    "insatisfaction": {
        "label": "Insatisfaction",
        "patterns": [r"\bpas (tres |vraiment )?satisfait", r"\bmecontent", r"\bdecu", r"\bfausses? (alertes?|alarmes?)\b", r"\bpanne", r"\bpas content",
                     r"\bjamais joignable\b", r"\bpersonne ne (repond|rappelle)\b", r"\bnul\b", r"\bcatastroph", r"\bscandal", r"\binadmissible\b", r"\bmarre\b"],
    },
    "resiliation": {
        "label": "Demande de résiliation",
        "patterns": [r"\bresili", r"\barreter (le|mon) (contrat|abonnement)\b", r"\bmettre fin\b", r"\bannuler (le|mon) (contrat|abonnement)\b", r"\bstopper\b",
                     r"\bmettre un terme\b", r"\bne plus (etre|rester) (client|abonne)"],
    },
    "definitif": {
        "label": "Décision présentée comme définitive",
        "patterns": [r"\bdefinitivement\b", r"\bc'est (tout )?decide\b", r"\bma decision est prise\b", r"\bquoi qu'il arrive\b", r"\bn'insistez pas\b",
                     r"\bpeu importe ce que vous\b", r"\bc'est non\b", r"\bje ne changerai pas d'avis\b"],
    },
    "presse": {
        "label": "Client pressé",
        "patterns": [r"\bpas le temps\b", r"\bje suis presse", r"\bfaites vite\b", r"\brapidement\b", r"\bdepech", r"\bj'ai (deux|cinq|2|5) minutes\b", r"\babreger\b", r"\ben vitesse\b"],
    },
    "reflexion": {
        "label": "Besoin de réflexion",
        "patterns": [r"\breflechir\b", r"\bje vais voir\b", r"\bje (vous )?rappel", r"\bpas (encore )?sur\b", r"\ben parler (a|avec)\b", r"\bje vais y reflechir\b"],
    },
    "effort": {
        "label": "Démarches / effort perçu",
        "patterns": [r"\btout refaire\b", r"\btrop complique", r"\btrop de demarches\b", r"\bpas envie de\b", r"\bgalere\b", r"\bprise de tete\b", r"\bpaperasse\b"],
    },
    "engagement": {
        "label": "Frais / engagement",
        "patterns": [r"\bengagement\b", r"\bfrais\b", r"\bpenalite", r"\bpreavis\b"],
    },
    "concurrence": {
        "label": "Concurrence",
        "patterns": [r"\bmoins cher ailleurs\b", r"\bautre (societe|entreprise|prestataire|operateur)\b", r"\bconcurren", r"\bune autre offre\b"],
    },
}

CLIENT_CUES: dict[str, dict] = {
    "securite": {"label": "Préoccupation de sécurité", "patterns": [r"\bcambriol", r"\bvol(s|e|eur)?\b", r"\binsecur", r"\bpeur\b", r"\bquartier\b", r"\bsquat", r"\bintrus"]},
    "famille": {"label": "Famille / personnes à protéger", "patterns": [r"\benfants?\b", r"\bbebe\b", r"\bfemme\b", r"\bmari\b", r"\bparents?\b", r"\bseule?\b", r"\bpersonne agee\b", r"\bfamille\b"]},
    "absence": {"label": "Absences / déplacements", "patterns": [r"\bvoyag", r"\bdeplacements?\b", r"\babsent", r"\bvacances\b", r"\bresidence secondaire\b"]},
    "temporaire": {"label": "Situation peut-être temporaire", "patterns": [r"\btemporaire", r"\bprovisoire", r"\ben attendant\b", r"\bquelques mois\b", r"\bpour l'instant\b", r"\bpour le moment\b"]},
    "satisfaction": {"label": "Satisfaction exprimée", "patterns": [r"\bsatisfait", r"\bcontent du service\b", r"\bjamais eu de (probleme|souci)\b", r"\bbien fonctionne\b", r"\brassur", r"\bon etait bien\b"]},
    "valeur": {"label": "Biens de valeur", "patterns": [r"\bobjets? de valeur\b", r"\bbijoux\b", r"\bmateriel\b", r"\boeuvres?\b", r"\bvoiture\b", r"\bgarage\b"]},
    "maison": {"label": "Type de logement mentionné", "patterns": [r"\bmaison\b", r"\bappartement\b", r"\brez-de-chaussee\b", r"\bplain-pied\b", r"\bjardin\b", r"\bpavillon\b"]},
}

# --------------------------------------------------------------------------- comportements du commercial

AGENT_BEHAVIOURS: dict[str, list[str]] = {
    "greeting": [r"\bbonjour\b", r"\bbonsoir\b", r"\ballo\b"],
    "presentation": [r"\bje m'appelle\b", r"\bje suis \w+ (de|du|chez)\b", r"\bsector alarm\b", r"\bservice (clients?|fidelisation|demenagement|retention)\b", r"\bici \w+\b"],
    "personal_check": [r"\bcomment allez-vous\b", r"\bvous allez bien\b", r"\bje vous remercie (de|d'avoir) (votre appel|appele|pris)\b", r"\bmerci (de|d'avoir) (votre appel|appele|pris le temps)\b", r"\bje suis ravie? de\b"],
    "agenda": [r"\bje vais vous poser\b", r"\bafin de (mieux )?(comprendre|vous accompagner|trouver)\b", r"\bpour (bien )?comprendre votre situation\b", r"\bquelques questions\b", r"\bje vais (prendre|regarder) (le temps|votre dossier|avec vous)\b"],
    "empathy": [r"\bje (vous )?comprends\b", r"\bc'est (tout a fait |bien )?(normal|comprehensible|legitime)\b", r"\bje suis (vraiment )?desole", r"\bnavre", r"\bfelicitations\b", r"\bbonne nouvelle\b",
                r"\bj'entends\b", r"\bje comprends (tout a fait|votre|parfaitement)\b", r"\bje mesure\b", r"\bje vous remercie de (me le dire|votre franchise)\b", r"\bc'est une (grande|belle) etape\b", r"\bje m'excuse\b", r"\bdesagreable\b"],
    "reformulation": REFORMULATION_MARKERS,
    "value": [r"\bsecurite\b", r"\bprotection\b", r"\bproteg", r"\btelesurveillance\b", r"\bintervention\b", r"\bcentre de (telesurveillance|surveillance)\b", r"\b24 ?h ?(/|sur) ?24\b",
              r"\btranquillite\b", r"\bserenite\b", r"\bdetecteurs?\b", r"\bagents? de securite\b", r"\bcambriol", r"\bvotre famille\b", r"\bvos proches\b", r"\blevee de doute\b", r"\breactivite\b", r"\bpartir l'esprit\b"],
    "proposal": [r"\btransfer", r"\b(demenager|deplacer|reinstaller) (votre|le|l')\s*(systeme|alarme|installation|equipement|contrat)", r"\bnouvelle adresse\b", r"\breprise\b", r"\bgarder (votre|le|l')",
                 r"\bconserver (votre|le|l')", r"\bje (peux|pourrais) vous proposer\b", r"\bje vous propose\b", r"\bsolution\b", r"\bsuspen", r"\brepreneur\b", r"\btransmettre (le|votre)\b",
                 r"\bnouveaux occupants\b", r"\bnouveau (contrat|logement) (chez nous|avec nous)\b", r"\bon (peut|pourrait) (installer|adapter|regarder)\b", r"\bqu'en pensez-vous\b", r"\bceder (le|votre)\b"],
    "acceptance": [r"\bje (lance|procede a|vais (proceder a|lancer|faire|enregistrer|prendre en compte)|fais|enregistre|prends en compte) (donc |tout de suite )?(la|votre) (demande de )?resiliation\b",
                   r"\bje (vais )?resilie", r"\bc'est note pour (la|votre) resiliation\b", r"\bje vous envoie (le formulaire|la procedure|le courrier) de resiliation\b",
                   r"\b(pas de (souci|probleme)|tres bien|d'accord|ok),? (je|on) (lance|resilie|procede|enregistre|cloture|ferme|arrete)", r"\bvotre (contrat|abonnement) (sera|est) (donc )?(resilie|cloture|arrete)\b",
                   r"\bje (cloture|ferme|arrete) (votre|le) (contrat|dossier|abonnement)\b"],
    "closing_recap": [r"\brecapitul", r"\bsi je resume\b", r"\ben resume\b", r"\bpour resumer\b", r"\bdonc nous (avons|convenons)\b", r"\bje vous confirme\b", r"\bnous avons convenu\b"],
    "next_step": [r"\bprochaine etape\b", r"\brendez-vous\b", r"\bje vous (envoie|adresse|rappelle|recontacte)\b", r"\bvous (allez )?recev(rez|oir)\b", r"\bun technicien\b", r"\bje (planifie|programme|bloque|reserve)\b",
                  r"\b(le|ce) (lundi|mardi|mercredi|jeudi|vendredi|samedi)\b", r"\bdate d'installation\b", r"\bje m'occupe de\b", r"\bje transmets\b", r"\bdans les \d+ (jours|heures)\b"],
    "commitment_check": [r"\bcela vous convient\b", r"\bca vous (convient|va)\b", r"\bon valide\b", r"\bvous etes d'accord\b", r"\bje peux (valider|enregistrer)\b", r"\bon part (la-dessus|sur)\b", r"\bqu'en pensez-vous\b"],
    "polite_close": [r"\bbonne (journee|soiree|fin de journee|continuation)\b", r"\bau revoir\b", r"\bmerci (pour|de) votre (confiance|temps|appel|fidelite)\b", r"\bbon demenagement\b"],
    "security_needs": [r"\bsecurite\b", r"\bquartier\b", r"\bcambriol", r"\brez-de-chaussee\b", r"\b(une )?maison ou (un )?appartement\b", r"\benfants?\b", r"\bvoisin", r"\bvous (vous )?absentez\b",
                       r"\bobjets? de valeur\b", r"\bjardin\b", r"\bgarage\b", r"\bproteger\b", r"\bse sentir en securite\b", r"\bvous sentir\b", r"\btranquille\b"],
    "move_reason": [r"\bpourquoi\b", r"\braison", r"\bqu'est-ce qui (vous )?(amene|motive|pousse)\b", r"\bou (est-ce que )?(vous )?(demenagez|partez|allez)\b", r"\bvous (demenagez|partez|allez) (ou|dans quelle)\b",
                    r"\bdans quelle (ville|region)\b", r"\bnouveau logement\b", r"\bnouvelle (maison|adresse|habitation)\b", r"\bprojet\b", r"\bqu'est-ce qui change\b", r"\bcontexte\b"],
    "move_timing": [r"\bquand\b", r"\bdate\b", r"\bquel (jour|mois)\b", r"\bdepuis quand\b", r"\ba quel moment\b", r"\bdans combien de temps\b"],
    "housing_status": [r"\bproprietaire\b", r"\blocataire\b", r"\blocation\b", r"\bachat\b", r"\bacquis\b", r"\bachete", r"\bmaison ou (un )?appartement\b", r"\btype de logement\b", r"\bsurface\b", r"\bpieces\b"],
    "pressure": [r"\bvous (etes|serez) oblige", r"\bvous n'avez pas le choix\b", r"\bc'est (comme ca|la procedure|le reglement)\b", r"\bje ne peux rien (faire|pour vous)\b", r"\bce n'est pas (possible|mon probleme)\b",
                 r"\bcalmez-vous\b", r"\bvous avez tort\b", r"\bvous devez\b", r"\bil faut que vous\b", r"\bvous auriez du\b", r"\bc'est votre probleme\b", r"\bvous ne comprenez pas\b"],
    "negative_words": [r"\bpas de (souci|probleme)\b", r"\bmalheureusement\b", r"\bje ne sais pas\b", r"\bje vais essayer\b", r"\bnormalement\b"],
    "filler": [r"\beuh+\b", r"\bdu coup\b", r"\ben fait\b", r"\bgenre\b", r"\bbah\b", r"\bben\b"],
}


def behaviour(text: str, key: str) -> bool:
    return has_any(text, AGENT_BEHAVIOURS[key])


def detect_categories(text: str, catalog: dict[str, dict]) -> list[str]:
    return [k for k, v in catalog.items() if has_any(text, v["patterns"])]


def talk_ratio(agent_texts: list[str], client_texts: list[str]) -> float:
    a = sum(len(words(t)) for t in agent_texts)
    c = sum(len(words(t)) for t in client_texts)
    return a / (a + c) if (a + c) else 0.0


def repeated_phrases(texts: list[str], n: int = 4, min_count: int = 3) -> list[tuple[str, int]]:
    """N-grammes (n mots) répétés au moins `min_count` fois — tics de langage, phrases récitées."""
    counter: Counter[str] = Counter()
    for t in texts:
        w = words(t)
        seen = set()
        for i in range(len(w) - n + 1):
            gram = " ".join(w[i:i + n])
            if gram not in seen:
                counter[gram] += 1
                seen.add(gram)
    stop = {"je vous remercie de", "est-ce que vous avez"}
    return [(g, c) for g, c in counter.most_common(10) if c >= min_count and g not in stop]


def filler_count(texts: list[str]) -> int:
    total = 0
    for t in texts:
        f = fold(t)
        total += sum(len(re.findall(p, f)) for p in AGENT_BEHAVIOURS["filler"])
    return total


_STOP_OVERLAP = set("le la les un une des de du et a au aux en dans pour par sur avec que qui quoi ce cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus est sont ai as avons avez ont suis es etes etait c'est j'ai oui non bien tres mais ou donc or ni car alors ca cela tout tous toute toutes si fait faire avoir etre comme aussi encore peu".split())


def shared_terms(a: str, b: str) -> int:
    """Nombre de mots significatifs (> 3 lettres) communs à `a` et `b`."""
    wa = {w for w in words(a) if len(w) > 3 and w not in _STOP_OVERLAP}
    wb = {w for w in words(b) if len(w) > 3 and w not in _STOP_OVERLAP}
    return len(wa & wb)


def lexical_overlap(a: str, b: str) -> float:
    """Part des mots significatifs de `b` repris dans `a` (personnalisation, reprise des mots du client)."""
    stop = set("le la les un une des de du et a au aux en dans pour par sur avec que qui quoi ce cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus est sont ai as avons avez ont suis es etes etait c'est j'ai oui non bien tres mais ou donc or ni car alors ca cela tout tous toute toutes si".split())
    wb = {w for w in words(b) if len(w) > 3 and w not in stop}
    if not wb:
        return 0.0
    wa = set(words(a))
    return len(wb & wa) / len(wb)
