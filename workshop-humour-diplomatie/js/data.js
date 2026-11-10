/*
 * Contenu du workshop « Brise-glace : humour & diplomatie ».
 * Fil rouge : prendre la température du client, apaiser d'abord par la diplomatie,
 * puis recréer du lien par une touche d'humour bienveillant, pour l'accompagner
 * dans son déménagement sans jamais le vexer.
 * Tout le texte pédagogique est ici : modifiez ce fichier, aucune compilation nécessaire.
 * Le moteur (affichage, quiz, voix…) est partagé : ../workshop-commun/.
 */
window.WORKSHOP_DATA = {
  storageKey: 'workshop-humour-diplomatie',

  labels: {
    introEyebrow: 'Workshop Movers · Relation client',
    introTitleHtml: 'Brise-glace : <span class="accent">humour</span> &amp; diplomatie',
    cmpEyebrow: 'Étape 2 · Comprendre le dosage',
    cmpTitleHtml: "L'humour seul <span class=\"vs\">ou</span> le bon dosage ?",
    cmpLead: "Même client agacé, même dossier. Une blague lancée trop tôt, ou la diplomatie d'abord et le sourire ensuite : écoutez la différence.",
    cmpClosedTag: 'Humour sans diplomatie',
    cmpOpenTag: 'Diplomatie + sourire',
    meterLabel: 'Tension du client',
    cmpWhyTitle: 'Pourquoi le bon dosage fonctionne-t-il ?',
    openersTitle: 'Les duos gagnants',
    closersTitle: 'Les mélanges ratés',
    examplesTitle: 'À vous : comment doseriez-vous ces phrases ?',
    flipClosed: 'Mal dosée',
    flipOpen: 'Bien dosée',
    flipBack: 'Revenir à la phrase mal dosée',
    sitEyebrow: 'Étape 3 · Mises en situation Movers',
    sitTitle: '4 températures, 4 dosages',
    sitLead: "Pour chaque client, l'équipe prend d'abord sa température : brûlant, tiède, froid ou détendu. Elle choisit le dosage diplomatie / humour, propose ses phrases, puis on révèle pas à pas.",
    stages: ['Contexte', 'Le faux pas', 'Le bon dosage', 'Ouvertures', 'Conclusion'],
    questionsLabel: 'Le bon dosage, phrase par phrase',
    questionsPrompt: "<strong>À vous de jouer.</strong> Quelle est la température de ce client ? Faut-il de la diplomatie seule, ou une touche d'humour, et à quel moment ? Proposez vos phrases avant de révéler le support.",
    revealQuestion: 'Révéler la phrase',
    oppsLabel: 'Ce que le bon dosage a ouvert',
    oppsPrompt: "<strong>Le client est apaisé ?</strong> Qu'est-ce que cela vous permet maintenant pour le déménagement de son alarme ?",
    oppsReveal: 'Révéler les ouvertures',
    oppsHide: 'Masquer les ouvertures',
    synthesisLabel: 'Phrase de transition vers le déménagement',
    trEyebrow: 'Étape 4 · Exercice collectif',
    trTitle: 'Trouve le bon dosage !',
    trLead: "Une phrase mal dosée s'affiche : trop raide, ou drôle au mauvais moment. À l'équipe de la réécrire avec le bon mélange de diplomatie et de sourire. Puis on compare.",
    trTag: 'Phrase mal dosée',
    trHint: 'Réaction probable : le client se raidit… ou se sent pris de haut.',
    trRevealTag: 'Version bien dosée',
    trReveal: 'Révéler une version bien dosée',
    trNext: 'Phrase suivante',
    quizTitle: 'Saurais-tu trouver le bon dosage ?',
    quizLead: "Trois clients tirés au hasard. Pour chacun : trop raide, trop drôle, ou bien dosé ? Choisissez la meilleure réponse.",
    quizAsk: 'Quelle réponse a le bon dosage ?',
    quizBest: 'Meilleure réponse',
    quizMsgs: [
      ['On rejoue ?', "Retenez l'ordre : d'abord apaiser (diplomatie), ensuite sourire (humour), toujours avancer (action)."],
      ['Bon début', "Vous sentez le dosage. Attention à l'humour placé avant l'excuse."],
      ['Très bien joué', 'Vous savez apaiser puis faire sourire. Encore un effort pour un sans-faute !'],
      ['Sans-faute !', 'Diplomate quand il faut, souriant quand on peut. Le client raccroche apaisé et de bonne humeur. Bravo.']
    ],
    conclTitle: 'Les 5 réflexes du bon dosage'
  },

  centralMessage: "D'abord rassurer, ensuite sourire, toujours avancer.",

  steps: [
    {
      id: 'introduction',
      label: 'Introduction',
      duration: '5 min',
      notes:
        "Présentez le thermomètre du client : BRÛLANT (colère) = diplomatie seule, le sourire seulement en fin d'appel. TIÈDE (agacé, déçu) = excuse sincère puis autodérision. FROID (méfiant, pressé) = respect, et humour léger sur notre propre rôle. DÉTENDU = humour complice, et diplomatie pour garder le cap."
    },
    {
      id: 'dosage',
      label: 'Le bon dosage',
      duration: '10 min',
      notes:
        "Faites jouer la scène deux fois : d'abord avec la blague seule, puis avec diplomatie + sourire. Demandez au « client » à quel moment il s'est senti respecté. Insistez : la même blague, placée APRÈS l'excuse, devient sympathique."
    },
    {
      id: 'situations',
      label: 'Mises en situation',
      duration: '20 min',
      notes:
        "Pour chaque client, faites voter la température AVANT de chercher des phrases : brûlant, tiède, froid ou détendu ? C'est elle qui décide du dosage. Un agent peut jouer le client, le haut-parleur lit ses réactions."
    },
    {
      id: 'bon-dosage',
      label: 'Trouve le bon dosage',
      duration: '10 min',
      notes:
        "Pour chaque phrase, demandez d'abord : « Trop raide ou trop drôle ? » Puis faites proposer une version équilibrée. Valorisez les formulations naturelles : le bon dosage doit ressembler à l'agent."
    },
    {
      id: 'challenge',
      label: 'Challenge final',
      duration: '5 min',
      notes:
        "Vote à main levée (A, B ou C) avant de cliquer. Dans chaque question, une réponse est trop raide, une trop drôle, une bien dosée. Parfois la bonne dose d'humour est zéro (colère, deuil)."
    },
    {
      id: 'conclusion',
      label: 'Conclusion',
      duration: '5 min',
      notes:
        "Demandez à chacun son « duo gagnant » : une phrase de diplomatie suivie d'une phrase de sourire qu'il se sent à l'aise de dire. Rappelez que la diplomatie est obligatoire, et que l'humour reste un bonus."
    }
  ],

  /* ÉCRAN 1 */
  intro: {
    subtitle: "Apaiser d'abord, sourire ensuite, avancer toujours.",
    principles: [
      { icon: 'shieldCheck', title: 'Apaiser', rest: 'avec diplomatie.', text: "Accueillir l'émotion, s'excuser sincèrement, prendre la main : c'est toujours la première étape." },
      { icon: 'target', title: 'Prendre la température', rest: 'avant de plaisanter.', text: "Brûlant : diplomatie seule. Tiède : excuse puis autodérision. Froid ou détendu : un sourire léger." },
      { icon: 'heart', title: 'Sourire ensemble', rest: 'pour garder le lien.', text: "Une fois la tension retombée, une touche d'humour transforme l'appel en vraie conversation." }
    ],
    hook: "La diplomatie fait baisser la tension. L'humour fait remonter la confiance."
  },

  /* ÉCRAN 2 */
  comparison: {
    closed: {
      question: "(rire) Ah, on vous a oublié ? Vous connaissez le dicton : jamais deux sans trois !",
      answer: 'Très drôle. Vous trouvez ça amusant ? Bon, résiliez-moi, j’en ai assez.',
      gain: 90,
      tone: 'red',
      verdict: "La blague arrive avant toute excuse : le client a l'impression qu'on se moque de lui. La tension explose."
    },
    open: {
      question:
        "Deux appels sans être rappelé, je comprends tout à fait votre agacement, et je m'en excuse. Je prends votre dossier moi-même, et cette fois pas besoin d'un troisième appel : vous êtes tombé sur la bonne personne !",
      answer: "(sourire) Bon, j'espère bien ! Alors voilà, on déménage le 15…",
      gain: 18,
      tone: 'green',
      verdict: "L'excuse et la prise en charge apaisent ; le clin d'œil final, sur l'agent et non sur le client, recrée du lien."
    },
    why: [
      { icon: 'heart', title: '1. La diplomatie ouvre', text: "« Je comprends votre agacement, et je m'en excuse » : le client se sent respecté avant tout." },
      { icon: 'shieldCheck', title: '2. La prise en charge rassure', text: "« Je prends votre dossier moi-même » : il sait que le problème va être réglé." },
      { icon: 'sparkles', title: '3. Le sourire arrive en dernier', text: "« Vous êtes tombé sur la bonne personne ! » : un clin d'œil sur soi, une fois la tension retombée." }
    ],
    openers: [
      "Je m'en excuse… et je prends le relais !",
      'Je comprends, à votre place je serais agacé aussi',
      'Je m’en occupe : un souci de moins pour vous',
      'Cette fois, pas besoin de rappeler : je reste avec vous',
      'Merci de votre patience… digne d’une médaille !',
      'On règle ça, et vous retournez à vos cartons'
    ],
    closers: [
      "La blague avant l'excuse",
      'Rire du problème du client',
      'L’excuse suivie d’un « mais »',
      "L'ironie ou le sarcasme",
      "L'humour face à la colère ou au deuil",
      'La politesse robotique, sans chaleur',
      "Trois blagues d'affilée"
    ],
    examples: [
      {
        closed: 'Nous vous présentons nos excuses pour la gêne occasionnée.',
        open: "Je suis vraiment désolé pour ce contretemps. Je prends le relais, et vous gardez votre énergie pour les cartons !",
        insight: "Trop raide → une excuse personnelle et sincère, suivie d'un sourire léger."
      },
      {
        closed: 'Jamais deux sans trois, hein !',
        open: "Deux fois, c'est déjà deux de trop, je m'en excuse. Je m'en occupe personnellement pour qu'il n'y ait pas de troisième fois.",
        insight: "Trop drôle → la diplomatie d'abord : on ne plaisante pas sur un problème répété."
      },
      {
        closed: 'Je vais transmettre votre demande au service concerné.',
        open: "Je m'en occupe personnellement et je vous tiens au courant : promis, pas de ping-pong entre services !",
        insight: "Trop administratif → on assume, puis un clin d'œil qui rassure."
      }
    ]
  },

  /* ÉCRAN 3 – quatre températures, quatre dosages. `questions` = phrases bien dosées. */
  situations: [
    {
      id: 'brulant',
      icon: 'alert',
      title: "Brûlant : l'alarme qui sonne sans arrêt",
      teaser: '« Les voisins viennent se plaindre ! »',
      context:
        "Depuis le transfert dans sa nouvelle maison, l'alarme du client s'est déclenchée trois nuits de suite. Les nouveaux voisins sont venus se plaindre. Il est furieux, épuisé, et exige une résiliation immédiate.",
      goal:
        "Température brûlante : diplomatie seule pour faire retomber la colère, solution concrète rapide. Un sourire n'est permis qu'à la toute fin, une fois le client apaisé.",
      badApproach: "(rire) Au moins, vous êtes sûr qu'elle fonctionne bien !",
      badWhy:
        "Plaisanter sur le problème d'un client à bout, c'est nier ce qu'il vit : trois nuits blanches et des voisins mécontents. Il se sent méprisé, et la résiliation devient une question d'honneur.",
      questions: [
        {
          q: "Trois nuits réveillé, et en plus avec les nouveaux voisins… Je comprends tout à fait que vous soyez à bout. Je suis vraiment désolé.",
          a: "Merci… Oui, je suis épuisé. Et je passe pour le voisin pénible avant même d'avoir défait les cartons.",
          insight: "Diplomatie pure : on nomme tout ce qu'il vit. La colère laisse place à la fatigue."
        },
        {
          q: "Je reprends la situation avec vous tout de suite. Les déclenchements ont lieu à quelle heure, à peu près ?",
          a: "Vers trois heures du matin, à chaque fois. Toujours dans le salon.",
          insight: "On passe à l'action concrète : le client devient acteur de la solution."
        },
        {
          q: "Merci, ça nous aide beaucoup. Je fais le nécessaire pour qu'un technicien vienne vérifier le détecteur du salon au plus vite, et je vous confirme tout par écrit.",
          a: "D'accord. Si c'est réglé rapidement, je veux bien garder l'alarme.",
          insight: "Le client parle de garder l'alarme : la colère est retombée."
        },
        {
          q: "Et d'ici là, j'espère que vous allez enfin pouvoir présenter vos voisins à la version calme de la maison !",
          a: "(petit rire) Oui, ce serait bien, ça. Merci pour votre aide.",
          insight: "Le sourire arrive en dernier, une fois la solution trouvée. Il porte sur la situation, pas sur le client."
        }
      ],
      opportunities: [
        { title: 'Colère retombée', text: "La diplomatie seule a apaisé : le client remercie." },
        { title: 'Problème localisé', text: 'Détecteur du salon, la nuit : intervention ciblée.' },
        { title: 'Résiliation abandonnée', text: 'Le client accepte de garder l’alarme si c’est réglé.' },
        { title: 'Fin d’appel chaleureuse', text: "Un petit sourire final, mérité, pour finir sur une note positive." }
      ],
      synthesis:
        "« Je récapitule : je fais le nécessaire pour l'intervention sur le détecteur du salon, je vous envoie la confirmation tout de suite, et je garde votre dossier en suivi jusqu'à ce que vos nuits redeviennent calmes. »",
      conclusion:
        "Avec un client brûlant, la dose d'humour est zéro… jusqu'à la fin. La diplomatie fait tout le travail ; le sourire n'arrive qu'une fois le problème pris en charge."
    },
    {
      id: 'tiede',
      icon: 'timer',
      title: 'Tiède : le rendez-vous repoussé',
      teaser: '« Je suis déçu, franchement. »',
      context:
        "L'installation dans le nouveau logement a été décalée de deux semaines. Le client emménage la semaine prochaine dans une maison sans protection. Il est déçu plus qu'en colère, et se demande « si ça vaut encore le coup ».",
      goal:
        "Température tiède : une excuse sincère et une prise en charge d'abord, puis une touche d'autodérision pour faire remonter la confiance, avant de chercher une solution.",
      badApproach: 'Désolé, mais les plannings sont très chargés en ce moment, ce n’est pas de notre faute.',
      badWhy:
        "L'excuse est aussitôt annulée par le « mais » et la justification. Le client entend : « Votre problème ne nous concerne pas. » Sa déception se transforme en doute sur toute la relation.",
      questions: [
        {
          q: "Je comprends votre déception : emménager sans protection, ce n'est pas ce qu'on vous avait promis. Je suis désolé.",
          a: "Voilà. Je comptais vraiment être protégé dès le premier jour.",
          insight: "Une excuse sans « mais » : le client se sent entendu."
        },
        {
          q: "Je regarde avec vous toutes les options pour avancer cette installation. Je ne vous lâche pas tant qu'on n'a pas trouvé mieux !",
          a: "(sourire) D'accord, j'aime bien cette motivation.",
          insight: "Une prise en charge énergique, avec un sourire dans la voix : la confiance remonte."
        },
        {
          q: "Vous êtes disponible quand, cette semaine ou la suivante ? Même un créneau qui se libère au dernier moment peut nous aider.",
          a: "Je suis là toute la journée de jeudi, et le samedi matin aussi.",
          insight: "Le client donne ses disponibilités : il redevient partenaire."
        },
        {
          q: "Parfait. Je vous inscris pour être prévenu si un créneau plus proche se libère, et je vous confirme tout par écrit. Le seul qui devra attendre, ce sera le carton de la cuisine !",
          a: "(rire) Celui-là, il attendra de toute façon ! Merci, vraiment.",
          insight: "Action concrète puis clin d'œil final : le client repart rassuré et de bonne humeur."
        }
      ],
      opportunities: [
        { title: 'Déception apaisée', text: "L'excuse sincère a restauré le respect." },
        { title: 'Confiance retrouvée', text: "L'énergie et le sourire de l'agent rassurent." },
        { title: 'Disponibilités connues', text: 'Jeudi et samedi matin : chercher un créneau plus proche.' },
        { title: 'Relation préservée', text: "Le client ne parle plus d'arrêter : il remercie." }
      ],
      synthesis:
        "« Je récapitule : je surveille les créneaux de jeudi et samedi matin, je vous préviens dès qu'une place se libère, et vous recevez tout par écrit aujourd'hui. Votre nouvelle maison sera protégée au plus vite. »",
      conclusion:
        "Avec un client tiède, la diplomatie ouvre (excuse sans « mais ») et le sourire relance la confiance. L'humour devient un signe d'engagement, pas de légèreté."
    },
    {
      id: 'froid',
      icon: 'shield',
      title: 'Froid : le client pressé et méfiant',
      teaser: '« J’ai cinq minutes, je résilie. »',
      context:
        "Le client appelle pendant sa pause déjeuner. Il déménage le mois prochain et annonce, sur un ton sec, qu'il veut résilier et qu'il n'a « pas de temps à perdre avec un argumentaire ».",
      goal:
        "Température froide : respecter son temps et sa demande (diplomatie), et utiliser un humour léger sur notre propre rôle pour lever la méfiance, puis obtenir sa permission pour une seule question.",
      badApproach: "Avant tout, je dois vous présenter nos offres de fidélité, ça ne prendra que dix minutes.",
      badWhy:
        "On ignore à la fois son temps et sa demande. Pour un client méfiant, c'est la preuve qu'on veut le retenir à tout prix : il se ferme définitivement.",
      questions: [
        {
          q: "C'est entendu, je m'occupe de votre demande et je respecte votre pause. Promis, je vais plus vite que votre micro-ondes !",
          a: "(petit rire) D'accord, on va voir ça.",
          insight: "Diplomatie (respect de la demande) + humour sur soi : la méfiance tombe."
        },
        {
          q: "Une seule question, en toute transparence, et vous avez le droit de dire non : votre nouveau logement, c'est un appartement ou une maison ?",
          a: 'Une maison. On n’a encore rien prévu pour la sécurité, d’ailleurs.',
          insight: 'Demander la permission redonne le contrôle au client : il répond volontiers.'
        },
        {
          q: "Alors je peux vous proposer de déplacer votre installation : vous n'avez rien à organiser. Je vous envoie le détail par écrit, et vous décidez tranquillement ce soir.",
          a: "Ah, par écrit, c'est parfait. Je regarde ça ce soir.",
          insight: "On respecte son temps : pas de pression, une trace écrite, une décision au calme."
        },
        {
          q: "Et je vous laisse profiter de ce qui reste de votre pause : mission accomplie avant la fin du micro-ondes ?",
          a: '(rire) Largement ! Merci, c’était efficace.',
          insight: "Un rappel humoristique pour conclure : le client repart avec une image positive."
        }
      ],
      opportunities: [
        { title: 'Méfiance levée', text: 'Respect de son temps + humour sur soi.' },
        { title: 'Un besoin réel', text: 'Une maison, aucune protection prévue.' },
        { title: 'Décision au calme', text: "Récapitulatif écrit : il choisit ce soir, sans pression." },
        { title: 'Image positive', text: '« C’était efficace » : la relation est préservée.' }
      ],
      synthesis:
        "« Je vous envoie tout de suite le détail du transfert vers votre nouvelle maison. Si ça vous convient, vous me rappelez ou vous répondez simplement au message, et je m'occupe de tout. »",
      conclusion:
        "Avec un client froid, la diplomatie, c'est le respect de son temps et de sa demande. L'humour, sur notre propre rôle, montre qu'on ne cherche pas à le piéger."
    },
    {
      id: 'detendu',
      icon: 'users',
      title: 'Détendu : le client bavard et enthousiaste',
      teaser: '« On a enfin trouvé la maison de nos rêves ! »',
      context:
        "Le client est ravi : il vient d'acheter une maison avec jardin et raconte longuement les travaux, la piscine, le chien. Il mentionne au passage qu'il pensait « arrêter l'alarme, on verra plus tard ». L'appel risque de s'éterniser sans aboutir.",
      goal:
        "Température détendue : partager sa bonne humeur avec un humour complice, et utiliser la diplomatie pour recentrer la conversation vers le transfert, sans couper ni vexer.",
      badApproach: 'Bon, revenons à l’essentiel : vous résiliez ou pas ?',
      badWhy:
        "Couper sèchement un client enthousiaste casse la complicité. Il se sent pris de haut, et la question fermée l'oriente vers… la résiliation.",
      questions: [
        {
          q: "Une maison avec jardin et piscine, félicitations ! Le chien doit déjà avoir repéré son coin préféré.",
          a: "(rire) Il a déjà creusé deux trous ! On est vraiment heureux.",
          insight: "Humour complice : on partage sa joie, la relation est chaleureuse."
        },
        {
          q: "Je comprends que vous ayez mille projets en tête. Je vous propose qu'on règle ensemble l'alarme en deux minutes, comme ça c'est une chose de faite et vous retournez à vos plans de jardin.",
          a: "Oui, vous avez raison, autant le faire maintenant.",
          insight: "Diplomatie : on recentre en valorisant son temps, sans le couper."
        },
        {
          q: "Une grande maison avec jardin, c'est plus d'accès qu'un appartement. Qu'est-ce qui serait important pour vous, côté sécurité ?",
          a: "C'est vrai… Surtout quand on part en vacances, avec la piscine et tout. Je n'y avais pas pensé.",
          insight: "Le client fait lui-même le lien entre sa nouvelle maison et le besoin de protection."
        },
        {
          q: "Alors on déplace votre installation, et on regarde si la maison a besoin d'un complément. Le chien gardera le jardin, et nous, la maison !",
          a: "(rire) Parfait, chacun son rôle ! On fait comme ça.",
          insight: "Le sourire final scelle l'accord : le transfert est accepté."
        }
      ],
      opportunities: [
        { title: 'Complicité installée', text: 'Le client rit et se sent écouté.' },
        { title: 'Conversation recentrée', text: "La diplomatie a ramené l'appel vers l'alarme, sans vexer." },
        { title: 'Un besoin révélé', text: 'Grande maison, jardin, absences : protection à adapter.' },
        { title: 'Transfert accepté', text: '« On fait comme ça » : l’accord est donné.' }
      ],
      synthesis:
        "« Je récapitule : on déplace votre installation dans la nouvelle maison, on vérifie si le jardin et les accès demandent un complément, et je vous envoie tout par écrit. Vous n'avez plus qu'à profiter de la piscine ! »",
      conclusion:
        "Avec un client détendu, l'humour vient naturellement ; c'est la diplomatie qui permet de garder le cap. On partage sa bonne humeur, puis on recentre avec élégance."
    }
  ],

  /* ÉCRAN 4 – Trouve le bon dosage ! (`closed` = phrase mal dosée) */
  transform: [
    {
      closed: 'Nous vous présentons nos excuses pour la gêne occasionnée.',
      proposals: [
        "Je suis vraiment désolé pour ce qui s'est passé. Je prends le relais, et vous, vous gardez votre énergie pour les cartons !",
        "Je m'excuse sincèrement pour ce contretemps. On va le régler ensemble, et vite."
      ],
      tip: "Trop raide : une excuse personnelle sonne vrai. Le sourire vient après, s'il a sa place."
    },
    {
      closed: 'Jamais deux sans trois, hein !',
      proposals: [
        "Deux fois, c'est déjà deux de trop, je m'en excuse. Je m'en occupe personnellement pour qu'il n'y ait pas de troisième fois.",
        "Je comprends que vous en ayez assez, et je suis désolé. Cette fois, je vous suis jusqu'au bout."
      ],
      tip: "Trop drôle : on ne plaisante jamais sur un problème qui se répète. Diplomatie d'abord."
    },
    {
      closed: 'Je vais transmettre votre demande au service concerné.',
      proposals: [
        "Je m'en occupe personnellement et je reviens vers vous : promis, pas de ping-pong entre services !",
        "C'est moi qui suis votre dossier maintenant. Vous avez un seul interlocuteur, et il est motivé !"
      ],
      tip: "Trop administratif : on assume, puis un clin d'œil qui rassure."
    },
    {
      closed: 'Il fallait nous prévenir plus tôt, mais bon, on va faire avec !',
      proposals: [
        "Merci de nous prévenir. On a encore le temps de bien organiser votre déménagement ensemble.",
        "Merci pour l'info ! On va s'organiser, et je vous promets que ce sera plus simple que le Tetris du camion."
      ],
      tip: "Reproche + humour = vexant. On remercie d'abord, le sourire ensuite."
    },
    {
      closed: 'Bon, je ne vais pas vous retenir plus longtemps.',
      proposals: [
        "Merci pour votre confiance ! Bon courage pour le déménagement, et belle installation dans votre nouvelle maison.",
        "C'est tout bon de mon côté ! Je vous souhaite une très belle installation, et que les cartons soient légers !"
      ],
      tip: "Une fin d'appel sèche laisse un goût amer. On termine chaleureux, personnel, et souriant."
    }
  ],

  /* ÉCRAN 5 – Challenge final : 3 clients tirés au hasard. Dans chaque question :
     une réponse trop raide, une trop drôle, une bien dosée. */
  quiz: [
    {
      client: "Ça fait deux fois que j'appelle, personne ne me rappelle !",
      options: [
        { text: 'Jamais deux sans trois, comme on dit !', why: 'Trop drôle : la blague sur le problème vexe le client.' },
        { text: 'Je transmets votre réclamation au service concerné.', why: 'Trop raide : le client se sent baladé une fois de plus.' },
        { text: "Deux fois, c'est deux de trop, je m'en excuse. Je prends votre dossier moi-même : vous êtes tombé sur la bonne personne !", correct: true }
      ],
      explanation:
        "L'excuse et la prise en charge d'abord, puis un clin d'œil sur l'agent lui-même. Le client se sent respecté, puis rassuré."
    },
    {
      client: "L'alarme a sonné trois nuits de suite, mes voisins sont furieux !",
      options: [
        { text: "Trois nuits réveillé, je comprends que vous soyez à bout, je suis vraiment désolé. Je m'occupe de faire vérifier ça au plus vite.", correct: true },
        { text: "(rire) Au moins, vous êtes sûr qu'elle fonctionne !", why: 'Humour sur le problème d’un client brûlant : il se sent méprisé.' },
        { text: 'Les fausses alarmes peuvent avoir plusieurs causes techniques.', why: 'Trop raide : on explique avant d’avoir écouté.' }
      ],
      explanation:
        "Client brûlant : la bonne dose d'humour est zéro. Diplomatie et action concrète ; le sourire pourra venir en fin d'appel."
    },
    {
      client: "Mon installation est repoussée de deux semaines, je suis déçu.",
      options: [
        { text: 'Désolé, mais les plannings sont chargés, ce n’est pas de notre faute.', why: "L'excuse est annulée par le « mais » : le client se sent abandonné." },
        { text: "Je comprends votre déception, et je suis désolé. Je regarde toutes les options avec vous : je ne vous lâche pas tant qu'on n'a pas trouvé mieux !", correct: true },
        { text: "Deux semaines, ça vous laisse le temps de défaire les cartons !", why: 'Trop drôle : on minimise une vraie déception.' }
      ],
      explanation:
        "Client tiède : excuse sans « mais », puis une prise en charge énergique avec le sourire. La confiance remonte."
    },
    {
      client: "J'ai cinq minutes, je veux résilier, pas d'argumentaire.",
      options: [
        { text: "C'est entendu, je respecte votre temps. Promis, je vais plus vite que votre micro-ondes !", correct: true },
        { text: 'Je dois vous présenter nos offres avant toute résiliation.', why: 'Trop raide : on ignore sa demande, il se ferme.' },
        { text: "Cinq minutes ? Vous savez qu'on a battu des records d'attente, alors…", why: "Humour sur nos défauts face à un client pressé : il s'impatiente." }
      ],
      explanation:
        "Client froid : on respecte d'abord sa demande et son temps, puis une touche d'humour sur soi lève la méfiance."
    },
    {
      client: "On a acheté une maison avec piscine, le chien adore le jardin !",
      options: [
        { text: 'Très bien. Vous résiliez ou vous transférez ?', why: 'Trop raide : on casse l’enthousiasme du client.' },
        { text: "Félicitations ! Le chien a déjà dû repérer son coin préféré. On règle l'alarme en deux minutes, et vous retournez à vos plans de jardin ?", correct: true },
        { text: "Une piscine ? Invitez-moi à la crémaillère, et je vous fais une remise !", why: 'Trop drôle et déplacé : on promet ce qui n’existe pas et on perd le cap.' }
      ],
      explanation:
        "Client détendu : humour complice pour partager sa joie, puis diplomatie pour recentrer l'appel, sans le couper."
    },
    {
      client: "Il fallait que je vous prévienne combien de temps avant ? Personne ne me l'a dit.",
      options: [
        { text: "Merci de nous prévenir maintenant ! On a encore le temps de tout organiser ensemble, et sans stress.", correct: true },
        { text: "C'est indiqué dans vos conditions générales.", why: 'Trop raide : le client se sent pris en faute.' },
        { text: "Hier, ça aurait été mieux… mais bon, on va faire avec !", why: 'Reproche déguisé en humour : le client se vexe.' }
      ],
      explanation:
        "On remercie au lieu de reprocher, et on rassure avec légèreté. Le client se sent accompagné, pas jugé."
    },
    {
      client: "Je dois résilier l'alarme de ma mère, elle part en maison de retraite.",
      options: [
        { text: "Je comprends, ce n'est pas une étape facile. Je vais vous accompagner simplement, prenez le temps qu'il vous faut.", correct: true },
        { text: "Elle va pouvoir se reposer, c'est des vacances à vie !", why: "L'humour n'a pas sa place face à une situation familiale délicate." },
        { text: 'Il me faut le numéro de contrat et un justificatif.', why: 'Trop raide : on ignore la dimension humaine.' }
      ],
      explanation:
        "Situation sensible : diplomatie et douceur uniquement. Savoir ne pas faire d'humour fait partie du bon dosage."
    },
    {
      client: "(fin d'appel, client détendu) Merci, c'était vraiment efficace !",
      options: [
        { text: 'Au revoir.', why: 'Trop raide : on rate une belle occasion de laisser une bonne impression.' },
        { text: "Avec plaisir ! Belle installation dans votre nouvelle maison, et que les cartons soient légers !", correct: true },
        { text: "Merci ! Et si vous voulez, je vous raconte une blague sur les déménageurs…", why: "Trop drôle : on en fait trop, et on prolonge l'appel sans raison." }
      ],
      explanation:
        "Fin d'appel : une phrase chaleureuse, personnelle et souriante. Le client raccroche avec le sourire et s'en souviendra."
    }
  ],

  /* ÉCRAN 6 */
  reflexes: [
    { not: "D'abord la diplomatie", do: "l'humour ensuite.", icon: 'shieldCheck' },
    { not: 'Prendre la température', do: 'avant chaque trait d’humour.', icon: 'target' },
    { not: 'Une excuse sincère', do: 'jamais suivie d’un « mais ».', icon: 'heart' },
    { not: 'Ne jamais rire du problème', do: 'sourire de la situation ou de soi.', icon: 'sparkles' },
    { not: 'Toujours conclure', do: 'sur une action claire et une note chaleureuse.', sep: ' ', icon: 'flag' }
  ],
  finalQuote:
    "La diplomatie ouvre la porte, l'humour la garde ouverte. Ensemble, ils transforment un appel tendu en une vraie conversation entre deux personnes."
};
