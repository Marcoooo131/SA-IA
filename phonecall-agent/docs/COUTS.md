# Estimation des coûts par appel

> Ordres de grandeur pour orienter les décisions D2 et D4. **À mesurer pendant le pilote** :
> l'application enregistre le coût estimé de chaque génération (`reports.cost_usd`) et la moyenne
> par appel (`/dashboard`, `phonecall_avg_cost_usd_per_call`). Les tarifs des fournisseurs
> évoluent : vérifier les grilles officielles avant toute décision.

## Hypothèses

| Paramètre | Valeur retenue | Commentaire |
|---|---|---|
| Durée moyenne d'un appel | 4 min | à mesurer sur les données Twilio |
| Transcription | ~600 mots ≈ 1 000–1 500 jetons | |
| Prompt système + consignes métier | ~1 500 jetons, +1 500 avec des exemples | |
| Entrée totale par appel | 3 000–5 000 jetons | |
| Sortie (JSON structuré + raisonnement adaptatif) | 1 500–3 500 jetons | le raisonnement est facturé comme de la sortie |
| Volume | 200 appels/jour × 22 jours = 4 400 appels/mois | hypothèse haute du cahier des charges |

## 1. Rédaction (LLM, Claude)

Tarifs publics Anthropic (USD par million de jetons, entrée / sortie) au moment de l'audit :
Claude Opus 5.5 4 $ / 20 $ ; Claude Sonnet 5.5 2 $ / 10 $ ; Claude Haiku 5.5 0,10 $ / 0,50 $.

| Modèle | Coût par appel | Coût mensuel (4 400 appels) |
|---|---|---|
| Claude Opus 5.5 (par défaut dans le prototype) | 0,04 – 0,09 $ | ~180 – 400 $ |
| Claude Sonnet 5.5 | 0,02 – 0,045 $ | ~90 – 200 $ |
| Claude Haiku 5.5 | < 0,003 $ | < 15 $ |

Le choix du modèle se fait **sur la qualité mesurée** (`docs/EVALUATION.md`) : commencer avec
Opus 5.5 en effort `medium`, puis tester des efforts plus bas ou des modèles moins chers sur le même
jeu d'évaluation et ne retenir que ceux qui ne dégradent pas les erreurs critiques. Leviers
supplémentaires : mise en cache du prompt système (prefixe stable), API Batch (−50 %) si un délai
de plusieurs heures est acceptable.

## 2. Transcription

| Option | Coût indicatif | Remarques |
|---|---|---|
| Auto-hébergée (faster-whisper, modèle `medium`) | coût de la machine : ~100 – 300 €/mois (CPU 8 vCPU ou petit GPU), soit ~0,02 – 0,07 € par appel à 4 400 appels/mois | l'audio ne quitte pas l'infrastructure ; qualité et vitesse à mesurer |
| Service géré (API de transcription) | de l'ordre de 0,005 à 0,03 $ par minute selon fournisseur et options (diarisation), soit ~0,02 – 0,12 $ par appel | à vérifier sur les grilles officielles ; DPA et région UE requis |

## 3. Infrastructure et Twilio

| Poste | Ordre de grandeur |
|---|---|
| API + workers + PostgreSQL + Redis managés | 80 – 250 €/mois, soit ~0,02 – 0,06 € par appel |
| Twilio (enregistrement, stockage, appels API) | selon le contrat Sector Alarm existant ; le téléchargement par l'API n'ajoute pas de coût d'enregistrement, mais la durée de conservation chez Twilio a un coût de stockage |

## 4. Synthèse

| Scénario | Coût total par appel (ordre de grandeur) |
|---|---|
| Économique (Haiku 5.5 + transcription auto-hébergée mutualisée) | ~0,03 – 0,08 € |
| Intermédiaire (Sonnet 5.5 + service géré) | ~0,07 – 0,20 € |
| Qualité maximale (Opus 5.5 + service géré avec diarisation) | ~0,10 – 0,25 € |

À comparer au temps de rédaction manuelle économisé : à 2–4 minutes par Phone Call et
200 appels par jour, 7 à 13 heures de conseiller par jour.
