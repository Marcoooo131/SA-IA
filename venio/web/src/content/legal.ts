// Pages légales : MODÈLES à compléter et à faire valider par un avocat avant tout lancement commercial.
// Les champs entre crochets ne sont pas inventés : ils dépendent de la société qui exploite Venio.
// Les faits techniques décrits (cookies, hébergement, sous-traitance) correspondent au fonctionnement réel du code.
export type LegalDoc = { slug: string; title: string; sections: { title: string; paragraphs: string[] }[] };

const TBD = (what: string) => `[À compléter : ${what}]`;

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "mentions-legales", title: "Mentions légales",
    sections: [
      { title: "Éditeur du site", paragraphs: [
        `${TBD("raison sociale, forme juridique et capital social")}`,
        `Siège social : ${TBD("adresse")}. Immatriculation : ${TBD("RCS et numéro SIREN")}. TVA intracommunautaire : ${TBD("numéro")}.`,
        `Directeur de la publication : ${TBD("nom")}. Contact : ${TBD("adresse email et téléphone")}.` ] },
      { title: "Hébergement", paragraphs: [
        `Interface web : Netlify, Inc. ${TBD("adresse du siège de l'hébergeur")}.`,
        `Application (API) : Render Services, Inc., région Francfort (Allemagne). ${TBD("adresse du siège de l'hébergeur")}.`,
        `Base de données et fichiers : Supabase, Inc., région Paris (France). ${TBD("adresse du siège de l'hébergeur")}.` ] },
      { title: "Propriété intellectuelle", paragraphs: [
        "Les textes, éléments graphiques, logo et logiciels de ce site sont protégés. Toute reproduction sans autorisation est interdite, sauf mention contraire." ] },
    ],
  },
  {
    slug: "cgv", title: "Conditions générales de vente",
    sections: [
      { title: "Objet", paragraphs: ["Les présentes conditions régissent la souscription par des professionnels aux offres d'abonnement du service Venio (prise de rendez-vous en ligne, récupération des appels manqués et services associés)."] },
      { title: "Offres, prix et paiement", paragraphs: [
        "Les offres et leurs limites sont décrites sur la page Tarifs. Les prix sont indiqués hors taxes, par entreprise, en facturation mensuelle ou annuelle. Le paiement est réalisé par carte via notre prestataire de paiement Stripe.",
        "Les crédits SMS supplémentaires sont vendus par packs prépayés, sans date d'expiration, non remboursables une fois consommés." ] },
      { title: "Essai gratuit", paragraphs: [`L'essai gratuit dure ${TBD("durée, actuellement 14 jours")} et ne requiert pas de carte bancaire. À son terme sans souscription, les nouvelles réservations sont suspendues ; les données restent accessibles ${TBD("durée de conservation après essai")}.`] },
      { title: "Durée, changement d'offre et résiliation", paragraphs: [
        "L'abonnement est sans engagement de durée au-delà de la période en cours. Le passage à une offre supérieure prend effet immédiatement, au prorata. La résiliation prend effet à la fin de la période payée.",
        `En cas d'impayé, l'accès est maintenu ${TBD("délai de grâce, actuellement 14 jours")}, puis les nouvelles réservations publiques sont suspendues ; les rendez-vous déjà confirmés sont maintenus.` ] },
      { title: "Responsabilité, droit applicable", paragraphs: [`${TBD("clauses de responsabilité, de niveau de service et de médiation, à rédiger avec un avocat")}`, `Droit applicable : droit français. ${TBD("juridiction compétente")}.`] },
    ],
  },
  {
    slug: "cgu", title: "Conditions générales d'utilisation",
    sections: [
      { title: "Accès au service", paragraphs: ["L'espace entreprise est réservé aux utilisateurs disposant d'un compte. Chaque utilisateur est responsable de la confidentialité de ses identifiants."] },
      { title: "Usage acceptable", paragraphs: [
        "L'entreprise s'engage à utiliser le service conformément à la réglementation, notamment en matière de données personnelles et de communications électroniques : contenu des SMS, information des personnes, prise en compte des oppositions.",
        "Les clients finaux réservent sans compte ; ils reçoivent un lien personnel pour gérer leur rendez-vous." ] },
      { title: "Disponibilité", paragraphs: [`${TBD("engagements de disponibilité et de maintenance")}`] },
    ],
  },
  {
    slug: "confidentialite", title: "Politique de confidentialité",
    sections: [
      { title: "Deux rôles distincts", paragraphs: [
        `Pour les comptes des entreprises clientes (identité, email, facturation), Venio est responsable du traitement : ${TBD("raison sociale et contact du délégué ou du responsable")}.`,
        "Pour les données des clients finaux qui réservent un rendez-vous (coordonnées, réponses, photos, numéro de téléphone d'un appel manqué), l'entreprise qui reçoit la demande est responsable du traitement ; Venio agit comme sous-traitant, uniquement pour son compte." ] },
      { title: "Données traitées et finalités", paragraphs: [
        "Gestion du compte et de l'abonnement ; prise, confirmation, rappel et gestion des rendez-vous ; récupération des appels manqués (numéro appelant, SMS envoyé, suivi du lien) ; statistiques d'usage agrégées par entreprise.",
        "Les images déposées sont ré-encodées pour supprimer leurs métadonnées, dont la position GPS. Aucune donnée n'est revendue ni utilisée à des fins publicitaires." ] },
      { title: "Hébergement et sous-traitants", paragraphs: ["Données hébergées dans l'Union européenne (Supabase, région Paris ; Render, région Francfort). Emails et SMS : Brevo. Paiement : Stripe.", `${TBD("liste exhaustive des sous-traitants et garanties de transfert le cas échéant")}`] },
      { title: "Durées de conservation et droits", paragraphs: [`${TBD("durées de conservation par catégorie de données")}`, `Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de portabilité : ${TBD("adresse de contact")}. Vous pouvez saisir la CNIL.`] },
    ],
  },
  {
    slug: "cookies", title: "Cookies",
    sections: [
      { title: "Ce que nous déposons", paragraphs: [
        "Un seul cookie, strictement nécessaire : le cookie de session de l'espace entreprise (« venio_session »), déposé à la connexion pour vous garder connecté. Il ne sert à aucun suivi.",
        "Sur les pages de réservation, la progression du parcours est conservée dans le stockage local de votre navigateur pour vous permettre de reprendre plus tard ; elle n'est pas transmise à des tiers." ] },
      { title: "Ce que nous ne déposons pas", paragraphs: ["Aucun cookie publicitaire, aucun outil de mesure d'audience déposant des cookies. C'est pourquoi aucun bandeau de consentement n'est affiché. Si cela change, ce bandeau sera ajouté avant tout dépôt."] },
    ],
  },
];
