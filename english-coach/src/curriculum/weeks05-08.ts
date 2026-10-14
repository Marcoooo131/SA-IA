import type { LessonSource } from './types';

/** Semaines 5 à 8 : passé, futur, présent parfait et modaux (niveau A2). */
export const WEEKS_5_8: LessonSource[] = [
  // ——— Semaine 5 : le passé ———
  {
    title: 'Les superlatifs',
    goal: 'Dire que quelque chose est le plus… ou le moins…',
    grammar: [
      'The -est / the most',
      "Adjectif court : the + -est (the tallest). Adjectif long : the most (the most beautiful). Irréguliers : good → the best, bad → the worst. On dit « in » pour un lieu : the best restaurant in town.",
      'It is the best restaurant in town.|C\'est le meilleur restaurant de la ville.',
      'This is the most expensive hotel.|C\'est l\'hôtel le plus cher.',
    ],
    words: 'the best=le meilleur; the worst=le pire; beautiful=beau/belle; important=important; city=ville; country=pays',
    sentences: [
      "C'est le meilleur restaurant de la ville.=It is the best restaurant in town.|It is the best restaurant in the city.|This is the best restaurant in town.",
      "C'est l'hôtel le plus cher.=It is the most expensive hotel.|This is the most expensive hotel.",
      "C'est le pire jour de ma vie.=It is the worst day of my life.|This is the worst day of my life.",
      'Paris est la plus belle ville du monde.=Paris is the most beautiful city in the world.',
    ],
  },
  {
    title: 'Le passé de « to be »',
    goal: 'Dire où tu étais et comment c\'était.',
    grammar: [
      'Was / were',
      "Au passé, « to be » devient was (I, he, she, it) et were (you, we, they). Négation : wasn't, weren't. Question : Were you…? Was it…?",
      'I was at home yesterday.|J\'étais à la maison hier.',
      'Were you tired?|Étais-tu fatigué ?',
    ],
    words: 'yesterday=hier; last night=hier soir; at home=à la maison; busy=occupé; weekend=week-end; ill/sick=malade',
    sentences: [
      "J'étais à la maison hier.=I was at home yesterday.|Yesterday I was at home.",
      'Étais-tu fatigué ?=Were you tired?',
      "Nous étions très occupés.=We were very busy.",
      "Il n'était pas malade.=He wasn't ill.|He wasn't sick.|He was not ill.|He was not sick.",
    ],
  },
  {
    title: 'Le prétérit des verbes réguliers',
    goal: 'Raconter une action terminée.',
    grammar: [
      'Verbe + -ed',
      "Le prétérit (past simple) exprime une action terminée à un moment précis : I worked yesterday. Les verbes réguliers prennent -ed : work → worked, play → played, stop → stopped, study → studied.",
      'I visited London last year.|J\'ai visité Londres l\'année dernière.',
      'She called me yesterday.|Elle m\'a appelé hier.',
    ],
    words: 'visit=visiter/rendre visite; play=jouer; study=étudier; start=commencer; finish=finir; last year=l\'année dernière',
    sentences: [
      "J'ai visité Londres l'année dernière.=I visited London last year.|Last year I visited London.",
      "Elle m'a appelé hier.=She called me yesterday.",
      'Nous avons fini le travail.=We finished the work.|We finished the job.',
      'Il a étudié l\'anglais à l\'école.=He studied English at school.',
    ],
  },
  {
    title: 'Les verbes irréguliers',
    goal: 'Utiliser les verbes irréguliers les plus fréquents.',
    grammar: [
      'Prétérit irrégulier',
      "Beaucoup de verbes courants sont irréguliers : go → went, have → had, see → saw, buy → bought, take → took, make → made, come → came, get → got. Il faut les apprendre par cœur.",
      'I went to the cinema last night.|Je suis allé au cinéma hier soir.',
      'She bought a new car.|Elle a acheté une nouvelle voiture.',
    ],
    words: 'went=suis allé (go, prétérit); saw=ai vu (see, prétérit); bought=ai acheté (buy, prétérit); took=ai pris (take, prétérit); made=ai fait (make, prétérit); came=suis venu (come, prétérit)',
    sentences: [
      'Je suis allé au cinéma hier soir.=I went to the cinema last night.|I went to the movies last night.|Last night I went to the cinema.',
      'Elle a acheté une nouvelle voiture.=She bought a new car.',
      "Nous avons vu un bon film.=We saw a good film.|We saw a good movie.",
      "Il a pris le train.=He took the train.",
    ],
  },
  {
    title: 'Négation et questions au passé',
    goal: 'Poser des questions sur le passé.',
    grammar: [
      "Did / didn't",
      "Au prétérit, on utilise did pour les questions et didn't pour la négation, suivi de la base verbale : Did you go? I didn't go (et non « I didn't went »).",
      'Did you see the match?|As-tu vu le match ?',
      "I didn't sleep well.|Je n'ai pas bien dormi.",
    ],
    words: 'sleep=dormir; well=bien; match=match; forget=oublier; lose=perdre; find=trouver',
    sentences: [
      'As-tu vu le match ?=Did you see the match?|Did you see the game?',
      "Je n'ai pas bien dormi.=I didn't sleep well.|I did not sleep well.",
      "Où es-tu allé ?=Where did you go?",
      "Elle n'a pas oublié.=She didn't forget.|She did not forget.",
    ],
  },
  {
    title: 'Situer dans le passé',
    goal: 'Utiliser ago, last et when.',
    grammar: [
      'Ago, last, when',
      "« il y a » (dans le passé) se dit ago, placé après la durée : two days ago. last = dernier : last week, last Monday. Pour une question : When did you arrive?",
      'I arrived two days ago.|Je suis arrivé il y a deux jours.',
      'We met last summer.|Nous nous sommes rencontrés l\'été dernier.',
    ],
    words: 'ago=il y a (passé); arrive=arriver; meet=rencontrer; met=ai rencontré (meet, prétérit); summer=été; month=mois',
    sentences: [
      'Je suis arrivé il y a deux jours.=I arrived two days ago.',
      "Nous nous sommes rencontrés l'été dernier.=We met last summer.",
      'Quand es-tu arrivé ?=When did you arrive?',
      'Elle a commencé il y a un mois.=She started a month ago.|She started one month ago.|She began a month ago.',
    ],
  },

  // ——— Semaine 6 : le futur et les voyages ———
  {
    title: 'Le futur avec « going to »',
    goal: 'Parler de tes projets et intentions.',
    grammar: [
      'Be going to + verbe',
      "Pour une intention ou un projet déjà décidé : I'm going to learn English. Aussi pour une prédiction évidente : Look at the clouds, it's going to rain.",
      "I'm going to visit my parents.|Je vais rendre visite à mes parents.",
      "It's going to rain.|Il va pleuvoir.",
    ],
    words: 'parents=parents; tomorrow=demain; next week=la semaine prochaine; plan=projet/prévoir; holiday/vacation=vacances; move=déménager/bouger',
    sentences: [
      'Je vais rendre visite à mes parents demain.=I am going to visit my parents tomorrow.|Tomorrow I am going to visit my parents.',
      'Il va pleuvoir.=It is going to rain.',
      'Nous allons déménager la semaine prochaine.=We are going to move next week.',
      "Qu'est-ce que tu vas faire ?=What are you going to do?",
    ],
  },
  {
    title: 'Le futur avec « will »',
    goal: 'Faire une promesse ou une décision immédiate.',
    grammar: [
      'Will + verbe',
      "will exprime une décision prise sur le moment (I'll call you back), une promesse (I'll help you) ou une prédiction générale (It will be fine). Négation : won't.",
      "I'll call you back.|Je te rappelle.",
      "Don't worry, it will be fine.|Ne t'inquiète pas, ça va bien se passer.",
    ],
    words: 'call back=rappeler; promise=promettre; probably=probablement; future=futur/avenir; soon=bientôt; later=plus tard',
    sentences: [
      'Je te rappelle plus tard.=I will call you back later.|I will call you later.',
      "Je te promets que je t'aiderai.=I promise I will help you.|I promise that I will help you.",
      'Il viendra probablement demain.=He will probably come tomorrow.',
      "Elle ne sera pas là.=She won't be there.|She will not be there.|She won't be here.",
    ],
  },
  {
    title: 'Les projets fixés',
    goal: 'Parler d\'un rendez-vous déjà organisé.',
    grammar: [
      'Le présent continu pour le futur',
      "Pour un rendez-vous ou un projet organisé (avec une date), on utilise souvent le présent continu : I'm meeting Tom on Friday. We're flying to Rome next month.",
      "I'm meeting Tom on Friday.|Je vois Tom vendredi.",
      "We're flying to Rome next month.|Nous prenons l'avion pour Rome le mois prochain.",
    ],
    words: 'Friday=vendredi; flight=vol; fly=prendre l\'avion/voler; appointment=rendez-vous; doctor=médecin; tonight=ce soir',
    sentences: [
      'Je vois Tom vendredi.=I am meeting Tom on Friday.|I am seeing Tom on Friday.',
      "Nous prenons l'avion pour Rome le mois prochain.=We are flying to Rome next month.",
      "J'ai rendez-vous chez le médecin demain.=I have an appointment with the doctor tomorrow.|I have a doctor's appointment tomorrow.|I am seeing the doctor tomorrow.",
      "Qu'est-ce que tu fais ce soir ?=What are you doing tonight?|What are you doing this evening?",
    ],
  },
  {
    title: 'À l\'aéroport',
    goal: 'Te débrouiller à l\'aéroport.',
    grammar: [
      'Phrases utiles en voyage',
      "Pour demander de l'aide poliment : Excuse me, where is…? Could you tell me…? Vocabulaire : boarding pass (carte d'embarquement), gate (porte), delayed (retardé), luggage (bagages, indénombrable).",
      'My flight is delayed.|Mon vol est retardé.',
      'Where is gate 12?|Où est la porte 12 ?',
    ],
    words: 'luggage/baggage=bagages; passport=passeport; gate=porte d\'embarquement; delayed=retardé; ticket=billet; check in=enregistrer',
    sentences: [
      'Mon vol est retardé.=My flight is delayed.|My flight has been delayed.',
      "Où est la porte 12 ?=Where is gate 12?|Where is gate twelve?",
      "J'ai perdu mon passeport.=I lost my passport.|I have lost my passport.",
      "Excusez-moi, où puis-je enregistrer mes bagages ?=Excuse me, where can I check in my luggage?|Excuse me, where can I check my luggage?|Excuse me, where can I check in my bags?",
    ],
  },
  {
    title: 'Demander son chemin',
    goal: 'Demander et indiquer un chemin.',
    grammar: [
      'Les directions',
      "go straight on (aller tout droit), turn left / turn right (tourner à gauche / à droite), take the first street on the left. Pour demander : How do I get to…? Is it far from here?",
      'How do I get to the station?|Comment je vais à la gare ?',
      'Turn left at the bank.|Tournez à gauche à la banque.',
    ],
    words: 'left=gauche; right=droite; straight on=tout droit; far=loin; turn=tourner; corner=coin',
    sentences: [
      'Comment je vais à la gare ?=How do I get to the station?|How can I get to the station?',
      'Tournez à gauche à la banque.=Turn left at the bank.',
      "Est-ce loin d'ici ?=Is it far from here?",
      "Allez tout droit puis tournez à droite.=Go straight on, then turn right.|Go straight on and then turn right.|Go straight ahead, then turn right.|Go straight and then turn right.",
    ],
  },
  {
    title: 'À l\'hôtel',
    goal: 'Réserver et faire une demande à l\'hôtel.',
    grammar: [
      'Demandes polies',
      "Could I…? / Could you…? / Would it be possible to…? sont plus polis que Can I…? Pour réserver : I'd like to book a room for two nights.",
      "I'd like to book a room.|Je voudrais réserver une chambre.",
      'Could I have the key, please?|Pourrais-je avoir la clé, s\'il vous plaît ?',
    ],
    words: 'book=réserver; room=chambre/pièce; night=nuit; breakfast=petit-déjeuner; included=compris/inclus; key=clé',
    sentences: [
      'Je voudrais réserver une chambre pour deux nuits.=I would like to book a room for two nights.|I would like to reserve a room for two nights.',
      'Le petit-déjeuner est-il compris ?=Is breakfast included?',
      "Pourrais-je avoir la clé, s'il vous plaît ?=Could I have the key, please?|Could I have the key please?|Can I have the key, please?",
      "La chambre est trop petite.=The room is too small.",
    ],
  },

  // ——— Semaine 7 : le present perfect ———
  {
    title: 'Le present perfect : expérience',
    goal: 'Parler de tes expériences de vie.',
    grammar: [
      'Have + participe passé',
      "Le present perfect relie le passé au présent. Pour une expérience sans date : Have you ever been to London? I have never seen snow. Participe passé : been, seen, done, eaten, visited.",
      'Have you ever been to London?|Es-tu déjà allé à Londres ?',
      'I have never eaten sushi.|Je n\'ai jamais mangé de sushis.',
    ],
    words: 'ever=déjà (question)/jamais; been=été (be, participe); seen=vu (see, participe); eaten=mangé (eat, participe); done=fait (do, participe); snow=neige',
    sentences: [
      'Es-tu déjà allé à Londres ?=Have you ever been to London?',
      "Je n'ai jamais mangé de sushis.=I have never eaten sushi.",
      "Elle n'a jamais vu la neige.=She has never seen snow.|She has never seen the snow.",
      "Avez-vous déjà fait du ski ?=Have you ever skied?|Have you ever been skiing?|Have you ever done skiing?",
    ],
  },
  {
    title: 'Present perfect ou prétérit ?',
    goal: 'Choisir le bon temps pour le passé.',
    grammar: [
      'Date précise ou non',
      "Prétérit avec un moment précis et terminé (yesterday, in 2019, last week). Present perfect sans moment précis ou avec un lien au présent : I have lost my keys (je ne les ai toujours pas).",
      'I have lost my keys.|J\'ai perdu mes clés (je ne les ai pas).',
      'I lost my keys yesterday.|J\'ai perdu mes clés hier.',
    ],
    words: 'lost=perdu (lose, participe); already=déjà; result=résultat; wallet=portefeuille; break=casser; broken=cassé',
    sentences: [
      "J'ai perdu mes clés.=I have lost my keys.|I lost my keys.",
      "J'ai perdu mon portefeuille hier.=I lost my wallet yesterday.",
      'Il a cassé son téléphone.=He has broken his phone.|He broke his phone.',
      "Je suis allé en Italie en 2019.=I went to Italy in 2019.",
    ],
  },
  {
    title: 'For et since',
    goal: 'Exprimer une durée qui continue.',
    grammar: [
      'For (durée) / since (point de départ)',
      "Pour une action commencée dans le passé et qui continue : present perfect + for (pendant, depuis + durée) ou since (depuis + date). I have lived here for five years / since 2020. Question : How long have you…?",
      'I have lived here for five years.|J\'habite ici depuis cinq ans.',
      'She has worked here since 2020.|Elle travaille ici depuis 2020.',
    ],
    words: 'since=depuis (date); for=pendant/depuis (durée); how long=combien de temps; known=connu (know, participe); company=entreprise; married=marié',
    sentences: [
      "J'habite ici depuis cinq ans.=I have lived here for five years.|I have been living here for five years.",
      'Elle travaille ici depuis 2020.=She has worked here since 2020.|She has been working here since 2020.',
      'Depuis combien de temps apprends-tu l\'anglais ?=How long have you been learning English?|How long have you learned English?',
      'Nous nous connaissons depuis dix ans.=We have known each other for ten years.',
    ],
  },
  {
    title: 'Just, already, yet',
    goal: 'Parler de ce qui vient d\'arriver.',
    grammar: [
      'Just, already, yet',
      "Avec le present perfect : just = venir de (I have just arrived), already = déjà (She has already left), yet = déjà (question) / pas encore (négation), en fin de phrase : Have you finished yet? I haven't finished yet.",
      'I have just arrived.|Je viens d\'arriver.',
      "I haven't finished yet.|Je n'ai pas encore fini.",
    ],
    words: 'just=venir de/juste; yet=encore (négation)/déjà (question); left=parti (leave, participe); finished=fini; received=reçu; email=e-mail/courriel',
    sentences: [
      "Je viens d'arriver.=I have just arrived.|I just arrived.",
      "Je n'ai pas encore fini.=I haven't finished yet.|I have not finished yet.",
      'Elle est déjà partie.=She has already left.|She already left.',
      "As-tu déjà reçu mon e-mail ?=Have you received my email yet?|Have you already received my email?|Did you get my email yet?",
    ],
  },
  {
    title: 'La santé',
    goal: 'Expliquer un problème de santé.',
    grammar: [
      'Avoir mal',
      "« J'ai mal à… » se dit avec have + a + -ache (a headache, a stomachache) ou « my … hurts » : My back hurts. « I feel » + adjectif : I feel sick, I feel better.",
      'I have a headache.|J\'ai mal à la tête.',
      'My back hurts.|J\'ai mal au dos.',
    ],
    words: 'headache=mal de tête; hurt=faire mal; feel=se sentir; medicine=médicament; pharmacy=pharmacie; back=dos',
    sentences: [
      "J'ai mal à la tête.=I have a headache.|I have got a headache.|My head hurts.",
      "J'ai mal au dos.=My back hurts.|I have back pain.|I have a backache.",
      'Je me sens mieux.=I feel better.|I am feeling better.',
      'Où est la pharmacie la plus proche ?=Where is the nearest pharmacy?|Where is the closest pharmacy?',
    ],
  },
  {
    title: 'Le travail',
    goal: 'Parler de ton métier.',
    grammar: [
      'Parler de son emploi',
      "« Je suis infirmier » : I am a nurse (avec l'article a/an !). What do you do? (Que fais-tu dans la vie ?) I work for (une entreprise) / in (un secteur) / as (un poste).",
      'I am a nurse.|Je suis infirmier.',
      'I work for a small company.|Je travaille pour une petite entreprise.',
    ],
    words: 'job=emploi/travail; nurse=infirmier; engineer=ingénieur; colleague=collègue; salary=salaire; office=bureau',
    sentences: [
      "Que fais-tu dans la vie ?=What do you do?|What do you do for a living?|What is your job?",
      'Je suis ingénieur.=I am an engineer.',
      'Je travaille pour une petite entreprise.=I work for a small company.',
      "Mes collègues sont sympas.=My colleagues are nice.|My colleagues are friendly.",
    ],
  },

  // ——— Semaine 8 : les modaux et les e-mails ———
  {
    title: 'Should : conseiller',
    goal: 'Donner un conseil.',
    grammar: [
      "Should / shouldn't",
      "should + base verbale = devrais, devrait (conseil) : You should rest. You shouldn't work so much. Question : Should I call him?",
      'You should rest.|Tu devrais te reposer.',
      "You shouldn't eat so much sugar.|Tu ne devrais pas manger autant de sucre.",
    ],
    words: 'should=devrais (conseil); rest=se reposer/repos; advice=conseil(s); try=essayer; healthy=sain/en bonne santé; exercise=faire du sport/exercice',
    sentences: [
      'Tu devrais te reposer.=You should rest.|You should get some rest.',
      "Tu ne devrais pas travailler autant.=You shouldn't work so much.|You should not work so much.",
      "Devrais-je l'appeler ?=Should I call him?|Should I call her?",
      'Tu devrais essayer.=You should try.|You should try it.',
    ],
  },
  {
    title: 'Must et have to',
    goal: 'Exprimer une obligation.',
    grammar: [
      'Must / have to',
      "must : obligation ressentie par celui qui parle (I must call my mum). have to : obligation extérieure (I have to wear a uniform). Au passé, seulement had to.",
      'I have to work on Saturday.|Je dois travailler samedi.',
      'I had to leave early.|J\'ai dû partir tôt.',
    ],
    words: 'must=devoir (obligation); have to=devoir/être obligé de; rule=règle; uniform=uniforme; leave=partir/quitter; Saturday=samedi',
    sentences: [
      'Je dois travailler samedi.=I have to work on Saturday.|I must work on Saturday.',
      "J'ai dû partir tôt.=I had to leave early.",
      'Tu dois porter un uniforme.=You have to wear a uniform.|You must wear a uniform.',
      'Est-ce que je dois payer maintenant ?=Do I have to pay now?|Must I pay now?',
    ],
  },
  {
    title: "Mustn't ou don't have to",
    goal: 'Distinguer interdiction et absence d\'obligation.',
    grammar: [
      "Mustn't ≠ don't have to",
      "Piège ! mustn't = interdiction (You mustn't smoke here : il est interdit de fumer). don't have to = pas obligatoire (You don't have to come : tu n'es pas obligé de venir).",
      "You mustn't smoke here.|Il est interdit de fumer ici.",
      "You don't have to come.|Tu n'es pas obligé de venir.",
    ],
    words: "allowed=autorisé; forbidden=interdit; necessary=nécessaire; touch=toucher; park=se garer/parc; wear=porter",
    sentences: [
      "Il est interdit de fumer ici.=You mustn't smoke here.|You must not smoke here.|Smoking is not allowed here.|Smoking is forbidden here.",
      "Tu n'es pas obligé de venir.=You don't have to come.|You do not have to come.",
      "Vous ne devez pas toucher ça.=You mustn't touch that.|You must not touch that.",
      "Nous n'avons pas besoin de nous dépêcher.=We don't have to hurry.|We don't need to hurry.",
    ],
  },
  {
    title: 'Could et might : la possibilité',
    goal: 'Exprimer une possibilité.',
    grammar: [
      'Might / could / may',
      "Pour une possibilité : It might rain (il se peut qu'il pleuve). could = pourrait. may est un peu plus formel. Ces modaux sont suivis de la base verbale et ne prennent jamais de -s.",
      'It might rain later.|Il se peut qu\'il pleuve plus tard.',
      'She could be at home.|Elle pourrait être chez elle.',
    ],
    words: 'might=il se peut que; maybe/perhaps=peut-être; possible=possible; sure=sûr; decide=décider; change=changer',
    sentences: [
      "Il se peut qu'il pleuve plus tard.=It might rain later.|It may rain later.|It could rain later.",
      'Elle pourrait être chez elle.=She could be at home.|She might be at home.',
      "Je ne suis pas sûr, je pourrais changer d'avis.=I am not sure, I might change my mind.|I am not sure, I could change my mind.",
      'Peut-être demain.=Maybe tomorrow.|Perhaps tomorrow.',
    ],
  },
  {
    title: 'Écrire un e-mail informel',
    goal: 'Écrire à un ami.',
    grammar: [
      "Les formules d'un e-mail amical",
      "Début : Hi Tom, / Hello Anna, Corps : How are you? Thanks for your message. Fin : See you soon, / Take care, / Best wishes, Ne mets pas d'espace avant « ? » ou « ! » en anglais.",
      'Thanks for your message.|Merci pour ton message.',
      'See you soon!|À bientôt !',
    ],
    words: 'thanks=merci; message=message; soon=bientôt; news=nouvelles; take care=prends soin de toi; hope=espérer',
    sentences: [
      'Merci pour ton message.=Thanks for your message.|Thank you for your message.',
      "J'espère que tu vas bien.=I hope you are well.|I hope you are doing well.|I hope you are fine.",
      'À bientôt !=See you soon!',
      "Donne-moi de tes nouvelles.=Let me know how you are.|Give me your news.|Keep me posted.",
    ],
  },
  {
    title: 'Écrire un e-mail professionnel',
    goal: 'Écrire un e-mail formel clair.',
    grammar: [
      'Les formules formelles',
      "Début : Dear Mr Smith, / Dear Sir or Madam, Pour introduire : I am writing to… Pour une pièce jointe : Please find attached… Fin : I look forward to hearing from you. Kind regards / Best regards,",
      'I am writing to confirm our meeting.|Je vous écris pour confirmer notre réunion.',
      'I look forward to hearing from you.|Dans l\'attente de votre réponse.',
    ],
    words: 'attached=ci-joint; confirm=confirmer; request=demande/demander; regards=salutations; available=disponible; reply=répondre/réponse',
    sentences: [
      "Je vous écris pour confirmer notre réunion.=I am writing to confirm our meeting.",
      'Veuillez trouver ci-joint le document.=Please find attached the document.|Please find the document attached.',
      "Je suis disponible lundi.=I am available on Monday.|I am available Monday.",
      "Dans l'attente de votre réponse.=I look forward to hearing from you.|I look forward to your reply.",
    ],
  },
];
