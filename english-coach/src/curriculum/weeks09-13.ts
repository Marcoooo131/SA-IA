import type { LessonSource } from './types';

/** Semaines 9 à 13 : structures intermédiaires et écrit autonome (niveau B1). */
export const WEEKS_9_13: LessonSource[] = [
  // ——— Semaine 9 : conditions et structures de phrase ———
  {
    title: 'Le premier conditionnel',
    goal: 'Parler d\'une condition réaliste.',
    grammar: [
      'If + présent, will + verbe',
      "Pour une situation probable : If it rains, I will stay at home. Après « if », on n'utilise jamais will. Même règle après when (quand) au futur : When I arrive, I'll call you.",
      'If it rains, I will stay at home.|S\'il pleut, je resterai à la maison.',
      "When I arrive, I'll call you.|Quand j'arriverai, je t'appellerai.",
    ],
    words: 'if=si; unless=à moins que; stay=rester; miss=rater/manquer; hurry=se dépêcher; ready=prêt',
    sentences: [
      "S'il pleut, je resterai à la maison.=If it rains, I will stay at home.|If it rains, I will stay home.|I will stay at home if it rains.",
      "Quand j'arriverai, je t'appellerai.=When I arrive, I will call you.|I will call you when I arrive.",
      'Si tu ne te dépêches pas, tu rateras le train.=If you don\'t hurry, you will miss the train.|If you do not hurry, you will miss the train.',
      "Je viendrai si je suis prêt.=I will come if I am ready.",
    ],
  },
  {
    title: 'Le deuxième conditionnel',
    goal: 'Imaginer une situation irréelle.',
    grammar: [
      'If + prétérit, would + verbe',
      "Pour une situation imaginaire : If I had more time, I would travel. Avec be, on peut dire were à toutes les personnes : If I were you, I would accept (à ta place, j'accepterais).",
      'If I had more time, I would travel.|Si j\'avais plus de temps, je voyagerais.',
      'If I were you, I would accept.|À ta place, j\'accepterais.',
    ],
    words: 'would=conditionnel (-rais); rich=riche; accept=accepter; world=monde; lottery=loterie; win=gagner',
    sentences: [
      "Si j'avais plus de temps, je voyagerais.=If I had more time, I would travel.|I would travel if I had more time.",
      "À ta place, j'accepterais.=If I were you, I would accept.|If I was you, I would accept.",
      'Si nous étions riches, nous achèterions une maison.=If we were rich, we would buy a house.',
      'Que ferais-tu si tu gagnais au loto ?=What would you do if you won the lottery?',
    ],
  },
  {
    title: 'Les pronoms relatifs',
    goal: 'Relier deux idées avec who, which, that.',
    grammar: [
      'Who, which, that, where',
      "who pour les personnes, which pour les choses, that pour les deux (registre courant), where pour les lieux. The man who lives next door. The book that I read. Quand le relatif est complément, on peut l'omettre : The book I read.",
      'The man who lives next door is a doctor.|L\'homme qui habite à côté est médecin.',
      'This is the town where I was born.|C\'est la ville où je suis né.',
    ],
    words: 'neighbour/neighbor=voisin; born=né; next door=à côté (voisin); film/movie=film; recommend=recommander; restaurant=restaurant',
    sentences: [
      "L'homme qui habite à côté est médecin.=The man who lives next door is a doctor.|The man that lives next door is a doctor.",
      "C'est la ville où je suis né.=This is the town where I was born.|This is the city where I was born.|It is the town where I was born.",
      "Le film que j'ai vu était génial.=The film I saw was great.|The film that I saw was great.|The movie I saw was great.|The movie that I saw was great.",
      'Voici le restaurant que je recommande.=Here is the restaurant I recommend.|This is the restaurant that I recommend.|This is the restaurant I recommend.',
    ],
  },
  {
    title: 'Too et enough',
    goal: 'Dire qu\'il y a trop ou pas assez.',
    grammar: [
      'Too / enough',
      "too + adjectif = trop (too expensive). Adjectif + enough = assez (old enough). enough + nom = assez de (enough money). Attention à l'ordre : « big enough », pas « enough big ».",
      'This coffee is too hot.|Ce café est trop chaud.',
      "He isn't old enough.|Il n'est pas assez âgé.",
    ],
    words: 'too=trop; hot=chaud; loud=fort (bruit); strong=fort/solide; space=espace/place; fast=rapide/vite',
    sentences: [
      'Ce café est trop chaud.=This coffee is too hot.|The coffee is too hot.',
      "Il n'est pas assez âgé.=He isn't old enough.|He is not old enough.",
      "Nous n'avons pas assez de place.=We don't have enough space.|We don't have enough room.|We haven't got enough space.",
      "La musique est trop forte.=The music is too loud.",
    ],
  },
  {
    title: 'So et such',
    goal: 'Insister sur une qualité.',
    grammar: [
      'So + adjectif / such + nom',
      "so + adjectif : It was so good! such (a) + adjectif + nom : It was such a good film! Pour une conséquence : so … that : I was so tired that I fell asleep.",
      'It was such a good film!|C\'était un si bon film !',
      'I was so tired that I fell asleep.|J\'étais tellement fatigué que je me suis endormi.',
    ],
    words: 'so=si/tellement; such=tel/si; fall asleep=s\'endormir; surprised=surpris; boring=ennuyeux; interesting=intéressant',
    sentences: [
      "C'était un si bon film !=It was such a good film!|It was such a good movie!",
      "J'étais tellement fatigué que je me suis endormi.=I was so tired that I fell asleep.|I was so tired I fell asleep.",
      'Elle est tellement gentille.=She is so kind.|She is so nice.',
      "C'est un livre tellement ennuyeux.=It is such a boring book.|This is such a boring book.",
    ],
  },
  {
    title: 'Gérondif ou infinitif ?',
    goal: 'Choisir entre -ing et to + verbe.',
    grammar: [
      'Verbe + -ing ou to + verbe',
      "Après enjoy, finish, avoid, mind, suggest : -ing (I enjoy reading). Après want, decide, hope, plan, need, promise : to + verbe (I decided to leave). Après une préposition, toujours -ing : I'm good at cooking.",
      'I enjoy reading.|J\'aime lire.',
      'She decided to leave.|Elle a décidé de partir.',
    ],
    words: 'avoid=éviter; suggest=suggérer; good at=doué pour; afraid of=avoir peur de; interested in=intéressé par; mind=déranger',
    sentences: [
      "Elle a décidé de partir.=She decided to leave.",
      "J'évite de manger tard.=I avoid eating late.",
      'Il est doué pour cuisiner.=He is good at cooking.',
      "Ça te dérange d'attendre ?=Do you mind waiting?",
    ],
  },

  // ——— Semaine 10 : raconter ———
  {
    title: 'Le passé continu',
    goal: 'Décrire une action en cours dans le passé.',
    grammar: [
      'Was / were + -ing',
      "Pour une action en cours à un moment du passé : I was reading at 9 p.m. Souvent avec le prétérit pour une action qui interrompt : I was cooking when the phone rang.",
      'I was cooking when the phone rang.|Je cuisinais quand le téléphone a sonné.',
      'What were you doing at nine?|Que faisais-tu à neuf heures ?',
    ],
    words: 'ring=sonner; rang=a sonné (ring, prétérit); while=pendant que; happen=arriver/se passer; shower=douche; accident=accident',
    sentences: [
      'Je cuisinais quand le téléphone a sonné.=I was cooking when the phone rang.',
      'Que faisais-tu à neuf heures ?=What were you doing at nine?|What were you doing at nine o\'clock?|What were you doing at 9?',
      "Il pleuvait quand nous sommes partis.=It was raining when we left.",
      "Pendant que je prenais ma douche, quelqu'un a frappé.=While I was having a shower, someone knocked.|While I was taking a shower, someone knocked.|While I was showering, someone knocked.",
    ],
  },
  {
    title: 'Used to',
    goal: 'Parler de tes anciennes habitudes.',
    grammar: [
      'Used to + verbe',
      "used to décrit une habitude passée qui n'existe plus : I used to smoke (je fumais, avant). Négation : didn't use to. Question : Did you use to…?",
      'I used to live in Lyon.|J\'habitais à Lyon (avant).',
      "I didn't use to like coffee.|Avant, je n'aimais pas le café.",
    ],
    words: 'used to=avoir l\'habitude de (passé); childhood=enfance; anymore=plus (ne… plus); village=village; play=jouer; often=souvent',
    sentences: [
      "J'habitais à Lyon avant.=I used to live in Lyon.",
      "Avant, je n'aimais pas le café.=I didn't use to like coffee.|I did not use to like coffee.",
      'Il fumait, mais il ne fume plus.=He used to smoke, but he doesn\'t smoke anymore.|He used to smoke but he doesn\'t anymore.|He used to smoke, but he doesn\'t anymore.',
      "Jouais-tu au foot quand tu étais enfant ?=Did you use to play football when you were a child?|Did you use to play soccer when you were a child?",
    ],
  },
  {
    title: 'Les verbes à particule (1)',
    goal: 'Utiliser les phrasal verbs du quotidien.',
    grammar: [
      'Verbe + particule',
      "Un phrasal verb associe un verbe et une particule, et le sens change : get up (se lever), turn on/off (allumer/éteindre), look for (chercher), give up (abandonner), find out (découvrir).",
      "I'm looking for my keys.|Je cherche mes clés.",
      "Don't give up!|N'abandonne pas !",
    ],
    words: 'look for=chercher; turn on=allumer; turn off=éteindre; give up=abandonner; find out=découvrir; light=lumière',
    sentences: [
      'Je cherche mes clés.=I am looking for my keys.',
      "N'abandonne pas !=Don't give up!",
      'Peux-tu éteindre la lumière ?=Can you turn off the light?|Can you turn the light off?|Could you turn off the light?|Could you switch off the light?',
      "J'ai découvert la vérité.=I found out the truth.",
    ],
  },
  {
    title: 'Les verbes à particule (2)',
    goal: 'Enrichir ton anglais avec d\'autres phrasal verbs.',
    grammar: [
      'Phrasal verbs fréquents',
      "pick up (aller chercher, ramasser), take off (décoller, enlever), put on (mettre un vêtement), run out of (être à court de), look after (s'occuper de), get on with (bien s'entendre avec).",
      'Can you pick me up at the station?|Peux-tu venir me chercher à la gare ?',
      'We have run out of milk.|Nous n\'avons plus de lait.',
    ],
    words: 'pick up=aller chercher/ramasser; put on=mettre (vêtement); run out of=être à court de; look after=s\'occuper de; get on with=bien s\'entendre avec; take off=décoller/enlever',
    sentences: [
      'Peux-tu venir me chercher à la gare ?=Can you pick me up at the station?|Could you pick me up at the station?|Can you pick me up from the station?',
      "Nous n'avons plus de lait.=We have run out of milk.|We ran out of milk.|We are out of milk.",
      "Je m'occupe de ma sœur.=I am looking after my sister.|I look after my sister.",
      "Je m'entends bien avec mes collègues.=I get on well with my colleagues.|I get on with my colleagues.|I get along with my colleagues.|I get along well with my colleagues.",
    ],
  },
  {
    title: 'Le passif au présent',
    goal: 'Mettre l\'accent sur l\'action plutôt que sur l\'auteur.',
    grammar: [
      'Be + participe passé',
      "Le passif se forme avec be + participe passé : English is spoken here. L'auteur, s'il est utile, est introduit par by. Il est fréquent à l'écrit et dans les consignes.",
      'English is spoken here.|On parle anglais ici.',
      'The office is cleaned every day.|Le bureau est nettoyé tous les jours.',
    ],
    words: 'spoken=parlé (speak, participe); made=fabriqué/fait; clean=nettoyer/propre; build=construire; built=construit; sell=vendre',
    sentences: [
      'On parle anglais ici.=English is spoken here.',
      'Le bureau est nettoyé tous les jours.=The office is cleaned every day.',
      'Ces voitures sont fabriquées en Allemagne.=These cars are made in Germany.',
      'Les billets sont vendus en ligne.=The tickets are sold online.|Tickets are sold online.',
    ],
  },
  {
    title: 'Le passif au passé',
    goal: 'Raconter ce qui a été fait.',
    grammar: [
      'Was / were + participe passé',
      "Au passé : The bridge was built in 1900. My bike was stolen. Pour l'auteur : The book was written by Orwell.",
      'My bike was stolen.|Mon vélo a été volé.',
      'This book was written by Orwell.|Ce livre a été écrit par Orwell.',
    ],
    words: 'stolen=volé (steal, participe); written=écrit (write, participe); bridge=pont; invite=inviter; cancel=annuler; repair=réparer',
    sentences: [
      'Mon vélo a été volé.=My bike was stolen.|My bicycle was stolen.|My bike has been stolen.',
      'Ce livre a été écrit par Orwell.=This book was written by Orwell.',
      'La réunion a été annulée.=The meeting was cancelled.|The meeting was canceled.|The meeting has been cancelled.|The meeting has been canceled.',
      "Nous avons été invités à la fête.=We were invited to the party.",
    ],
  },

  // ——— Semaine 11 : rapporter, argumenter ———
  {
    title: 'Le discours indirect',
    goal: 'Rapporter les paroles de quelqu\'un.',
    grammar: [
      'Say / tell + concordance des temps',
      "say something / tell someone something. Au discours indirect, le temps recule souvent : « I am tired » → She said (that) she was tired. « I will come » → He told me he would come.",
      'She said she was tired.|Elle a dit qu\'elle était fatiguée.',
      'He told me he would come.|Il m\'a dit qu\'il viendrait.',
    ],
    words: 'said=a dit (say, prétérit); told=a dit à (tell, prétérit); explain=expliquer; truth=vérité; lie=mensonge/mentir; agree=être d\'accord',
    sentences: [
      "Elle a dit qu'elle était fatiguée.=She said she was tired.|She said that she was tired.",
      "Il m'a dit qu'il viendrait.=He told me he would come.|He told me that he would come.|He said he would come.",
      "Ils nous ont dit la vérité.=They told us the truth.",
      "Elle a expliqué qu'elle était en retard.=She explained that she was late.|She explained she was late.",
    ],
  },
  {
    title: 'Les questions indirectes',
    goal: 'Poser des questions de manière polie.',
    grammar: [
      'Do you know where… ?',
      "Dans une question indirecte, l'ordre redevient sujet + verbe, sans do/does : Where is the station? → Do you know where the station is? Can you tell me what time it starts?",
      'Do you know where the station is?|Savez-vous où est la gare ?',
      'Can you tell me what time it starts?|Pouvez-vous me dire à quelle heure ça commence ?',
    ],
    words: 'wonder=se demander; whether=si (alternative); start=commencer; close=fermer; museum=musée; open=ouvert/ouvrir',
    sentences: [
      'Savez-vous où est la gare ?=Do you know where the station is?',
      'Pouvez-vous me dire à quelle heure ça commence ?=Can you tell me what time it starts?|Could you tell me what time it starts?|Can you tell me when it starts?|Could you tell me when it starts?',
      "Je me demande s'il viendra.=I wonder if he will come.|I wonder whether he will come.|I wonder if he is coming.",
      'Savez-vous si le musée est ouvert ?=Do you know if the museum is open?|Do you know whether the museum is open?',
    ],
  },
  {
    title: 'Les connecteurs logiques',
    goal: 'Structurer tes idées à l\'écrit.',
    grammar: [
      'However, although, because, so',
      "because (parce que), so (donc), but (mais), however (cependant, en début de phrase suivi d'une virgule), although (bien que, suivi d'un sujet + verbe), despite (malgré, suivi d'un nom ou -ing).",
      'Although it was late, we continued.|Bien qu\'il fût tard, nous avons continué.',
      'It was expensive. However, it was worth it.|C\'était cher. Cependant, ça valait le coup.',
    ],
    words: 'however=cependant; although=bien que; despite=malgré; because=parce que; therefore=donc/par conséquent; worth it=ça vaut le coup',
    sentences: [
      "Bien qu'il soit tard, nous continuons.=Although it is late, we are continuing.|Although it is late, we continue.|Although it's late, we keep going.",
      'Malgré la pluie, nous sommes sortis.=Despite the rain, we went out.|In spite of the rain, we went out.',
      "C'était cher. Cependant, ça valait le coup.=It was expensive. However, it was worth it.",
      "Je suis resté parce que j'étais malade.=I stayed because I was ill.|I stayed because I was sick.|I stayed at home because I was ill.|I stayed at home because I was sick.",
    ],
  },
  {
    title: 'A few, a little',
    goal: 'Nuancer les quantités.',
    grammar: [
      'A few / a little / few / little',
      "a few + dénombrable (a few friends : quelques amis), a little + indénombrable (a little time : un peu de temps). Sans « a », le sens devient négatif : few people came (peu de gens sont venus).",
      'I have a few friends in London.|J\'ai quelques amis à Londres.',
      'Few people came.|Peu de gens sont venus.',
    ],
    words: 'a few=quelques; a little=un peu de; several=plusieurs; most=la plupart; each=chaque; none=aucun',
    sentences: [
      "J'ai quelques amis à Londres.=I have a few friends in London.|I have got a few friends in London.",
      "Il me reste un peu de temps.=I have a little time left.|I still have a little time.",
      'Peu de gens sont venus.=Few people came.|Not many people came.',
      'La plupart de mes collègues parlent anglais.=Most of my colleagues speak English.',
    ],
  },
  {
    title: 'Donner son opinion',
    goal: 'Exprimer et justifier ton avis.',
    grammar: [
      "Exprimer l'opinion",
      "In my opinion, I think (that), I believe, I don't think + phrase affirmative (« I don't think it's a good idea » plutôt que « I think it's not »). Pour nuancer : It depends. On the one hand… on the other hand…",
      "I don't think it's a good idea.|Je ne pense pas que ce soit une bonne idée.",
      'In my opinion, it is too expensive.|À mon avis, c\'est trop cher.',
    ],
    words: 'opinion=opinion/avis; believe=croire; idea=idée; depend=dépendre; disagree=ne pas être d\'accord; point of view=point de vue',
    sentences: [
      "Je ne pense pas que ce soit une bonne idée.=I don't think it is a good idea.|I don't think that it is a good idea.|I do not think it is a good idea.",
      "À mon avis, c'est trop cher.=In my opinion, it is too expensive.",
      'Ça dépend.=It depends.',
      "Je ne suis pas d'accord avec toi.=I don't agree with you.|I disagree with you.",
    ],
  },
  {
    title: 'Faire une réclamation',
    goal: 'Te plaindre poliment et efficacement.',
    grammar: [
      'Réclamer avec politesse',
      "I am writing to complain about… Unfortunately, … I would be grateful if you could… (Je vous serais reconnaissant de…). I would like a refund (un remboursement).",
      'I would like a refund.|Je voudrais un remboursement.',
      'I would be grateful if you could reply quickly.|Je vous serais reconnaissant de répondre rapidement.',
    ],
    words: 'complain=se plaindre; refund=remboursement/rembourser; unfortunately=malheureusement; damaged=endommagé; grateful=reconnaissant; order=commande/commander',
    sentences: [
      'Je voudrais un remboursement.=I would like a refund.',
      'Malheureusement, la commande est arrivée endommagée.=Unfortunately, the order arrived damaged.|Unfortunately the order arrived damaged.',
      "Je vous écris pour me plaindre du service.=I am writing to complain about the service.",
      'Je vous serais reconnaissant de répondre rapidement.=I would be grateful if you could reply quickly.|I would be grateful if you could answer quickly.',
    ],
  },

  // ——— Semaine 12 : temps avancés ———
  {
    title: 'Le present perfect continu',
    goal: 'Insister sur la durée d\'une action.',
    grammar: [
      'Have been + -ing',
      "Pour une action qui dure depuis un moment et continue (ou vient de s'arrêter) : I have been waiting for an hour. It has been raining all day. Question : How long have you been…?",
      'I have been waiting for an hour.|J\'attends depuis une heure.',
      "It has been raining all day.|Il pleut depuis ce matin / toute la journée.",
    ],
    words: 'all day=toute la journée; wait=attendre; recently=récemment; lately=ces derniers temps; project=projet; run=courir',
    sentences: [
      "J'attends depuis une heure.=I have been waiting for an hour.|I have been waiting for one hour.",
      'Il pleut toute la journée.=It has been raining all day.|It is raining all day.',
      'Elle travaille sur ce projet depuis des mois.=She has been working on this project for months.',
      "Qu'as-tu fait ces derniers temps ?=What have you been doing lately?|What have you been doing recently?",
    ],
  },
  {
    title: 'Le plus-que-parfait',
    goal: 'Exprimer une action antérieure à une autre dans le passé.',
    grammar: [
      'Had + participe passé',
      "Pour une action qui s'est passée avant une autre action passée : When I arrived, the film had already started. Très utile pour raconter une histoire.",
      'When I arrived, the film had already started.|Quand je suis arrivé, le film avait déjà commencé.',
      'She had never seen the sea before.|Elle n\'avait jamais vu la mer auparavant.',
    ],
    words: 'before=avant/auparavant; already=déjà; sea=mer; realise/realize=se rendre compte; leave=partir; story=histoire',
    sentences: [
      'Quand je suis arrivé, le film avait déjà commencé.=When I arrived, the film had already started.|When I arrived, the movie had already started.|When I arrived, the film had already begun.',
      "Elle n'avait jamais vu la mer auparavant.=She had never seen the sea before.",
      "Je me suis rendu compte que j'avais oublié mes clés.=I realised I had forgotten my keys.|I realized I had forgotten my keys.|I realised that I had forgotten my keys.|I realized that I had forgotten my keys.",
      'Le train était déjà parti.=The train had already left.',
    ],
  },
  {
    title: 'Le troisième conditionnel',
    goal: 'Parler d\'un regret ou d\'un passé imaginaire.',
    grammar: [
      'If + had + participe, would have + participe',
      "Pour imaginer un passé différent : If I had known, I would have come. Souvent pour un regret ou un reproche. Contraction fréquente à l'oral : I'd have.",
      'If I had known, I would have come.|Si j\'avais su, je serais venu.',
      'If we had left earlier, we would not have missed the train.|Si nous étions partis plus tôt, nous n\'aurions pas raté le train.',
    ],
    words: 'known=su/connu (know, participe); earlier=plus tôt; missed=raté; regret=regretter/regret; chance=chance/occasion; mistake=erreur',
    sentences: [
      "Si j'avais su, je serais venu.=If I had known, I would have come.",
      "Si nous étions partis plus tôt, nous n'aurions pas raté le train.=If we had left earlier, we would not have missed the train.|If we had left earlier, we wouldn't have missed the train.",
      "Si tu m'avais appelé, je t'aurais aidé.=If you had called me, I would have helped you.",
      "Je n'aurais pas fait cette erreur.=I would not have made this mistake.|I wouldn't have made this mistake.|I would not have made that mistake.|I wouldn't have made that mistake.",
    ],
  },
  {
    title: 'Exprimer un souhait',
    goal: 'Dire ce que tu voudrais changer.',
    grammar: [
      'I wish / if only',
      "I wish + prétérit pour un souhait sur le présent : I wish I spoke English fluently (j'aimerais parler…). I wish + had + participe pour un regret sur le passé : I wish I had studied more.",
      'I wish I spoke English fluently.|J\'aimerais parler anglais couramment.',
      'I wish I had studied more.|Je regrette de ne pas avoir étudié davantage.',
    ],
    words: 'wish=souhaiter/souhait; fluently=couramment; if only=si seulement; free time=temps libre; abroad=à l\'étranger; studied=étudié',
    sentences: [
      "J'aimerais parler anglais couramment.=I wish I spoke English fluently.|I wish I could speak English fluently.",
      "Je regrette de ne pas avoir étudié davantage.=I wish I had studied more.",
      "Si seulement j'avais plus de temps libre !=If only I had more free time!",
      "J'aimerais vivre à l'étranger.=I wish I lived abroad.|I would like to live abroad.|I would love to live abroad.",
    ],
  },
  {
    title: 'La déduction',
    goal: 'Faire une hypothèse logique.',
    grammar: [
      "Must be / can't be / might be",
      "must be = sûrement (déduction positive) : He must be tired. can't be = ça ne peut pas être (déduction négative) : It can't be true. might/could be = peut-être.",
      'He must be tired.|Il doit être fatigué.',
      "It can't be true!|Ça ne peut pas être vrai !",
    ],
    words: 'true=vrai; false=faux; obviously=évidemment; certain=certain; guess=deviner; joke=plaisanter/blague',
    sentences: [
      'Il doit être fatigué.=He must be tired.',
      "Ça ne peut pas être vrai !=It can't be true!|It cannot be true!|That can't be true!",
      'Tu dois plaisanter !=You must be joking!|You must be kidding!',
      "Elle est peut-être au bureau.=She might be at the office.|She may be at the office.|She could be at the office.|Maybe she is at the office.",
    ],
  },
  {
    title: 'Les faux amis',
    goal: 'Éviter les pièges des mots trompeurs.',
    grammar: [
      'Faux amis courants',
      "actually = en fait (et non actuellement : currently). eventually = finalement (et non éventuellement : possibly). library = bibliothèque (librairie : bookshop). sensible = raisonnable (sensible : sensitive).",
      'Actually, I agree with you.|En fait, je suis d\'accord avec toi.',
      'I am currently working in Paris.|Je travaille actuellement à Paris.',
    ],
    words: 'actually=en fait; currently=actuellement; eventually=finalement; library=bibliothèque; bookshop/bookstore=librairie; sensitive=sensible',
    sentences: [
      "En fait, je suis d'accord avec toi.=Actually, I agree with you.|Actually I agree with you.",
      'Je travaille actuellement à Paris.=I am currently working in Paris.|I currently work in Paris.',
      'Finalement, il a accepté.=Eventually, he accepted.|In the end, he accepted.|Eventually he accepted.|Finally, he accepted.',
      'Je vais à la bibliothèque.=I am going to the library.|I go to the library.',
    ],
  },

  // ——— Semaine 13 : écrire en autonomie ———
  {
    title: 'Les réunions de travail',
    goal: 'Participer par écrit à une réunion.',
    grammar: [
      'Formules de réunion',
      "Let's get started (commençons). Could you clarify…? (pourriez-vous préciser). I'd like to add something. To sum up (pour résumer). Let's follow up by email (faisons le suivi par e-mail).",
      'Could you clarify this point?|Pourriez-vous préciser ce point ?',
      "To sum up, we need more time.|Pour résumer, nous avons besoin de plus de temps.",
    ],
    words: 'deadline=date limite/échéance; agenda=ordre du jour; clarify=préciser/clarifier; sum up=résumer; follow up=faire le suivi; schedule=planning/planifier',
    sentences: [
      'Pourriez-vous préciser ce point ?=Could you clarify this point?|Could you clarify that point?',
      'Pour résumer, nous avons besoin de plus de temps.=To sum up, we need more time.|In summary, we need more time.',
      "La date limite est vendredi.=The deadline is Friday.|The deadline is on Friday.",
      "Faisons le suivi par e-mail.=Let's follow up by email.|Let us follow up by email.",
    ],
  },
  {
    title: 'Accord et désaccord',
    goal: 'Réagir avec nuance aux idées des autres.',
    grammar: [
      "Être d'accord ou non",
      "I agree / I totally agree. I see your point, but… That's a good point. I'm not sure about that. « Je suis d'accord » se dit I agree (jamais « I am agree »).",
      'I see your point, but I disagree.|Je comprends ton point de vue, mais je ne suis pas d\'accord.',
      "That's a good point.|C'est une bonne remarque.",
    ],
    words: 'totally=totalement; point=remarque/argument; partly=en partie; convince=convaincre; compromise=compromis; suggestion=suggestion',
    sentences: [
      "Je suis totalement d'accord.=I totally agree.|I completely agree.|I fully agree.",
      "C'est une bonne remarque.=That is a good point.|It is a good point.",
      "Je ne suis pas convaincu.=I am not convinced.",
      "Je suis d'accord en partie.=I partly agree.|I agree in part.",
    ],
  },
  {
    title: 'Raconter une histoire',
    goal: 'Écrire un récit structuré au passé.',
    grammar: [
      'Les marqueurs du récit',
      "First, … Then, … After that, … Suddenly, … In the end / Finally, … Combine les temps : prétérit pour les événements, passé continu pour le décor, plus-que-parfait pour ce qui s'était passé avant.",
      'Suddenly, the lights went out.|Soudain, les lumières se sont éteintes.',
      'In the end, everything was fine.|Au final, tout s\'est bien passé.',
    ],
    words: 'suddenly=soudain; first=d\'abord; then=ensuite/puis; in the end=au final; everything=tout; nobody=personne',
    sentences: [
      "Soudain, les lumières se sont éteintes.=Suddenly, the lights went out.|Suddenly the lights went out.",
      "Au final, tout s'est bien passé.=In the end, everything was fine.|In the end, everything went well.|Finally, everything went well.",
      "D'abord, nous avons pris le train, puis un taxi.=First, we took the train, then a taxi.|First we took the train, then a taxi.|First, we took the train and then a taxi.",
      "Personne ne savait quoi faire.=Nobody knew what to do.|No one knew what to do.",
    ],
  },
  {
    title: 'La politesse et les expressions',
    goal: 'Être naturel et poli à l\'écrit.',
    grammar: [
      'Expressions idiomatiques utiles',
      "No worries (pas de souci), It's up to you (c'est toi qui vois), I'm on my way (j'arrive), Never mind (laisse tomber), It's a piece of cake (c'est du gâteau), Fingers crossed (croisons les doigts).",
      "It's up to you.|C'est toi qui vois.",
      "I'm on my way.|Je suis en route.",
    ],
    words: 'no worries=pas de souci; up to you=c\'est toi qui vois; on my way=en route; never mind=laisse tomber/ce n\'est pas grave; piece of cake=du gâteau (facile); fingers crossed=croisons les doigts',
    sentences: [
      "C'est toi qui vois.=It is up to you.|It's up to you.",
      "Je suis en route.=I am on my way.",
      "Ce n'est pas grave.=Never mind.|It doesn't matter.|No worries.|It is not a big deal.",
      "L'examen était facile, c'était du gâteau.=The exam was easy, it was a piece of cake.|The exam was a piece of cake.",
    ],
  },
  {
    title: 'Les erreurs typiques des francophones',
    goal: 'Corriger les erreurs les plus fréquentes.',
    grammar: [
      'Les pièges à éviter',
      "« I am agree » → I agree. « I have 30 years » → I am 30. « Since 3 years » → for 3 years. « Informations » → information (indénombrable). « He don't » → he doesn't. « Explain me » → explain to me.",
      'Can you explain it to me?|Peux-tu me l\'expliquer ?',
      'I need some information.|J\'ai besoin d\'informations.',
    ],
    words: 'information=informations; advice=conseils; furniture=meubles; explain=expliquer; depend on=dépendre de; married to=marié à',
    sentences: [
      "Peux-tu me l'expliquer ?=Can you explain it to me?|Could you explain it to me?",
      "J'ai besoin d'informations.=I need some information.|I need information.",
      'Ça dépend de toi.=It depends on you.',
      "Elle est mariée à un Anglais.=She is married to an Englishman.|She is married to an English man.",
    ],
  },
];
