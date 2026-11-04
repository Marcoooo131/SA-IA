# Workshop « Le brise-glace »

Atelier interactif pour l'équipe Movers : **désamorcer un client mécontent ou qui veut résilier**, rendre l'appel agréable
et l'accompagner dans son déménagement **sans le vexer**.

> « On ne déménage pas un client vexé : on accompagne un client rassuré. »

**En ligne :** `https://marcoooo131.github.io/SA-IA/workshop-brise-glace/`

## Déroulé (≈ 55 min)

| # | Écran | Ce que fait l'équipe |
|---|-------|----------------------|
| 1 | Introduction | 3 principes (accueillir, ralentir, créer du lien), phrase d'accroche |
| 2 | Braque ou apaise | Même client en colère, deux premières phrases : jauge de tension, méthode en 3 temps (accueillir · assumer · donner un cap), formules qui apaisent / qui braquent, 3 phrases à retourner |
| 3 | 4 clients à désamorcer | Le client furieux (technicien absent), « Je veux résilier, point. », le client qui se sent piégé (conditions du contrat), le client stressé par le déménagement : contexte → piège à éviter → phrases brise-glace une par une avec la réaction du client → ce qui ouvre la porte au déménagement → phrase de transition et leçon |
| 4 | Reformule pour apaiser ! | 5 phrases qui braquent à reformuler à l'oral, puis révélation de versions apaisantes |
| 5 | Challenge final | 3 clients tirés au hasard parmi 8, choisir la meilleure première réponse, score et correction |
| 6 | Conclusion | Les 5 réflexes brise-glace, phrase finale |

## Animer la séance

Mêmes commandes que le workshop « découverte client » :
`→` / `←` (ou télécommande) pour naviguer, `F` plein écran, `H` afficher / masquer toutes les réponses,
`N` notes de l'animateur, `S` voix du client, `A` `B` `C` au challenge, boutons « 30 s » / « 1 min » pour le minuteur.

Conseils :
- Faites **jouer les scènes** : un agent lit la phrase du client sur un ton énervé, un autre répond. Le ton compte autant que les mots.
- Dans les mises en situation, demandez la première phrase de l'équipe **avant** de révéler le support.
- Les réactions du client sont lues à voix haute (synthèse vocale du navigateur) : pratique pour faire ressentir l'effet d'une phrase.

## Modifier le contenu

Tout le texte est dans **`js/data.js`** (situations, phrases, réactions, exercice, quiz, réflexes, notes d'animation, libellés).
Le moteur est partagé avec les autres workshops dans [`../workshop-commun/`](../workshop-commun/).
Dans le quiz, les propositions sont mélangées : n'écrivez pas « la réponse B » dans les explications.

Le score et les propositions de l'équipe sont conservés dans le navigateur de l'appareil, séparément de l'autre workshop.

## Tester en local

```bash
python3 -m http.server 8000     # depuis la racine du dépôt, puis ouvrir http://localhost:8000/workshop-brise-glace/
```

## Déploiement

Publié automatiquement par [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) à chaque push sur `main`.

> Outil de formation interne non officiel. Les situations et réactions client sont des exemples pédagogiques fictifs.
> Vérifiez que les engagements cités (rappel, confirmation écrite, conditions de transfert) correspondent à vos procédures.
