// Contenu de la présentation, partagé par l'application web (src/slides.tsx)
// et par le générateur PowerPoint (scripts/build-pptx.mjs) : une seule source à mettre à jour.
// Règle de rédaction : aucun chiffre, horaire ou règle métier qui ne figure pas dans la note d'organisation.

export const colors = {
  black: '#111111',
  red: '#E30613',
  white: '#FFFFFF',
  darkGrey: '#242424',
  lightGrey: '#F2F2F2',
} as const;

export const deckTitle = 'Nouvelle organisation Movers';

// ── Diapositive 1 ────────────────────────────────────────────────
export const cover = {
  kicker: 'Réunion d’équipe · Service Movers',
  title: 'Nouvelle organisation Movers',
  subtitle:
    'Un fonctionnement plus clair, des tâches mieux structurées et une meilleure visibilité pour tous.',
  pillars: [
    { icon: 'Layers', label: 'Un fonctionnement plus clair' },
    { icon: 'ClipboardList', label: 'Des tâches mieux structurées' },
    { icon: 'Eye', label: 'Une meilleure visibilité pour tous' },
  ],
  footer: 'Une organisation commune, que toute l’équipe peut comprendre et appliquer.',
};

// ── Diapositive 2 ────────────────────────────────────────────────
export const day = {
  intro: 'La structure du planning reste la même qu’avant. Ce qui change : une séparation plus claire entre les deux activités.',
  usual: {
    label: 'Journée habituelle',
    blocks: [
      { kind: 'in', hours: 3, title: 'Réception', subtitle: 'Entrant' },
      { kind: 'out', hours: 4, title: 'Sortant', subtitle: 'Working on' },
    ],
  },
  special: {
    label: 'Une journée spécifique',
    blocks: [
      { kind: 'in', hours: 4, title: 'Réception', subtitle: 'Entrant' },
      { kind: 'out', hours: 3, title: 'Sortant', subtitle: 'Working on' },
    ],
  },
  planningNote: 'Les horaires précis et le jour concerné sont indiqués dans votre planning.',
  activities: [
    {
      kind: 'in',
      icon: 'PhoneIncoming',
      title: 'En réception',
      steps: ['On décroche', 'On identifie le besoin', 'On crée une tâche complète'],
    },
    {
      kind: 'out',
      icon: 'PhoneOutgoing',
      title: 'En sortant',
      steps: ['On traite les tâches attribuées', 'On réalise les rendez-vous téléphoniques'],
    },
  ],
} as const;

// ── Diapositive 3 ────────────────────────────────────────────────
export const roles = [
  {
    icon: 'Headset',
    count: '2 standardistes',
    title: 'Entrant',
    tasks: [
      'Réceptionner les appels',
      'Identifier la demande',
      'Récupérer les informations nécessaires',
      'Utiliser le bon template',
      'Créer une tâche claire et exploitable dans le CRM',
    ],
  },
  {
    icon: 'PhoneOutgoing',
    count: '2 agents sortants',
    title: 'Working on',
    tasks: [
      'Traiter les tâches attribuées',
      'Réaliser les appels sortants',
      'Effectuer les rendez-vous téléphoniques',
      'Mettre à jour les dossiers',
      'Respecter les processus et délais habituels',
    ],
  },
  {
    icon: 'UserCog',
    count: 'Le référent',
    title: 'Dispatch',
    tasks: [
      'Distribuer les tâches',
      'Suivre l’équilibre de la charge de travail',
      'Ajuster la rotation lorsque cela est nécessaire',
    ],
  },
  {
    icon: 'UserCheck',
    count: 'Le suppléant',
    title: 'Relais',
    tasks: ['Assurer le dispatch lorsque le référent est absent'],
  },
];

export const rolesMessage =
  'Chacun contribue au bon fonctionnement du service : la qualité des informations transmises facilite le travail de toute l’équipe.';

// ── Diapositives 4 à 8 : les cinq templates ──────────────────────
export type Template = {
  id: string;
  number: number;
  name: string;
  short: string;
  icon: string;
  fields: string[];
};

