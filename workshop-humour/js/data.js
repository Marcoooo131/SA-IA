/*
 * Contenu du workshop « L'humour brise-glace » : utiliser une touche d'humour bienveillant pour détendre
 * un client qui déménage, rendre l'appel agréable et faciliter le transfert de son alarme, sans jamais le vexer.
 * Tout le texte pédagogique est ici : modifiez ce fichier, aucune compilation nécessaire.
 * Le moteur (affichage, quiz, voix…) est partagé : ../workshop-commun/.
 */
window.WORKSHOP_DATA = {
  storageKey: 'workshop-humour',

  labels: {
    introEyebrow: 'Workshop Movers · Relation client',
    introTitleHtml: "L'humour <span class=\"accent\">brise-glace</span>",
    cmpEyebrow: 'Étape 2 · Comprendre la différence',
    cmpTitleHtml: 'La réponse sans relief <span class="vs">ou</span> celle qui fait sourire ?',
    cmpLead: "Même client, même demande. Une réponse efficace mais froide, ou la même réponse avec une touche de légèreté : écoutez la différence.",
    cmpClosedTag: 'Réponse sans relief',
    cmpOpenTag: 'Réponse avec le sourire',
    meterLabel: 'Complicité avec le client',
    cmpWhyTitle: 'Pourquoi la deuxième réponse détend-elle le client ?',
    openersTitle: "L'humour qui marche",
    closersTitle: "L'humour à proscrire",
    examplesTitle: 'À vous : comment ajouteriez-vous une touche de sourire ?',
    flipClosed: 'Sans relief',
    flipOpen: 'Avec le sourire',
    flipBack: 'Revenir à la version sans relief',
    sitEyebrow: 'Étape 3 · Mises en situation Movers',
    sitTitle: '4 clients, 4 dosages d’humour',
    sitLead: "Pour chaque client, l'équipe décide d'abord SI l'humour a sa place, puis propose sa phrase. On révèle ensuite pas à pas les phrases, les réactions du client et ce que le sourire a ouvert.",
    stages: ['Contexte', 'Le faux pas', 'Phrases', 'Ouvertures', 'Conclusion'],
    questionsLabel: 'Phrases avec le sourire',
    questionsPrompt: "<strong>À vous de jouer.</strong> L'humour est-il le bienvenu avec ce client ? Si oui, quelle phrase légère diriez-vous ? Proposez avant de révéler le support.",
    revealQuestion: 'Révéler la phrase',
    oppsLabel: 'Ce que le sourire a ouvert',
    oppsPrompt: "<strong>Le client a souri ?</strong> Qu'est-ce que cette détente vous permet maintenant pour le déménagement de son alarme ?",
    oppsReveal: 'Révéler les ouvertures',
    oppsHide: 'Masquer les ouvertures',
    synthesisLabel: 'Phrase de transition vers le déménagement',
    trEyebrow: 'Étape 4 · Exercice collectif',
    trTitle: 'Ajoute une touche de sourire !',
    trLead: "Une phrase correcte mais robotique s'affiche. À l'équipe de la rendre plus humaine, avec une pointe d'humour bienveillant. Puis on compare.",
    trTag: 'Phrase sans relief',
    trHint: 'Réaction probable : « Hm. » … la conversation reste administrative.',
    trRevealTag: 'Version avec le sourire',
    trReveal: 'Révéler une version avec le sourire',
    trNext: 'Phrase suivante',
    quizTitle: 'Saurais-tu faire sourire ce client ?',
    quizLead: "Trois clients tirés au hasard. Choisissez la meilleure réponse… et attention : parfois, la meilleure réponse est sans humour.",
    quizAsk: 'Quelle est la meilleure réponse ?',
    quizBest: 'Meilleure réponse',
    quizMsgs: [
      ['On rejoue ?', "L'humour est un art délicat. Retenez la règle d'or : on rit avec le client, jamais de lui, et jamais à chaud."],
      ['Bon début', 'Vous sentez la légèreté. Attention au dosage et au moment.'],
      ['Très bien joué', 'Vous savez faire sourire sans déraper. Encore un effort pour un sans-faute !'],
      ['Sans-faute !', 'Le bon mot, au bon moment, avec la bonne personne. Le client raccroche le sourire aux lèvres. Bravo.']
    ],
    conclTitle: "Les 5 règles d'or de l'humour"
  },

  centralMessage:
    "Le client n'a pas besoin d'un humoriste. Il a besoin d'un conseiller humain, qui sait aussi le faire sourire.",

  steps: [
    {
      id: 'introduction',
      label: 'Introduction',
      duration: '5 min',
      notes:
        "Demandez à l'équipe : « Racontez-moi un appel où un client a ri avec vous. Qu'est-ce qui s'est passé ensuite ? » Faites remarquer que la suite de l'appel est presque toujours plus facile."
    },
    {
      id: 'sans-relief-ou-sourire',
      label: 'Sans relief ou sourire',
      duration: '10 min',
      notes:
        "Faites lire les deux réponses à voix haute par deux agents différents. Insistez sur le ton : l'humour passe par le sourire dans la voix, pas par la blague elle-même. Puis lisez la liste « à proscrire » : c'est la partie la plus importante."
    },
    {
      id: 'situations',
      label: 'Mises en situation',
      duration: '20 min',
      notes:
        "Pour chaque client, faites d'abord voter : « Humour ou pas humour ? » avant de chercher des phrases. La situation 4 (client en colère) montre quand l'humour est interdit : prenez le temps de la débattre."
    },
    {
      id: 'touche-de-sourire',
      label: 'Touche de sourire',
      duration: '10 min',
      notes:
        "Encouragez les formulations personnelles : un humour qui ressemble à l'agent sonne vrai. Écartez avec bienveillance les propositions qui pourraient vexer, en expliquant pourquoi."
    },
    {
      id: 'challenge',
      label: 'Challenge final',
      duration: '5 min',
      notes:
        "Vote à main levée (A, B ou C) avant de cliquer. Certains clients appellent une réponse SANS humour : c'est voulu. Rejouer tire trois nouveaux clients."
    },
    {
      id: 'conclusion',
      label: 'Conclusion',
      duration: '5 min',
      notes:
        "Demandez à chacun sa phrase « sourire » préférée, celle qu'il se sent à l'aise de dire. Rappelez qu'on n'oblige personne à faire de l'humour : un ton chaleureux suffit déjà."
    }
  ],

  /* ÉCRAN 1 */
  intro: {
    subtitle: 'Faire sourire avant de convaincre.',
    principles: [
      { icon: 'heart', title: 'Sourire avec le client', rest: 'jamais de lui.', text: "On rit d'une situation partagée, pas de la personne ni de son problème." },
      { icon: 'target', title: 'Doser', rest: 'une touche, pas un sketch.', text: 'Un trait léger suffit. Puis on revient tout de suite au concret.' },
      { icon: 'ear', title: 'Lire le moment', rest: "l'écoute d'abord.", text: "L'humour vient après l'écoute, jamais à la place. Avec un client en colère : pas d'humour." }
    ],
    hook: 'Un client qui sourit au téléphone a déjà baissé la garde.'
  },

  /* ÉCRAN 2 */
  comparison: {
    closed: {
      question: 'Très bien. Pour le dossier, il me faut votre numéro de contrat, votre nouvelle adresse et votre date de déménagement.',
      answer: '(soupir) Oui… attendez, je cherche.',
      gain: 18,
      verdict: "La réponse est correcte, mais l'alarme reste une corvée de plus. Le client subit l'appel."
    },
    open: {
      question:
        "Ah, le déménagement : trois semaines à porter des cartons, et on ne retrouve jamais celui des câbles ! Rassurez-vous, l'alarme, c'est moi qui m'en occupe : un carton de moins pour vous.",
      answer: "(rire) Le carton des câbles, c'est exactement ça ! Bon, allez-y, je vous écoute.",
      gain: 85,
      tone: 'green',
      verdict: "Le client sourit, se sent compris et pris en charge. L'alarme devient une aide, pas une contrainte."
    },
    why: [
      { icon: 'users', title: '1. Une complicité partagée', text: "On rit d'une galère que tout le monde connaît (les cartons), jamais du client." },
      { icon: 'sparkles', title: '2. On dédramatise', text: "« Un carton de moins » : le souci de l'alarme devient léger et simple." },
      { icon: 'flag', title: '3. On enchaîne sur du concret', text: "Le sourire ouvre la porte, la prise en charge suit immédiatement." }
    ],
    openers: [
      'Un carton de moins pour vous !',
      'Je prends le relais, vous gardez les cartons',
      "Bonne nouvelle : l'alarme, vous n'avez pas à la porter",
      "Promis, ce sera plus rapide que de monter l'armoire",
      'Je reviens avant la fin de la musique !',
      'Bon courage pour le Tetris du camion !'
    ],
    closers: [
      'Se moquer du client',
      'Ironiser sur la panne ou le retard',
      'Plaisanter quand le client est en colère',
      'Blagues sur les cambriolages',
      'Le sarcasme',
      'Les sujets sensibles (politique, religion, physique…)',
      'Insister si le client ne rit pas'
    ],
    examples: [
      {
        closed: 'Je vais vous mettre en attente.',
        open: "Je vous mets trente secondes en attente. Promis, je reviens avant la fin de la musique !",
        insight: "Le client sait combien de temps il attend, et l'attente devient plus légère."
      },
      {
        closed: 'Il me faut votre nouvelle adresse.',
        open: "Et alors, cette nouvelle adresse ? Je note… et rassurez-vous, je ne m'invite pas à la crémaillère !",
        insight: "Une question administrative devient un moment sympathique."
      },
      {
        closed: 'Le technicien passera entre 8 h et 12 h.',
        open: "Le technicien passera entre 8 h et 12 h : de quoi prendre le café tranquillement avant son arrivée !",
        insight: "On donne la même information, avec une image agréable plutôt qu'une contrainte."
      }
    ]
  },

  /* ÉCRAN 3 – quatre clients, quatre dosages. `questions` = phrases avec le sourire. */
  situations: [
    {
      id: 'cartons',
      icon: 'truck',
      title: 'Le client débordé par les cartons',
      teaser: '« Je n’ai pas la tête à ça… »',
      context:
        "Le client appelle au milieu des cartons, à une semaine du déménagement. Il est fatigué mais pas fâché. Il pense résilier l'alarme « pour avoir une chose de moins à gérer ».",
      goal:
        "Détendre l'appel par une complicité légère sur le déménagement, puis montrer que garder l'alarme est plus simple que de l'arrêter.",
      badApproach: "Résilier ? Vous êtes sûr ? Vous savez que c'est pendant les déménagements qu'il y a le plus de cambriolages…",
      badWhy:
        "On remplace la légèreté par la peur. Le client, déjà fatigué, se sent mis sous pression : il se ferme, et la relation se dégrade.",
      questions: [
        {
          q: "Une semaine avant le jour J ? Alors vous êtes en pleine phase « on n'a jamais eu autant d'affaires de notre vie » !",
          a: "(rire) Exactement ! On se demande comment tout ça tenait dans l'appartement.",
          insight: "Une galère universelle, racontée avec le sourire : le client se sent compris."
        },
        {
          q: "Bonne nouvelle : l'alarme, c'est le seul objet de la maison que vous n'aurez pas à porter. Je m'occupe de tout.",
          a: 'Ah ça, ça me plaît ! Et concrètement, ça se passe comment ?',
          insight: "L'humour transforme la résiliation en service rendu. Le client pose lui-même la question de la suite."
        },
        {
          q: "C'est très simple : vous me donnez la nouvelle adresse, je cale l'installation, et vous, vous gardez toute votre énergie pour le canapé dans l'escalier !",
          a: "(rire) Le canapé, c'est mon cauchemar ! Bon, d'accord, notez l'adresse.",
          insight: 'Un deuxième clin d’œil, puis du concret : le client donne son accord.'
        },
        {
          q: "Le premier soir dans la nouvelle maison, vous préférez dormir sur vos deux oreilles ou sur un carton ?",
          a: '(rire) Sur mes deux oreilles, et protégé, tant qu’à faire !',
          insight: "Le client formule lui-même le bénéfice de la protection, sans aucune peur."
        }
      ],
      opportunities: [
        { title: 'Le client a ri deux fois', text: 'La complicité est installée : il est réceptif.' },
        { title: 'Un souci en moins', text: "Le transfert est présenté comme une aide qui allège son déménagement." },
        { title: 'Accord pour avancer', text: 'Il donne spontanément sa nouvelle adresse.' },
        { title: 'Protection dès l’arrivée', text: "Planifier l'installation au plus près de l'emménagement." }
      ],
      synthesis:
        "« Parfait, je récapitule : je m'occupe du transfert vers votre nouvelle adresse, vous n'avez rien à porter ni à organiser, et la maison est protégée dès votre arrivée. Le seul carton qui reste à trouver, c'est celui des câbles ! »",
      conclusion:
        "Avec un client fatigué mais pas fâché, l'humour est un allié : il transforme une corvée en service. On rit de la situation, puis on enchaîne tout de suite sur du concret."
    },
    {
      id: 'attente',
      icon: 'timer',
      title: "Le client agacé par l'attente",
      teaser: '« Vingt minutes d’attente ! »',
      context:
        "Le client a attendu vingt minutes avant d'être pris en charge. Il est agacé, sans être furieux, et commence par une remarque sèche sur le temps perdu. Il appelle pour son déménagement.",
      goal:
        "S'excuser d'abord, sincèrement, puis utiliser une pointe d'autodérision pour faire retomber l'agacement et repartir sur de bonnes bases.",
      badApproach: '(rire) Vingt minutes ? Vous avez eu de la chance, ce matin c’était quarante !',
      badWhy:
        "L'humour arrive avant l'excuse et minimise la gêne du client. Il a l'impression qu'on se moque de son temps perdu : l'agacement se transforme en colère.",
      questions: [
        {
          q: "Vingt minutes, c'est beaucoup trop, je suis vraiment désolé. Merci de votre patience.",
          a: "Bon… merci. Ce n'est pas contre vous, mais c'est long.",
          insight: "L'excuse vient d'abord, sans humour : l'agacement redescend déjà."
        },
        {
          q: "Vous connaissez maintenant notre musique d'attente par cœur… Je vous promets de vous la faire oublier !",
          a: "(petit rire) Je pourrais vous la chanter, oui !",
          insight: "L'autodérision, sur l'entreprise et non sur le client, détend après l'excuse."
        },
        {
          q: "Alors ne perdons plus une minute : je suis tout à vous. Vous m'appelez pour votre déménagement, c'est bien ça ?",
          a: "Oui, on déménage le mois prochain, et je voulais savoir pour l'alarme.",
          insight: "On montre qu'on respecte son temps : retour immédiat au concret."
        },
        {
          q: "Félicitations pour le déménagement ! Racontez-moi, vous partez vers quel genre de logement ?",
          a: "Une maison, enfin ! Avec un petit jardin.",
          insight: "Le client parle de son projet avec plaisir : la conversation est lancée."
        }
      ],
      opportunities: [
        { title: 'Agacement désamorcé', text: "L'excuse puis le sourire ont effacé les vingt minutes." },
        { title: 'Respect de son temps', text: 'Un appel efficace, sans détour, maintenant.' },
        { title: 'Un projet positif', text: 'Une maison avec jardin : nouveaux accès à protéger.' },
        { title: 'Client ouvert', text: "Il appelle de lui-même pour l'alarme : le transfert est naturel." }
      ],
      synthesis:
        "« Une maison avec jardin, c'est une belle étape ! On va faire en sorte que votre protection vous suive, et je vous promets que ce sera beaucoup plus rapide que l'attente de tout à l'heure. »",
      conclusion:
        "L'humour ne remplace jamais l'excuse : il la suit. D'abord reconnaître la gêne, ensuite l'autodérision. Et on rit de soi ou de l'entreprise, jamais du client."
    },
    {
      id: 'mefiant',
      icon: 'shield',
      title: 'Le client froid et méfiant',
      teaser: '« Ne cherchez pas à me retenir. »',
      context:
        "Le client déménage et demande la résiliation d'un ton sec. Il prévient d'emblée : « Je sais comment ça marche, vous allez essayer de me retenir. » Il n'est pas en colère, il est sur ses gardes.",
      goal:
        "Désarmer la méfiance avec une pointe d'humour qui montre qu'on a entendu sa demande, puis obtenir sa permission pour une seule question sur le nouveau logement.",
      badApproach: "(ton ironique) Vous retenir ? Mais voyons, on n'oserait jamais…",
      badWhy:
        "L'ironie confirme la méfiance : le client entend « bien sûr qu'on va essayer ». Le sarcasme ne fait jamais rire celui qui est déjà sur ses gardes.",
      questions: [
        {
          q: "C'est entendu, je m'occupe de votre demande. Et rassurez-vous, je n'ai ni lasso ni menottes à ce bureau !",
          a: "(sourire dans la voix) Ah, tant mieux, parce que j'en ai déjà eu, des conseillers collants !",
          insight: "L'humour montre qu'on respecte sa demande : la méfiance tombe."
        },
        {
          q: "Je vais juste vous poser une seule question, en toute transparence. Vous avez le droit de dire « joker » !",
          a: '(rire) Allez-y, je garde mon joker en réserve.',
          insight: "Demander la permission avec légèreté redonne le contrôle au client."
        },
        {
          q: "Votre nouveau logement, c'est un appartement ou une maison ?",
          a: "Une maison, un peu isolée. Et c'est vrai que je ne sais pas encore comment on va la protéger.",
          insight: "Détendu, le client partage spontanément un vrai besoin."
        },
        {
          q: "Je vous explique en deux minutes comment on peut déplacer votre installation, et vous décidez ensuite. Si ça ne vous convient pas, je finalise votre demande, sans rancune !",
          a: "D'accord, ça me paraît honnête. Je vous écoute.",
          insight: 'Transparence et légèreté : le client accepte d’écouter, par choix.'
        }
      ],
      opportunities: [
        { title: 'Méfiance levée', text: "Il a constaté qu'on respectait sa demande, avec le sourire." },
        { title: 'Permission accordée', text: "Il accepte d'écouter : rester bref et honnête." },
        { title: 'Un besoin réel', text: 'Maison isolée, rien de prévu pour la sécurité.' },
        { title: 'Relation de confiance', text: "Le « sans rancune » prouve qu'il garde le choix." }
      ],
      synthesis:
        "« Très bien : on déplace votre installation dans la maison, vous gardez votre protection sans rien organiser, et je vous envoie tout par écrit. Et vous gardez votre joker pour une prochaine fois ! »",
      conclusion:
        "Avec un client méfiant, l'humour sert à montrer qu'on l'a entendu, pas à le convaincre. Une pointe de légèreté sur notre propre rôle désarme bien mieux qu'un argument."
    },
    {
      id: 'colere',
      icon: 'alert',
      title: "Le client en colère : l'humour attendra",
      teaser: '« C’est inadmissible ! »',
      context:
        "Le technicien n'est pas venu au rendez-vous de transfert. Le client a posé un jour de congé pour rien. Il est en colère et hausse le ton dès le début de l'appel.",
      goal:
        "Comprendre qu'ici, l'humour est interdit à chaud. Désamorcer d'abord par l'écoute et la prise en charge, et ne retrouver le sourire qu'en fin d'appel, une fois le client apaisé.",
      badApproach: "Allez, ce n'est pas si grave, au moins vous avez eu un jour de repos !",
      badWhy:
        "Faire de l'humour sur le problème d'un client en colère, c'est minimiser ce qu'il vit. Il se sent méprisé : la colère explose et la résiliation devient une évidence.",
      questions: [
        {
          q: "Vous avez perdu une journée de congé, je comprends tout à fait votre colère. Je suis sincèrement désolé.",
          a: 'Merci… mais c’est vraiment pénible, vous savez.',
          insight: "Aucun humour : on nomme le préjudice et on s'excuse. Le ton baisse."
        },
        {
          q: "Je reprends votre dossier personnellement, et on fixe ensemble un nouveau créneau qui vous convient vraiment.",
          a: "D'accord. Le samedi matin, ce serait possible ?",
          insight: 'La prise en charge concrète apaise : le client se projette.'
        },
        {
          q: "Je regarde tout de suite les créneaux disponibles et je vous confirme tout par écrit avant de raccrocher.",
          a: 'Parfait. Là, je suis rassuré.',
          insight: "Le client est apaisé : c'est seulement maintenant que le sourire peut revenir."
        },
        {
          q: "Et cette fois, le technicien a un plan, une alarme sur son téléphone et votre adresse en gros : il ne vous oubliera pas !",
          a: '(rire) Ah ! Bon, je compte sur vous alors.',
          insight: "Un sourire en fin d'appel, sur l'entreprise et non sur le client, pour finir sur une note positive."
        }
      ],
      opportunities: [
        { title: "Colère désamorcée sans humour", text: "Écoute, excuse et action concrète d'abord." },
        { title: 'Transfert reprogrammé', text: 'Un nouveau créneau adapté à ses contraintes.' },
        { title: 'Confiance retrouvée', text: 'Confirmation écrite : le client est rassuré.' },
        { title: 'Fin d’appel positive', text: "Le sourire arrive en dernier, une fois l'orage passé." }
      ],
      synthesis:
        "« Je récapitule : nouveau rendez-vous confirmé, je vous envoie la confirmation tout de suite, et je garde votre dossier en suivi jusqu'à l'installation dans votre nouveau logement. »",
      conclusion:
        "L'humour est un outil, pas un réflexe. Face à la colère, il est interdit tant que le client n'est pas apaisé. Savoir s'en passer, c'est aussi ça, maîtriser l'humour."
    }
  ],

  /* ÉCRAN 4 – Ajoute une touche de sourire ! (`closed` = phrase sans relief) */
  transform: [
    {
      closed: 'Votre dossier est enregistré.',
      proposals: [
        "C'est tout bon, votre dossier est enregistré ! Voilà au moins une chose rangée dans ce déménagement.",
        "Dossier enregistré ! Un carton de moins sur la liste."
      ],
      tip: "On annonce la même chose, avec une image du quotidien du client."
    },
    {
      closed: 'Merci de patienter, je vérifie.',
      proposals: [
        "Je vérifie ça, ne bougez pas… enfin, vous pouvez continuer les cartons, je ne vous vois pas !",
        "Un petit instant, je vérifie. Je fais plus vite que le carton de la cuisine, promis !"
      ],
      tip: "L'attente devient un moment complice au lieu d'un silence pesant."
    },
    {
      closed: "Il faudra être présent le jour de l'intervention.",
      proposals: [
        "Le jour de l'intervention, il faudra juste être là pour accueillir le technicien. Il ne demande ni café ni croissants… mais il ne dira pas non !",
        "Seule condition : que quelqu'un soit là pour ouvrir. Le technicien est doué, mais il ne traverse pas encore les murs !"
      ],
      tip: "Une contrainte présentée avec le sourire est mieux retenue, et mieux acceptée."
    },
    {
      closed: 'Avez-vous d’autres questions ?',
      proposals: [
        "Est-ce que je peux faire autre chose pour vous ? À part porter les cartons, ça je ne peux pas !",
        "Y a-t-il autre chose qui vous trotte dans la tête, à part le plan de la nouvelle cuisine ?"
      ],
      tip: "On ouvre la porte aux questions avec chaleur, sans formule toute faite."
    },
    {
      closed: 'Je vous souhaite une bonne journée.',
      proposals: [
        "Bon courage pour les cartons, et que le carton des câbles soit avec vous !",
        "Très belle installation dans votre nouvelle maison, et bon courage pour le canapé dans l'escalier !"
      ],
      tip: 'Une fin d’appel personnalisée et souriante : c’est ce dont le client se souviendra.'
    }
  ],

  /* ÉCRAN 5 – Challenge final : 3 clients tirés au hasard. Attention : parfois la meilleure réponse est sans humour. */
  quiz: [
    {
      client: "Je déménage, encore un truc à gérer… et maintenant l'alarme !",
      options: [
        { text: "Rassurez-vous, l'alarme, c'est moi qui m'en occupe : un carton de moins pour vous !", correct: true },
        { text: 'Il me faut votre numéro de contrat et votre nouvelle adresse.', why: "Correct mais froid : l'alarme reste une corvée." },
        { text: "Vous savez, avec les cambriolages pendant les déménagements, mieux vaut ne pas résilier…", why: 'On remplace l’humour par la peur : le client se ferme.' }
      ],
      explanation:
        "Cette réponse fait sourire sur une galère partagée et transforme l'alarme en aide. Le client se sent soulagé, pas sollicité."
    },
    {
      client: "Le technicien n'est pas venu, j'ai posé un jour de congé pour rien !",
      options: [
        { text: "Au moins, vous avez eu une journée de repos !", why: "Humour sur le problème d'un client en colère : il se sent méprisé." },
        { text: 'Vous avez perdu une journée, je suis sincèrement désolé. Je reprends votre dossier et on fixe ensemble un créneau qui vous convient.', correct: true },
        { text: "(rire) Ça arrive aux meilleurs d'entre nous !", why: 'Le rire minimise le préjudice : la colère monte.' }
      ],
      explanation:
        "Ici, la meilleure réponse est SANS humour. Face à la colère, on écoute, on s'excuse et on agit. Le sourire pourra revenir en fin d'appel."
    },
    {
      client: "J'ai attendu vingt minutes avant de vous avoir !",
      options: [
        { text: "Vingt minutes ? Vous avez de la chance, ce matin c'était quarante !", why: "L'humour arrive avant l'excuse et minimise la gêne." },
        { text: 'Que puis-je pour vous ?', why: "On ignore l'agacement : le client se sent transparent." },
        { text: "Je suis vraiment désolé pour cette attente. Vous connaissez notre musique par cœur maintenant… je vous promets de vous la faire oublier !", correct: true }
      ],
      explanation:
        "L'excuse d'abord, puis une autodérision sur l'entreprise. Le client sourit et repart sur de bonnes bases."
    },
    {
      client: "Je sais comment ça marche, vous allez essayer de me retenir.",
      options: [
        { text: "C'est entendu, je m'occupe de votre demande. Et rassurez-vous, je n'ai pas de lasso à mon bureau !", correct: true },
        { text: "(ton ironique) Vous retenir ? Mais voyons, jamais de la vie…", why: "L'ironie confirme la méfiance du client." },
        { text: 'Je suis obligé de vous présenter nos offres avant.', why: 'On ignore sa demande : il se ferme complètement.' }
      ],
      explanation:
        "Cette réponse respecte la demande et la désamorce avec une image drôle sur notre propre rôle. La méfiance tombe."
    },
    {
      client: "On part dans une maison avec un grand jardin, j'ai hâte !",
      options: [
        { text: 'Très bien, quelle est la nouvelle adresse ?', why: "On passe à côté de l'enthousiasme du client." },
        { text: 'Félicitations ! Un grand jardin… vous allez enfin pouvoir faire des barbecues sans demander l’avis des voisins du dessus !', correct: true },
        { text: "Un grand jardin, c'est surtout plus d'endroits par où entrer pour les cambrioleurs.", why: 'On casse sa joie avec de la peur : très mauvais pour la relation.' }
      ],
      explanation:
        "On partage la joie du client avec une image positive. Une fois la complicité créée, parler de la protection du nouveau logement devient naturel."
    },
    {
      client: "À la maison, on dit que c'est toujours moi qui déclenche l'alarme par erreur.",
      options: [
        { text: "(rire) Alors vous êtes le meilleur testeur de la maison ! On peut regarder ensemble comment éviter ces fausses alertes.", correct: true },
        { text: "Ah, il y a toujours un étourdi dans chaque famille !", why: 'On rit du client, pas avec lui : il peut se sentir vexé.' },
        { text: "Il faut bien lire la notice.", why: 'Condescendant : le client se sent pris en faute.' }
      ],
      explanation:
        "Le client tend lui-même une perche humoristique : on la saisit avec bienveillance, sans le moquer, puis on propose une aide concrète."
    },
    {
      client: "Mon père est décédé, je dois résilier l'alarme de sa maison.",
      options: [
        { text: "Je vous présente toutes mes condoléances. Je vais vous accompagner simplement, prenez le temps qu'il vous faut.", correct: true },
        { text: "Pour la résiliation, il me faut le numéro de contrat.", why: "Trop froid : on ignore la peine du client." },
        { text: 'Je vais essayer de rendre ce moment un peu plus léger…', why: "L'humour n'a aucune place face à un deuil." }
      ],
      explanation:
        "Face à un deuil, aucun humour : douceur, condoléances et accompagnement. Savoir ne pas faire d'humour fait partie de la technique."
    },
    {
      client: "(fin d'appel, client détendu) Merci beaucoup, vous m'avez bien aidé !",
      options: [
        { text: 'De rien. Au revoir.', why: 'Fin d’appel sans chaleur : on rate le moment de laisser une bonne impression.' },
        { text: "Avec plaisir ! Bon courage pour les cartons, et que le carton des câbles soit avec vous !", correct: true },
        { text: "Merci à vous. N'oubliez pas qu'il y a aussi nos offres de télésurveillance vidéo…", why: "Une relance commerciale qui casse le moment : le client repart méfiant." }
      ],
      explanation:
        "La fin d'appel est le moment idéal pour un sourire personnalisé : le client raccroche sur une note positive, et s'en souviendra."
    }
  ],

  /* ÉCRAN 6 */
  reflexes: [
    { not: 'Ne jamais rire du client', do: 'rire avec lui.', icon: 'heart' },
    { not: 'Ne pas plaisanter sur le problème', do: 'alléger la situation.', icon: 'sparkles' },
    { not: "Pas d'humour à chaud", do: "écouter et s'excuser d'abord.", icon: 'ear' },
    { not: 'Ne pas en faire trop', do: 'une touche suffit.', icon: 'target' },
    { not: 'Après le sourire, toujours enchaîner', do: 'sur du concret.', sep: ' ', icon: 'flag' }
  ],
  finalQuote:
    "L'humour ne remplace pas l'écoute, il la prolonge. Un sourire partagé au téléphone, c'est un client qui se sent face à une personne, et non face à une procédure."
};
