"""Playbook « rétention déménagement » : situations, points à explorer, pistes commerciales.

RÈGLE ABSOLUE : ce module ne contient AUCUN tarif, AUCUNE offre chiffrée, AUCUNE condition
contractuelle ni possibilité de transfert présentée comme acquise. Les pistes commerciales sont des
*types* de solutions à vérifier dans la documentation métier de l'entreprise (base RAG « entreprise »).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sales_coach.analysis.nlp import has_any


@dataclass
class CheckItem:
    id: str
    label: str
    agent_patterns: list[str]
    question: str


@dataclass
class Situation:
    key: str
    label: str
    client_patterns: list[str]
    checklist: list[CheckItem]
    pistes: list[str]  # types de solutions à VÉRIFIER dans la doc métier
    kb_query: str
    reasoning: str
    exclusive_of: list[str] = field(default_factory=list)


SITUATIONS: list[Situation] = [
    Situation(
        key="demenagement",
        label="Le client quitte son logement",
        client_patterns=[r"\bdemenag", r"\bquitt(e|er|ons) (le|mon|notre|l')\s*(logement|appartement|maison)", r"\bnouveau logement\b", r"\bnouvelle (maison|adresse)\b", r"\bon part\b", r"\bje pars\b"],
        checklist=[
            CheckItem("raison", "Raison du déménagement", [r"\bpourquoi\b", r"\braison", r"\bqu'est-ce qui (vous )?(amene|motive|pousse)\b", r"\bprojet\b", r"\bcontexte\b"],
                      "Qu'est-ce qui motive ce déménagement ?"),
            CheckItem("destination", "Destination / nouveau logement", [r"\bou (est-ce que )?(vous )?(demenagez|partez|allez)\b", r"\bnouveau logement\b", r"\bnouvelle (maison|adresse|habitation)\b", r"\bdans quelle (ville|region)\b", r"\bvous (demenagez|partez|allez) ou\b"],
                      "Parlez-moi de votre futur logement : où se situe-t-il et à quoi ressemble-t-il ?"),
            CheckItem("date", "Date du déménagement", [r"\bquand\b", r"\bdate\b", r"\bquel (jour|mois)\b", r"\ba quel moment\b"],
                      "À quelle date est prévu le déménagement ?"),
            CheckItem("statut", "Statut (propriétaire / locataire)", [r"\bproprietaire\b", r"\blocataire\b", r"\blocation\b", r"\bachat\b", r"\bachete"],
                      "Vous serez propriétaire ou locataire de ce nouveau logement ?"),
            CheckItem("besoins_securite", "Besoins de sécurité dans le nouveau logement", [r"\bsecurite\b", r"\bquartier\b", r"\bcambriol", r"\bproteger\b", r"\bvous sentir\b", r"\btranquill", r"\brez-de-chaussee\b"],
                      "Qu'est-ce qui sera important pour vous en matière de sécurité dans ce nouveau logement ?"),
            CheckItem("satisfaction", "Satisfaction vis-à-vis du service actuel", [r"\bsatisfait", r"\bcontent\b", r"\bvotre experience\b", r"\bcomment (ca|cela) s'est passe\b", r"\bqu'avez-vous pense\b", r"\bque retenez-vous\b", r"\bavis sur\b"],
                      "Comment s'est passée votre expérience avec votre alarme jusqu'ici ?"),
        ],
        pistes=["Continuité du service à la nouvelle adresse (transfert / réinstallation) — selon conditions documentées",
                "Reprise du contrat par le repreneur du logement actuel — selon procédure documentée"],
        kb_query="déménagement transfert installation nouvelle adresse procédure",
        reasoning="Un déménagement n'est pas en soi une raison de résilier : c'est un moment de vie où le besoin de protection peut se reposer, voire augmenter.",
    ),
    Situation(
        key="proprietaire",
        label="Le client devient propriétaire",
        client_patterns=[r"\b(on a|j'ai|nous avons|on vient d') ?achete", r"\bdevenir proprietaire", r"\bdevenons proprietaires?\b", r"\bnotre (propre )?maison\b", r"\bacquisition\b", r"\bon (a|vient de) signer\b"],
        checklist=[
            CheckItem("felicitations", "Valorisation du projet (félicitations)", [r"\bfelicitations\b", r"\bbelle (etape|nouvelle)\b", r"\bbonne nouvelle\b", r"\bgrand projet\b"],
                      "Félicitations pour cet achat ! Comment se présente ce nouveau chez-vous ?"),
            CheckItem("type_bien", "Type et configuration du bien", [r"\bmaison\b", r"\bappartement\b", r"\bpieces\b", r"\bjardin\b", r"\bgarage\b", r"\bplain-pied\b", r"\betages?\b"],
                      "Comment est configuré le logement (maison, étages, accès, jardin, garage) ?"),
            CheckItem("enjeux", "Enjeux d'un propriétaire (patrimoine, assurance)", [r"\bpatrimoine\b", r"\bassur", r"\binvestissement\b", r"\bvaleur\b", r"\btravaux\b"],
                      "Maintenant que vous êtes propriétaire, qu'est-ce qui compte le plus pour vous dans la protection de ce bien ?"),
        ],
        pistes=["Installation adaptée au nouveau bien — selon offres documentées", "Prise en compte d'éventuelles exigences d'assurance — sans affirmer de remise"],
        kb_query="nouveau propriétaire installation maison offre",
        reasoning="Devenir propriétaire augmente généralement l'attachement au bien protégé : c'est une opportunité de valoriser la protection, pas un motif de départ.",
    ),
    Situation(
        key="locataire",
        label="Le client devient locataire",
        client_patterns=[r"\bdevenir locataire\b", r"\ben location\b", r"\bje (vais )?loue", r"\bon (va )?loue", r"\bun bail\b", r"\bmon proprio\b", r"\ble proprietaire (ne veut|refuse|n'accepte)"],
        checklist=[
            CheckItem("contraintes_bail", "Contraintes du bail / accord du propriétaire", [r"\bproprietaire\b", r"\bbail\b", r"\bautorisation\b", r"\baccord\b", r"\bpercer\b", r"\btravaux\b"],
                      "Avez-vous déjà pu échanger avec votre propriétaire sur l'installation d'équipements ?"),
            CheckItem("duree", "Durée prévue dans le logement", [r"\bcombien de temps\b", r"\bduree\b", r"\btemporaire\b", r"\bprovisoire\b"],
                      "Combien de temps pensez-vous rester dans ce logement ?"),
        ],
        pistes=["Solution compatible location (sans travaux lourds) — uniquement si documentée"],
        kb_query="locataire installation sans travaux bail autorisation",
        reasoning="Le statut de locataire n'empêche pas forcément la protection ; il faut comprendre les contraintes réelles (accord du bailleur, durée).",
    ),
    Situation(
        key="autre_region",
        label="Déménagement dans une autre région",
        client_patterns=[r"\bautre region\b", r"\bautre ville\b", r"\bmut(e|ee|ation)\b", r"\bautre bout de la france\b", r"\bdans le (sud|nord|sud-ouest|sud-est|nord-est|nord-ouest)\b", r"\ben (bretagne|normandie|provence|alsace|auvergne|occitanie|corse)\b", r"\bloin d'ici\b"],
        checklist=[
            CheckItem("couverture", "Vérification de la continuité du service à destination", [r"\bcouverture\b", r"\bzone\b", r"\bdisponible (a|dans|sur)\b", r"\bnous (sommes|intervenons) (aussi |egalement )?(a|dans|sur)\b", r"\bcontinuite\b", r"\bpartout en france\b", r"\bnouvelle adresse\b", r"\btransfer"],
                      "Je vérifie pour vous la continuité du service à votre future adresse : quelle est la ville exacte ?"),
            CheckItem("modalites", "Explication des modalités possibles", [r"\bmodalites\b", r"\bprocedure\b", r"\bcomment (ca|cela) se passe\b", r"\bles etapes\b", r"\bconcretement\b", r"\btechnicien\b"],
                      "Voulez-vous que je vous explique concrètement comment se passerait la suite à votre nouvelle adresse ?"),
        ],
        pistes=["Continuité du service à la nouvelle adresse — à confirmer dans la documentation de couverture"],
        kb_query="déménagement autre région couverture zone transfert modalités",
        reasoning="Un départ en région n'est une fin de contrat que si le service ne peut pas suivre : le commercial doit le vérifier et l'expliquer, pas le supposer.",
    ),
    Situation(
        key="etranger",
        label="Déménagement à l'étranger",
        client_patterns=[r"\bl'etranger\b", r"\bquitte la france\b", r"\bexpatri", r"\bau (canada|portugal|maroc|quebec|royaume-uni|luxembourg)\b", r"\ben (belgique|suisse|espagne|italie|allemagne|angleterre|tunisie|algerie)\b"],
        checklist=[
            CheckItem("pays", "Destination et durée", [r"\bquel pays\b", r"\bou (exactement|partez)\b", r"\bcombien de temps\b", r"\bdefinitif\b", r"\btemporaire\b"],
                      "Vous partez pour combien de temps, et dans quel pays ?"),
            CheckItem("bien_france", "Bien conservé en France (résidence secondaire, logement vacant)", [r"\bgard(ez|er) (votre|un|le) (logement|bien|maison)\b", r"\bresidence secondaire\b", r"\bvacant\b", r"\bfamille en france\b", r"\breste en france\b", r"\bvendre\b", r"\bmettre en location\b"],
                      "Conservez-vous un logement ou des proches en France pendant votre absence ?"),
        ],
        pistes=["Protection d'un bien laissé vacant en France — si applicable et documentée", "Reprise par le repreneur du logement — selon procédure"],
        kb_query="déménagement étranger résiliation logement vacant résidence secondaire",
        reasoning="Un départ à l'étranger peut légitimement mettre fin au contrat ; il faut néanmoins vérifier s'il reste un bien ou des proches à protéger en France, et soigner la sortie.",
    ),
    Situation(
        key="deja_equipe",
        label="Nouveau logement déjà équipé",
        client_patterns=[r"\bdeja (une alarme|equipe|un systeme|installe)", r"\by a deja (une|un)\b", r"\bil y a deja (une alarme|un systeme)", r"\balarme (de l'ancien|des anciens|du) (proprietaire|occupants?)"],
        checklist=[
            CheckItem("satisfaction_existant", "Satisfaction / connaissance de l'installation existante", [r"\bque savez-vous\b", r"\bqu'est-ce que vous savez\b", r"\bquel (type de )?(systeme|alarme|equipement)\b", r"\bfonctionne\b", r"\babonnement\b", r"\btelesurveill", r"\bqui (gere|surveille)\b", r"\bentretien\b"],
                      "Que savez-vous de l'installation déjà présente : est-elle reliée à une télésurveillance, et qui en assure le suivi ?"),
            CheckItem("equipements", "Équipements présents", [r"\bdetecteurs?\b", r"\bcamera", r"\bsirene\b", r"\bequipements?\b", r"\bcentrale\b"],
                      "Quels équipements avez-vous repérés (détecteurs, caméras, sirène) ?"),
            CheckItem("besoins_securite", "Besoins de sécurité", [r"\bsecurite\b", r"\bproteger\b", r"\bquartier\b", r"\bcambriol", r"\bvous sentir\b"],
                      "Qu'attendez-vous d'un système de sécurité dans ce nouveau logement ?"),
            CheckItem("reprise", "Possibilités de reprise / transfert autorisées", [r"\breprise\b", r"\btransfer", r"\brempla", r"\bcomparer\b", r"\bnotre service\b", r"\bdifference\b"],
                      "Seriez-vous d'accord pour qu'on compare ensemble ce que vous apporte l'installation existante et ce que vous aviez avec nous ?"),
        ],
        pistes=["Comparaison de niveau de service (télésurveillance, intervention) — factuelle, sans dénigrement", "Reprise ou remplacement de l'existant — uniquement si documenté"],
        kb_query="logement déjà équipé alarme existante reprise remplacement",
        reasoning="« Déjà équipé » ne dit rien de la qualité de l'installation, de son abonnement ni de son suivi : beaucoup d'objections tombent une fois ces points éclaircis.",
    ),
    Situation(
        key="plus_alarme",
        label="Le client ne souhaite plus avoir d'alarme",
        client_patterns=[r"\bplus besoin\b", r"\bne (veux|veut|souhaite) plus (d'alarme|de systeme|d'abonnement)\b", r"\bplus d'alarme\b", r"\bjamais servi\b", r"\bne sert (a|à) rien\b", r"\bpas besoin d'alarme\b"],
        checklist=[
            CheckItem("pourquoi", "Comprendre ce qui a changé", [r"\bqu'est-ce qui (a change|vous fait dire)\b", r"\bpourquoi\b", r"\bqu'est-ce qui vous amene\b", r"\bdepuis quand\b", r"\bqu'est-ce qui a"],
                      "Qu'est-ce qui vous fait dire aujourd'hui que vous n'en aurez plus besoin ?"),
            CheckItem("valeur_percue", "Valeur perçue / usage réel", [r"\butilis", r"\bmode (partiel|nuit)\b", r"\bapplication\b", r"\bvous en servez\b", r"\bsouvenir\b", r"\bdeja (alerte|intervenu)\b"],
                      "Comment utilisiez-vous votre alarme au quotidien ?"),
            CheckItem("besoins_securite", "Besoins de sécurité dans le nouveau logement", [r"\bsecurite\b", r"\bquartier\b", r"\bcambriol", r"\bproteger\b"],
                      "Comment voyez-vous la sécurité dans votre futur logement ?"),
        ],
        pistes=["Rappel de la valeur d'usage (sans pression) ; si le besoin est réellement nul, sortie de qualité"],
        kb_query="client ne veut plus d'alarme argumentation valeur",
        reasoning="« Plus besoin » cache souvent une autre raison (prix, mauvaise expérience, méconnaissance des usages). Il faut la faire émerger avant de conclure.",
    ),
    Situation(
        key="budget",
        label="Problème de budget",
        client_patterns=[r"\btrop cher", r"\bbudget\b", r"\b(plus |pas )?les moyens\b", r"\bpayer\b", r"\bchomage\b", r"\bserrer la ceinture\b", r"\beconomies\b", r"\bdepenses\b", r"\bprix\b"],
        checklist=[
            CheckItem("cause", "Raison réelle de la difficulté financière", [r"\bqu'est-ce qui\b", r"\bsituation\b", r"\bje (me )?permets de vous demander\b", r"\bpouvez-vous m'en dire\b", r"\bqu'est-ce qui pese\b", r"\bpourquoi\b"],
                      "Si ce n'est pas indiscret, qu'est-ce qui a changé dans votre budget ?"),
            CheckItem("temporalite", "Problème temporaire ou durable", [r"\btemporaire\b", r"\bprovisoire\b", r"\bcombien de temps\b", r"\bdurable\b", r"\bpassager\b", r"\bpour l'instant\b", r"\bd'ici\b"],
                      "Est-ce une situation passagère, liée au déménagement, ou plus durable ?"),
            CheckItem("attentes", "Attentes du client", [r"\bqu'est-ce qui (vous )?(aiderait|conviendrait)\b", r"\bqu'attendez\b", r"\bideal\b", r"\bqu'est-ce qui serait\b", r"\bselon vous\b", r"\bvos attentes\b"],
                      "Qu'est-ce qui vous permettrait de garder votre protection sereinement ?"),
            CheckItem("possibilites", "Possibilités commerciales autorisées", [r"\bje (peux|vais) (verifier|regarder)\b", r"\bpossibilites\b", r"\bsolution\b", r"\badapt", r"\bformule\b", r"\boption\b"],
                      "Je vais regarder avec vous les possibilités prévues dans ce cas : je vérifie ce que je peux vous proposer."),
        ],
        pistes=["Adaptation de formule / options — uniquement selon grille commerciale documentée",
                "Solutions prévues pour difficultés temporaires — uniquement si documentées"],
        kb_query="difficulté financière budget geste commercial formule adaptation",
        reasoning="Ne pas se contenter d'accepter la résiliation : comprendre la cause réelle, sa durée et les attentes, puis ne proposer que des possibilités autorisées.",
    ),
    Situation(
        key="insatisfaction",
        label="Client insatisfait du service",
        client_patterns=[r"\bpas (tres |vraiment )?satisfait", r"\bmecontent", r"\bdecu", r"\bfausses? (alertes?|alarmes?)\b", r"\bpannes?\b", r"\bpas content", r"\bjamais joignable\b", r"\bmarre\b", r"\binadmissible\b", r"\bscandal"],
        checklist=[
            CheckItem("ecoute", "Écoute et excuses sur le vécu", [r"\bdesole", r"\bnavre", r"\bje (vous )?comprends\b", r"\bje m'excuse\b", r"\bdesagreable\b", r"\bj'entends\b"],
                      "Je suis sincèrement désolé de ce que vous avez vécu. Pouvez-vous me raconter ce qui s'est passé ?"),
            CheckItem("faits", "Faits précis (quoi, quand, combien de fois)", [r"\bqu'est-ce qui s'est passe\b", r"\bracontez\b", r"\bquand\b", r"\bcombien de fois\b", r"\bdepuis quand\b", r"\bexpliquez\b"],
                      "Racontez-moi ce qui s'est passé, et depuis quand ?"),
            CheckItem("resolution", "Proposition de résolution concrète", [r"\btechnicien\b", r"\bje (m'occupe|transmets|fais remonter|planifie)\b", r"\bresoudre\b", r"\bcorriger\b", r"\bverification\b", r"\bdiagnostic\b"],
                      "Je vous propose qu'on règle d'abord ce problème : je m'en occupe personnellement."),
        ],
        pistes=["Résolution du problème de fond avant toute discussion de résiliation", "Geste commercial — uniquement si prévu par la politique documentée"],
        kb_query="réclamation insatisfaction fausses alarmes panne geste commercial",
        reasoning="Une insatisfaction non traitée rend toute proposition inaudible : il faut d'abord écouter, reconnaître, résoudre.",
    ),
    Situation(
        key="definitif",
        label="Le client souhaite résilier définitivement",
        client_patterns=[r"\bdefinitivement\b", r"\bc'est (tout )?decide\b", r"\bma decision est prise\b", r"\bquoi qu'il arrive\b", r"\bn'insistez pas\b", r"\bc'est non\b"],
        checklist=[
            CheckItem("respect", "Respect de la décision exprimé", [r"\bje respecte\b", r"\bc'est votre (choix|decision)\b", r"\bje comprends (votre|tout a fait)\b", r"\bbien entendu\b"],
                      "Je respecte tout à fait votre décision."),
            CheckItem("une_question", "Une question d'ouverture avant de conclure", [r"\bavant (de|que) (finaliser|conclure|proceder|valider)\b", r"\bune (derniere|seule) question\b", r"\bpour (mon|notre) information\b", r"\bpuis-je vous demander\b", r"\bqu'est-ce qui\b"],
                      "Avant de finaliser, puis-je vous demander ce qui a été déterminant dans votre décision ?"),
            CheckItem("porte_ouverte", "Porte laissée ouverte / sortie de qualité", [r"\bsi (un jour|a l'avenir|vous changez)\b", r"\bn'hesitez pas\b", r"\bporte (reste )?ouverte\b", r"\bnous restons\b"],
                      "Si votre situation évolue, nous serons là pour vous accompagner."),
        ],
        pistes=["Sortie de qualité (image, recommandation, retour futur)", "Vérifier une dernière fois le motif réel"],
        kb_query="résiliation définitive procédure fin de contrat",
        reasoning="Face à une décision ferme, insister détériore la relation ; mais une question d'ouverture et une sortie soignée restent attendues.",
    ),
    Situation(
        key="repreneur",
        label="Transmission de l'équipement à un repreneur",
        client_patterns=[r"\brepreneur", r"\bnouveaux? (occupants?|proprietaires?|locataires?)\b", r"\bacheteurs?\b", r"\blaisser l'alarme\b", r"\btransmettre\b", r"\breprendre (le|mon) contrat\b", r"\bceux qui (arrivent|achetent|rachetent)\b"],
        checklist=[
            CheckItem("coordonnees", "Recueil du contact repreneur (avec son accord)", [r"\bcoordonnees\b", r"\bcontact\b", r"\bpouvez-vous (leur|lui) (transmettre|donner)\b", r"\bmettre en relation\b", r"\bnumero\b"],
                      "Seriez-vous d'accord pour nous mettre en relation avec le repreneur, avec son accord ?"),
            CheckItem("procedure", "Explication de la procédure de reprise", [r"\breprise\b", r"\bprocedure\b", r"\bdemarche\b", r"\betapes\b", r"\bdocument"],
                      "Je vous explique la démarche prévue pour une reprise de contrat."),
            CheckItem("client_suit", "Continuité pour le client lui-même", [r"\bet (vous|pour vous),? (dans|a) (votre|la) nouvelle?\b", r"\bvotre nouveau logement\b", r"\bnouvelle adresse\b", r"\bet de votre cote\b"],
                      "Et pour votre nouveau logement, comment envisagez-vous votre sécurité ?"),
        ],
        pistes=["Reprise du contrat par le repreneur — selon procédure documentée", "Nouvelle protection pour le client à sa nouvelle adresse"],
        kb_query="reprise contrat repreneur nouveaux occupants procédure",
        reasoning="La transmission à un repreneur peut conserver l'installation ET ouvrir une discussion sur la protection du client à sa nouvelle adresse.",
    ),
]

SITUATIONS_BY_KEY = {s.key: s for s in SITUATIONS}


def detect_situations(client_texts: list[str]) -> list[Situation]:
    joined = " ".join(client_texts)
    found = [s for s in SITUATIONS if has_any(joined, s.client_patterns)]
    return found


def evaluate_checklist(situation: Situation, agent_texts: list[str], client_texts: list[str] | None = None) -> list[dict]:
    """`covered` : exploré par le commercial ; `known_from_client` : information donnée spontanément par le client."""
    joined = " ".join(agent_texts)
    cjoined = " ".join(client_texts or [])
    return [
        {
            "situation": situation.label,
            "item": item.label,
            "covered": has_any(joined, item.agent_patterns),
            "known_from_client": bool(cjoined) and has_any(cjoined, item.agent_patterns),
            "suggested_question": item.question,
        }
        for item in situation.checklist
    ]