export const templates: Template[] = [
  {
    id: 'prio',
    number: 1,
    name: 'PRIO — Movers / Déménagement',
    short: 'Déménagement',
    icon: 'Truck',
    fields: [
      'Nom interlocuteur',
      'Numéro de téléphone',
      'Propriétaire / locataire',
      'Nouvelle adresse',
      'Date de déménagement',
      'Horaire de rappel',
      'Informations complémentaires',
    ],
  },
  {
    id: 'resiliation',
    number: 2,
    name: 'Movers — Résiliation',
    short: 'Résiliation',
    icon: 'FileX',
    fields: [
      'Nom interlocuteur',
      'Numéro de téléphone',
      'Date de déménagement',
      'Raison Résiliation',
      'Justificatif',
      'Horaire de rappel',
      'Informations complémentaires',
    ],
  },
  {
    id: 'resiliation-exception',
    number: 3,
    name: 'Movers — Résiliation Exception',
    short: 'Résiliation Exception',
    icon: 'FileExclamationPoint',
    fields: [
      'Nom interlocuteur',
      'Numéro de téléphone',
      'Date de déménagement',
      'Raison Résiliation',
      'Justificatif',
      'Horaire de rappel',
      'Informations complémentaires',
    ],
  },
  {
    id: 'takeovers',
    number: 4,
    name: 'Movers — Takeovers',
    short: 'Takeovers',
    icon: 'Handshake',
    fields: [
      'Nom',
      'Prénom',
      'Numéro de téléphone',
      'Business Name',
      'E-mail',
      'Date d’intégration',
      'Horaire de rappel',
      'Informations complémentaires',
    ],
  },
  {
    id: 'administratif',
    number: 5,
    name: 'Movers — Administratif',
    short: 'Administratif',
    icon: 'Briefcase',
    fields: [
      'Nom interlocuteur',
      'Numéro de téléphone',
      'Raison de l’appel',
      'Action à réaliser',
      'Rappel : oui ou non',
      'Si oui, horaire',
      'Informations complémentaires',
    ],
  },
];

export const templateById = (id: string): Template => {
  const found = templates.find((t) => t.id === id);
  if (!found) throw new Error(`Template inconnu : ${id}`);
  return found;
};

export const templatesOverview = {
  goalsTitle: 'Pourquoi des templates ?',
  rule: 'Chaque appel est qualifié avec le template qui correspond à la demande.',
  goals: [
    { icon: 'ListChecks', label: 'Ne pas oublier d’informations importantes' },
    { icon: 'ShieldCheck', label: 'Éviter les demandes incomplètes' },
    { icon: 'FolderSync', label: 'Faciliter la compréhension du dossier par l’agent qui le reprend' },
    { icon: 'MessageCircleX', label: 'Limiter les échanges pour récupérer les informations manquantes' },
  ],
};

// Exemple fictif : aucune donnée réelle.
export const prioExample = {
  title: 'Exemple fictif de tâche bien renseignée',
  values: [
    ['Nom interlocuteur', 'Mme Sophie Exemple'],
    ['Numéro de téléphone', '06 00 00 00 00'],
    ['Propriétaire / locataire', 'Locataire'],
    ['Nouvelle adresse', '12 rue de l’Exemple, 75000 Paris'],
    ['Date de déménagement', '15/12/2026'],
    ['Horaire de rappel', 'Demain, entre 10 h et 12 h'],
    ['Informations complémentaires', 'Préfère être rappelée sur son portable. A déjà les clés du nouveau logement.'],
  ] as [string, string][],
  avoid: '« Cliente qui déménage, à rappeler. »',
  message:
    'Des informations assez précises pour que l’agent sortant reprenne le dossier sans redemander ce qui a déjà été communiqué.',
};

export const resiliation = {
  sameFields: 'Les champs sont identiques',
  rule: 'La catégorie choisie doit correspondre au traitement applicable dans le processus existant.',
  doubt: 'En cas de doute sur la catégorie : se référer au processus existant.',
};

export const takeovers = {
  groups: [
    { label: 'Identité', fields: ['Nom', 'Prénom'] },
    { label: 'Contact', fields: ['Numéro de téléphone', 'E-mail'] },
    { label: 'Entreprise', fields: ['Business Name', 'Date d’intégration'] },
    { label: 'Suivi', fields: ['Horaire de rappel', 'Informations complémentaires'] },
  ],
  message: 'Des informations complètes facilitent la reprise et le suivi du dossier Takeovers.',
};

