"""Catalogue pédagogique des erreurs commerciales.

Chaque erreur décrit : pourquoi c'est une erreur, ce que le commercial aurait dû comprendre, la
conséquence commerciale possible, une meilleure formulation (adaptée à la situation détectée),
l'action à appliquer au prochain appel, et des exercices de progression par niveau.

Ces contenus sont des RECOMMANDATIONS PÉDAGOGIQUES (catégorie « recommandation IA / coach »),
inspirées de pratiques de vente reconnues (questionnement ouvert, reformulation, traitement des
objections) — ce ne sont ni des procédures de l'entreprise ni des résultats scientifiques.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CRITERIA = [
    ("contact", "Prise de contact et mise en confiance", 10),
    ("decouverte", "Découverte du besoin", 20),
    ("raisons", "Compréhension des raisons du déménagement", 15),
    ("argumentation", "Argumentation et valorisation du service", 15),
    ("objections", "Traitement des objections", 20),
    ("proposition", "Proposition de solutions de rétention", 10),
    ("conclusion", "Conclusion et engagement client", 10),
]
CRITERIA_LABELS = {k: label for k, label, _ in CRITERIA}
CRITERIA_MAX = {k: m for k, _, m in CRITERIA}


@dataclass
class Exercise:
    level: int  # 1 à 3
    title: str
    instructions: str


@dataclass
class ErrorType:
    code: str
    criterion: str
    title: str
    why_wrong: str
    should_understand: str
    consequence: str
    action: str
    better: dict[str, str]  # clé de situation -> formulation ; "default" obligatoire
    exercises: list[Exercise] = field(default_factory=list)
    severity: int = 2

    def phrasing(self, situations: list[str]) -> str:
        for s in situations:
            if s in self.better:
                return self.better[s]
        return self.better["default"]


ERRORS: dict[str, ErrorType] = {}


def _add(e: ErrorType) -> None:
    ERRORS[e.code] = e


_add(ErrorType(
    code="ACCEPTATION_RAPIDE",
    criterion="objections",
    title="Accepte la résiliation trop rapidement",
    why_wrong="Le commercial valide la demande de départ avant d'avoir compris la situation ni proposé de solution : la rétention n'est même pas tentée.",
    should_understand="Une demande de résiliation pour déménagement est souvent une demande d'information déguisée : le client ne sait pas toujours que le service peut le suivre.",
    consequence="Perte d'un client potentiellement conservable ; aucune information recueillie sur le motif réel.",
    action="Ne jamais lancer une résiliation avant d'avoir posé au moins trois questions ouvertes sur le projet de déménagement.",
    better={
        "default": "Je comprends, un déménagement, c'est beaucoup de choses à gérer. Avant de regarder la suite avec vous, parlez-moi un peu de votre projet : où partez-vous, et à quoi ressemble votre futur logement ?",
        "budget": "Je comprends que le budget compte beaucoup en ce moment. Avant toute chose, j'aimerais comprendre : qu'est-ce qui a changé de votre côté, et est-ce plutôt passager ou durable ?",
        "deja_equipe": "Je comprends. Avant de décider quoi que ce soit, que savez-vous de l'installation déjà présente : est-elle reliée à une télésurveillance, et qui en assure le suivi ?",
        "insatisfaction": "Je suis vraiment désolé de ce que vous avez vécu. Avant de parler de résiliation, racontez-moi ce qui s'est passé : je veux comprendre et voir ce que je peux régler.",
        "definitif": "Je respecte tout à fait votre décision. Avant de la finaliser, puis-je vous demander ce qui a été déterminant pour vous ?",
    },
    exercises=[
        Exercise(1, "Les 3 questions avant tout", "Pour 5 demandes de résiliation fictives, écrivez les 3 questions ouvertes que vous poseriez AVANT d'évoquer la procédure."),
        Exercise(2, "Le réflexe de la pause", "En simulation, à chaque « je veux résilier », marquez une pause, reformulez, puis posez une question ouverte. Objectif : 0 acceptation immédiate sur 3 simulations."),
        Exercise(3, "Résister au client pressé", "Simulation « client pressé » niveau 3 : obtenez la raison du déménagement et la date en moins de 60 secondes sans brusquer le client."),
    ],
    severity=3,
))

_add(ErrorType(
    code="QUESTION_FERMEE_INUTILE",
    criterion="decouverte",
    title="Question fermée là où une question ouverte s'imposait",
    why_wrong="La question n'appelle qu'un « oui » ou un « non » : elle n'apprend presque rien sur la situation du client et fait porter la conversation par le commercial.",
    should_understand="En phase de découverte, l'objectif est de faire parler le client : ses mots révèlent les besoins, les freins et les leviers de rétention.",
    consequence="Découverte superficielle, arguments génériques, objections qui surgissent tard.",
    action="Transformer systématiquement les « Est-ce que… ? / Vous avez… ? » de découverte en « Comment… ? / Qu'est-ce que… ? / Parlez-moi de… ».",
    better={
        "default": "Parlez-moi de votre nouveau logement : comment se présente-t-il ?",
        "deja_equipe": "Qu'est-ce que vous savez de l'installation qui est déjà en place ?",
        "budget": "Qu'est-ce qui pèse le plus dans votre budget en ce moment ?",
    },
    exercises=[
        Exercise(1, "Transforme ta question", "Réécrivez 10 questions fermées (« Vous avez une maison ? », « C'est pour bientôt ? ») en questions ouvertes."),
        Exercise(2, "Ratio 3 pour 1", "En simulation, visez au moins 3 questions ouvertes pour 1 fermée pendant la découverte."),
        Exercise(3, "Entonnoir", "Construisez un entonnoir complet (ouverte → précision → reformulation → fermée de validation) sur le cas « autre région »."),
    ],
    severity=1,
))

_add(ErrorType(
    code="QUESTION_ORIENTEE_NEGATIVE",
    criterion="decouverte",
    title="Question qui suggère la réponse négative",
    why_wrong="La formulation invite le client à confirmer son départ (« Vous ne souhaitez pas… ? », « Vous voulez résilier ? ») : elle ferme la porte à toute solution.",
    should_understand="La manière de poser une question oriente la réponse ; une question négative pousse vers le « non ».",
    consequence="Le client s'engage verbalement dans la résiliation, ce qui rend la rétention plus difficile ensuite.",
    action="Bannir les questions négatives ; formuler la question autour du projet et des besoins du client.",
    better={
        "default": "Comment envisagez-vous la sécurité de votre futur logement ?",
        "plus_alarme": "Qu'est-ce qui vous fait dire aujourd'hui que vous n'en aurez plus besoin ?",
    },
    exercises=[
        Exercise(1, "Chasse au « ne… pas »", "Relisez 3 de vos appels et relevez toutes les questions contenant « ne… pas / plus » ; réécrivez-les."),
        Exercise(2, "Questions de projet", "Préparez 5 questions qui parlent du futur logement plutôt que de la fin du contrat."),
    ],
    severity=3,
))

_add(ErrorType(
    code="DECOUVERTE_ABSENTE",
    criterion="decouverte",
    title="Aucune question ouverte de découverte",
    why_wrong="Le commercial n'a posé aucune question ouverte : il ne connaît ni le projet, ni les besoins, ni la motivation réelle du client.",
    should_understand="Sans découverte, toute proposition est générique et toute objection est traitée à l'aveugle.",
    consequence="Taux de rétention faible et argumentaire non personnalisé.",
    action="Préparer et poser au moins 3 questions ouvertes de découverte dans les 2 premières minutes.",
    better={"default": "Pour bien vous accompagner, racontez-moi un peu votre projet de déménagement : qu'est-ce qui vous amène à partir, et où allez-vous ?"},
    exercises=[
        Exercise(1, "Banque de questions", "Constituez votre banque personnelle de 10 questions ouvertes de découverte « déménagement »."),
        Exercise(2, "Découverte chronométrée", "En simulation, réalisez une découverte de 2 minutes uniquement avec des questions ouvertes et des reformulations."),
    ],
    severity=3,
))

_add(ErrorType(
    code="PAS_DE_REFORMULATION",
    criterion="decouverte",
    title="Pas de reformulation après une explication importante du client",
    why_wrong="Le client vient d'expliquer sa situation, mais le commercial enchaîne sans reformuler : le client ne se sent pas compris et les malentendus ne sont pas levés.",
    should_understand="La reformulation (écoute active) valide la compréhension, montre l'attention portée au client et prépare la proposition.",
    consequence="Le client a l'impression d'un discours standard ; la proposition paraît décalée.",
    action="Après chaque explication importante du client, reformuler en une phrase (« Si je comprends bien, … ») avant de poursuivre.",
    better={"default": "Si je comprends bien, vous déménagez pour [reprendre les mots du client] et ce qui compte pour vous, c'est [besoin exprimé]. C'est bien ça ?"},
    exercises=[
        Exercise(1, "Reformuler en 1 phrase", "À partir de 5 répliques clients (bibliothèque d'appels fictifs), écrivez une reformulation de 25 mots maximum."),
        Exercise(2, "Reformulation + question", "En simulation, enchaînez chaque reformulation par une question ouverte d'approfondissement."),
    ],
))

_add(ErrorType(
    code="RAISON_NON_EXPLOREE",
    criterion="raisons",
    title="Raison du déménagement non explorée",
    why_wrong="Le client annonce son déménagement mais le commercial ne cherche pas à en connaître le contexte (destination, logement, date, statut).",
    should_understand="Chaque situation (achat, location, autre région, étranger, logement équipé, budget) appelle une réponse différente : sans la raison, impossible de choisir la bonne.",
    consequence="Solution inadaptée ou absence de solution ; occasion de rétention manquée.",
    action="Dès l'annonce du déménagement : où, quand, quel type de logement, propriétaire ou locataire.",
    better={
        "default": "C'est un beau changement ! Où allez-vous vous installer, et à quoi ressemblera votre nouveau logement ?",
        "proprietaire": "Félicitations pour cet achat ! Comment se présente votre nouvelle maison ?",
        "autre_region": "Vous partez dans quelle ville exactement ? Je vais vérifier avec vous comment la suite peut se passer là-bas.",
        "etranger": "Vous partez pour combien de temps ? Est-ce que vous conservez un logement ou des proches en France ?",
    },
    exercises=[
        Exercise(1, "La grille OQQP", "Pour chaque annonce de déménagement, listez : Où ? Quand ? Quel logement ? Propriétaire / locataire ?"),
        Exercise(2, "Diagnostic express", "En simulation, identifiez la situation exacte du client (parmi les 11 du playbook) avant la 4e réplique."),
    ],
    severity=3,
))

_add(ErrorType(
    code="OBJECTION_IGNOREE",
    criterion="objections",
    title="Objection ignorée ou contournée",
    why_wrong="Le client formule une objection, mais la réponse du commercial ne la reconnaît pas : elle reste intacte et reviendra.",
    should_understand="Une objection non traitée est une objection qui grossit : le client a besoin de se sentir entendu avant d'écouter une solution.",
    consequence="Le client se ferme ; la décision de départ se renforce.",
    action="Appliquer systématiquement : accueillir (empathie) → explorer (question) → reformuler → répondre.",
    better={
        "default": "Je comprends tout à fait. Qu'est-ce qui vous fait dire ça exactement ?",
        "budget": "Je comprends, le budget, c'est important. Est-ce une contrainte passagère liée au déménagement ou plus durable ?",
        "deja_equipe": "D'accord, c'est une bonne chose de l'avoir repéré. Que savez-vous de cette installation : est-elle télésurveillée ?",
        "insatisfaction": "Je suis désolé que vous ayez vécu ça. Racontez-moi ce qui s'est passé.",
    },
    exercises=[
        Exercise(1, "Accueillir avant de répondre", "Pour 8 objections types, écrivez la phrase d'accueil (empathie) puis la question d'exploration."),
        Exercise(2, "Méthode AERR", "En simulation « client qui refuse toute proposition », appliquez Accueillir-Explorer-Reformuler-Répondre à chaque objection."),
        Exercise(3, "Objections enchaînées", "Simulation niveau 3 : traitez 3 objections successives sans perdre le fil de la découverte."),
    ],
))

_add(ErrorType(
    code="OBJECTION_SANS_EXPLORATION",
    criterion="objections",
    title="Réponse à l'objection sans chercher à la comprendre",
    why_wrong="Le commercial argumente immédiatement sans poser de question : il répond à l'objection qu'il imagine, pas forcément à la vraie.",
    should_understand="Derrière « trop cher », « plus besoin » ou « déjà équipé » se cachent des réalités différentes ; seule une question permet de les distinguer.",
    consequence="Argument à côté du vrai frein ; impression de discours commercial forcé.",
    action="Avant tout argument, poser une question qui précise l'objection (« Qu'est-ce qui vous fait dire… ? »).",
    better={
        "default": "Je comprends. Pour bien vous répondre, qu'est-ce qui vous fait dire ça ?",
        "budget": "Je comprends. Est-ce le montant global qui pose problème, ou plutôt la période actuelle avec le déménagement ?",
        "plus_alarme": "Je l'entends. Qu'est-ce qui a changé pour que vous n'en voyiez plus l'utilité ?",
    },
    exercises=[
        Exercise(1, "La question qui précise", "Pour chaque objection de la liste, formulez une question qui la précise sans la contredire."),
        Exercise(2, "Zéro argument avant question", "En simulation, interdiction d'argumenter avant d'avoir posé une question sur l'objection."),
    ],
))

_add(ErrorType(
    code="PRESSION",
    criterion="objections",
    title="Formulation sous pression, autoritaire ou défensive",
    why_wrong="La formulation met le client en tort ou lui impose une contrainte (« vous devez », « c'est la procédure », « calmez-vous ») : elle crée une opposition.",
    should_understand="La persuasion éthique repose sur la compréhension et le choix du client, jamais sur la contrainte.",
    consequence="Escalade du conflit, dégradation de l'image, réclamation possible.",
    action="Remplacer les formulations d'obligation par des formulations de choix et d'accompagnement.",
    better={"default": "Je comprends votre agacement, et c'est légitime. Voyons ensemble ce que je peux faire concrètement pour vous."},
    exercises=[
        Exercise(1, "Dictionnaire positif", "Réécrivez 10 phrases d'obligation (« vous devez », « ce n'est pas possible ») en formulations d'accompagnement."),
        Exercise(2, "Client agressif", "Simulation « client agressif » : désamorcer sans jamais utiliser « calmez-vous » ni « c'est la procédure »."),
    ],
    severity=3,
))

_add(ErrorType(
    code="ARGUMENT_GENERIQUE",
    criterion="argumentation",
    title="Argument générique, non relié à la situation du client",
    why_wrong="L'argument décrit le service de façon standard sans le relier à ce que le client a exprimé.",
    should_understand="Un argument convainc quand il répond à un besoin exprimé par le client, avec ses propres mots (méthode CAP : Caractéristique → Avantage → Preuve, reliée au besoin).",
    consequence="Le client n'y voit pas de bénéfice personnel ; l'argument est perçu comme un discours commercial.",
    action="Commencer chaque argument par le besoin du client (« Vous m'avez dit que… ») avant de présenter le service.",
    better={"default": "Vous m'avez dit que vous vous absentez souvent : c'est justement dans ces moments-là que la télésurveillance prend tout son sens, puisque vous n'êtes pas seul à veiller sur votre logement."},
    exercises=[
        Exercise(1, "Argument CAP", "Pour 3 besoins clients (enfants, absences, maison isolée), construisez un argument Caractéristique-Avantage-Preuve relié au besoin."),
        Exercise(2, "Reprendre les mots du client", "En simulation, chaque argument doit reprendre au moins un mot exact prononcé par le client."),
    ],
    severity=1,
))

_add(ErrorType(
    code="MONOLOGUE",
    criterion="argumentation",
    title="Monologue du commercial",
    why_wrong="Une réplique très longue sans question : le client décroche et ne peut pas réagir.",
    should_understand="Un argument efficace est court et suivi d'une question pour vérifier l'adhésion.",
    consequence="Perte d'attention ; objections non exprimées qui ressortent à la fin.",
    action="Limiter chaque argument à 3 phrases et terminer par une question (« Qu'en pensez-vous ? »).",
    better={"default": "[Argument en 2-3 phrases maximum.] Qu'est-ce que vous en pensez ?"},
    exercises=[
        Exercise(1, "Argument en 30 secondes", "Réécrivez votre argument principal en 3 phrases suivies d'une question."),
    ],
    severity=1,
))

_add(ErrorType(
    code="PROPOSITION_PREMATUREE",
    criterion="proposition",
    title="Solution proposée avant toute découverte",
    why_wrong="Le commercial propose une solution avant d'avoir compris la situation : la proposition tombe à plat ou paraît forcée.",
    should_understand="Une proposition n'a de valeur que si elle répond à un besoin identifié et reformulé.",
    consequence="Refus rapide, et la proposition est « grillée » pour la suite de l'appel.",
    action="Proposer seulement après avoir reformulé le besoin et obtenu l'accord du client sur cette reformulation.",
    better={"default": "Avant de vous proposer quoi que ce soit, j'aimerais être sûr de bien comprendre votre situation : parlez-moi de votre nouveau logement."},
    exercises=[
        Exercise(1, "Découverte → reformulation → proposition", "Sur 3 appels fictifs, identifiez le bon moment de la proposition."),
    ],
))

_add(ErrorType(
    code="PAS_DE_PROPOSITION",
    criterion="proposition",
    title="Aucune solution de rétention proposée",
    why_wrong="L'appel se termine sans qu'aucune solution de continuité (transfert, reprise, adaptation documentée) n'ait été proposée.",
    should_understand="Même si le client semble décidé, présenter au moins une solution adaptée est indispensable : il ne la connaît peut-être pas.",
    consequence="Départ du client sans qu'il ait connu les possibilités existantes.",
    action="Avant de conclure, présenter au moins une solution adaptée à la situation, vérifiée dans la documentation métier.",
    better={
        "default": "Avant de conclure, savez-vous que votre protection peut peut-être vous suivre dans votre nouveau logement ? Je vérifie avec vous les possibilités prévues dans votre cas.",
        "repreneur": "Pour le logement que vous quittez, les nouveaux occupants pourraient reprendre l'installation : voulez-vous que je vous explique la démarche ? Et pour votre nouvelle adresse, comment voyez-vous votre sécurité ?",
        "etranger": "Je comprends que le contrat s'arrête pour ce logement. Si vous conservez un bien en France, ou si les repreneurs souhaitent garder l'installation, je peux vous expliquer ce qui est prévu.",
    },
    exercises=[
        Exercise(1, "Une situation, une solution", "Pour chacune des 11 situations du playbook, notez la piste de solution et le document métier qui la justifie."),
        Exercise(2, "Proposer avec une question", "En simulation, présentez votre solution en terminant par « Qu'en pensez-vous ? »."),
    ],
    severity=3,
))

_add(ErrorType(
    code="CONCLUSION_SANS_ENGAGEMENT",
    criterion="conclusion",
    title="Conclusion sans récapitulatif ni engagement",
    why_wrong="L'appel se termine sans récapitulatif ni prochaine étape claire : le client ne sait pas ce qui va se passer.",
    should_understand="Une conclusion efficace récapitule, fixe la prochaine étape (date, action, responsable) et vérifie l'accord du client.",
    consequence="Engagement fragile, rappels supplémentaires, risque de changement d'avis.",
    action="Terminer chaque appel par : récapitulatif → prochaine étape datée → « Cela vous convient-il ? ».",
    better={"default": "Je récapitule : [décision], [prochaine étape] le [date]. Je vous envoie la confirmation par écrit. Cela vous convient-il ?"},
    exercises=[
        Exercise(1, "Phrase de clôture", "Écrivez votre phrase de récapitulatif type et entraînez-vous à la dire en 20 secondes."),
    ],
))

_add(ErrorType(
    code="OUVERTURE_IMPERSONNELLE",
    criterion="contact",
    title="Prise de contact sans présentation ni mise en confiance",
    why_wrong="Le commercial entre directement dans le sujet sans se présenter ni créer de lien.",
    should_understand="Les premières secondes posent le cadre : présentation, remerciement, objectif de l'échange.",
    consequence="Client sur la défensive dès le départ.",
    action="Ouvrir par : salutation + prénom + service + remerciement + objectif de l'appel.",
    better={"default": "Bonjour, je suis [prénom], du service clients. Merci de votre appel. Je vais prendre le temps de bien comprendre votre situation pour vous accompagner au mieux."},
    exercises=[Exercise(1, "Ouverture en 15 secondes", "Rédigez et chronométrez votre ouverture idéale.")],
    severity=1,
))

_add(ErrorType(
    code="VOCABULAIRE_NEGATIF",
    criterion="contact",
    title="Vocabulaire négatif ou hésitant",
    why_wrong="Des expressions comme « pas de souci », « malheureusement », « je vais essayer » transmettent du doute ou une image négative.",
    should_understand="Les mots choisis influencent la perception de fiabilité et d'engagement (règle de pratique professionnelle, non une loi scientifique).",
    consequence="Moindre crédibilité, client moins rassuré.",
    action="Remplacer : « pas de souci » → « avec plaisir / bien sûr » ; « je vais essayer » → « je m'en occupe ».",
    better={"default": "Bien sûr, je m'en occupe."},
    exercises=[Exercise(1, "Mots interdits", "Listez vos 5 tics négatifs et leur remplacement ; demandez à un collègue de les relever en simulation.")],
    severity=1,
))


def get(code: str) -> ErrorType:
    return ERRORS[code]
