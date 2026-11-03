/*
 * Contenu du workshop « L'art de la découverte client ».
 * Tout le texte pédagogique est ici : pour modifier une situation, une question ou le quiz,
 * il suffit d'éditer ce fichier (aucune compilation nécessaire).
 */
window.WORKSHOP_DATA = {
  centralMessage:
    "Celui qui pose les bonnes questions n'a pas besoin de forcer la vente. Il permet au client de trouver lui-même les raisons de rester.",

  /* Étapes du workshop (ordre de navigation). `notes` = conseils animateur (touche N). */
  steps: [
    {
      id: 'introduction',
      label: 'Introduction',
      duration: '5 min',
      notes:
        "Lancez la séance en demandant : « Combien de temps parle le client dans vos derniers appels de résiliation ? » Laissez 2 ou 3 agents répondre, puis présentez les trois principes."
    },
    {
      id: 'ouverte-fermee',
      label: 'Ouverte ou fermée',
      duration: '10 min',
      notes:
        "Lisez la question fermée à voix haute et faites répondre un agent comme le ferait un client pressé. Faites de même avec la question ouverte : l'équipe constate d'elle-même la différence de matière obtenue."
    },
    {
      id: 'situations',
      label: 'Mises en situation',
      duration: '20 min',
      notes:
        "Pour chaque situation : lisez le contexte, demandez à l'équipe ses propres questions AVANT de révéler celles du support. Lancez le minuteur de réflexion, puis comparez. Un agent peut jouer le client."
    },
    {
      id: 'transforme',
      label: 'Transforme ta question',
      duration: '10 min',
      notes:
        "Une question à la fois. Interrogez au moins deux agents différents par question. Notez la meilleure proposition de l'équipe dans le champ prévu : elle est conservée sur cet appareil."
    },
    {
      id: 'challenge',
      label: 'Challenge final',
      duration: '5 min',
      notes:
        "Faites voter l'équipe à main levée (A, B ou C) avant de cliquer. Les touches A, B et C du clavier sélectionnent aussi une réponse. Rejouer tire trois nouvelles situations."
    },
    {
      id: 'conclusion',
      label: 'Conclusion',
      duration: '5 min',
      notes:
        "Demandez à chaque agent de choisir LE réflexe qu'il travaillera sur ses prochains appels, et de le dire à voix haute. Un engagement verbal est mieux retenu."
    }
  ],

  /* ÉCRAN 1 */
  intro: {
    title: "L'art de la découverte client",
    subtitle: 'Comprendre avant de convaincre.',
    principles: [
      { icon: 'ear', title: 'Écouter', rest: 'plutôt que parler.', text: 'Le client qui parle vous donne les clés de la conservation.' },
      { icon: 'help', title: 'Questionner', rest: 'plutôt que supposer.', text: "Derrière « je veux résilier », il y a toujours une histoire." },
      { icon: 'target', title: 'Comprendre', rest: 'avant de proposer.', text: 'Une solution proposée trop tôt répond à la mauvaise question.' }
    ],
    hook: 'Une question fermée termine une conversation. Une question ouverte en commence une.'
  },

  /* ÉCRAN 2 */
  comparison: {
    closed: {
      question: 'Êtes-vous satisfait de votre alarme ?',
      answer: 'Oui, ça va.',
      gain: 12,
      verdict: "Une réponse en deux mots. Aucune information exploitable, et la conversation s'arrête."
    },
    open: {
      question: "Qu'est-ce qui vous apporte le plus de tranquillité avec votre système d'alarme aujourd'hui ?",
      answer: 'Je pars régulièrement en déplacement et je sais que ma maison est protégée.',
      gain: 88,
      verdict: 'Le client parle de son mode de vie et formule lui-même la valeur de son alarme.'
    },
    why: [
      { icon: 'user', title: 'Le client parle de lui', text: 'On apprend une habitude concrète : des déplacements réguliers.' },
      { icon: 'heart', title: 'Il formule la valeur', text: "« Je sais que ma maison est protégée » : c'est lui qui le dit, pas l'agent." },
      { icon: 'message', title: 'On peut rebondir', text: "« Comment se passent vos absences ? » : la découverte continue naturellement." }
    ],
    openers: ['Comment…', "Qu'est-ce qui…", 'Quels / Quelles…', 'Dans quelles situations…', 'Racontez-moi…', 'De quelle manière…'],
    closers: ['Est-ce que…', 'Vous êtes… ?', 'Vous avez… ?', 'Vous voulez… ?', 'Si je…, vous… ?'],
    examples: [
      {
        closed: 'Vous utilisez votre application ?',
        open: 'Comment utilisez-vous votre application au quotidien ?',
        insight: "Révèle les usages réels et les éventuelles difficultés de prise en main."
      },
      {
        closed: 'Vous avez déjà eu une intrusion ?',
        open: 'Comment avez-vous vécu la sécurité de votre logement depuis votre installation ?',
        insight: "Fait parler du ressenti, pas seulement des incidents : la tranquillité devient visible."
      },
      {
        closed: 'Vous voulez garder votre alarme ?',
        open: "Qu'est-ce qui serait important pour vous pour continuer à bénéficier d'une protection à votre domicile ?",
        insight: 'Évite le « non » réflexe et oriente le client vers ses propres critères de maintien.'
      }
    ]
  },

  /* ÉCRAN 3 – les quatre mises en situation */
  situations: [
    {
      id: 'demenagement',
      icon: 'truck',
      title: 'Le déménagement',
      teaser: '« Je déménage, je veux résilier. »',
      context:
        "Le client appelle le service Movers : il quitte son appartement en centre-ville pour une maison en périphérie dans six semaines. Il demande la résiliation de son contrat.",
      goal:
        "Comprendre son projet et son futur cadre de vie pour qu'il envisage lui-même de poursuivre sa protection dans son nouveau logement.",
      badApproach: 'Vous souhaitez résilier votre alarme parce que vous déménagez ?',
      badWhy:
        "La question valide la résiliation : le client répond « oui » et l'appel se termine. On confirme son départ au lieu d'explorer son projet.",
      questions: [
        {
          q: 'Comment se présente votre nouveau logement ?',
          a: "C'est une maison avec jardin, plus grande, avec un garage. Mais c'est un peu plus isolé.",
          insight: 'Maison = plus d’accès (portes, baies, garage). Le besoin de protection augmente.'
        },
        {
          q: 'Quelles différences voyez-vous entre votre logement actuel et le nouveau en matière de sécurité ?',
          a: "Ici je suis au troisième avec un digicode. Là-bas, les voisins sont plus loin, il n'y a personne la journée.",
          insight: "Le client exprime lui-même un sentiment d'exposition plus fort."
        },
        {
          q: 'Comment envisagez-vous la protection de votre futur domicile ?',
          a: "Honnêtement, je n'y ai pas encore pensé. On a déjà tellement de choses à gérer avec le déménagement.",
          insight: 'Ouverture : lui simplifier la vie en prenant en charge le transfert.'
        },
        {
          q: "Qu'est-ce qui serait important pour vous de retrouver en matière de sécurité dans votre nouveau logement ?",
          a: "Pouvoir tout gérer depuis mon téléphone comme aujourd'hui, et savoir que quelqu'un réagit si l'alarme se déclenche.",
          insight: "Il cite lui-même deux bénéfices de son contrat actuel : l'application et la télésurveillance."
        }
      ],
      opportunities: [
        { title: 'Transfert du système', text: "Proposer le déménagement de l'installation existante." },
        { title: 'Nouvelle installation', text: 'Étudier une installation adaptée à la maison.' },
        { title: 'Adaptation du matériel', text: 'Garage, baies vitrées, extérieur : compléter la protection.' },
        { title: 'Maintien de la relation', text: 'Le client reste accompagné pendant une période chargée.' }
      ],
      synthesis:
        "« Si je résume : vous vous installez dans une maison plus isolée, et ce qui compte pour vous, c'est de garder la main depuis votre téléphone et une intervention en cas d'alerte. C'est bien ça ? »",
      conclusion:
        "Un déménagement n'est pas une raison de partir : c'est un nouveau lieu de vie à protéger. Le client qui déménage a souvent plus besoin de sécurité qu'avant. C'est à lui de le dire, pas à nous."
    },
    {
      id: 'prix',
      icon: 'wallet',
      title: 'Le prix / le budget',
      teaser: '« C’est trop cher pour moi. »',
      context:
        "Le client souhaite résilier : il trouve son abonnement trop cher et dit qu'il « fait le tri » dans ses dépenses.",
      goal:
        "Distinguer une vraie contrainte budgétaire d'un problème de valeur perçue, et identifier ce qui compte vraiment pour lui avant toute proposition.",
      badApproach: 'Si je vous fais une réduction, vous restez ?',
      badWhy:
        "La remise arrive avant la compréhension. Elle confirme au client qu'il payait trop cher, déprécie le service et ne règle pas la vraie raison du départ.",
      questions: [
        {
          q: "Comment percevez-vous aujourd'hui le rapport entre votre abonnement et les services dont vous bénéficiez ?",
          a: 'Je paie tous les mois, mais au final je ne vois pas vraiment ce que j’ai en échange.',
          insight: "Le sujet n'est pas le montant mais la valeur perçue : les services sont invisibles pour lui."
        },
        {
          q: "Qu'est-ce qui vous semble le moins adapté dans votre abonnement actuel ?",
          a: "J'ai l'impression de payer pour des choses que je n'utilise jamais.",
          insight: "Piste d'adaptation de l'offre, plutôt qu'une remise générale."
        },
        {
          q: 'Comment avez-vous déterminé le budget que vous souhaiteriez consacrer à votre sécurité ?',
          a: "Avec tout qui augmente, je revois tous mes abonnements. Je n'ai pas vraiment de chiffre en tête.",
          insight: 'Contrainte budgétaire globale : la sécurité est en concurrence avec d’autres dépenses.'
        },
        {
          q: 'Quels services sont les plus importants pour vous dans votre protection ?',
          a: "Surtout que quelqu'un intervienne si l'alarme sonne quand on n'est pas là.",
          insight: 'Le client désigne lui-même le cœur de valeur : la télésurveillance.'
        }
      ],
      opportunities: [
        { title: 'Vrai problème financier ?', text: 'Vérifier si le prix est la cause réelle ou un symptôme.' },
        { title: 'Services valorisés', text: 'Identifier ce à quoi le client tient vraiment.' },
        { title: "Adaptation de l'offre", text: 'Étudier un ajustement selon les possibilités existantes.' },
        { title: 'Pas de remise à l’aveugle', text: 'Ne rien proposer sans avoir compris le besoin.' }
      ],
      synthesis:
        "« Si je comprends bien, l'essentiel pour vous, c'est l'intervention en cas d'alarme pendant vos absences, et vous avez le sentiment de payer pour des services que vous n'utilisez pas. On regarde ensemble ce qui correspond vraiment à votre usage ? »",
      conclusion:
        "« Trop cher » veut souvent dire « je ne vois pas ce que ça m'apporte ». Faire parler le client de ce qu'il valorise permet de défendre la valeur, ou d'ajuster l'offre de façon juste."
    },
    {
      id: 'inutilise',
      icon: 'power',
      title: "Il n'utilise plus son alarme",
      teaser: '« Je ne la mets presque plus. »',
      context:
        "Le client explique qu'il n'utilise quasiment plus son système depuis plusieurs mois et souhaite arrêter son contrat.",
      goal:
        "Trouver ce qui a fait baisser l'utilisation (l'irritant) et faire émerger les situations où le besoin de protection existe encore.",
      badApproach: 'Vous ne mettez plus votre alarme ?',
      badWhy:
        "On fait répéter au client ce qu'il vient de dire. Il confirme (« non, jamais »), se justifie, et on ne sait toujours pas pourquoi.",
      questions: [
        {
          q: 'Comment se passe l’utilisation de votre système au quotidien ?',
          a: 'Au début on la mettait tout le temps. Maintenant, presque jamais.',
          insight: "L'usage a existé : quelque chose a changé en cours de route."
        },
        {
          q: "Qu'est-ce qui fait que vous l'utilisez moins aujourd'hui ?",
          a: "On a eu deux fausses alarmes à cause du chat, et ma conjointe ne sait pas trop se servir de l'application.",
          insight: 'Deux irritants concrets et solubles : détection à adapter et prise en main.'
        },
        {
          q: 'Dans quelles situations ressentez-vous encore le besoin d’être protégé ?',
          a: 'Quand on part en vacances, là oui, je la mets. Et la nuit, ce serait rassurant.',
          insight: 'Le besoin est toujours là : il est simplement ciblé.'
        },
        {
          q: "Qu'est-ce qui pourrait vous faciliter l'utilisation de votre installation ?",
          a: "Si je n'avais plus peur que le chat la déclenche, je la mettrais sans réfléchir.",
          insight: 'La solution est formulée par le client : adapter la détection.'
        },
        {
          q: 'Comment pourrions-nous rendre votre système plus utile dans votre quotidien ?',
          a: 'Si toute la famille savait l’utiliser, on la mettrait sûrement plus souvent.',
          insight: 'Ouverture : un accompagnement pour tout le foyer.'
        }
      ],
      opportunities: [
        { title: 'Problème de compréhension', text: 'Le fonctionnement n’a jamais été bien expliqué.' },
        { title: "Difficultés avec l'application", text: 'Accompagner la prise en main pas à pas.' },
        { title: "Habitudes d'utilisation", text: 'Réancrer l’alarme dans les moments clés.' },
        { title: 'Besoin de formation', text: 'Expliquer le système à tous les utilisateurs du foyer.' },
        { title: 'SAV ou adaptation', text: 'Intervention technique ou réglage de l’installation.' }
      ],
      synthesis:
        "« Si je résume : vous avez arrêté de l'utiliser à cause des fausses alarmes et de l'application, mais vous en avez toujours besoin pendant vos vacances et la nuit. Si on règle ces deux points, l'alarme vous serait de nouveau utile ? »",
      conclusion:
        "« Je ne l'utilise plus » cache presque toujours un irritant : fausse alarme, application mal comprise, matériel inadapté. Trouver l'irritant, c'est trouver la solution."
    },
    {
      id: 'utilite',
      icon: 'shield',
      title: "Il n'en voit plus l'utilité",
      teaser: '« Il ne s’est jamais rien passé. »',
      context:
        "Le client estime ne plus avoir besoin d'une alarme : en plusieurs années, il n'a jamais rencontré le moindre problème de sécurité.",
      goal:
        'Reconnecter le client à ses motivations initiales et à la tranquillité d’esprit que son système lui apporte, sans jamais créer de peur.',
      badApproach: 'Vous savez que les cambriolages peuvent arriver à tout moment ?',
      badWhy:
        "On cherche à faire peur. Le client se sent manipulé, se braque, et l'argument renforce l'idée qu'on veut « vendre à tout prix ».",
      questions: [
        {
          q: "Qu'est-ce qui vous avait motivé à installer une alarme à l'époque ?",
          a: "On venait d'avoir notre premier enfant, et il y avait eu des cambriolages dans la rue.",
          insight: 'Motivation initiale : protéger sa famille. Elle est toujours d’actualité.'
        },
        {
          q: 'Comment votre perception de la sécurité a-t-elle évolué depuis votre installation ?',
          a: "Comme il ne s'est jamais rien passé, je me dis que c'est peut-être devenu inutile.",
          insight: 'Le paradoxe de la prévention : rien ne s’est passé… pendant que la maison était protégée.'
        },
        {
          q: "Quelles sont aujourd'hui les situations dans lesquelles vous souhaitez vous sentir en sécurité ?",
          a: 'Quand on part le week-end, et la nuit quand je suis seule avec les enfants.',
          insight: 'Des situations concrètes et actuelles où la protection compte.'
        },
        {
          q: "Quelle importance accordez-vous à la tranquillité d'esprit lorsque vous êtes absent de votre domicile ?",
          a: "C'est vrai que je pars l'esprit léger, je ne pense jamais à la maison.",
          insight: 'Le bénéfice invisible devient visible : la tranquillité d’esprit.'
        },
        {
          q: "Qu'est-ce qui vous manquerait si vous ne disposiez plus de votre système de protection ?",
          a: '… Je crois que je vérifierais trois fois les portes avant de partir.',
          insight: 'Le client verbalise lui-même la valeur de son système.'
        }
      ],
      opportunities: [
        { title: 'Motivations initiales', text: 'Faire ressortir pourquoi le client avait choisi d’être protégé.' },
        { title: "Tranquillité d'esprit", text: 'Revaloriser ce bénéfice qu’on ne remarque plus.' },
        { title: 'Habitudes de protection', text: 'Identifier les moments où le système compte.' },
        { title: 'Valeur préventive', text: 'Faire prendre conscience du rôle du système, sans créer de peur.' }
      ],
      synthesis:
        "« Si je vous entends bien, vous aviez installé l'alarme pour protéger votre famille, et aujourd'hui c'est ce qui vous permet de partir l'esprit léger. C'est toujours important pour vous ? »",
      conclusion:
        "On ne vend pas la peur, on fait reconnaître la tranquillité. Le client ne garde pas une alarme pour ce qui lui est arrivé, mais pour ce qu'il n'a plus à craindre."
    }
  ],

  /* ÉCRAN 4 – Transforme ta question ! */
  transform: [
    {
      closed: 'Vous êtes satisfait de notre service ?',
      proposals: [
        "Qu'est-ce qui vous plaît le plus dans notre service, et qu'est-ce qui pourrait être amélioré ?",
        'Comment décririez-vous votre expérience avec nous depuis votre installation ?'
      ],
      tip: 'On obtient à la fois les points forts à valoriser et les irritants à traiter.'
    },
    {
      closed: 'Vous utilisez votre alarme tous les jours ?',
      proposals: [
        'À quels moments de la journée ou de la semaine utilisez-vous votre alarme ?',
        "Comment l'alarme s'intègre-t-elle dans vos habitudes aujourd'hui ?"
      ],
      tip: "On découvre les usages réels et les moments où l'alarme a de la valeur."
    },
    {
      closed: 'Votre problème est uniquement financier ?',
      proposals: [
        "En dehors du prix, qu'est-ce qui a pesé dans votre réflexion ?",
        "Qu'est-ce qui vous a amené à envisager de résilier aujourd'hui ?"
      ],
      tip: 'Le prix est souvent la raison donnée, rarement la seule raison.'
    },
    {
      closed: 'Vous souhaitez garder votre installation ?',
      proposals: [
        "Qu'est-ce qui compterait pour vous pour continuer à être protégé ?",
        'Comment voyez-vous la protection de votre domicile dans les mois à venir ?'
      ],
      tip: 'On évite le « non » réflexe et on fait travailler le client sur ses critères.'
    },
    {
      closed: 'Vous avez trouvé une autre société ?',
      proposals: [
        "Qu'est-ce qui a retenu votre attention dans les autres offres que vous avez vues ?",
        'Quels critères sont les plus importants pour vous dans le choix de votre protection ?'
      ],
      tip: "On apprend ce que le client recherche, sans dénigrer ni se mettre sur la défensive."
    }
  ],

  /* ÉCRAN 5 – Challenge final : 3 situations tirées au hasard dans cette liste */
  quiz: [
    {
      client: 'Je trouve que mon abonnement est trop cher.',
      options: [
        { text: 'Si je baisse le prix, vous restez ?', why: 'Remise proposée avant de comprendre : on dévalorise le service.' },
        { text: 'Vous avez regardé les prix chez les concurrents ?', why: 'Fermée, et elle oriente le client vers la concurrence.' },
        { text: "Qu'est-ce qui vous semble aujourd'hui le moins adapté dans votre abonnement ?", correct: true }
      ],
      explanation:
        "Cette question fait parler le client de son usage réel. On découvre si le problème est le montant, la valeur perçue ou des services inutiles, avant toute proposition."
    },
    {
      client: 'Je déménage le mois prochain, donc je vais arrêter mon contrat.',
      options: [
        { text: 'Vous êtes sûr de vouloir résilier ?', why: 'Fermée et défensive : le client confirme « oui ».' },
        { text: 'Comment se présente votre futur logement ?', correct: true },
        { text: 'Vous déménagez à quelle date ?', why: "Utile pour le dossier, mais elle ne fait pas avancer la découverte." }
      ],
      explanation:
        "Cette question ouvre sur le nouveau projet : type de logement, environnement, besoins. C'est la porte d'entrée vers un transfert ou une nouvelle installation."
    },
    {
      client: 'Je ne mets plus jamais l’alarme, ça ne sert à rien de payer.',
      options: [
        { text: 'Pourquoi vous ne la mettez plus ?', why: "« Pourquoi » peut sonner comme un reproche : le client se justifie au lieu d'expliquer." },
        { text: 'Vous savez que vous payez pour rien, alors ?', why: 'Culpabilisante, elle confirme la décision de résilier.' },
        { text: "Qu'est-ce qui fait que vous l'utilisez moins aujourd'hui ?", correct: true }
      ],
      explanation:
        "Cette question cherche l'irritant (fausses alarmes, application, habitudes) sans jugement. Un irritant identifié est souvent un irritant qu'on peut régler."
    },
    {
      client: "Il ne s'est jamais rien passé chez moi, je n'en ai plus besoin.",
      options: [
        { text: 'Les cambriolages augmentent partout, vous savez ?', why: 'Argument de peur : le client se braque et se sent manipulé.' },
        { text: "Qu'est-ce qui vous avait motivé à installer une alarme à l'époque ?", correct: true },
        { text: 'Vous ne voulez vraiment plus être protégé ?', why: 'Fermée et culpabilisante : elle appelle un « non » sec.' }
      ],
      explanation:
        'Cette question reconnecte le client à ses motivations initiales. Il retrouve lui-même les raisons qui l’avaient poussé à se protéger.'
    },
    {
      client: "J'ai vu une offre moins chère dans une autre société.",
      options: [
        { text: "Qu'est-ce qui a retenu votre attention dans cette offre ?", correct: true },
        { text: 'Laquelle ? Nous sommes bien meilleurs, vous savez.', why: 'Dénigrer la concurrence crispe le client et ne nous apprend rien.' },
        { text: 'Je peux vous faire le même prix, ça vous va ?', why: 'On s’aligne sans savoir ce que le client compare réellement.' }
      ],
      explanation:
        "Cette question révèle les critères du client (prix, matériel, services). On peut ensuite valoriser ce qu'il a déjà et qu'il ne retrouverait peut-être pas ailleurs."
    },
    {
      client: "L'application est trop compliquée, je n'y arrive pas.",
      options: [
        { text: 'Vous avez bien installé la dernière version ?', why: 'Fermée et technique : on passe à côté de la vraie difficulté.' },
        { text: "Pourtant elle est simple, vous voulez que je vous explique ?", why: 'Elle minimise le ressenti du client : il se sent jugé.' },
        { text: "À quel moment l'application vous pose-t-elle le plus de difficultés ?", correct: true }
      ],
      explanation:
        "Cette question localise précisément le blocage. On peut ensuite accompagner le client sur ce point exact, ou orienter vers le SAV si besoin."
    },
    {
      client: 'Je vais vivre une partie de l’année dans le Sud, la maison sera souvent vide.',
      options: [
        { text: 'Vous voulez résilier, alors ?', why: "On propose soi-même la résiliation : c'est l'inverse de l'objectif." },
        { text: 'Vous partez combien de temps ?', why: 'Fermée et factuelle : elle ne fait pas parler du besoin.' },
        { text: 'Comment envisagez-vous la surveillance de votre maison pendant ces longues absences ?', correct: true }
      ],
      explanation:
        "Cette question fait réaliser au client qu'une maison souvent vide a justement besoin d'être surveillée. C'est lui qui fait le lien."
    },
    {
      client: "J'ai eu deux fausses alarmes ce mois-ci, ça commence à m'agacer.",
      options: [
        { text: 'Ça arrive à tout le monde, ne vous inquiétez pas.', why: 'On minimise l’irritation : le client ne se sent pas écouté.' },
        { text: 'Racontez-moi comment ça s’est passé ces deux fois-là.', correct: true },
        { text: "Je vous envoie un technicien, d'accord ?", why: 'Solution proposée trop tôt : on ne connaît pas encore la cause.' }
      ],
      explanation:
        "Cette question laisse le client exprimer son agacement et donne les éléments pour trouver la cause (animal, porte, détecteur). L'écoute désamorce la tension."
    }
  ],

  /* ÉCRAN 6 */
  reflexes: [
    { not: 'Ne jamais supposer', do: 'questionner.', icon: 'help' },
    { not: 'Ne pas interrompre', do: 'écouter.', icon: 'ear' },
    { not: 'Ne pas argumenter trop tôt', do: 'comprendre.', icon: 'search' },
    { not: 'Ne pas proposer systématiquement une remise', do: 'identifier le vrai besoin.', icon: 'target' },
    { not: 'Toujours faire reformuler au client', do: 'ce qui compte pour lui.', sep: ' ', icon: 'repeat' }
  ],
  finalQuote:
    "Notre objectif n'est pas simplement d'empêcher une résiliation. C'est de faire comprendre au client pourquoi il a choisi de nous faire confiance et pourquoi cette confiance a toujours du sens aujourd'hui."
};