export const administratif = {
  essentials: [
    { icon: 'MessageCircle', title: 'La demande du client', text: 'Indiquer clairement ce que le client demande.' },
    { icon: 'ArrowRight', title: 'L’action attendue', text: 'Préciser ce qui doit être fait concrètement.' },
  ],
  key: 'Une tâche ne décrit pas seulement un problème : elle permet de comprendre l’action attendue.',
  before: {
    label: 'Problème seul',
    text: '« Le client appelle au sujet de son adresse e‑mail. »',
  },
  after: {
    label: 'Tâche exploitable',
    lines: [
      ['Raison de l’appel', 'Le client a changé d’adresse e‑mail.'],
      ['Action à réaliser', 'Mettre à jour l’adresse e‑mail dans le dossier.'],
      ['Rappel', 'Non'],
    ] as [string, string][],
  },
  exampleNote: 'Exemple fictif',
};

// ── Diapositive 9 ────────────────────────────────────────────────
export const rotation = {
  steps: ['Déménagement', 'Résiliation', 'Résiliation Exception', 'Takeovers'],
  restart: 'Nouveau cycle',
  purpose: 'La rotation sert à organiser la répartition des catégories de dossiers.',
  now: { label: 'Aujourd’hui', text: 'Le référent effectue le dispatch manuellement.' },
  later: { label: 'Dans un second temps', text: 'L’automatisation du dispatch sera envisagée.' },
};

// ── Diapositive 10 ───────────────────────────────────────────────
export const workload = {
  intro: 'Des règles communes, connues de tous, pour garder une charge de travail maîtrisée.',
  rules: [
    {
      icon: 'Inbox',
      situation: 'Accumulation de dossiers',
      effect: 'Le collaborateur est temporairement retiré de la rotation pour résorber son portefeuille.',
    },
    {
      icon: 'Hourglass',
      situation: 'Retard de traitement',
      effect: 'Le collaborateur est temporairement retiré de la rotation le temps de rattraper son retard.',
    },
    {
      icon: 'CalendarX',
      situation: 'No-show récurrent',
      effect: 'Deux rendez-vous non rappelés entraînent un déménagement attribué en moins.',
    },
  ],
  goalsTitle: 'L’objectif',
  goals: [
    'Maintenir une charge de travail maîtrisée',
    'Traiter les dossiers dans les délais',
    'Limiter les demandes en attente',
  ],
};

// ── Diapositive 11 ───────────────────────────────────────────────
export const changes = {
  columns: [
    {
      tone: 'change',
      icon: 'Sparkles',
      title: 'Ce qui change',
      tag: 'Dès maintenant',
      items: [
        'Une séparation plus claire entre réception et sortant',
        'Des templates communs',
        'Une rotation structurée',
        'Un dispatch centralisé par le référent',
        'Des règles communes de gestion de la charge',
      ],
    },
    {
      tone: 'same',
      icon: 'CircleCheck',
      title: 'Ce qui ne change pas',
      tag: 'Comme avant',
      items: [
        'Les processus habituels',
        'Les délais de traitement',
        'Les exigences de qualité',
        'La nécessité d’assurer un suivi rigoureux des dossiers',
      ],
    },
    {
      tone: 'later',
      icon: 'CalendarClock',
      title: 'Ce qui arrivera plus tard',
      tag: 'Évolutions futures',
      items: [
        'L’automatisation du dispatch',
        'Un agenda connecté pour visualiser les rendez-vous et les disponibilités',
      ],
    },
  ],
} as const;

// ── Diapositive 12 ───────────────────────────────────────────────
export const together = {
  quote:
    'Le but de cette organisation est que chacun sache quoi traiter, comment le traiter et où retrouver les bonnes informations. Avec des tâches mieux renseignées et une répartition plus claire, nous pouvons faciliter le travail de tous et améliorer le suivi collectif.',
  reflexesTitle: 'Trois réflexes à retenir',
  reflexes: [
    'Utiliser le bon template',
    'Renseigner les informations nécessaires',
    'Maintenir son portefeuille à jour et signaler les difficultés',
  ],
};

// ── Diapositive 13 ───────────────────────────────────────────────
export const questions = {
  title: 'Vos questions',
  subtitle: 'Un point n’est pas clair ? C’est le moment d’en parler.',
  revisit: 'Revenir sur un sujet',
};

// ── Plan de la présentation (titres, notes de l'orateur) ─────────
export type SlideMeta = {
  id: string;
  kicker: string;
  title: string;
  theme: 'dark' | 'light';
  notes: string;
};

