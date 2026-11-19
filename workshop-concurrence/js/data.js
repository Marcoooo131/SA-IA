/* ==========================================================================
   Workshop « Sector Alarm face à la concurrence » – contenu
   --------------------------------------------------------------------------
   Sources :
   - Concurrents : 4 captures fournies (assets/capture-*.png).
   - Sector Alarm : site officiel sectoralarm.fr, consulté le 19/11/2026.
   Statuts du tableau : "ok" inclus (vert), "opt" option ou sous conditions
   (orange), "no" non inclus (rouge), "na" information non disponible (gris),
   "info" donnée neutre (prix, engagement).
   Pour compléter une case Sector Alarm : remplacer ["na", "Non précisé"]
   par le statut et le texte confirmés en interne.
   ========================================================================== */
window.WORKSHOP = {
  title: 'Sector Alarm face à la concurrence',
  sourcesDate: '19/11/2026',

  /* ---------- Slide 1 ---------- */
  intro: {
    title: 'SECTOR ALARM VS LA CONCURRENCE',
    kicker: 'Workshop Movers · 20 à 30 minutes',
    hook: 'Un client ne compare pas toujours deux entreprises. Il compare deux promesses de sécurité.',
    actors: [
      { name: 'Sector Alarm', tag: 'Notre offre', main: true },
      { name: 'Homiris', tag: 'Confort · Sérénité' },
      { name: 'Nexecur', tag: 'Initiale · Intégrale' },
      { name: 'IMA Protect', tag: 'À la carte · Tout inclus' },
      { name: 'Offre à 40 €', tag: 'Concurrent · 12 mois' }
    ],
    question: 'Selon vous, quels sont les trois critères que les clients regardent en priorité lorsqu\'ils comparent deux sociétés de télésurveillance ?',
    hints: [
      'Le prix mensuel… et ce qu\'il comprend vraiment',
      'Ce qui se passe quand l\'alarme se déclenche (qui traite l\'alerte, en combien de temps)',
      'L\'intervention sur place et la mise en sécurité',
      'Le matériel et l\'installation',
      'L\'engagement et la confiance dans l\'entreprise'
    ]
  },

  /* ---------- Slide 2 : tableau ---------- */
  columns: [
    { name: 'Sector Alarm', sub: ['Essentiel / Sérénité'], main: true },
    { name: 'Homiris', sub: ['Confort', 'Sérénité'] },
    { name: 'Nexecur', sub: ['Initiale', 'Intégrale'] },
    { name: 'IMA Protect', sub: ['À la carte', 'Tout inclus'] },
    { name: 'Offre à 40 €', sub: ['Formule unique'] }
  ],
  /* Une ligne = libellé + une liste de cellules par colonne (une par formule).
     key: true = écart majeur, mis en avant avec le bouton « Faire ressortir les écarts ». */
  rows: [
    { label: 'Prix mensuel', key: true, cells: [
      [['info', 'dès 37,90 € / 43,90 €']],
      [['na', 'Non affiché'], ['na', 'Non affiché']],
      [['info', 'dès 21,90 €'], ['info', 'dès 32,90 €']],
      [['info', 'Sur devis'], ['info', 'dès 37,99 €']],
      [['info', '40 €']]
    ] },
    { label: 'Engagement', cells: [
      [['info', '12 mois minimum']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['info', '12 mois']]
    ] },
    { label: 'Matériel', key: true, cells: [
      [['opt', 'Frais en sus*']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Mis à dispo.'], ['ok', 'Mis à dispo.']],
      [['opt', 'Selon formule'], ['ok', 'En location']],
      [['ok', 'Mis à dispo.']]
    ] },
    { label: 'Détecteurs mouvement avec images', cells: [
      [['opt', 'Selon pack']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Inclus'], ['ok', 'Inclus']],
      [['ok', 'Inclus']]
    ] },
    { label: 'Détecteurs d\'ouverture', cells: [
      [['opt', 'Selon pack']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Inclus'], ['ok', 'Inclus']],
      [['ok', 'Inclus']]
    ] },
    { label: 'Détecteur de fumée', cells: [
      [['opt', 'Selon pack']],
      [['opt', 'Option'], ['ok', 'Inclus']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Option'], ['ok', 'Inclus']],
      [['na', 'Non précisé']]
    ] },
    { label: 'Application mobile', cells: [
      [['ok', 'Incluse']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Incluse'], ['ok', 'Incluse']],
      [['ok', 'Incluse'], ['ok', 'Incluse']],
      [['ok', 'Incluse']]
    ] },
    { label: 'Installation professionnelle', cells: [
      [['ok', 'Incluse']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Incluse'], ['ok', 'Incluse']],
      [['ok', 'Incluse'], ['ok', 'Incluse']],
      [['ok', 'Incluse']]
    ] },
    { label: 'Télésurveillance 24h/24 et 7j/7', key: true, cells: [
      [['ok', 'Incluse']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Option / relais'], ['ok', 'Incluse']],
      [['opt', 'Périodes choisies'], ['ok', 'Incluse']],
      [['ok', 'Incluse']]
    ] },
    { label: 'Traitement des alertes', key: true, cells: [
      [['ok', 'Opérateur < 20 s**']],
      [['opt', 'Analyse : option'], ['ok', 'Analyse incluse']],
      [['opt', 'Après 90 s si indispo.'], ['ok', 'À chaque alerte']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Gestion incluse']]
    ] },
    { label: 'Vérification audio et vidéo', cells: [
      [['opt', 'Photo + audio selon config.']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Selon service'], ['ok', 'Incluse']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé']]
    ] },
    { label: 'Téléinterpellation', cells: [
      [['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Selon formule'], ['ok', 'Incluse']],
      [['na', 'Non précisé']]
    ] },
    { label: 'Intervention d\'un agent', key: true, cells: [
      [['opt', 'Si incident confirmé']],
      [['opt', 'Option temporaire'], ['ok', 'Incluse']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Option'], ['opt', 'Selon nécessité']],
      [['opt', 'Selon conditions']]
    ] },
    { label: 'Gardiennage', key: true, cells: [
      [['na', 'Non précisé']],
      [['no', 'Non inclus'], ['ok', 'Inclus']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Option'], ['opt', 'Selon nécessité']],
      [['opt', 'Jusqu\'à 15 h']]
    ] },
    { label: 'Maintenance', cells: [
      [['ok', 'Durée du contrat']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['opt', 'Selon formule'], ['ok', 'Incluse']],
      [['ok', 'Incluse']]
    ] },
    { label: 'Changement des piles', cells: [
      [['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['na', 'Non précisé'], ['na', 'Non précisé']],
      [['ok', 'Inclus']]
    ] }
  ],
  tableNotes: [
    '* Sector Alarm : frais de mise à disposition du matériel en plus de l\'abonnement (Essentiel dès 799 € TTC, Sérénité dès 999 € TTC, hors promotion). IMA Protect : 99 € TTC de frais de mise en service sur les 2 offres.',
    '** Temps de réaction moyen sur les alarmes prioritaires (mesure interne auditée par SBSC). Homiris « gardiennage » = « mesures de sauvegarde (gardiennage ou sécurisation) ».'
  ],

  /* ---------- Slide 3 : fiches ---------- */
  competitors: [
    {
      name: 'Homiris',
      price: 'Tarifs non affichés sur la capture',
      gear: 'Détecteur de fumée : en option (Confort), inclus (Sérénité)',
      plus: 'Une formule de base modulable (Confort) et une formule complète (Sérénité) : analyse par un opérateur, intervention d\'un agent, mesures de sauvegarde',
      limits: 'En Confort : analyse opérateur en option, intervention en « option temporaire », mesures de sauvegarde non incluses',
      client: '« Je ne paie que les options dont j\'ai vraiment besoin. »'
    },
    {
      name: 'Nexecur',
      price: 'Le prix d\'appel le plus bas : dès 21,90 € (Initiale), dès 32,90 € (Intégrale)',
      gear: 'Matériel mis à disposition, installation pro, application, vidéo en direct (les 2 formules)',
      plus: 'Initiale : le client gère lui-même ses alertes. Intégrale : télésurveillance 24/7, opérateur à chaque alerte',
      limits: 'En Initiale : télésurveillance en option / relais, opérateur seulement après 90 s si le client est indisponible, vérification audio et vidéo selon le service activé',
      client: '« À 21,90 € par mois, je paie beaucoup moins cher. »'
    },
    {
      name: 'IMA Protect',
      price: 'Tout inclus dès 37,99 € + 99 € TTC de mise en service ; À la carte sur devis',
      gear: 'Centrale, clavier avec sirène, détecteurs d\'ouverture et de mouvement avec image ; en Tout inclus : détecteur de fumée connecté, haut-parleur de téléinterpellation, 2 badges',
      plus: 'Téléinterpellation, intervention d\'un agent et gardiennage affichés dans l\'offre',
      limits: 'Intervention et gardiennage : « selon nécessité » (Tout inclus), en option (À la carte) ; télésurveillance pendant les périodes choisies en À la carte',
      client: '« Chez eux, j\'ai le gardiennage et l\'intervention d\'un agent. »'
    },
    {
      name: 'Offre à 40 €',
      price: '40 €/mois, engagement 12 mois',
      gear: 'Centrale, clavier avec sirène, 5 détecteurs (mouvement avec images, infrarouges, choc et ouverture), 4 badges',
      plus: 'Installation, application, télésurveillance 24/7, gestion des alertes, maintenance et piles incluses ; visite d\'entretien tous les 3 ans',
      limits: 'Intervention d\'un agent selon conditions, gardiennage jusqu\'à 15 heures ; marque non identifiée sur la capture',
      client: '« Matériel et installation pro pour 40 € par mois, tout compris. »'
    }
  ],

  /* ---------- Slide 4 : défendre Sector Alarm ---------- */
  proofs: [
    { icon: 'headset', text: 'Télésurveillance 24h/24 et 7j/7 incluse dans l\'abonnement' },
    { icon: 'timer', text: 'Réaction en moins de 20 secondes en moyenne sur les alarmes prioritaires (mesure auditée)' },
    { icon: 'eye', text: 'Levée de doute : images du détecteur photo, contact téléphonique, écoute audio selon l\'installation' },
    { icon: 'shieldCheck', text: 'Si l\'incident est confirmé : envoi d\'un agent de sécurité et appel des services compétents' },
    { icon: 'truck', text: 'Installation professionnelle incluse, en moins de 24 h (sous réserve d\'éligibilité)' },
    { icon: 'repeat', text: 'Maintenance pendant toute la durée du contrat, application mobile incluse' }
  ],
  toCheck: 'À confirmer en interne avant de l\'affirmer au client : gardiennage, téléinterpellation, changement des piles, contenu exact des packs Essentiel et Sérénité.',
  method: [
    {
      n: 1, title: 'ACCUEILLIR', icon: 'ear',
      goal: 'Comprendre ce qui plaît au client dans l\'offre concurrente.',
      questions: [
        '« Qu\'est-ce qui vous a particulièrement intéressé dans cette offre ? »',
        '« Est-ce principalement le prix ou les prestations proposées ? »'
      ],
      answer: '« C\'est normal de comparer, et vous avez raison de le faire. Dites-moi ce qui vous a plu, qu\'on regarde ensemble si cela correspond à vos besoins. »'
    },
    {
      n: 2, title: 'COMPARER', icon: 'search',
      goal: 'Identifier les différences réelles entre les prestations.',
      questions: [
        '« Avez-vous vérifié ce qui est réellement compris dans l\'abonnement ? »',
        '« Si vous deviez choisir entre un tarif plus bas et un niveau de service différent, qu\'est-ce qui serait le plus important pour vous ? »'
      ],
      answer: '« Regardons les deux offres ligne par ligne : la télésurveillance 24/7 est-elle comprise ? Qui traite l\'alerte, et en combien de temps ? Que se passe-t-il si l\'intrusion est confirmée ? »'
    },
    {
      n: 3, title: 'VALORISER', icon: 'shieldCheck',
      goal: 'Expliquer concrètement ce que le client conserve ou gagne avec Sector Alarm.',
      questions: [
        '« Qu\'est-ce qui compte le plus pour vous quand l\'alarme se déclenche et que vous n\'êtes pas joignable ? »'
      ],
      answer: '« Avec nous, vous gardez une télésurveillance 24/7 comprise dans l\'abonnement : nos opérateurs réagissent en moins de 20 secondes en moyenne, vérifient l\'alerte, et envoient un agent si l\'incident est confirmé. Et la maintenance est assurée pendant tout le contrat. »'
    }
  ],

  /* ---------- Slide 5 : mises en situation ---------- */
  situations: [
    {
      title: 'Le prix', icon: 'wallet',
      quote: 'J\'ai trouvé une offre à 21,90 € chez Nexecur. Pourquoi je continuerais à payer plus cher chez vous ?',
      questions: [
        '« Ce tarif comprend-il une télésurveillance 24/7 avec un opérateur ? »',
        '« Si l\'alarme se déclenche et que vous ne répondez pas, qui prend le relais ? »',
        '« Qu\'est-ce qui compte le plus pour vous : le montant mensuel ou ce qui se passe en cas d\'alerte ? »'
      ],
      answer: 'Le 21,90 € correspond à la formule Initiale : la télésurveillance y est « en option / relais » et un opérateur ne traite l\'alerte qu\'après 90 secondes si le client est indisponible. La formule avec opérateur à chaque alerte est affichée dès 32,90 €. Chez Sector Alarm, la télésurveillance 24/7 est comprise dans l\'abonnement.',
      watch: 'Comparer à formule équivalente (Intégrale), et rester transparent : chez nous, le matériel est facturé en plus de l\'abonnement.'
    },
    {
      title: 'Les prestations', icon: 'shield',
      quote: 'Chez IMA Protect, j\'ai le gardiennage et l\'intervention d\'un agent.',
      questions: [
        '« Dans quelle offre : À la carte ou Tout inclus ? »',
        '« Avez-vous vu à quelles conditions ces services sont prévus ? »',
        '« Qu\'attendez-vous concrètement après une intrusion ? »'
      ],
      answer: 'Chez IMA Protect, intervention et gardiennage sont « en option » dans l\'offre À la carte et « selon nécessité » dans l\'offre Tout inclus (dès 37,99 € + 99 € TTC de mise en service). Chez Sector Alarm, si la levée de doute confirme l\'incident, un agent de sécurité est envoyé sur place et les services compétents sont contactés.',
      watch: 'Le gardiennage chez Sector Alarm n\'est pas détaillé sur le site : ne pas l\'affirmer sans validation interne.'
    },
    {
      title: 'Le matériel', icon: 'truck',
      quote: 'Mon nouveau prestataire me propose du matériel et une installation professionnelle pour 40 € par mois.',
      questions: [
        '« Combien de détecteurs, et de quels types ? »',
        '« Que se passe-t-il après le déclenchement : intervention, gardiennage, dans quelles limites ? »',
        '« Sur combien de temps vous engagez-vous ? »'
      ],
      answer: 'L\'offre à 40 € comprend 5 détecteurs et 4 badges, avec un engagement de 12 mois ; l\'intervention d\'un agent est « selon conditions » et le gardiennage limité à 15 heures. Chez Sector Alarm : installation professionnelle en moins de 24 h, télésurveillance 24/7, réaction moyenne en moins de 20 secondes, maintenance pendant tout le contrat.',
      watch: 'Engagement identique (12 mois minimum chez nous). Parler de service rendu, pas uniquement de matériel.'
    },
    {
      title: 'La formule', icon: 'target',
      quote: 'Chez Homiris, je peux prendre une formule moins chère et ajouter les options dont j\'ai besoin.',
      questions: [
        '« Quelles options vous seraient indispensables ? »',
        '« Une fois ces options ajoutées, quel serait le total mensuel ? »',
        '« Qu\'est-ce qui doit absolument être compris pour que vous soyez serein ? »'
      ],
      answer: 'En formule Confort, le détecteur de fumée et l\'analyse par un opérateur sont en option, l\'intervention d\'un agent est une « option temporaire » et les mesures de sauvegarde ne sont pas incluses. Il faut comparer le total, options comprises, avec ce qui est inclus chez Sector Alarm : télésurveillance 24/7, levée de doute, maintenance.',
      watch: 'Les prix Homiris ne sont pas sur la capture : ne pas avancer de chiffre.'
    }
  ],

  /* ---------- Slide 6 : conclusion ---------- */
  rules: [
    'Ne jamais critiquer gratuitement la concurrence.',
    'Ne jamais comparer uniquement les mensualités.',
    'Toujours vérifier les prestations réellement incluses.',
    'Revenir systématiquement aux besoins et aux attentes du client.'
  ],
  finalQuestion: 'Si votre client vous dit qu\'il a trouvé moins cher ailleurs, quelle sera votre première question ?',
  finalHints: [
    '« Qu\'est-ce qui vous a plu dans cette offre ? »',
    '« Qu\'est-ce qui est compris dans ce prix ? »',
    '« Qu\'est-ce qui est le plus important pour vous en cas d\'alerte ? »'
  ],
  closing: 'Notre objectif n\'est pas d\'être systématiquement les moins chers. Notre objectif est que le client comprenne pourquoi il choisit de rester chez Sector Alarm.',

  /* ---------- Notes de l'animateur (touche N) ---------- */
  notes: [
    '≈ 4 min. Lire l\'accroche, présenter les 5 acteurs. Poser la question, noter 3 critères dans les cases, puis révéler les pistes.',
    '≈ 6 min. Laisser lire 30 s. Cliquer « Faire ressortir les écarts » : prix, matériel, télésurveillance, traitement des alertes, intervention, gardiennage. Rappeler que le gris n\'est pas un « non ».',
    '≈ 5 min. Une fiche par concurrent : demander à l\'équipe pourquoi un client pourrait choisir cette offre AVANT de révéler l\'argument client. Pas de dénigrement.',
    '≈ 5 min. Dérouler les 3 étapes. N\'utiliser que les preuves Sector Alarm affichées ; le reste est à confirmer en interne.',
    '≈ 8 min. Choisir 2 ou 3 situations. 2 min de jeu, 1 min de débrief. Au moins 2 questions de découverte avant de répondre. Révéler ensuite les pistes.',
    '≈ 3 min. Révéler les 4 règles une par une, poser la question finale, conclure sur la phrase.'
  ]
};
