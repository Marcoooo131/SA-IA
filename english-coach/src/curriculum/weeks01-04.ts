import type { LessonSource } from './types';

/** Semaines 1 à 4 : les fondations (niveau A1). Six leçons par semaine, le 7e jour est un bilan. */
export const WEEKS_1_4: LessonSource[] = [
  // ——— Semaine 1 : se présenter ———
  {
    title: 'Se présenter',
    goal: 'Dire qui tu es avec le verbe « to be ».',
    grammar: [
      'Le verbe « to be » (être)',
      "Au présent : I am, you are, he/she/it is, we are, they are. À l'écrit courant, on contracte souvent : I'm, you're, he's, we're, they're.",
      'I am French.|Je suis français.',
      'She is a teacher.|Elle est professeure.',
    ],
    words: 'hello/hi=bonjour; name=nom; teacher=professeur; student=étudiant; French=français; happy=heureux',
    sentences: [
      "Je veux apprendre l'anglais.=I want to learn English.|I would like to learn English.",
      "Je m'appelle Paul.=My name is Paul.|I am Paul.|I am called Paul.",
      'Je suis étudiant.=I am a student.',
      'Elle est professeure.=She is a teacher.',
    ],
  },
  {
    title: 'Les articles et les noms',
    goal: 'Utiliser a, an et the correctement.',
    grammar: [
      'A, an, the',
      "« a » devant un son consonne (a book), « an » devant un son voyelle (an apple, an hour). « the » s'utilise quand on sait de quoi on parle. Au pluriel, on ajoute souvent -s : books.",
      'I have an apple.|J\'ai une pomme.',
      'The book is on the table.|Le livre est sur la table.',
    ],
    words: 'book=livre; apple=pomme; table=table; house=maison; car=voiture; hour=heure',
    sentences: [
      "C'est une pomme.=It is an apple.|This is an apple.",
      'La voiture est rouge.=The car is red.',
      "J'ai un livre.=I have a book.|I have got a book.",
      'Les maisons sont grandes.=The houses are big.|The houses are large.',
    ],
  },
  {
    title: 'Les possessifs',
    goal: 'Dire à qui appartient quelque chose.',
    grammar: [
      'My, your, his, her, our, their',
      "Le possessif s'accorde avec le possesseur, pas avec l'objet : his car (sa voiture, à lui), her car (sa voiture, à elle). Le génitif « 's » : Paul's car = la voiture de Paul.",
      'This is my sister.|C\'est ma sœur.',
      "Paul's car is new.|La voiture de Paul est neuve.",
    ],
    words: 'sister=sœur; brother=frère; friend=ami; phone=téléphone; new=nouveau/neuf; old=vieux/ancien',
    sentences: [
      "C'est mon frère.=This is my brother.|He is my brother.",
      'Son téléphone est neuf (à elle).=Her phone is new.',
      'La voiture de Paul est vieille.=Paul\'s car is old.',
      'Notre amie est française.=Our friend is French.',
    ],
  },
  {
    title: 'Les nombres et l\'âge',
    goal: 'Compter et donner son âge.',
    grammar: [
      "L'âge avec « to be »",
      "En anglais, on « est » un âge : I am 30 (years old). On ne dit jamais « I have 30 years ». Nombres utiles : twelve, twenty, thirty, forty, fifty, a hundred.",
      'I am thirty years old.|J\'ai trente ans.',
      'How old are you?|Quel âge as-tu ?',
    ],
    words: 'twelve=douze; twenty=vingt; thirty=trente; hundred=cent; year=année/an; age=âge',
    sentences: [
      "J'ai vingt ans.=I am twenty.|I am twenty years old.|I am 20.|I am 20 years old.",
      'Quel âge as-tu ?=How old are you?',
      'Mon frère a douze ans.=My brother is twelve.|My brother is twelve years old.|My brother is 12.|My brother is 12 years old.',
      "Il y a cent livres.=There are a hundred books.|There are one hundred books.|There are 100 books.",
    ],
  },
  {
    title: 'Le présent simple',
    goal: 'Parler de tes habitudes.',
    grammar: [
      'Présent simple : le -s de la 3e personne',
      "On utilise le présent simple pour les habitudes et les vérités générales. Attention : à he/she/it, le verbe prend un -s : I work, she works. Do → does, go → goes, have → has.",
      'I work in Paris.|Je travaille à Paris.',
      'She lives in London.|Elle habite à Londres.',
    ],
    words: 'work=travailler; live=habiter/vivre; drink=boire; eat=manger; coffee=café; every day=tous les jours/chaque jour',
    sentences: [
      'Je travaille à Lyon.=I work in Lyon.',
      'Elle habite à Londres.=She lives in London.',
      'Il boit du café tous les jours.=He drinks coffee every day.',
      'Nous mangeons à midi.=We eat at noon.|We eat at midday.|We eat at twelve.',
    ],
  },
  {
    title: 'Avoir : have',
    goal: 'Parler de ce que tu possèdes.',
    grammar: [
      'Have et have got',
      "« have » signifie avoir. À la 3e personne : she has. En anglais britannique, on dit aussi « have got » : I have got a dog. Pour l'âge, la faim ou la peur, on utilise « to be » : I am hungry.",
      'She has two children.|Elle a deux enfants.',
      'I am hungry.|J\'ai faim.',
    ],
    words: 'dog=chien; cat=chat; child=enfant; children=enfants; hungry=affamé/avoir faim; cold=froid/avoir froid',
    sentences: [
      "J'ai un chien.=I have a dog.|I have got a dog.",
      'Elle a deux enfants.=She has two children.|She has got two children.',
      "J'ai faim.=I am hungry.",
      "Nous avons froid.=We are cold.",
    ],
  },

  // ——— Semaine 2 : la vie quotidienne ———
  {
    title: 'La négation',
    goal: 'Dire ce que tu ne fais pas.',
    grammar: [
      "Don't / doesn't",
      "Au présent simple, la négation se construit avec do not (don't) ou does not (doesn't) à la 3e personne, suivi du verbe sans -s : she doesn't work. Avec « to be », on ajoute simplement not : I am not tired.",
      "I don't like tea.|Je n'aime pas le thé.",
      "He doesn't work on Sunday.|Il ne travaille pas le dimanche.",
    ],
    words: 'like=aimer (bien); tea=thé; tired=fatigué; Sunday=dimanche; meat=viande; smoke=fumer',
    sentences: [
      "Je n'aime pas le thé.=I don't like tea.",
      "Elle ne mange pas de viande.=She doesn't eat meat.",
      "Il ne travaille pas le dimanche.=He doesn't work on Sunday.|He doesn't work on Sundays.",
      'Je ne suis pas fatigué.=I am not tired.',
    ],
  },
  {
    title: 'Poser des questions',
    goal: 'Poser des questions au présent simple.',
    grammar: [
      'Do / does en début de question',
      "Pour poser une question : Do you…? / Does she…? puis le verbe sans -s. Mots interrogatifs : what (quoi), where (où), when (quand), why (pourquoi), who (qui), how (comment).",
      'Do you speak English?|Parles-tu anglais ?',
      'Where does she live?|Où habite-t-elle ?',
    ],
    words: 'speak=parler; where=où; when=quand; why=pourquoi; what=quoi/que; understand=comprendre',
    sentences: [
      'Parles-tu anglais ?=Do you speak English?',
      'Où habite-t-elle ?=Where does she live?',
      'Pourquoi apprends-tu l\'anglais ?=Why do you learn English?|Why are you learning English?',
      'Est-ce que tu comprends ?=Do you understand?',
    ],
  },
  {
    title: "Dire l'heure",
    goal: "Demander et donner l'heure.",
    grammar: [
      "L'heure en anglais",
      "What time is it? It's seven o'clock (7 h). half past seven (7 h 30), a quarter past seven (7 h 15), a quarter to eight (7 h 45). « at » sert à donner un horaire : at 8 a.m.",
      "It's half past nine.|Il est neuf heures et demie.",
      'The meeting is at ten.|La réunion est à dix heures.',
    ],
    words: 'time=heure (moment)/temps; morning=matin; evening=soir; meeting=réunion; early=tôt; late=tard/en retard',
    sentences: [
      'Quelle heure est-il ?=What time is it?|What is the time?',
      'Il est sept heures.=It is seven o\'clock.|It is seven.|It is 7.|It is 7 o\'clock.',
      'La réunion est à dix heures.=The meeting is at ten.|The meeting is at ten o\'clock.|The meeting is at 10.',
      'Je suis en retard.=I am late.',
    ],
  },
  {
    title: 'La routine et la fréquence',
    goal: 'Dire à quelle fréquence tu fais les choses.',
    grammar: [
      'Les adverbes de fréquence',
      "always (toujours), usually (d'habitude), often (souvent), sometimes (parfois), never (jamais). Ils se placent avant le verbe principal (I often read) mais après « to be » (She is always late).",
      'I usually get up at seven.|D\'habitude, je me lève à sept heures.',
      'She is never late.|Elle n\'est jamais en retard.',
    ],
    words: 'always=toujours; often=souvent; sometimes=parfois; never=jamais; get up=se lever; read=lire',
    sentences: [
      'Je lis souvent le soir.=I often read in the evening.|I often read at night.',
      "Elle n'est jamais en retard.=She is never late.",
      'Je me lève toujours tôt.=I always get up early.',
      'Nous allons parfois au cinéma.=We sometimes go to the cinema.|We sometimes go to the movies.|Sometimes we go to the cinema.',
    ],
  },
  {
    title: 'Il y a',
    goal: 'Décrire un lieu avec there is / there are.',
    grammar: [
      'There is / there are',
      "« Il y a » se dit there is au singulier et there are au pluriel. Négation : there isn't / there aren't. Question : Is there…? Are there…?",
      'There is a bank near here.|Il y a une banque près d\'ici.',
      'Are there any shops?|Est-ce qu\'il y a des magasins ?',
    ],
    words: 'bank=banque; shop/store=magasin; street=rue; near=près de; kitchen=cuisine; bedroom=chambre',
    sentences: [
      "Il y a une banque dans la rue.=There is a bank in the street.|There is a bank on the street.",
      'Il y a deux chambres.=There are two bedrooms.',
      "Il n'y a pas de magasin près d'ici.=There is no shop near here.|There isn't a shop near here.|There is no store near here.|There isn't a store near here.",
      'Y a-t-il une cuisine ?=Is there a kitchen?',
    ],
  },
  {
    title: 'Les prépositions de lieu',
    goal: 'Situer des objets et des lieux.',
    grammar: [
      'In, on, under, next to, between',
      "in (dans), on (sur), under (sous), next to (à côté de), between (entre), in front of (devant), behind (derrière). Pour une ville : in Paris ; pour un étage : on the second floor.",
      'The keys are on the table.|Les clés sont sur la table.',
      'The bank is next to the station.|La banque est à côté de la gare.',
    ],
    words: 'keys=clés; under=sous; next to=à côté de; between=entre; behind=derrière; station=gare',
    sentences: [
      'Les clés sont sur la table.=The keys are on the table.',
      'Le chat est sous le lit.=The cat is under the bed.',
      'La banque est à côté de la gare.=The bank is next to the station.',
      "Je suis derrière toi.=I am behind you.",
    ],
  },

  // ——— Semaine 3 : capacités, nourriture, achats ———
  {
    title: 'Can : pouvoir, savoir faire',
    goal: 'Exprimer une capacité ou une permission.',
    grammar: [
      'Can / can\'t',
      "can + verbe sans « to » : I can swim. Il est identique à toutes les personnes (she can, pas « she cans »). Négation : can't (cannot). Question : Can you…?",
      'I can swim.|Je sais nager.',
      'Can I sit here?|Puis-je m\'asseoir ici ?',
    ],
    words: 'swim=nager; drive=conduire; cook=cuisiner; help=aider; sit=s\'asseoir; open=ouvrir',
    sentences: [
      'Je sais nager.=I can swim.',
      'Elle ne sait pas conduire.=She can\'t drive.|She cannot drive.',
      'Peux-tu m\'aider ?=Can you help me?|Could you help me?',
      "Puis-je ouvrir la fenêtre ?=Can I open the window?|May I open the window?|Could I open the window?",
    ],
  },
  {
    title: "L'impératif",
    goal: 'Donner des consignes et des conseils.',
    grammar: [
      "L'impératif",
      "On utilise le verbe seul : Open the door. Pour la négation : Don't + verbe : Don't worry. Pour proposer : Let's go! (Allons-y !). Ajoute « please » pour être poli.",
      'Please close the door.|Ferme la porte, s\'il te plaît.',
      "Don't worry.|Ne t'inquiète pas.",
    ],
    words: 'close=fermer; door=porte; window=fenêtre; worry=s\'inquiéter; wait=attendre; listen=écouter',
    sentences: [
      "Ferme la porte, s'il te plaît.=Close the door, please.|Please close the door.",
      "Ne t'inquiète pas.=Don't worry.",
      'Attends-moi !=Wait for me!',
      'Allons-y !=Let\'s go!',
    ],
  },
  {
    title: 'Some et any',
    goal: 'Parler de quantités indéfinies.',
    grammar: [
      'Some / any',
      "« some » s'utilise dans les phrases affirmatives (I have some bread), « any » dans les négations et les questions (Do you have any milk? I don't have any sugar). Pour proposer, on garde some : Would you like some tea?",
      'I need some eggs.|J\'ai besoin d\'œufs.',
      "We don't have any milk.|Nous n'avons pas de lait.",
    ],
    words: 'bread=pain; milk=lait; egg=œuf; sugar=sucre; water=eau; need=avoir besoin de',
    sentences: [
      "J'ai besoin d'œufs.=I need some eggs.|I need eggs.",
      "Nous n'avons pas de lait.=We don't have any milk.|We have no milk.|We haven't got any milk.",
      "As-tu du pain ?=Do you have any bread?|Have you got any bread?",
      "Voulez-vous de l'eau ?=Would you like some water?|Do you want some water?",
    ],
  },
  {
    title: 'Much, many, a lot of',
    goal: 'Parler de grandes et petites quantités.',
    grammar: [
      'Dénombrable ou indénombrable',
      "many + nom dénombrable pluriel (many friends), much + indénombrable (much money), surtout dans les questions et négations. a lot of fonctionne avec les deux. How much? (combien, indénombrable) / How many? (combien, dénombrable).",
      'How many brothers do you have?|Combien de frères as-tu ?',
      "I don't have much time.|Je n'ai pas beaucoup de temps.",
    ],
    words: 'money=argent; how much=combien (indénombrable); how many=combien (dénombrable); a lot of=beaucoup de; people=gens/personnes; enough=assez',
    sentences: [
      "Combien de frères as-tu ?=How many brothers do you have?|How many brothers have you got?",
      "Je n'ai pas beaucoup de temps.=I don't have much time.|I don't have a lot of time.|I haven't got much time.",
      "Il y a beaucoup de gens.=There are a lot of people.|There are many people.|There are lots of people.",
      "Combien d'argent as-tu ?=How much money do you have?|How much money have you got?",
    ],
  },
  {
    title: 'Les goûts',
    goal: 'Dire ce que tu aimes et ce que tu détestes.',
    grammar: [
      'Like / love / hate + -ing',
      "Pour parler d'activités qu'on aime : like, love, enjoy, hate + verbe en -ing : I love reading. « I would like » (I'd like) signifie « je voudrais », pour une demande polie.",
      'I love travelling.|J\'adore voyager.',
      "I'd like a coffee, please.|Je voudrais un café, s'il vous plaît.",
    ],
    words: 'love=adorer/aimer; hate=détester; enjoy=apprécier; travel=voyager; music=musique; dance=danser',
    sentences: [
      "J'adore voyager.=I love travelling.|I love traveling.|I love to travel.",
      'Elle déteste cuisiner.=She hates cooking.|She hates to cook.',
      "Je voudrais un café, s'il vous plaît.=I would like a coffee, please.|I would like a coffee please.|Can I have a coffee, please?",
      'Aimes-tu danser ?=Do you like dancing?|Do you like to dance?',
    ],
  },
  {
    title: 'Faire des achats',
    goal: 'Demander un prix et acheter quelque chose.',
    grammar: [
      'Demander le prix',
      "How much is it? (combien ça coûte, singulier) / How much are they? (pluriel). « It costs ten pounds. » Pour acheter : I'll take it (je le prends). « Can I pay by card? » (Puis-je payer par carte ?)",
      'How much is this shirt?|Combien coûte cette chemise ?',
      'Can I pay by card?|Puis-je payer par carte ?',
    ],
    words: 'price=prix; cheap=bon marché; expensive=cher; pay=payer; buy=acheter; shirt=chemise',
    sentences: [
      'Combien coûte cette chemise ?=How much is this shirt?|How much does this shirt cost?',
      'Puis-je payer par carte ?=Can I pay by card?|Can I pay by credit card?',
      "C'est trop cher.=It is too expensive.|It's too expensive.",
      'Je le prends.=I will take it.',
    ],
  },

  // ——— Semaine 4 : décrire le présent ———
  {
    title: 'Le présent continu',
    goal: 'Décrire ce qui se passe en ce moment.',
    grammar: [
      'Be + verbe-ing',
      "Pour une action en cours : I am working, she is reading. Négation : I'm not working. Question : Are you working? Mots-indices : now, right now, at the moment.",
      'I am working now.|Je travaille en ce moment.',
      'What are you doing?|Qu\'est-ce que tu fais ?',
    ],
    words: 'now=maintenant; at the moment=en ce moment; write=écrire; wait for=attendre (quelqu\'un); rain=pleuvoir/pluie; watch=regarder',
    sentences: [
      "Qu'est-ce que tu fais ?=What are you doing?",
      'Je travaille en ce moment.=I am working at the moment.|I am working now.|I am working right now.',
      'Il pleut.=It is raining.',
      "Elle regarde un film.=She is watching a film.|She is watching a movie.",
    ],
  },
  {
    title: 'Présent simple ou continu ?',
    goal: 'Choisir entre habitude et action en cours.',
    grammar: [
      'Habitude ou action en cours',
      "Présent simple : habitude ou vérité (I work every day). Présent continu : maintenant ou situation temporaire (I'm working from home this week). Certains verbes d'état (know, want, like, need) ne se mettent pas au continu.",
      'I usually walk, but today I am taking the bus.|D\'habitude je marche, mais aujourd\'hui je prends le bus.',
      'I know the answer.|Je connais la réponse.',
    ],
    words: 'usually=d\'habitude; today=aujourd\'hui; know=savoir/connaître; walk=marcher; answer=réponse; this week=cette semaine',
    sentences: [
      "D'habitude je marche, mais aujourd'hui je prends le bus.=I usually walk, but today I am taking the bus.|Usually I walk, but today I am taking the bus.",
      'Je connais la réponse.=I know the answer.',
      'Elle travaille à la maison cette semaine.=She is working from home this week.|She is working at home this week.',
      "Il ne comprend pas.=He doesn't understand.",
    ],
  },
  {
    title: 'Les vêtements et la météo',
    goal: 'Parler du temps qu\'il fait et de ce que tu portes.',
    grammar: [
      'La météo avec « it »',
      "On parle de la météo avec it : It's sunny, it's cloudy, it's windy, it's cold. Pour porter un vêtement : to wear. I'm wearing a coat.",
      "It's sunny today.|Il fait beau aujourd'hui.",
      'She is wearing a red dress.|Elle porte une robe rouge.',
    ],
    words: 'wear=porter (un vêtement); coat=manteau; sunny=ensoleillé; weather=temps/météo; shoes=chaussures; dress=robe',
    sentences: [
      "Il fait beau aujourd'hui.=It is sunny today.|The weather is nice today.|It is nice today.",
      'Elle porte une robe rouge.=She is wearing a red dress.',
      'Quel temps fait-il ?=What is the weather like?|How is the weather?',
      'Mets ton manteau, il fait froid.=Put on your coat, it is cold.|Put your coat on, it is cold.',
    ],
  },
  {
    title: 'Les pronoms compléments',
    goal: 'Remplacer un nom par me, him, her, them…',
    grammar: [
      'Me, you, him, her, it, us, them',
      "Après un verbe ou une préposition, on utilise les pronoms compléments : Call me. I like her. Give it to them. L'ordre reste sujet + verbe + complément.",
      'Can you call me?|Peux-tu m\'appeler ?',
      'I know them.|Je les connais.',
    ],
    words: 'call=appeler; give=donner; send=envoyer; tell=dire (à quelqu\'un); show=montrer; ask=demander',
    sentences: [
      "Peux-tu m'appeler ?=Can you call me?|Could you call me?",
      'Je les connais.=I know them.',
      'Donne-le-lui (à elle).=Give it to her.',
      "Il nous envoie un message.=He sends us a message.|He is sending us a message.",
    ],
  },
  {
    title: 'Décrire les gens',
    goal: 'Décrire le caractère et l\'apparence.',
    grammar: [
      "La place de l'adjectif",
      "En anglais, l'adjectif est invariable et se place avant le nom : a tall man, tall women. Pour demander une description : What is he like? (Comment est-il ?) / What does he look like? (À quoi ressemble-t-il ?)",
      'She has long hair.|Elle a les cheveux longs.',
      'What is your boss like?|Comment est ton patron ?',
    ],
    words: 'tall=grand; short=petit/court; kind=gentil; funny=drôle; hair=cheveux; boss=patron/chef',
    sentences: [
      'Elle a les cheveux longs.=She has long hair.|She has got long hair.',
      'Comment est ton patron ?=What is your boss like?',
      "C'est un homme gentil.=He is a kind man.",
      'Mes amis sont drôles.=My friends are funny.',
    ],
  },
  {
    title: 'Les comparatifs',
    goal: 'Comparer deux choses.',
    grammar: [
      'Comparatif : -er than / more … than',
      "Adjectif court : + -er than (taller than, bigger than). Adjectif long : more … than (more expensive than). Irréguliers : good → better, bad → worse. Égalité : as … as.",
      'London is bigger than Paris.|Londres est plus grande que Paris.',
      'This book is better than the film.|Ce livre est meilleur que le film.',
    ],
    words: 'bigger=plus grand; better=meilleur/mieux; worse=pire; easy=facile; difficult=difficile; than=que (comparaison)',
    sentences: [
      'Londres est plus grande que Paris.=London is bigger than Paris.|London is larger than Paris.',
      "L'anglais est plus facile que le chinois.=English is easier than Chinese.",
      'Ce livre est meilleur que le film.=This book is better than the film.|This book is better than the movie.',
      'Le train est plus cher que le bus.=The train is more expensive than the bus.',
    ],
  },
];
