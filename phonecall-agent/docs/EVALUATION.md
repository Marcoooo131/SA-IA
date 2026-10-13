# Jeu d'évaluation des comptes rendus

Les tests automatisés vérifient la mécanique. Ils ne disent rien de la qualité réelle des Phone
Call. Celle-ci doit être jugée par des **experts métier** sur un jeu de cas **anonymisés et
autorisés**.

## 1. Constitution du jeu

- 60 à 100 appels, répartis par motif (déménagement, résiliation, rétention, administratif, SAV,
  commercial, suivi, autre) et par difficulté (bruit, coupures, plusieurs demandes, client hésitant).
- Pour chaque appel : la transcription anonymisée (noms, adresses, numéros, contrats remplacés par
  des valeurs fictives cohérentes) et un **Phone Call de référence** rédigé ou validé par un expert.
- Inclure volontairement des pièges : proposition non acceptée, montant évoqué puis refusé, action
  promise mais non réalisée, passage inaudible sur une information critique, appel sans contenu.
- Le format des fichiers est celui de `phonecall_agent/demo_data/transcripts/*.json` ; les
  scénarios synthétiques fournis servent d'exemples.

## 2. Grille de notation (par compte rendu, deux experts indépendants)

| Critère | Échelle |
|---|---|
| **Erreur critique** (fait inventé, action présentée comme réalisée à tort, montant / date / engagement faux) | oui / non — *une seule suffit à rendre le compte rendu inacceptable* |
| Fidélité (tout ce qui est écrit est dans l'appel) | 1–5 |
| Complétude (les éléments utiles au dossier sont présents) | 1–5 |
| Distinction propos du client / informations du conseiller / actions réalisées / actions à faire | 1–5 |
| Concision et style (exploitable tel quel dans le CRM) | 1–5 |
| Catégorie correcte (ou « indéterminé » à juste titre) | oui / non |
| Temps de correction estimé | secondes |

## 3. Seuils proposés (à valider par le métier)

- **0 erreur critique** sur le jeu de référence.
- Fidélité moyenne ≥ 4,5 ; complétude ≥ 4 ; style ≥ 4.
- ≥ 80 % des comptes rendus utilisables avec au plus une correction mineure.
- Tous les cas pièges signalés par au moins un signal du validateur.

## 4. Utilisation

1. Lancer la génération sur le jeu (même configuration que la production visée).
2. Exporter textes, signaux et indicateurs ; faire noter à l'aveugle.
3. Calculer : taux d'erreurs critiques, moyennes, corrélation entre l'indicateur qualité et la note
   des experts (calibrage), rappel du validateur sur les cas pièges.
4. Rejouer à chaque changement de prompt (`PROMPT_VERSION`), de modèle, de fournisseur de
   transcription ou de configuration métier. Conserver les résultats pour comparaison.
