"""Profils de clients simulés pour l'entraînement (données entièrement fictives).

Chaque profil possède des faits cachés, révélés seulement si le commercial pose les bonnes questions,
et une condition de rétention réaliste. Aucun tarif ni offre n'est mentionné : le client simulé
réagit aux propositions sur le principe (continuité, reprise, vérification), pas sur des montants.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Persona:
    key: str
    label: str
    description: str
    openings: list[str]
    facts: dict[str, tuple[str, str]]  # sujet -> (réponse développée, réponse courte)
    fact_order: list[str]
    key_facts: list[str]  # faits à découvrir pour qu'une proposition soit recevable
    objections: list[str]
    proposal_accept: str
    proposal_soft: str
    closed_answers: list[str]
    irritation_lines: list[str]
    empathy_reactions: list[str]
    accept_cancel_line: str
    end_lines: dict[str, str]
    initial_openness: float = 5.0
    initial_irritation: float = 2.0
    sensitivity: float = 1.0  # réactivité aux maladresses
    retainable: bool = True
    traits: list[str] = field(default_factory=list)


PERSONAS: dict[str, Persona] = {}


def _p(p: Persona) -> None:
    PERSONAS[p.key] = p


_p(Persona(
    key="presse",
    label="Client pressé",
    description="Déménage dans 10 jours dans une autre région, veut régler la résiliation en deux minutes. Ignore que le service pourrait le suivre.",
    openings=["Bonjour, je n'ai pas beaucoup de temps : je déménage dans dix jours, je veux résilier l'alarme. On peut faire ça vite ?"],
    facts={
        "reason": ("Je suis muté pour le travail, à Nantes. Tout s'est décidé très vite.", "Une mutation."),
        "destination": ("On a trouvé une maison à Nantes, un peu en périphérie. Avec un jardin.", "À Nantes, une maison."),
        "date": ("Le camion arrive le 15, dans dix jours.", "Dans dix jours."),
        "status": ("On loue au début, le temps de voir si on achète.", "Locataires pour l'instant."),
        "security": ("C'est un quartier qu'on ne connaît pas du tout, et la maison est isolée au fond d'une impasse… Ma femme n'est pas très rassurée, en fait.", "On ne connaît pas le quartier."),
        "satisfaction": ("Honnêtement on était bien avec vous, jamais eu de problème.", "Ça allait."),
        "equipment": ("Il n'y a rien dans la maison, pas d'alarme.", "Non, rien."),
    },
    fact_order=["reason", "destination", "date", "security", "satisfaction", "status", "equipment"],
    key_facts=["destination", "security"],
    objections=["Je n'ai pas le temps pour des démarches compliquées, vous comprenez ?", "Je vous ai dit que j'étais pressé…", "Bon, je verrai ça une fois installé."],
    proposal_accept="Ah, si vous vous occupez de vérifier et que je n'ai rien à faire, d'accord, ça m'arrange. Ma femme sera contente.",
    proposal_soft="Hmm… et ça me demande beaucoup de démarches, ça ?",
    closed_answers=["Oui.", "Non.", "Oui, oui.", "Euh… oui."],
    irritation_lines=["Écoutez, je suis vraiment pressé.", "On peut accélérer ?", "Je n'ai pas appelé pour un questionnaire."],
    empathy_reactions=["Merci, oui c'est la course en ce moment.", "Oui, c'est un peu la folie."],
    accept_cancel_line="Parfait, merci. Au revoir.",
    end_lines={"timeout": "Bon, je dois raccrocher, je rappellerai.", "irritated": "Laissez tomber, j'enverrai un courrier. Au revoir."},
    initial_openness=4.0, initial_irritation=3.0, sensitivity=1.4, traits=["phrases courtes", "s'impatiente si monologue"],
))

_p(Persona(
    key="mecontent",
    label="Client mécontent",
    description="A eu deux fausses alarmes et un rappel tardif ; déménage dans la même ville. Veut partir surtout par déception.",
    openings=["Bonjour. Je déménage le mois prochain et franchement j'en profite pour résilier, parce que je ne suis pas satisfait du tout."],
    facts={
        "problem": ("On a eu deux fausses alarmes en mars, à trois heures du matin, et la deuxième fois personne ne m'a rappelé avant le lendemain midi. J'ai trouvé ça inadmissible.", "Des fausses alarmes."),
        "reason": ("Le déménagement, c'est parce qu'on a besoin d'une pièce de plus, le bébé arrive.", "On a besoin de plus grand."),
        "destination": ("On reste dans la même ville, trois rues plus loin, un appartement au rez-de-chaussée.", "Pas loin, même ville."),
        "date": ("Fin du mois prochain.", "Le mois prochain."),
        "security": ("Avec le bébé, au rez-de-chaussée… oui, la sécurité ça compte, c'est pour ça qu'on avait pris l'alarme au départ.", "Ça compte, oui."),
        "satisfaction": ("Avant ces fausses alarmes, honnêtement c'était bien. C'est vraiment le suivi qui m'a déçu.", "Bof."),
        "status": ("On reste locataires.", "Locataires."),
    },
    fact_order=["problem", "reason", "destination", "security", "satisfaction", "date", "status"],
    key_facts=["problem", "security"],
    objections=["Vous comprenez que je n'ai plus confiance ?", "Et qui me garantit que ça ne recommencera pas ?", "Je ne vais pas continuer à payer pour être réveillé en pleine nuit."],
    proposal_accept="Bon… si le problème des fausses alarmes est vraiment vérifié et réglé, et que vous m'expliquez comment ça marcherait dans le nouvel appart, je veux bien qu'on en reparle.",
    proposal_soft="Je ne sais pas… il faudrait d'abord régler le problème des fausses alarmes.",
    closed_answers=["Oui.", "Non.", "Si vous le dites.", "Oui, c'est ça."],
    irritation_lines=["Vous ne m'écoutez pas, là.", "C'est exactement ce genre de réponse qui m'agace.", "Je vous parle d'un vrai problème."],
    empathy_reactions=["Merci de le reconnaître, ça change de la dernière fois.", "Oui, voilà. C'est surtout ça qui m'a énervé."],
    accept_cancel_line="Voilà. Merci. Au revoir.",
    end_lines={"timeout": "Bon, je vais réfléchir, mais je ne suis pas convaincu.", "irritated": "C'est bon, je résilierai par courrier recommandé. Au revoir."},
    initial_openness=3.5, initial_irritation=5.0, sensitivity=1.2,
))

_p(Persona(
    key="agressif",
    label="Client agressif",
    description="Très énervé par une facturation qu'il juge injuste après une annonce de déménagement ; teste les limites du conseiller.",
    openings=["Oui alors c'est la troisième fois que j'appelle ! Je déménage, je veux résilier, et je veux que ce soit fait MAINTENANT, c'est clair ?"],
    facts={
        "problem": ("On m'a dit la dernière fois qu'on me rappellerait et personne ne l'a fait. J'ai l'impression d'être pris pour un idiot.", "Personne ne m'a rappelé."),
        "reason": ("Je me sépare, je pars dans un petit appartement. Voilà. Pas simple en ce moment.", "Raisons personnelles."),
        "destination": ("Un deux-pièces en ville, au premier étage.", "Un appartement."),
        "date": ("Dans trois semaines.", "Bientôt."),
        "security": ("Je vais vivre seul… je n'y avais pas trop réfléchi. Le quartier n'est pas génial, c'est vrai.", "Je ne sais pas."),
        "budget": ("Avec la séparation, tout est compliqué financièrement.", "C'est compliqué."),
    },
    fact_order=["problem", "reason", "security", "destination", "budget", "date"],
    key_facts=["problem", "reason"],
    objections=["Ne commencez pas avec votre baratin commercial.", "Vous n'allez pas me vendre quelque chose aujourd'hui.", "Je m'en fiche de vos offres."],
    proposal_accept="Bon. D'accord. Si vous me rappelez vraiment cette fois avec quelque chose de concret, je veux bien écouter.",
    proposal_soft="Vous voyez, vous essayez encore de me vendre un truc.",
    closed_answers=["OUI.", "Non !", "Évidemment.", "Ça vous regarde ?"],
    irritation_lines=["Vous vous moquez de moi ?", "Passez-moi votre responsable.", "C'est incroyable, ça !"],
    empathy_reactions=["… Bon. Merci de m'écouter, au moins.", "Oui. Enfin quelqu'un qui comprend."],
    accept_cancel_line="Enfin ! Merci. Au revoir.",
    end_lines={"timeout": "J'en ai assez, je raccroche.", "irritated": "Je vais porter réclamation. Au revoir !"},
    initial_openness=2.5, initial_irritation=7.5, sensitivity=1.6,
))

_p(Persona(
    key="plus_payer",
    label="Client qui ne veut plus payer",
    description="Budget serré à cause du déménagement (double loyer pendant deux mois) ; difficulté temporaire, mais le client parle de résilier.",
    openings=["Bonjour, je vous appelle parce que je déménage et je ne veux plus payer l'alarme, c'est trop cher pour nous en ce moment."],
    facts={
        "budget": ("On va payer deux loyers pendant deux mois, plus le déménagement… C'est surtout ces deux-trois mois qui sont durs.", "Le budget est serré."),
        "temporary": ("Après, ça devrait aller mieux, c'est vraiment la période du déménagement qui coince.", "Ça devrait s'arranger."),
        "reason": ("On se rapproche de l'école des enfants.", "Pour les enfants."),
        "destination": ("Une maison mitoyenne, avec un petit jardin.", "Une maison."),
        "security": ("Les enfants seront seuls après l'école une heure ou deux… c'est vrai que l'alarme nous rassurait pour ça.", "Les enfants rentrent seuls."),
        "satisfaction": ("Le service, rien à dire, c'est vraiment l'argent.", "Le service ça va."),
        "date": ("Début du mois prochain.", "Le mois prochain."),
    },
    fact_order=["budget", "reason", "security", "temporary", "destination", "satisfaction", "date"],
    key_facts=["budget", "temporary"],
    objections=["De toute façon, c'est l'argent le problème.", "Je ne peux pas me permettre de dépenses en plus en ce moment.", "Vous n'allez pas me faire baisser le prix, si ?"],
    proposal_accept="Si vous pouvez vérifier ce qui est possible pour passer ces deux mois difficiles, et que je garde la protection pour les enfants, alors oui, ça m'intéresse.",
    proposal_soft="Peut-être, mais concrètement, pour mon budget, ça change quoi ?",
    closed_answers=["Oui.", "Non.", "Oui, c'est ça.", "Pas vraiment."],
    irritation_lines=["Je vous dis que je n'ai pas les moyens.", "Ce n'est pas la peine d'insister."],
    empathy_reactions=["Merci, oui ce n'est pas facile en ce moment.", "C'est gentil de comprendre."],
    accept_cancel_line="D'accord. Merci. Au revoir.",
    end_lines={"timeout": "Je vais y réfléchir, au revoir.", "irritated": "Non, vraiment, je préfère arrêter. Au revoir."},
    initial_openness=5.0, initial_irritation=2.5, sensitivity=1.0,
))

_p(Persona(
    key="deja_equipe",
    label="Client qui a déjà une alarme",
    description="Achète une maison où une alarme est déjà installée par l'ancien propriétaire ; ne sait pas si elle est reliée à une télésurveillance.",
    openings=["Bonjour, on a acheté une maison et il y a déjà une alarme dedans, donc on n'aura plus besoin de la vôtre. Je voudrais arrêter le contrat."],
    facts={
        "equipment": ("C'est l'alarme des anciens propriétaires. Une sirène et des détecteurs, je crois. Je ne sais pas du tout si elle est reliée à quelque chose, ni si elle marche.", "Celle des anciens propriétaires."),
        "reason": ("On a acheté notre première maison, on était en appartement avant.", "On a acheté."),
        "destination": ("Une maison à quinze kilomètres, avec un garage et un grand terrain.", "Une maison, pas loin."),
        "date": ("On signe dans un mois.", "Dans un mois."),
        "status": ("Propriétaires, enfin !", "Propriétaires."),
        "security": ("La maison est un peu isolée, la première voisine est à deux cents mètres. On voyage beaucoup aussi.", "Elle est un peu isolée."),
        "satisfaction": ("Avec vous ça se passait bien, l'application était pratique.", "Bien."),
    },
    fact_order=["equipment", "reason", "status", "destination", "security", "satisfaction", "date"],
    key_facts=["equipment", "security"],
    objections=["Mais il y a déjà une alarme, je ne vais pas en payer deux.", "Je ne vois pas pourquoi je changerais ce qui est déjà là.", "On verra bien si elle marche."],
    proposal_accept="Effectivement, je ne sais même pas si elle est reliée à quelqu'un. Si vous m'aidez à comparer et à voir ce qui est possible, je veux bien.",
    proposal_soft="Je ne sais pas, il faudrait déjà que je regarde ce qu'il y a.",
    closed_answers=["Oui.", "Non.", "Je crois.", "Aucune idée."],
    irritation_lines=["Je vous ai dit qu'il y avait déjà une alarme.", "Je ne vais pas payer deux fois."],
    empathy_reactions=["Merci ! Oui, on est contents.", "Oui, c'est un grand projet."],
    accept_cancel_line="Très bien, merci. Au revoir.",
    end_lines={"timeout": "Bon, je vais regarder de mon côté. Au revoir.", "irritated": "Non, je préfère arrêter. Merci."},
    initial_openness=5.0, initial_irritation=1.5, sensitivity=0.9,
))

_p(Persona(
    key="refus_total",
    label="Client qui refuse toute proposition",
    description="Part s'installer définitivement à l'étranger ; la rétention est très difficile. Attendu : respect, question d'ouverture, sortie de qualité (repreneur).",
    openings=["Bonjour. Je pars vivre en Espagne définitivement. Je veux résilier, et je préfère vous le dire tout de suite : je ne veux aucune proposition."],
    facts={
        "reason": ("On prend notre retraite là-bas, c'est un projet de longue date.", "La retraite."),
        "destination": ("Près de Valence, en Espagne.", "En Espagne."),
        "date": ("Dans deux mois.", "Dans deux mois."),
        "property": ("On vend la maison ici. On a déjà des acheteurs, un jeune couple.", "On vend."),
        "satisfaction": ("Vous avez été très bien, ce n'est pas la question.", "C'était bien."),
    },
    fact_order=["reason", "property", "destination", "date", "satisfaction"],
    key_facts=["property"],
    objections=["Je vous l'ai dit, aucune proposition.", "N'insistez pas, s'il vous plaît.", "C'est décidé."],
    proposal_accept="Ah, pour les acheteurs ? Oui, ça, pourquoi pas, envoyez-moi la démarche, je leur transmettrai.",
    proposal_soft="Non, je vous ai dit : pas de proposition.",
    closed_answers=["Oui.", "Non.", "C'est ça.", "Exactement."],
    irritation_lines=["Vous insistez, là.", "Je vous ai demandé de ne pas insister."],
    empathy_reactions=["Merci, oui, on est très heureux de ce projet.", "C'est gentil, merci."],
    accept_cancel_line="Merci de ne pas avoir insisté. Au revoir.",
    end_lines={"timeout": "Bon, merci, au revoir.", "irritated": "Je vais faire ça par courrier. Au revoir."},
    initial_openness=2.0, initial_irritation=3.0, sensitivity=1.5, retainable=False,
))

_p(Persona(
    key="indecis",
    label="Client indécis",
    description="Ne sait pas trop s'il a encore besoin d'une alarme dans son futur appartement en étage ; réceptif si on l'aide à réfléchir.",
    openings=["Bonjour… alors voilà, je déménage, et je me demandais… enfin je pense résilier, je ne sais pas trop si j'en aurai encore besoin."],
    facts={
        "reason": ("Je me rapproche de mon travail, je vais dans le centre-ville.", "Pour le travail."),
        "destination": ("Un appartement au troisième étage, dans une résidence avec digicode.", "Un appartement en étage."),
        "security": ("Je me dis qu'en étage c'est moins risqué… mais en même temps je pars souvent en déplacement, une semaine par mois, et j'ai du matériel photo assez cher.", "Je ne sais pas trop."),
        "satisfaction": ("J'étais plutôt content, ça me rassurait quand je partais.", "Plutôt content."),
        "date": ("Dans six semaines.", "Dans un mois et demi."),
        "status": ("Je loue.", "Locataire."),
    },
    fact_order=["reason", "destination", "security", "satisfaction", "date", "status"],
    key_facts=["security"],
    objections=["Je ne sais pas… en étage, c'est utile ?", "Je vais peut-être réfléchir.", "Je ne voudrais pas payer pour rien."],
    proposal_accept="Vu comme ça… oui, avec mes déplacements et le matériel, ça a du sens. D'accord, regardons comment ça se passerait.",
    proposal_soft="Peut-être… je ne sais pas.",
    closed_answers=["Oui… je crois.", "Non, pas vraiment.", "Peut-être.", "Je ne sais pas."],
    irritation_lines=["Vous me mettez un peu la pression, là.", "Je ne sais pas, je vous dis."],
    empathy_reactions=["Oui, c'est ça, je ne sais pas trop.", "Merci, c'est vrai que ce n'est pas évident."],
    accept_cancel_line="Ah… d'accord. Bon, merci. Au revoir.",
    end_lines={"timeout": "Je vais réfléchir encore un peu. Au revoir.", "irritated": "Bon, je préfère arrêter alors."},
    initial_openness=5.5, initial_irritation=1.0, sensitivity=1.0,
))

TOPIC_PATTERNS = {
    "reason": [r"\bpourquoi\b", r"\braison", r"\bqu'est-ce qui (vous )?(amene|motive|pousse|a decide)\b", r"\bprojet\b", r"\bcontexte\b", r"\bqu'est-ce qui se passe\b", r"\bqu'est-ce qui change\b"],
    "destination": [r"\bou (est-ce que )?(vous )?(demenagez|partez|allez|vous installez)\b", r"\bville\b", r"\bregion\b", r"\bnouve(au|lle) (logement|maison|appartement|adresse|chez-vous)\b", r"\bfutur (logement|domicile)\b", r"\bressembl", r"\bse presente\b", r"\bdecri"],
    "date": [r"\bquand\b", r"\bdate\b", r"\bmoment\b", r"\becheance\b", r"\bdans combien\b"],
    "status": [r"\bproprietaire\b", r"\blocataire\b", r"\bachat\b", r"\blocation\b", r"\bachete"],
    "security": [r"\bsecurite\b", r"\bquartier\b", r"\bcambriol", r"\bproteg", r"\binquiet", r"\bpreoccup", r"\bimportant pour vous\b", r"\brassur", r"\bvous sentir\b", r"\bseul", r"\babsen", r"\bdeplacement"],
    "satisfaction": [r"\bexperience\b", r"\bsatisf", r"\bs'est passe\b", r"\bjusqu'ici\b", r"\bapprecie", r"\bcontent\b", r"\bavis\b"],
    "budget": [r"\bbudget\b", r"\bfinanc", r"\bcher\b", r"\bprix\b", r"\bpayer\b", r"\bargent\b", r"\bpese\b"],
    "temporary": [r"\btemporaire\b", r"\bpassag", r"\bdurable\b", r"\bprovisoire\b", r"\bdans quelques mois\b", r"\bpour l'instant\b", r"\bperiode\b"],
    "equipment": [r"\binstallation\b", r"\bequipement", r"\bexistant", r"\bdeja en place\b", r"\btelesurveill", r"\bqui (gere|surveille)\b", r"\breliee?\b", r"\bfonctionne\b", r"\balarme (deja|actuelle|presente|en place)\b"],
    "problem": [r"\bs'est passe\b", r"\bprobleme\b", r"\bfausses?\b", r"\barrive\b", r"\bracont", r"\bexpliqu", r"\bqu'est-ce qui ne va pas\b", r"\bdecu\b"],
    "property": [r"\b(votre|le) logement actuel\b", r"\bmaison (actuelle|ici)\b", r"\bvend", r"\bdevient\b", r"\brepreneur", r"\bacheteur", r"\bque devient\b", r"\bgard(ez|er) (votre|un) (logement|bien)\b", r"\ben france\b"],
}
