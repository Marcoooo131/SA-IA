"""Fictional calls (synthetic data only) for the tests of the Phone Call template.

("mic", text) = advisor, ("system", text) = remote party.
"""

MOVERS = [
    ("mic", "Sector Alarm bonjour, Julie à votre écoute."),
    ("system", "Bonjour, je m'appelle Madame Durand, je suis titulaire du contrat."),
    ("system", "Je vous appelle parce que je déménage le 15 mars et je voudrais transférer mon alarme."),
    ("mic", "Très bien. Quelle est votre nouvelle adresse ?"),
    ("system", "Ma nouvelle adresse c'est 12 rue des Lilas à Lyon."),
    ("system", "Actuellement j'ai une centrale, deux détecteurs de mouvement et une caméra dans le salon."),
    ("mic", "D'accord. Un audit du nouveau logement est nécessaire avant l'installation."),
    ("mic", "Votre numéro WO est le 458213."),
    ("system", "Et mon contrat, il continue pareil ?"),
    ("mic", "Oui, votre contrat est conservé, sans nouvel engagement."),
    ("mic", "Je peux vous proposer un mois d'abonnement offert pour le transfert."),
    ("system", "D'accord, ça me va."),
    ("system", "Les nouveaux propriétaires de mon appartement voudraient peut-être reprendre une alarme."),
    ("mic", "Je vais transmettre leurs coordonnées au service commercial."),
    ("mic", "J'ai programmé l'audit, le technicien passera le 10 mars à 9 h."),
    ("mic", "Vous devez nous envoyer l'attestation de vente du logement."),
    ("system", "Je vous l'envoie cette semaine. Je ne suis disponible que le matin."),
    ("mic", "C'est noté. Votre dossier est en cours."),
    ("system", "Merci, au revoir."),
]

FRONTLINE = [
    ("mic", "Sector Alarm bonjour, je vous écoute."),
    ("system", "Bonjour, ma centrale sonne toutes les nuits sans raison depuis trois jours."),
    ("system", "J'avais déjà appelé la semaine dernière pour le même problème."),
    ("mic", "Je comprends. Le détecteur du garage a une pile faible, c'est souvent la cause des déclenchements."),
    ("system", "Pourquoi personne ne me l'a dit la dernière fois ?"),
    ("mic", "Le défaut n'apparaissait pas encore dans l'historique, il est apparu hier."),
    ("mic", "J'ai envoyé une nouvelle pile par courrier."),
    ("mic", "Vous allez la recevoir sous 48 heures."),
    ("system", "D'accord, merci."),
]

OUTGOING = [
    ("system", "Allô ?"),
    ("mic", "Bonjour, je suis Thomas de Sector Alarm. Est-ce que je suis bien avec Monsieur Martin ?"),
    ("system", "Oui, c'est moi."),
    ("mic", "Je vous appelle au sujet de votre demande de caméra supplémentaire."),
    ("mic", "Je peux vous proposer une caméra extérieure à 9 euros par mois."),
    ("system", "Non merci, je ne souhaite pas ajouter d'option pour le moment."),
    ("mic", "Très bien, je note votre refus. Bonne journée."),
]

INSUFFICIENT = [
    ("mic", "Sector Alarm bonjour."),
    ("system", "Bonjour, euh, attendez, je vous rappelle plus tard."),
]

CONTRADICTORY = [
    ("mic", "Sector Alarm bonjour, je vous écoute."),
    ("system", "Bonjour, je voudrais mettre à jour mon numéro de téléphone."),
    ("system", "Mon nouveau numéro c'est le 06 12 34 56 78."),
    ("mic", "Je répète : 06 12 34 56 79, c'est bien ça ?"),
    ("system", "Oui. Et je déménage le 3 avril."),
    ("system", "Ah non pardon, je déménage le 10 avril."),
    ("mic", "Je vous propose de garder votre contrat avec un mois offert."),
    ("system", "D'accord, je garde le contrat."),
    ("system", "Finalement non merci, je préfère résilier."),
]

MULTI_FOLLOW_UP = [
    ("mic", "Sector Alarm bonjour, je vous écoute."),
    ("system", "Bonjour, je voudrais changer mon badge et modifier mon code d'accès."),
    ("mic", "Je vais vous envoyer un nouveau badge par courrier sous 5 jours."),
    ("mic", "Vous devez nous renvoyer l'ancien badge dans l'enveloppe fournie."),
    ("mic", "Un technicien va vous appeler demain pour le code d'accès."),
    ("mic", "Je vous rappelle vendredi pour vérifier que tout fonctionne."),
    ("system", "Je vais aussi vous envoyer une photo du clavier."),
    ("system", "Parfait, merci beaucoup."),
]

ALL = {"movers": MOVERS, "frontline": FRONTLINE, "sortant": OUTGOING, "insuffisant": INSUFFICIENT,
       "contradictoire": CONTRADICTORY, "multi_suivi": MULTI_FOLLOW_UP}