export const slides: SlideMeta[] = [
  {
    id: 'cover',
    kicker: 'Introduction',
    title: 'Nouvelle organisation Movers',
    theme: 'dark',
    notes:
      'Présenter le projet comme une organisation commune : l’objectif est que chacun puisse la comprendre et l’appliquer. Annoncer le déroulé : la journée, les rôles, les templates, la rotation, la charge de travail et la suite.',
  },
  {
    id: 'day',
    kicker: 'Le planning',
    title: 'Comment va fonctionner notre journée ?',
    theme: 'light',
    notes:
      'La structure du planning ne change pas. On distingue simplement plus clairement les deux activités : 3 heures en réception et 4 heures en sortant / Working on, avec une journée spécifique à 4 heures de réception et 3 heures de sortant. Les horaires et le jour concerné sont ceux du planning de chacun.',
  },
  {
    id: 'roles',
    kicker: 'Les rôles',
    title: 'Qui fait quoi ?',
    theme: 'light',
    notes:
      'Insister sur la complémentarité : une tâche bien créée en réception, c’est un rappel plus simple en sortant. Le référent distribue et équilibre ; le suppléant prend le relais en son absence.',
  },
  {
    id: 'templates',
    kicker: 'Les templates',
    title: 'Les cinq templates : le bon réflexe',
    theme: 'dark',
    notes:
      'Chaque appel est qualifié avec le template correspondant. Le but n’est pas d’ajouter du travail, mais d’éviter les allers-retours pour récupérer une information manquante.',
  },
  {
    id: 'prio',
    kicker: 'Template 1',
    title: 'PRIO — Movers / Déménagement',
    theme: 'light',
    notes:
      'Parcourir les champs un à un, puis l’exemple fictif. Comparer avec une tâche trop vague : l’agent sortant devrait tout redemander.',
  },
  {
    id: 'resiliation',
    kicker: 'Templates 2 et 3',
    title: 'Résiliation et Résiliation Exception',
    theme: 'light',
    notes:
      'Les deux templates ont exactement les mêmes champs. La différence se joue sur la catégorie, qui doit correspondre au traitement applicable dans le processus existant.',
  },
  {
    id: 'takeovers',
    kicker: 'Template 4',
    title: 'Movers — Takeovers',
    theme: 'light',
    notes:
      'Huit champs, regroupés ici pour être retenus plus facilement : identité, contact, entreprise, suivi. Plus le dossier est complet, plus la reprise est simple.',
  },
  {
    id: 'administratif',
    kicker: 'Template 5',
    title: 'Movers — Administratif',
    theme: 'light',
    notes:
      'Deux éléments essentiels : la demande du client et l’action concrète à réaliser. Montrer la différence entre la description d’un problème et une tâche exploitable.',
  },
  {
    id: 'rotation',
    kicker: 'La rotation',
    title: 'Comment fonctionne la rotation ?',
    theme: 'dark',
    notes:
      'Dérouler le cycle étape par étape (bouton « Étape suivante »). Le dispatch est fait manuellement par le référent pour commencer ; l’automatisation sera envisagée dans un second temps.',
  },
  {
    id: 'workload',
    kicker: 'La charge de travail',
    title: 'Que se passe-t-il si la charge augmente ?',
    theme: 'light',
    notes:
      'Présenter les règles calmement : elles servent à garder une charge maîtrisée, à respecter les délais et à limiter les demandes en attente. Signaler tôt une difficulté permet d’ajuster.',
  },
  {
    id: 'changes',
    kicker: 'En résumé',
    title: 'Ce qui change et ce qui ne change pas',
    theme: 'light',
    notes:
      'Bien distinguer ce qui s’applique dès maintenant et ce qui arrivera plus tard (automatisation du dispatch, agenda connecté).',
  },
  {
    id: 'together',
    kicker: 'Conclusion',
    title: 'On avance ensemble',
    theme: 'dark',
    notes: 'Lire le message, puis reprendre les trois réflexes à retenir.',
  },
  {
    id: 'questions',
    kicker: 'Échange',
    title: 'Vos questions',
    theme: 'dark',
    notes:
      'Ouvrir la discussion. Les boutons permettent de revenir directement sur une diapositive pour répondre à une question.',
  },
];
