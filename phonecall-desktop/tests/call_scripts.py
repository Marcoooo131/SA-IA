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