# Transcript of a Movers outgoing call provided by the business team as an example (ANONYMISED:
# agent and agency names replaced), exactly as the app displayed it, transcription errors included.
TEAM_EXAMPLE_RAW = (
    "InterlocuteurSector Alarm 00:02InterlocuteurOù est-il ? 00:03ConseillerOui bonjour, Julien, Société Sector Alarm, "
    "vous allez bien ? 00:06InterlocuteurOui, très bien, merci. 00:08ConseillerOui, je vous appelais par rapport à votre "
    "demande que vous aviez faite en formulaire. 00:12InterlocuteurOui, c'est bien. 00:15ConseillerPar rapport à un "
    "déménagement. 00:17InterlocuteurC'est ça, donc je déménage 1 km plus loin. 00:17ConseillerDonc je venais un petit "
    "peu... Ouais. 00:21ConseillerOk, ça marche. 00:23InterlocuteurD'accord. 00:23ConseillerVoilà, et je vois que dans le "
    "message j'ai mis, bonjour, il est possible de procéder à la réinstallation de l'alarme avant la date du déménagement. "
    "00:29InterlocuteurOuais, parce que j'ai déjà l'autre bien, donc je peux déjà installer l'arm de l'autre côté. "
    "00:32ConseillerOk. 00:34ConseillerÇa marche. Donc nous, pour vous expliquer un petit peu comment ça se passe, c'est "
    "assez simple. En fait, le matériel qui est déjà installé, on n'y touche pas. On vient directement avec du nouveau "
    "matériel sans frais à la nouvelle adresse. 00:37InterlocuteurSector Alarm 00:46InterlocuteurD'accord, ok "
    "00:47ConseillerVoilà. Pour l'ancien matériel, en fait, on essaie de prendre contact avec soit les propriétaires, soit "
    "les futurs acheteurs pour savoir s'ils souhaitent en bénéficier ou non. 00:49InterlocuteurSector Alarm "
    "00:53InterlocuteurSector Alarm 00:56InterlocuteurAh, sachant que moi c'est une location auprès d'une agence Exemple "
    "Immobilier donc... 00:56ConseillerS'ils ne souhaitent pas. 01:02ConseillerSouvent nous on contacte l'agence en "
    "demandant est ce que vous voulez qu'on laisse ? Oui, non. Si c'est non, on retire le matériel et on le recycle. Ça ne "
    "vous impacte pas. 01:04InterlocuteurC'est... 01:12InterlocuteurD'accord, ok. Je vais juste les prévenir, puis... "
    "01:13ConseillerVoilà. 01:16ConseillerOui, ok, ça marche. Et dans tous les cas, si jamais eux ils souhaitent qu'on "
    "laisse l'alarme et que les futurs locataires la reprennent, vous bénéficierais de deux mots offerts. "
    "01:17InterlocuteurOk, ça va. 01:20InterlocuteurSector Alarm 01:23InterlocuteurSector Alarm 01:26InterlocuteurD'accord. "
    "Ok. Super. 01:27ConseillerVoilà, global grand. Au niveau du nouveau logement, vous avez d'électricité et pas de gros "
    "travaux. 01:29InterlocuteurD'accord. 01:33InterlocuteurNon, rien. 01:34ConseillerOk, super. Je vais regarder ce que "
    "j'ai comme date l'installation. 01:35InterlocuteurTout est prêt. 01:42ConseillerNon. 01:43ConseillerAlors au plus tôt "
    "je vais avoir 26, sinon j'ai le 27, 28, 20 plus ou 30. 01:50InterlocuteurPas importe, pour moi. "
    "01:52InterlocuteurAh, attendez, je vais quand même vérifier un truc. 26, 27, 28, 29, octobre, il y a une "
    "compatibilité. 01:52ConseillerBon. 01:53ConseillerOui. 01:55ConseillerTélés. 02:04InterlocuteurAvec l'une de ses "
    "lettres. 02:08InterlocuteurMerci. 02:11InterlocuteurOui en normalisation, bien entendu. 02:16InterlocuteurOk. Bon, on "
    "va faire après le 31 octobre si c'est possible. On rentre quand ? 02:22ConseillerAprès 31. 02:23InterlocuteurJeudi "
    "29. On rentre jeudi 29. 02:26ConseillerOk, c'est vous qui me dites si je mets jusqu'à là. 02:30InterlocuteurÀ partir "
    "du jeudi 29 quoi. 02:32ConseillerEt bah j'ai avoir le... 02:33InterlocuteurMaintenant, week-end, ce week-end. "
    "02:34ConseillerJe vais avoir le 29, le 30, ou sinon ça va être la semaine d'après avec le 4 novembre, 5 ou 6. Le 30 "
    "c'est parfait. 02:38InterlocuteurTrans... 02:39InterlocuteurC'est parfait."
)


def parse_team_transcript(raw: str) -> list[tuple[str, str, float]]:
    """(channel, text, start s) from the « SpeakerText mm:ss » format shown by the app."""
    import re

    out, start = [], 0.0
    for speaker, text, ts in re.findall(r"(Interlocuteur|Conseiller)(.*?)\s*(\d{2}:\d{2}|$)", raw):
        out.append(("system" if speaker == "Interlocuteur" else "mic", text.strip(), start))
        if ts:
            minutes, seconds = ts.split(":")
            start = int(minutes) * 60 + int(seconds)
    return out


TEAM_EXAMPLE = [(ch, text) for ch, text, _start in parse_team_transcript(TEAM_EXAMPLE_RAW)]
