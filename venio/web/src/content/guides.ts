// Guides de la page Ressources. Conseils pratiques, sans chiffre de marché ni statistique invérifiable.
export type Guide = { slug: string; title: string; summary: string; minutes: number; sections: { title: string; paragraphs: string[]; list?: string[] }[] };

export const GUIDES: Guide[] = [
  {
    slug: "reduire-les-appels-manques",
    title: "Réduire les appels manqués quand on travaille sur le terrain",
    summary: "Renvoi d'appel, message d'accueil, rappel rapide : les réglages qui évitent de perdre un prospect pendant un chantier ou une intervention.",
    minutes: 5,
    sections: [
      { title: "Comprendre pourquoi on manque des appels", paragraphs: [
        "Sur un chantier, au volant ou en rendez-vous, décrocher n'est pas toujours possible ni prudent. Le problème n'est pas l'appel manqué lui-même, mais ce qui se passe ensuite : un prospect qui tombe sur une messagerie appelle souvent le concurrent suivant.",
        "L'objectif est donc double : donner une réponse immédiate à l'appelant, et vous permettre de traiter la demande au moment où vous êtes disponible." ] },
      { title: "Les réglages à faire sur votre ligne", paragraphs: ["La plupart des opérateurs permettent un renvoi conditionnel, activé uniquement quand vous ne décrochez pas :"],
        list: ["Renvoi sur non-réponse : l'appel est transféré après quelques sonneries.", "Renvoi sur occupation : quand vous êtes déjà en ligne.", "Renvoi si injoignable : téléphone éteint ou sans réseau."] },
      { title: "Un message d'accueil qui oriente", paragraphs: [
        "Si l'appel aboutit sur une messagerie, dites clairement ce qui va se passer : « vous allez recevoir un SMS pour décrire votre besoin et réserver un créneau », plutôt que « laissez un message ». Un prospect préfère une action simple à un message vocal qu'il n'est pas sûr de voir traité." ] },
      { title: "Rappeler vite, et seulement quand c'est utile", paragraphs: [
        "Gardez un créneau dans la journée pour rappeler les appels sans demande associée. Pour les autres, la demande écrite (besoin, photos, adresse) vous permet de rappeler en sachant déjà de quoi il s'agit, ou de ne pas rappeler du tout si le rendez-vous est déjà pris." ] },
      { title: "Mesurer", paragraphs: [
        "Comptez sur un mois les appels manqués, les demandes obtenues et les rendez-vous qui en découlent. C'est le seul moyen de savoir si vos réglages fonctionnent : Venio affiche ces chiffres pour la récupération des appels manqués." ] },
    ],
  },
  {
    slug: "preparer-une-visite-technique",
    title: "Préparer une visite technique avant de se déplacer",
    summary: "Les informations à demander avant de vous déplacer chez un client, pour arriver préparé et éviter les visites inutiles.",
    minutes: 4,
    sections: [
      { title: "Ce qu'il faut savoir avant de partir", paragraphs: ["Chaque déplacement coûte du temps. Avant une visite, quelques informations suffisent souvent à préparer le bon matériel, le bon interlocuteur, ou à se rendre compte qu'un appel suffit :"],
        list: ["La nature précise des travaux ou du besoin.", "Les dimensions ou la surface approximative.", "Le type de logement et son ancienneté (utile notamment pour la TVA applicable aux travaux).", "Le délai souhaité, et si le client se renseigne seulement.", "Des photos de l'existant.", "L'adresse exacte et les conditions d'accès."] },
      { title: "Poser les questions sans décourager", paragraphs: [
        "Un long formulaire fait fuir. Posez une question à la fois, proposez des choix plutôt que du texte libre, et rendez les questions sensibles facultatives (budget, photos). Expliquez pourquoi vous demandez : « cela nous aide à préparer votre devis »." ] },
      { title: "Orienter vers le bon rendez-vous", paragraphs: [
        "Toutes les demandes ne méritent pas une visite. Un client qui « se renseigne » sera mieux servi par un appel court ; un projet complet, photos à l'appui, justifie un déplacement. Prévoyez ces règles dans votre parcours plutôt que de trier à la main." ] },
    ],
  },
  {
    slug: "reduire-les-absences-aux-rendez-vous",
    title: "Réduire les absences aux rendez-vous",
    summary: "Confirmation immédiate, rappel la veille, report facile : ce qui aide réellement un client à venir, ou à prévenir.",
    minutes: 4,
    sections: [
      { title: "Confirmer tout de suite, par écrit", paragraphs: [
        "Une confirmation reçue dans la minute, avec la date, l'heure, l'adresse et un fichier à ajouter à l'agenda, ancre le rendez-vous. Un client qui n'a rien reçu doute de sa réservation." ] },
      { title: "Rappeler au bon moment", paragraphs: [
        "Un rappel la veille laisse le temps de s'organiser, ou de prévenir. Envoyez-le par email, et par SMS uniquement si le client l'a accepté." ] },
      { title: "Rendre le report plus simple que l'oubli", paragraphs: [
        "Un client empêché qui doit appeler pour décaler a de bonnes chances de ne rien faire. Un lien pour reporter ou annuler en deux clics transforme une absence en créneau libéré, que quelqu'un d'autre pourra réserver. Fixez un délai minimum (par exemple 24 heures) pour garder la maîtrise de votre planning." ] },
      { title: "Suivre le taux d'absence", paragraphs: [
        "Marquez les rendez-vous « absent » dans votre agenda : sur quelques mois, vous verrez si vos rappels fonctionnent, et pour quelles prestations." ] },
    ],
  },
];
