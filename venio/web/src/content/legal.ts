// Pages légales — version « palier 0 » (micro-entreprise, offre unique), rédigée le 24/11/2026 à partir du
// fonctionnement réel du produit et des modèles officiels (clauses de sous-traitance de la Commission européenne,
// guides de la CNIL). Relecture par un avocat prévue au palier 2 (voir plateforme-rdv/09).
// Règle : rien n'est inventé. Ce qui dépend de l'entreprise (identité, adresses, numéros) reste entre crochets
// « [À compléter : …] » et est surligné à l'écran tant qu'il n'est pas renseigné.
export type LegalDoc = { slug: string; title: string; version: string; sections: { title: string; paragraphs: string[] }[] };

const TBD = (what: string) => `[À compléter : ${what}]`;
const BRAND = "Venio";   // nom commercial provisoire (décision D1 en cours : « Vecall » envisagé)
const VERSION = "24 novembre 2026";
const PROVIDER = `${TBD("prénom et nom")}, entrepreneur individuel (EI), exerçant sous le nom commercial ${BRAND}`;
const CONTACT = TBD("adresse email de contact");

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "mentions-legales", title: "Mentions légales", version: VERSION,
    sections: [
      { title: "Éditeur", paragraphs: [
        `Le site et le service ${BRAND} sont édités par ${PROVIDER}.`,
        `Adresse : ${TBD("adresse de l'entreprise")}. Numéro SIREN : ${TBD("SIREN")}. Immatriculation : ${TBD("registre d'immatriculation")}.`,
        `TVA : ${TBD("« TVA non applicable, art. 293 B du CGI » en cas de franchise en base, sinon numéro de TVA intracommunautaire")}.`,
        `Directeur de la publication : ${TBD("prénom et nom")}. Contact : ${CONTACT}.` ] },
      { title: "Hébergement", paragraphs: [
        `Site internet : Netlify, Inc. ${TBD("adresse du siège")}.`,
        `Application (API) : Render Services, Inc., serveurs situés à Francfort (Allemagne). ${TBD("adresse du siège")}.`,
        `Base de données et fichiers : Supabase, Inc., serveurs situés à Paris (France). ${TBD("adresse du siège")}.` ] },
      { title: "Propriété intellectuelle", paragraphs: [
        `Les textes, éléments graphiques, le logo et le logiciel ${BRAND} sont protégés par le droit d'auteur. Toute reproduction ou réutilisation sans autorisation écrite est interdite.` ] },
    ],
  },
  {
    slug: "cgv", title: "Conditions générales de vente", version: VERSION,
    sections: [
      { title: "1. Objet et champ d'application", paragraphs: [
        `Les présentes conditions générales de vente (les « CGV ») régissent la souscription et l'utilisation du service en ligne ${BRAND} (le « Service »), fourni par ${PROVIDER} (le « Prestataire »).`,
        "Le Service est réservé aux professionnels (artisans, entreprises, indépendants) agissant dans le cadre de leur activité (le « Client »). Il n'est pas proposé aux consommateurs.",
        "Les CGV, les conditions générales d'utilisation et le contrat de sous-traitance des données forment ensemble le contrat entre le Client et le Prestataire. Ils prévalent sur tout autre document du Client." ] },
      { title: "2. Description du Service", paragraphs: [
        "Le Service permet au Client de publier une page de réservation en ligne, de poser à ses prospects des questions adaptées à son métier, de leur proposer des créneaux disponibles, d'envoyer par email les confirmations et rappels de rendez-vous, et de consulter les demandes reçues dans un espace sécurisé.",
        "La récupération des appels manqués (envoi d'un SMS contenant le lien de réservation après un appel non décroché) est proposée en version pilote : elle nécessite le renvoi des appels sans réponse du Client vers un numéro fourni par le Prestataire, et son activation se fait avec chaque Client, après vérification de sa ligne.",
        "Seules les fonctions décrites sur la page Tarifs à la date de la souscription sont dues. Les fonctions annoncées comme « à venir » ne font pas partie de l'offre." ] },
      { title: "3. Inscription et acceptation", paragraphs: [
        "La création d'un espace vaut acceptation des CGV, des conditions générales d'utilisation et du contrat de sous-traitance, matérialisée par une case à cocher. La date et la version acceptées sont enregistrées.",
        "Le Client garantit l'exactitude des informations fournies et les tient à jour." ] },
      { title: "4. Essai gratuit", paragraphs: [
        "Toute nouvelle inscription bénéficie d'un essai gratuit de 14 jours, sans carte bancaire et sans engagement.",
        "À la fin de l'essai sans abonnement, la page de réservation du Client n'accepte plus de nouvelles demandes. Les rendez-vous déjà confirmés et les données restent consultables ; le Client peut s'abonner à tout moment ou demander la suppression de ses données (article 15)." ] },
      { title: "5. Prix", paragraphs: [
        "Le prix de l'abonnement et des packs de crédits SMS est celui affiché sur la page Tarifs et rappelé lors du paiement. Il est exprimé hors taxes, par entreprise, avec une facturation mensuelle ou annuelle au choix du Client.",
        `Si le Prestataire bénéficie de la franchise en base de TVA, ses factures portent la mention « TVA non applicable, art. 293 B du CGI ». Dans le cas contraire, la TVA au taux en vigueur s'ajoute au prix hors taxes.`,
        "Le Prestataire peut modifier ses prix. Le Client en est informé par email au moins 30 jours avant leur application, qui ne prend effet qu'au renouvellement suivant ; il peut résilier avant cette date sans frais." ] },
      { title: "6. Paiement et factures", paragraphs: [
        "Le paiement se fait par carte bancaire, d'avance pour chaque période, par l'intermédiaire du prestataire de paiement Stripe. Le Prestataire n'a jamais accès aux numéros de carte.",
        "En cas d'abonnement pendant l'essai, la carte est enregistrée et le premier prélèvement a lieu à la fin de l'essai.",
        "Les factures sont disponibles à tout moment dans l'espace « Abonnement » du Client." ] },
      { title: "7. Durée, renouvellement et résiliation", paragraphs: [
        "L'abonnement est conclu pour la période choisie (un mois ou un an) et se renouvelle automatiquement pour une période identique.",
        "Le Client peut résilier à tout moment depuis son espace. La résiliation prend effet à la fin de la période en cours, déjà payée, qui n'est pas remboursée, y compris pour un abonnement annuel. Aucun frais de résiliation n'est appliqué.",
        "Le Prestataire peut résilier le contrat en cas de manquement grave du Client, après une mise en demeure restée sans effet pendant 15 jours, ou sans délai en cas d'usage illicite du Service (notamment l'envoi de messages non sollicités)." ] },
      { title: "8. Retard ou défaut de paiement", paragraphs: [
        "En cas d'échec de paiement, de nouvelles tentatives sont faites automatiquement et le Client est invité à mettre à jour sa carte. L'accès est maintenu 14 jours ; au-delà, la page de réservation n'accepte plus de nouvelles demandes, les rendez-vous déjà confirmés étant maintenus.",
        "Conformément à l'article L. 441-10 du Code de commerce, toute somme non payée à l'échéance entraîne de plein droit des pénalités de retard au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €." ] },
      { title: "9. Crédits SMS", paragraphs: [
        "Un crédit correspond à un SMS de 160 caractères standards. Les crédits inclus dans l'abonnement sont renouvelés chaque mois et ne se reportent pas d'un mois sur l'autre.",
        "Les crédits achetés en packs n'expirent pas tant que le compte du Client est ouvert. Ils ne sont ni remboursables ni transférables. Un crédit n'est pas consommé si le SMS n'est pas parti.",
        "Lorsque les crédits sont épuisés, aucun SMS n'est envoyé et aucun dépassement n'est facturé ; les appels manqués restent enregistrés. Des plafonds de sécurité (par numéro et par jour) protègent le Client contre les envois répétés." ] },
      { title: "10. Obligations du Client", paragraphs: [
        "Le Client utilise le Service conformément à la loi et aux conditions générales d'utilisation. Il est seul responsable des informations qu'il publie, des prestations qu'il propose et de la relation avec ses propres clients.",
        "Pour les données de ses prospects et clients, le Client est responsable de traitement au sens du RGPD : il les informe de l'utilisation de leurs données et respecte leurs droits, avec l'aide du Prestataire (contrat de sous-traitance).",
        "Le Client n'utilise pas les SMS du Service pour de la prospection commerciale ou des messages publicitaires, respecte les demandes d'opposition (STOP) et n'importe pas de numéros dans le Service sans base légale.",
        "Le Client garde ses identifiants confidentiels et signale sans délai toute utilisation non autorisée de son compte." ] },
      { title: "11. Disponibilité et assistance", paragraphs: [
        "Le Prestataire met en œuvre les moyens raisonnables pour que le Service soit accessible en continu, sans garantir une disponibilité ininterrompue. Des interruptions peuvent avoir lieu pour maintenance, si possible en dehors des heures ouvrées, ou en cas de panne d'un prestataire technique (hébergement, opérateurs de téléphonie et de SMS, emails).",
        `L'assistance est assurée par email (${CONTACT}), les jours ouvrés, en principe sous deux jours ouvrés.`,
        "La remise d'un SMS ou d'un email dépend des opérateurs : le Prestataire ne garantit ni sa réception ni son délai de réception." ] },
      { title: "12. Données personnelles", paragraphs: [
        "Le traitement des données des comptes clients est décrit dans la politique de confidentialité. Le traitement des données des prospects et clients du Client, réalisé pour son compte, est encadré par le contrat de sous-traitance des données, qui fait partie du contrat." ] },
      { title: "13. Responsabilité", paragraphs: [
        "Le Prestataire est tenu d'une obligation de moyens. Sa responsabilité ne peut être engagée que pour un dommage direct prouvé qui lui est imputable.",
        "Il ne répond pas des dommages indirects, notamment perte de chiffre d'affaires, de chantier, de clientèle ou de données dont le Client devait conserver une copie, ni des conséquences d'une information erronée fournie par le Client ou ses prospects.",
        "Sauf faute lourde ou intentionnelle, la responsabilité totale du Prestataire est limitée aux sommes payées par le Client au titre du Service au cours des 12 mois précédant le fait générateur." ] },
      { title: "14. Propriété intellectuelle", paragraphs: [
        "Le Service, son logiciel et ses contenus restent la propriété du Prestataire. Le Client bénéficie d'un droit d'utilisation personnel et non exclusif pendant la durée de son abonnement.",
        "Le Client reste propriétaire des données et contenus qu'il saisit ou que ses prospects transmettent (réponses, photos). Il autorise le Prestataire à les traiter dans la seule mesure nécessaire au Service." ] },
      { title: "15. Fin du contrat et réversibilité", paragraphs: [
        "À la fin du contrat, ou à tout moment sur demande, le Client peut obtenir une copie de ses données (demandes, contacts, rendez-vous) dans un format standard réutilisable, dans un délai de 30 jours.",
        "Sauf obligation légale de conservation, les données du Client sont supprimées au plus tard 3 mois après la fin du contrat, ou dans les 30 jours suivant une demande de suppression. Les copies de sauvegarde sont effacées selon leur cycle de rotation." ] },
      { title: "16. Contrats conclus hors établissement", paragraphs: [
        "Lorsque l'abonnement est conclu hors établissement (par exemple à l'issue d'une présentation sur un chantier) avec un professionnel employant cinq salariés au plus, et que l'objet du contrat n'entre pas dans le champ de son activité principale, celui-ci bénéficie des protections prévues par l'article L. 221-3 du Code de la consommation, dont un délai de rétractation de 14 jours." ] },
      { title: "17. Modification des CGV", paragraphs: [
        "Le Prestataire peut faire évoluer les CGV. La nouvelle version est communiquée par email au moins 30 jours avant son entrée en vigueur ; le Client qui la refuse peut résilier sans frais avant cette date." ] },
      { title: "18. Droit applicable et litiges", paragraphs: [
        "Les CGV sont soumises au droit français. En cas de différend, les parties recherchent d'abord une solution amiable. À défaut, le litige est porté devant les juridictions compétentes selon les règles de droit commun." ] },
    ],
  },
  {
    slug: "cgu", title: "Conditions générales d'utilisation", version: VERSION,
    sections: [
      { title: "1. Objet", paragraphs: [
        `Les présentes conditions encadrent l'utilisation du Service ${BRAND} : l'espace des entreprises clientes et les pages de réservation mises à la disposition de leurs prospects.` ] },
      { title: "2. Espace entreprise", paragraphs: [
        "L'accès est réservé aux personnes disposant d'un compte, protégé par un mot de passe d'au moins 10 caractères. En cas d'oubli, un lien de réinitialisation à usage unique, valable 30 minutes, est envoyé par email ; son utilisation ferme toutes les sessions ouvertes.",
        "Chaque utilisateur est responsable de la confidentialité de ses identifiants et des actions réalisées depuis son compte." ] },
      { title: "3. Usage acceptable", paragraphs: [
        "Il est interdit d'utiliser le Service pour envoyer des messages non sollicités ou publicitaires, publier des contenus illicites, trompeurs ou portant atteinte aux droits de tiers, tenter d'accéder aux données d'une autre entreprise, ou perturber le fonctionnement du Service.",
        "Le Prestataire peut suspendre sans délai un compte en cas d'usage manifestement illicite ou dangereux pour le Service ou pour des tiers, puis en informe le Client." ] },
      { title: "4. Pages de réservation (prospects)", paragraphs: [
        "Les prospects réservent sans créer de compte. Les informations qu'ils saisissent (coordonnées, réponses, photos) sont transmises à la seule entreprise concernée, qui en est responsable ; elles ne sont ni revendues ni partagées avec d'autres entreprises.",
        "Chaque réservation donne lieu à un lien personnel permettant de reporter ou d'annuler le rendez-vous dans le délai fixé par l'entreprise. Ce lien ne doit pas être partagé.",
        "Les photos envoyées sont ré-encodées pour supprimer leurs métadonnées, dont la position GPS." ] },
      { title: "5. SMS après appel manqué", paragraphs: [
        "Lorsque la fonction est activée par l'entreprise, la personne dont l'appel n'a pas abouti peut recevoir un SMS unique contenant le lien de réservation de l'entreprise. Des règles limitent les envois : jamais vers un numéro masqué ou fixe, jamais la nuit, au plus un SMS pour des appels rapprochés et trois par numéro sur 30 jours. Une demande d'opposition (STOP) met fin aux envois vers ce numéro." ] },
      { title: "6. Disponibilité", paragraphs: [
        "Les conditions de disponibilité et d'assistance sont celles des conditions générales de vente (article 11)." ] },
    ],
  },
  {
    slug: "confidentialite", title: "Politique de confidentialité", version: VERSION,
    sections: [
      { title: "1. Qui est responsable de vos données", paragraphs: [
        `Pour les comptes des entreprises clientes (identité, email, facturation, utilisation du Service), le responsable du traitement est ${PROVIDER}. Contact : ${CONTACT}.`,
        "Pour les données des prospects et clients qui réservent un rendez-vous ou dont l'appel a été manqué, le responsable du traitement est l'entreprise concernée. Le Prestataire agit alors comme sous-traitant, uniquement sur ses instructions (voir le contrat de sous-traitance). Pour exercer vos droits sur ces données, adressez-vous en priorité à cette entreprise." ] },
      { title: "2. Données traitées, finalités et bases légales", paragraphs: [
        "Comptes clients : nom, email, mot de passe chiffré (jamais lisible), entreprise, abonnement. Finalités : fournir le Service, facturer, assister, sécuriser. Base légale : exécution du contrat ; obligations légales pour la facturation.",
        "Prospects (pour le compte des entreprises) : prénom, nom, téléphone, email, adresse du rendez-vous, réponses au questionnaire, photos facultatives, créneau choisi ; pour un appel manqué : numéro appelant, date, SMS envoyé, ouverture du lien. Finalités : organiser le rendez-vous demandé, le confirmer et le rappeler, permettre à l'entreprise de le préparer.",
        "Statistiques : uniquement agrégées par entreprise (nombre de demandes, taux de conversion). Aucune donnée n'est revendue, utilisée à des fins publicitaires, ni utilisée pour entraîner un modèle d'intelligence artificielle." ] },
      { title: "3. Destinataires et sous-traitants", paragraphs: [
        "Les données ne sont accessibles qu'à l'entreprise concernée et, si nécessaire, au Prestataire pour assurer le Service ou l'assistance.",
        "Sous-traitants techniques : Supabase (base de données et fichiers, serveurs à Paris), Render (application, serveurs à Francfort), Netlify (site internet), Brevo (emails et SMS, France), Stripe (paiements des abonnements). Un opérateur de téléphonie s'ajoutera pour la récupération des appels manqués ; il figurera dans cette liste avant toute utilisation.",
        `Plusieurs de ces sociétés ont leur siège aux États-Unis. Garanties encadrant un éventuel transfert : ${TBD("à vérifier pour chaque prestataire (Data Privacy Framework ou clauses contractuelles types)")}.` ] },
      { title: "4. Durées de conservation", paragraphs: [
        "Comptes clients : pendant le contrat, puis 3 ans (prescription). Factures : 10 ans (obligation comptable), chez le prestataire de paiement.",
        "Données des prospects : selon les instructions de l'entreprise, et au plus 3 ans après le dernier contact. Journaux d'appels et de SMS : 12 mois. Espaces de démonstration : supprimés automatiquement sous 2 heures.",
        "Jetons de connexion et de réinitialisation : quelques minutes à 30 jours selon leur usage. Copies de sauvegarde, lorsqu'il en existe : effacées selon leur cycle de rotation." ] },
      { title: "5. Sécurité", paragraphs: [
        "Connexions chiffrées (HTTPS), mots de passe chiffrés avec l'algorithme Argon2, cloisonnement strict des données de chaque entreprise au niveau de la base de données, accès aux fichiers réservé à l'entreprise concernée, suppression des métadonnées des photos." ] },
      { title: "6. Vos droits", paragraphs: [
        `Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Écrivez à ${CONTACT} ; une réponse vous est apportée dans un délai d'un mois.`,
        "Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr)." ] },
    ],
  },
  {
    slug: "sous-traitance", title: "Contrat de sous-traitance des données", version: VERSION,
    sections: [
      { title: "1. Objet", paragraphs: [
        "Le présent contrat, annexé aux CGV, définit les conditions dans lesquelles le Prestataire (le « Sous-traitant ») traite des données personnelles pour le compte du Client (le « Responsable du traitement »), conformément à l'article 28 du règlement (UE) 2016/679 (RGPD). Il s'inspire des clauses contractuelles types adoptées par la Commission européenne (décision 2021/915)." ] },
      { title: "2. Description du traitement", paragraphs: [
        "Nature et finalité : hébergement et fonctionnement du Service de prise de rendez-vous et de récupération des appels manqués (collecte des demandes, proposition de créneaux, notifications, SMS après appel manqué, statistiques).",
        "Personnes concernées : prospects et clients du Responsable du traitement, personnes l'ayant appelé. Données : identité, coordonnées, adresse, réponses aux questions, photos, numéro de téléphone, informations sur les rendez-vous, appels et messages.",
        "Durée : celle du contrat, puis jusqu'à la suppression ou la restitution des données (article 8)." ] },
      { title: "3. Instructions", paragraphs: [
        "Le Sous-traitant ne traite les données que sur instruction documentée du Responsable du traitement : le contrat, la configuration de son espace et ses demandes écrites. Il l'informe s'il estime qu'une instruction est contraire à la réglementation." ] },
      { title: "4. Confidentialité et sécurité", paragraphs: [
        "Les personnes autorisées à traiter les données sont soumises à une obligation de confidentialité.",
        "Le Sous-traitant met en œuvre les mesures de l'article 32 du RGPD, notamment : chiffrement des communications, mots de passe chiffrés (Argon2), cloisonnement des données de chaque client au niveau de la base de données, accès aux fichiers restreint, suppression des métadonnées des photos." ] },
      { title: "5. Sous-traitants ultérieurs", paragraphs: [
        "Le Responsable du traitement autorise le recours aux sous-traitants ultérieurs listés dans la politique de confidentialité. Le Sous-traitant l'informe par email de tout ajout ou remplacement au moins 30 jours à l'avance ; le Responsable du traitement peut s'y opposer et, à défaut d'accord, résilier sans frais.",
        "Le Sous-traitant impose à ses sous-traitants ultérieurs des obligations équivalentes et reste responsable de leur exécution." ] },
      { title: "6. Assistance", paragraphs: [
        "Le Sous-traitant aide le Responsable du traitement à répondre aux demandes d'exercice des droits des personnes, transmet sans délai toute demande reçue directement, et l'assiste pour la sécurité, les analyses d'impact et la consultation de la CNIL le cas échéant." ] },
      { title: "7. Violations de données", paragraphs: [
        "Le Sous-traitant notifie au Responsable du traitement toute violation de données personnelles dans les meilleurs délais, et au plus tard 48 heures après en avoir pris connaissance, avec les informations disponibles (nature, données et personnes concernées, conséquences probables, mesures prises), afin de lui permettre de respecter son propre délai de notification à la CNIL." ] },
      { title: "8. Fin du traitement", paragraphs: [
        "À la fin du contrat, le Sous-traitant restitue les données sur demande dans un format standard sous 30 jours, puis les supprime au plus tard 3 mois après la fin du contrat, sauf obligation légale de conservation. Les copies de sauvegarde sont effacées selon leur cycle de rotation." ] },
      { title: "9. Contrôle", paragraphs: [
        "Le Sous-traitant met à disposition les informations nécessaires pour démontrer le respect de ses obligations. Un audit peut être réalisé, aux frais du Responsable du traitement, avec un préavis de 30 jours, sans accès aux données des autres clients." ] },
      { title: "10. Obligations du Responsable du traitement", paragraphs: [
        "Le Responsable du traitement fournit des instructions licites, informe les personnes concernées de l'utilisation de leurs données (notamment de l'envoi d'un SMS après un appel manqué), dispose d'une base légale pour chaque traitement et respecte les oppositions." ] },
    ],
  },
  {
    slug: "cookies", title: "Cookies", version: VERSION,
    sections: [
      { title: "Ce que nous déposons", paragraphs: [
        "Un seul cookie, strictement nécessaire : le cookie de session de l'espace entreprise (« venio_session »), déposé à la connexion pour vous garder connecté. Il ne sert à aucun suivi.",
        "Sur les pages de réservation, la progression du parcours est conservée dans le stockage local de votre navigateur pour vous permettre de reprendre plus tard ; elle n'est pas transmise à des tiers." ] },
      { title: "Ce que nous ne déposons pas", paragraphs: [
        "Aucun cookie publicitaire, aucun outil de mesure d'audience déposant des cookies. C'est pourquoi aucun bandeau de consentement n'est affiché. Si cela change, ce bandeau sera ajouté avant tout dépôt." ] },
    ],
  },
];
