/*
 * Contenu du workshop « Le brise-glace » : désamorcer un client mécontent ou qui veut résilier,
 * rendre l'appel agréable et l'accompagner dans son déménagement sans le vexer.
 * Tout le texte pédagogique est ici : modifiez ce fichier, aucune compilation nécessaire.
 * Le moteur (affichage, quiz, voix…) est partagé : ../workshop-commun/.
 */
window.WORKSHOP_DATA = {
  storageKey: 'workshop-brise-glace',

  /* Libellés d'interface propres à cet atelier (le reste prend les valeurs par défaut du moteur) */
  labels: {
    introEyebrow: 'Workshop Movers · Relation client',
    introTitleHtml: 'Le <span class="accent">brise-glace</span>',
    cmpEyebrow: 'Étape 2 · Comprendre la différence',
    cmpTitleHtml: 'La phrase qui braque <span class="vs">ou</span> celle qui apaise ?',
    cmpLead: "Même client en colère, même dossier. Seule la première phrase de l'agent change… et tout le reste de l'appel avec elle.",
    cmpClosedTag: 'Réponse qui braque',
    cmpOpenTag: 'Réponse brise-glace',
    meterLabel: 'Tension du client',
    cmpWhyTitle: 'Pourquoi la deuxième réponse désamorce-t-elle le client ?',
    openersTitle: 'Les formules qui apaisent',
    closersTitle: 'Les formules qui braquent',
    examplesTitle: 'À vous : comment désamorceriez-vous ces phrases ?',
    flipClosed: 'Braque',
    flipOpen: 'Apaise',
    flipBack: 'Revenir à la phrase qui braque',
    sitEyebrow: 'Étape 3 · Mises en situation Movers',
    sitTitle: 'Les 4 clients à désamorcer',
    sitLead: "Lisez le contexte, laissez l'équipe proposer ses phrases, puis révélez pas à pas les brise-glace, les réactions du client et ce qui ouvre la porte au déménagement.",
    stages: ['Contexte', 'Le piège', 'Brise-glace', 'Ouvertures', 'Conclusion'],
    questionsLabel: 'Phrases brise-glace',
    questionsPrompt: "<strong>À vous de jouer.</strong> Quelle est la première phrase que vous diriez à ce client pour faire baisser la tension ? Proposez vos formulations avant de révéler celles du support.",
    revealQuestion: 'Révéler la phrase',
    oppsLabel: "Ce qui ouvre la porte au déménagement",
    oppsPrompt: "<strong>La glace est brisée ?</strong> Quels signaux montrent que le client est prêt à avancer, et sur quoi peut-on maintenant s'appuyer ?",
    oppsReveal: 'Révéler les ouvertures',
    oppsHide: 'Masquer les ouvertures',
    synthesisLabel: "Phrase de transition vers le déménagement",
    trEyebrow: 'Étape 4 · Exercice collectif',
    trTitle: 'Reformule pour apaiser !',
    trLead: "Une phrase maladroite s'affiche : celle qui nous échappe quand l'appel se tend. À l'équipe de proposer, à l'oral, une version qui apaise. Puis on compare.",
    trTag: 'Phrase qui braque',
    trHint: 'Réaction probable : le client hausse le ton… et l’appel bascule.',
    trRevealTag: 'Version brise-glace',
    trReveal: 'Révéler une version apaisante',
    trNext: 'Phrase suivante',
    quizTitle: 'Saurais-tu désamorcer ce client ?',
    quizLead: 'Trois clients tirés au hasard. Pour chacun, choisissez la meilleure première réponse.',
    quizAsk: 'Quelle est la meilleure réponse pour faire baisser la tension ?',
    quizBest: 'Meilleure réponse',
    quizMsgs: [
      ['On rejoue ?', 'Le réflexe de se justifier est tenace. Commencez toujours par accueillir l’émotion du client.'],
      ['Bon début', 'Vous sentez la tension. Attention aux phrases qui minimisent ou qui renvoient la faute.'],
      ['Très bien joué', 'Vous savez faire redescendre la pression. Encore un effort pour un sans-faute !'],
      ['Sans-faute !', 'Vous accueillez, vous assumez, vous donnez un cap. Le client raccroche rassuré. Bravo.']
    ],
    conclTitle: 'Les 5 réflexes brise-glace'
  },

  centralMessage:
    "On ne déménage pas un client vexé : on accompagne un client rassuré. La glace se brise avec de l'écoute, jamais avec des arguments.",

  steps: [
    {
      id: 'introduction',
      label: 'Introduction',
      duration: '5 min',
      notes:
        "Ouvrez par une question à l'équipe : « Quelle est la phrase d'un client qui vous fait le plus monter en pression ? » Notez 2 ou 3 réponses : elles serviront dans l'exercice de l'étape 4."
    },
    {
      id: 'braque-apaise',
      label: 'Braque ou apaise',
      duration: '10 min',
      notes:
        "Faites jouer la scène : un agent lit la phrase du client sur un ton énervé, un autre répond avec la phrase qui braque, puis avec la phrase brise-glace. Demandez au « client » ce qu'il a ressenti dans les deux cas."
    },
    {
      id: 'situations',
      label: 'Mises en situation',
      duration: '20 min',
      notes:
        "Pour chaque client : faites proposer la première phrase par l'équipe AVANT de révéler le support. Insistez sur le ton : la même phrase dite trop vite ou sur la défensive ne désamorce rien. La voix du client peut être lue à haute voix (bouton haut-parleur)."
    },
    {
      id: 'reformule',
      label: 'Reformule pour apaiser',
      duration: '10 min',
      notes:
        "Une phrase à la fois. Faites dire la reformulation à voix haute, avec le ton. Valorisez les formulations personnelles : un brise-glace sincère vaut mieux qu'une phrase apprise par cœur."
    },
    {
      id: 'challenge',
      label: 'Challenge final',
      duration: '5 min',
      notes:
        "Vote à main levée (A, B ou C) avant de cliquer. Les touches A, B et C du clavier sélectionnent aussi une réponse. Rejouer tire trois nouveaux clients."
    },
    {
      id: 'conclusion',
      label: 'Conclusion',
      duration: '5 min',
      notes:
        "Demandez à chacun de choisir SA phrase brise-glace préférée et de la dire à voix haute. Proposez de l'écrire sur un post-it à côté de l'écran pour les prochains appels."
    }
  ],

  /* ÉCRAN 1 */
  intro: {
    subtitle: 'Désamorcer avant de convaincre.',
    principles: [
      { icon: 'heart', title: 'Accueillir', rest: "l'émotion plutôt que la contester.", text: 'Un client qui se sent compris n’a plus besoin de hausser le ton.' },
      { icon: 'ear', title: 'Ralentir', rest: 'plutôt que se justifier.', text: 'Laisser le client vider son sac, c’est déjà faire baisser la pression.' },
      { icon: 'users', title: 'Créer du lien', rest: 'avant de parler solution.', text: "On ne parle déménagement qu'une fois la glace brisée." }
    ],
    hook: "Un client mécontent ne cherche pas quelqu'un qui a raison. Il cherche quelqu'un qui l'écoute."
  },

  /* ÉCRAN 2 – la phrase qui braque / la phrase brise-glace */
  comparison: {
    closed: {
      question: "Je ne peux rien faire pour vous, il faut voir avec le service concerné.",
      answer: "Évidemment ! Personne ne peut jamais rien faire chez vous. Résiliez-moi, j'en ai assez.",
      gain: 92,
      tone: 'red',
      verdict: "Le client se sent renvoyé d'un service à l'autre. La colère monte et la résiliation devient une question de principe."
    },
    open: {
      question:
        "Trois appels pour la même chose, je comprends tout à fait que vous soyez agacé. Je reprends votre dossier avec vous maintenant, et on ne raccroche pas sans une solution claire.",
      answer: "Bon… merci. Au moins quelqu'un qui m'écoute. Alors voilà ce qui s'est passé…",
      gain: 22,
      tone: 'green',
      verdict: "Le client se sent reconnu et pris en charge. Il redescend et accepte de raconter : la conversation peut commencer."
    },
    why: [
      { icon: 'heart', title: "1. Accueillir l'émotion", text: "« Je comprends que vous soyez agacé » : on reconnaît le ressenti, sans le contester ni le juger." },
      { icon: 'shieldCheck', title: '2. Assumer', text: "« Je reprends votre dossier avec vous » : pas de renvoi de balle, l'agent prend la main." },
      { icon: 'flag', title: '3. Donner un cap', text: "« On ne raccroche pas sans une solution claire » : le client sait où va l'appel, il peut lâcher prise." }
    ],
    openers: [
      'Je comprends que…',
      'Vous avez raison de me le signaler',
      'Merci de votre patience',
      'On va regarder ça ensemble',
      'Si je vous suis bien…',
      'Je reste avec vous jusqu’à…',
      'Je m’en occupe personnellement'
    ],
    closers: [
      'Calmez-vous',
      "Ce n'est pas de ma faute",
      "C'est la procédure",
      'Vous auriez dû…',
      'Je ne peux rien faire',
      'Oui, mais…',
      'Comme je vous l’ai déjà dit…'
    ],
    examples: [
      {
        closed: 'Calmez-vous, madame.',
        open: "Je vous entends, et je comprends que la situation soit pénible. Racontez-moi ce qui s'est passé, je vous écoute.",
        insight: "Ordonner le calme agace. Reconnaître l'émotion la fait retomber."
      },
      {
        closed: "C'est la procédure, je n'y peux rien.",
        open: "Je vais vous expliquer pourquoi on procède ainsi, et surtout ce que je peux faire pour vous dès aujourd'hui.",
        insight: 'On explique la règle, mais on met l’accent sur ce qui est possible.'
      },
      {
        closed: 'Vous auriez dû nous prévenir avant.',
        open: "Merci de nous prévenir. On a encore le temps d'organiser les choses ensemble pour votre déménagement.",
        insight: 'Pas de reproche : on remercie, et on se projette sur la suite.'
      }
    ]
  },

  /* ÉCRAN 3 – quatre clients à désamorcer. `questions` = phrases brise-glace. */
  situations: [
    {
      id: 'furieux',
      icon: 'alert',
      title: 'Le client furieux',
      teaser: '« Ça fait trois fois que j’appelle ! »',
      context:
        "Le technicien ne s'est pas présenté au rendez-vous de transfert prévu pour le déménagement. Le client a posé une demi-journée de congé pour rien. Il appelle pour la troisième fois et annonce d'emblée qu'il veut résilier.",
      goal:
        "Faire retomber la colère en reconnaissant le préjudice, reprendre la main sur le dossier et reprogrammer le transfert dans de bonnes conditions.",
      badApproach: "Je vois que c'est le service technique qui a annulé, ce n'est pas de notre ressort ici.",
      badWhy:
        "Pour le client, il n'y a qu'une seule entreprise. Se défausser sur un autre service confirme qu'il est baladé, et transforme la colère en envie de partir.",
      questions: [
        {
          q: "Vous avez posé une demi-journée pour rien, je comprends tout à fait votre colère. Je suis vraiment désolé pour ce rendez-vous manqué.",
          a: "Merci de le reconnaître… Mais franchement, c'est la troisième fois que j'explique tout depuis le début.",
          insight: "Le ton baisse dès que le préjudice est nommé. Le client exprime la vraie douleur : se répéter."
        },
        {
          q: "Vous n'aurez pas à tout réexpliquer : j'ai votre dossier sous les yeux et je m'en occupe personnellement jusqu'au bout.",
          a: "D'accord. Ça, ça me rassure un peu.",
          insight: "La prise en charge personnelle remplace la sensation d'être baladé."
        },
        {
          q: "Si je vous suis bien, ce qui compte avant tout pour vous, c'est que le transfert soit fait sans reprendre une journée de congé ?",
          a: "Exactement. Je ne peux pas me libérer encore une fois en semaine.",
          insight: 'La reformulation fait émerger la contrainte réelle : la disponibilité.'
        },
        {
          q: "Alors regardons ensemble le créneau qui vous arrange le mieux, et je vous confirme tout par écrit avant de raccrocher.",
          a: "Bon, d'accord. Si c'est confirmé noir sur blanc, on peut le refaire.",
          insight: "Le client parle de « refaire » le transfert : la résiliation n'est plus d'actualité."
        }
      ],
      opportunities: [
        { title: 'La colère est retombée', text: 'Le client remercie et accepte d’avancer : le moment est venu de parler solution.' },
        { title: 'La vraie contrainte', text: 'Ses disponibilités : proposer le créneau le plus adapté possible.' },
        { title: 'Le besoin de garantie', text: "Confirmer par écrit, donner un nom, s'engager sur un suivi." },
        { title: 'Le transfert relancé', text: 'Le déménagement de l’installation redevient le sujet de l’appel.' }
      ],
      synthesis:
        "« Je récapitule : je vous propose ce créneau, je vous envoie la confirmation tout de suite, et je garde votre dossier en suivi jusqu'à l'installation dans votre nouveau logement. Ça vous convient ? »",
      conclusion:
        "Face à la colère, on ne défend pas l'entreprise : on défend le client. Nommer le préjudice, s'excuser sincèrement et prendre la main suffisent souvent à faire tomber la résiliation."
    },
    {
      id: 'ferme',
      icon: 'x',
      title: '« Je veux résilier, point. »',
      teaser: '« Je n’ai pas le temps de discuter. »',
      context:
        "Le client déménage dans trois semaines. Ton sec, réponses courtes : il demande la résiliation et prévient qu'il ne veut « pas qu'on essaie de le retenir ».",
      goal:
        "Respecter sa demande pour faire tomber la méfiance, créer un minimum de lien humain, puis obtenir son accord pour parler une minute du nouveau logement.",
      badApproach: 'Avant de résilier, je dois vous présenter nos offres de fidélité.',
      badWhy:
        "Le client a annoncé qu'il ne voulait pas être retenu. Lui imposer un argumentaire confirme sa méfiance : il se ferme définitivement et l'appel devient un rapport de force.",
      questions: [
        {
          q: "C'est entendu, je m'occupe de votre demande, et je vous promets de ne pas vous faire perdre de temps.",
          a: "Ah. Bon, très bien. Merci.",
          insight: "Respecter la demande désarme la méfiance : le client relâche sa garde."
        },
        {
          q: "Un déménagement dans trois semaines, vous devez avoir mille choses à gérer en ce moment !",
          a: "Ne m'en parlez pas, les cartons, les compteurs, l'école des enfants… Je n'en vois pas le bout.",
          insight: "Une phrase d'empathie sur sa vie, pas sur le contrat : le client s'ouvre et donne du contexte."
        },
        {
          q: "Je comprends. Je peux vous poser une seule question sur votre futur logement ? Ça prend trente secondes, et ensuite je finalise ce que vous m'avez demandé.",
          a: 'Allez-y, trente secondes.',
          insight: 'Demander la permission redonne le contrôle au client : il accepte bien plus volontiers.'
        },
        {
          q: 'Comment se présente le nouveau logement ?',
          a: "C'est une maison, un peu à l'écart. On n'a pas encore réfléchi à l'alarme, honnêtement.",
          insight: "La porte s'ouvre : nouveau logement plus exposé, rien de prévu pour la sécurité."
        }
      ],
      opportunities: [
        { title: 'Méfiance levée', text: 'Le client a constaté qu’on respectait sa demande : il écoute.' },
        { title: 'Un client débordé', text: "Lui proposer de prendre en charge le déménagement de l'alarme, c'est une chose de moins à gérer." },
        { title: 'Un logement plus exposé', text: 'Maison à l’écart : le besoin de protection existe.' },
        { title: 'Permission obtenue', text: 'Il a accepté d’en parler : rester bref et concret.' }
      ],
      synthesis:
        "« Puisque vous avez déjà beaucoup à gérer, je peux vous enlever ce souci : on déplace votre installation dans la nouvelle maison et vous gardez votre protection sans rien organiser de votre côté. Ça vous dirait que je vous explique comment ça se passe ? »",
      conclusion:
        "Avec un client fermé, le brise-glace passe par le respect : on ne force pas, on demande la permission. Un client qui garde le contrôle de l'appel accepte bien plus facilement d'écouter."
    },
    {
      id: 'piege',
      icon: 'wallet',
      title: 'Le client qui se sent piégé',
      teaser: '« On ne m’a jamais dit ça ! »',
      context:
        "En annonçant son déménagement, le client découvre que son contrat comporte un engagement et des conditions de résiliation. Il se sent trompé : « Votre commercial ne m'a jamais parlé de ça, c'est de l'arnaque. »",
      goal:
        "Accueillir le sentiment d'injustice sans contester ni accuser le commercial, expliquer clairement les conditions, puis montrer que le déménagement de l'installation lui évite justement ces frais.",
      badApproach: "C'est pourtant écrit dans votre contrat, vous l'avez signé.",
      badWhy:
        "Même si c'est exact, la phrase dit au client qu'il est en tort. Il se sent humilié, et un client vexé préfère payer des frais plutôt que de rester.",
      questions: [
        {
          q: "Je comprends votre surprise, et je comprends que vous vous sentiez mal informé. Ce n'est jamais agréable de découvrir ça au moment d'un déménagement.",
          a: "Voilà, c'est exactement ça. J'ai l'impression d'avoir été pris pour un idiot.",
          insight: "On valide le ressenti sans valider l'accusation. Le client se sent compris, pas jugé."
        },
        {
          q: "Je vais vous expliquer simplement ce qui est prévu dans votre contrat, et surtout ce qu'on peut faire dans votre situation.",
          a: "D'accord, mais soyez clair, s'il vous plaît.",
          insight: "La transparence apaise : le client accepte d'écouter les conditions."
        },
        {
          q: "La bonne nouvelle, c'est que si vous gardez votre protection dans votre nouveau logement, il n'y a plus de résiliation, donc pas de frais de résiliation.",
          a: "Ah… ça change un peu les choses. Et ça se passe comment ?",
          insight: "Le déménagement devient la solution au problème, et non une contrainte de plus."
        },
        {
          q: "Qu'est-ce qui serait important pour vous dans la suite, pour que vous vous sentiez bien accompagné cette fois ?",
          a: "Qu'on m'explique tout clairement, par écrit, sans mauvaise surprise.",
          insight: 'Le client formule sa condition de confiance : la clarté.'
        }
      ],
      opportunities: [
        { title: 'Sentiment d’injustice apaisé', text: 'Le client a été écouté sans être contredit.' },
        { title: 'Les frais deviennent un argument', text: 'Le transfert évite des frais : le déménagement est la solution.' },
        { title: 'Besoin de clarté', text: 'Récapitulatif écrit, étapes et calendrier précis.' },
        { title: 'Confiance à reconstruire', text: 'Tenir chaque engagement pris pendant l’appel.' }
      ],
      synthesis:
        "« Pour être parfaitement clair : on déplace votre installation dans le nouveau logement, il n'y a donc pas de frais de résiliation, et je vous envoie aujourd'hui un récapitulatif écrit de tout ce qu'on vient de dire. On fait comme ça ? »",
      conclusion:
        "Avoir raison ne sert à rien si le client repart vexé. On ne gagne pas un débat sur le contrat : on reconnaît le ressenti, on explique avec transparence, et on transforme la contrainte en solution."
    },
    {
      id: 'stresse',
      icon: 'truck',
      title: 'Le client stressé par le déménagement',
      teaser: '« Je n’ai vraiment pas la tête à ça ! »',
      context:
        "Le client appelle entre deux cartons, enfants en fond sonore. Il est à bout et agacé de devoir « en plus » s'occuper de l'alarme. Il dit qu'il préfère tout arrêter pour avoir un souci de moins.",
      goal:
        "Apporter de la légèreté et du soulagement, montrer qu'on lui simplifie la vie, et organiser le transfert sans lui ajouter de charge mentale.",
      badApproach: 'Il me faut d’abord votre nouvelle adresse complète, la date exacte et vos disponibilités.',
      badWhy:
        "Enchaîner les questions administratives ajoute du stress à un client déjà débordé. Il a l'impression qu'on lui donne une tâche de plus : arrêter devient plus simple.",
      questions: [
        {
          q: "J'entends qu'il y a de l'animation chez vous ! Un déménagement avec des enfants, c'est un vrai marathon.",
          a: "(rire) Un marathon, c'est le mot ! Je ne sais plus où donner de la tête.",
          insight: "Une touche d'humour bienveillant et une phrase de vie quotidienne : la tension retombe."
        },
        {
          q: "Alors l'alarme, on va en faire un souci de moins, pas un souci de plus. Je m'occupe de tout, vous n'aurez presque rien à faire.",
          a: "Ah, si c'est vous qui gérez, alors oui, ça m'arrange.",
          insight: "On retourne la situation : garder l'alarme devient plus simple qu'arrêter."
        },
        {
          q: "Je vous prends juste deux minutes maintenant, ou vous préférez que je vous rappelle à un moment plus calme ?",
          a: "Rappelez-moi plutôt ce soir après 19 h, ce sera plus tranquille.",
          insight: "Laisser le choix du moment montre du respect, et donne un vrai rendez-vous d'écoute."
        },
        {
          q: "Le jour où vous arrivez dans la nouvelle maison, qu'est-ce qui vous rassurerait le plus, avec les enfants ?",
          a: "Savoir que la maison est protégée dès le premier soir, pour dormir tranquille.",
          insight: 'Le client exprime lui-même le bénéfice : sécurité dès l’arrivée, pour sa famille.'
        }
      ],
      opportunities: [
        { title: 'Le stress a baissé', text: 'Le client rit, souffle et accepte l’aide proposée.' },
        { title: 'Prise en charge complète', text: 'Le transfert est présenté comme un service qui allège sa charge.' },
        { title: 'Un rappel accepté', text: 'Un moment calme pour finaliser, à l’heure qu’il a choisie.' },
        { title: 'Protection dès l’arrivée', text: 'Planifier l’installation au plus près de son emménagement.' }
      ],
      synthesis:
        "« Parfait : je vous rappelle ce soir après 19 h, je vous prépare tout d'ici là, et on s'organise pour que la nouvelle maison soit protégée dès votre première nuit. Vous n'avez rien d'autre à faire d'ici là. »",
      conclusion:
        "Un client stressé ne refuse pas l'alarme : il refuse une contrainte de plus. Le brise-glace, c'est de la légèreté, du respect de son temps, et une prise en charge qui le soulage vraiment."
    }
  ],

  /* ÉCRAN 4 – Reformule pour apaiser ! (`closed` = phrase qui braque) */
  transform: [
    {
      closed: 'Calmez-vous, s’il vous plaît.',
      proposals: [
        'Je comprends que vous soyez à bout, et vous avez le droit de l’être. Je vous écoute.',
        'Je vois que cette situation vous pèse vraiment. Prenons le temps de la reprendre ensemble.'
      ],
      tip: "On ne demande jamais à quelqu'un de se calmer : on lui donne une raison de le faire."
    },
    {
      closed: "Ce n'est pas de ma faute.",
      proposals: [
        "Vous avez raison, ça n'aurait pas dû se passer comme ça. Je m'en occupe personnellement.",
        "Je suis désolé pour ce qui s'est passé. Mon rôle maintenant, c'est que ça se règle."
      ],
      tip: "Le client ne cherche pas un coupable : il cherche quelqu'un qui prend la main."
    },
    {
      closed: 'Je ne peux rien faire pour vous.',
      proposals: [
        'Voici ce que je peux faire pour vous dès maintenant…',
        "Je ne peux pas changer ce point, mais je peux vous proposer autre chose qui va vous aider."
      ],
      tip: "On parle toujours de ce qui est possible, jamais seulement de ce qui ne l'est pas."
    },
    {
      closed: 'Il fallait lire votre contrat.',
      proposals: [
        "Je comprends que ce point vous surprenne. Je vous l'explique simplement, et on regarde ensemble la meilleure option.",
        'Ce n’est pas toujours évident à repérer dans un contrat. Faisons le point ensemble, clairement.'
      ],
      tip: 'Même quand on a raison, on évite de mettre le client en faute : il se vexe et se ferme.'
    },
    {
      closed: 'Oui mais vous déménagez, donc vous résiliez ?',
      proposals: [
        "Félicitations pour ce nouveau projet ! Racontez-moi, vous partez vers quel type de logement ?",
        "Un déménagement, c'est une belle étape. Comment s'organise votre arrivée dans le nouveau logement ?"
      ],
      tip: "Le déménagement est une bonne nouvelle pour le client : on s'en réjouit avec lui avant de parler contrat."
    }
  ],

  /* ÉCRAN 5 – Challenge final : 3 clients tirés au hasard dans cette liste */
  quiz: [
    {
      client: "Ça fait trois fois que j'appelle, personne ne fait rien ! Je veux résilier.",
      options: [
        { text: "Je comprends votre exaspération, trois appels c'est beaucoup trop. Je reprends votre dossier et je m'en occupe personnellement.", correct: true },
        { text: 'Calmez-vous, monsieur, je vais voir ce que je peux faire.', why: '« Calmez-vous » est perçu comme un reproche : la tension monte.' },
        { text: "Ce n'est pas moi que vous avez eu les autres fois.", why: 'Vrai, mais inutile : le client entend « ce n’est pas mon problème ».' }
      ],
      explanation:
        "Cette réponse reconnaît l'exaspération et la prend en charge personnellement. Le client n'a plus besoin de se battre pour être entendu."
    },
    {
      client: "Votre commercial ne m'a jamais parlé de ces frais, c'est de l'arnaque !",
      options: [
        { text: "C'est pourtant écrit dans votre contrat signé.", why: 'Exact mais humiliant : le client se vexe et se braque.' },
        { text: 'Je comprends votre surprise. Je vous explique clairement ce qui est prévu, et surtout ce que l’on peut faire pour vous.', correct: true },
        { text: 'Je ne peux pas savoir ce que le commercial vous a dit.', why: 'On se défausse : le client se sent seul face au problème.' }
      ],
      explanation:
        "Cette réponse accueille le ressenti sans contester ni accuser, puis promet de la clarté et une solution. Le client accepte d'écouter."
    },
    {
      client: 'Je déménage, je résilie, et ne cherchez pas à me retenir.',
      options: [
        { text: 'Avant de résilier, je dois quand même vous présenter nos offres.', why: 'On ignore la demande du client : il se ferme complètement.' },
        { text: 'Très bien, c’est noté. Bonne journée.', why: "Pas de lien, pas d'écoute : on perd le client sans même avoir compris sa situation." },
        { text: "C'est entendu, je m'occupe de votre demande sans vous faire perdre de temps. Un déménagement, ça doit vous occuper en ce moment !", correct: true }
      ],
      explanation:
        "Cette réponse respecte la demande (la méfiance tombe) puis crée un lien humain sur sa vie du moment. La conversation peut s'ouvrir naturellement."
    },
    {
      client: "Je suis au milieu des cartons, je n'ai vraiment pas la tête à parler d'alarme !",
      options: [
        { text: "Je comprends ! Je vous rappelle à un moment plus calme ? Ce soir, ça vous irait ?", correct: true },
        { text: "Ce ne sera pas long, il me faut juste votre nouvelle adresse et la date d'emménagement.", why: 'On ajoute une tâche à un client débordé : il préfère tout arrêter.' },
        { text: "D'accord, rappelez-nous quand vous aurez le temps.", why: "On laisse la charge au client : il ne rappellera probablement jamais." }
      ],
      explanation:
        "Cette réponse respecte son état et son temps, tout en gardant la main : c'est l'agent qui rappelle, à un moment choisi par le client."
    },
    {
      client: "Le technicien n'est pas venu, j'ai posé un jour de congé pour rien !",
      options: [
        { text: "Le planning technique est très chargé en ce moment, vous savez.", why: 'Une justification que le client entend comme une excuse : il se sent méprisé.' },
        { text: "Vous avez perdu une journée, je suis vraiment désolé. Je m'occupe de reprogrammer avec vous un créneau qui vous convient vraiment.", correct: true },
        { text: "Vous auriez dû appeler le matin pour confirmer.", why: 'On renvoie la faute au client : la colère explose.' }
      ],
      explanation:
        "Cette réponse nomme le préjudice, s'excuse sincèrement et propose une action concrète centrée sur les contraintes du client."
    },
    {
      client: "De toute façon, vous allez encore me raconter n'importe quoi.",
      options: [
        { text: 'Non, je ne raconte pas n’importe quoi, monsieur.', why: 'Se défendre transforme l’appel en dispute.' },
        { text: "Je comprends que la confiance soit entamée. Je vous propose de tout vous confirmer par écrit, comme ça vous aurez une trace de chaque engagement.", correct: true },
        { text: 'Je ne fais que mon travail.', why: 'On se met sur la défensive : le client se sent rejeté.' }
      ],
      explanation:
        "Cette réponse reconnaît la perte de confiance au lieu de la contester, et offre une garantie concrète : l'écrit."
    },
    {
      client: "J'ai attendu vingt minutes avant d'avoir quelqu'un, c'est inadmissible.",
      options: [
        { text: 'Merci de votre patience, et désolé pour cette attente. Je suis tout à vous, qu’est-ce que je peux faire pour vous ?', correct: true },
        { text: "Il y a beaucoup d'appels aujourd'hui, ce n'est pas de notre faute.", why: "On minimise l'attente et on se dédouane : l'appel démarre mal." },
        { text: "Que puis-je pour vous ?", why: "On ignore l'agacement : le client se sent transparent." }
      ],
      explanation:
        "Cette réponse remercie, s'excuse brièvement et montre une disponibilité totale. En dix secondes, le client se sent considéré."
    },
    {
      client: "Je pars à l'étranger, vous ne pouvez rien pour moi. Résiliez.",
      options: [
        { text: "Alors effectivement, il n'y a rien à faire.", why: 'On conclut sans écouter : on passe à côté de la situation réelle.' },
        { text: "Vous êtes sûr ? C'est dommage de partir.", why: 'On met en doute sa décision : le client se sent jugé.' },
        { text: "Quel beau projet ! Je m'occupe de votre demande. Et le logement actuel, il reste occupé ou il sera vide pendant votre absence ?", correct: true }
      ],
      explanation:
        "Cette réponse se réjouit du projet, respecte la demande, puis s'intéresse sincèrement à la situation. Un logement vide pendant une longue absence est souvent à protéger."
    }
  ],

  /* ÉCRAN 6 */
  reflexes: [
    { not: "Ne jamais contredire l'émotion", do: "l'accueillir.", icon: 'heart' },
    { not: 'Ne pas se justifier', do: 'assumer et agir.', icon: 'shieldCheck' },
    { not: 'Ne pas couper le client', do: 'le laisser vider son sac.', icon: 'ear' },
    { not: "Ne pas promettre l'impossible", do: 'donner un cap clair.', icon: 'flag' },
    { not: 'Toujours finir l’appel', do: 'sur une note positive et personnelle.', sep: ' ', icon: 'sparkles' }
  ],
  finalQuote:
    "Un client mécontent qui raccroche apaisé devient souvent un client fidèle. Notre rôle n'est pas de gagner la discussion, c'est de regagner sa confiance."
};
