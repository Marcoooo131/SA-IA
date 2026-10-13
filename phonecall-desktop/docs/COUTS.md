# Mesures et coûts

## 1. Mesures de transcription (CI, conversation synthétique)

Banc : `scripts/benchmark_stt.py`, exécuté par GitHub Actions (runner Linux 4 vCPU, sans GPU,
faster-whisper int8). Conversation fictive « déménagement » (10 tours, ~50 s de parole), deux
canaux, lue **en temps réel** dans la même chaîne que l'application (segmentation → reconnaissance →
assemblage). Deux voix de synthèse : **espeak-ng** (très robotique) et **Piper** (voix neuronale,
plus naturelle). Mesure complémentaire : arrêt au milieu du 4ᵉ tour (« Fin » en pleine phrase).

Résultats du 13/10/2026 (run GitHub Actions n° 38439236892) :

| Modèle | Voix | WER | Latence texte définitif, médiane (p90) | Facteur temps réel | « Fin » → transcription complète | Derniers mots si arrêt en pleine phrase |
|---|---|---|---|---|---|---|
| base | espeak | 58,9 % | 1,7 s (2,7 s) | 0,54 | 0 s | perdus (« Non, ») |
| base | Piper | 4,0 % | 1,4 s (1,9 s) | 0,47 | 0,05 s | conservés |
| **small** | espeak | 25,8 % | 4,1 s (5,8 s) | 0,97 | 1,2 s | déformés |
| **small** | **Piper** | **4,0 %** | **1,7 s (2,0 s)** | **0,57** | **0 s** | **conservés** |
| medium | espeak | 4,8 % | 19,3 s (26,3 s) | 1,45 | 26,9 s | conservés (un mot ajouté) |
| medium | Piper | 1,6 % | 19,0 s (26,1 s) | 1,45 | 26,8 s | partiels (« Dans une maison… ») |

Conclusions :

- **`small` est le meilleur compromis** sur une machine de 4 vCPU : quasi-exact sur une voix
  naturelle, texte définitif en ~2 s, CPU à 57 % sur voix naturelle mais **~100 % sur voix dégradée**
  (plus de passes de décodage) — à vérifier sur les postes réels.
- **`medium` est trop lent** sans GPU : facteur temps réel 1,45, la transcription prend du retard
  (19 s de latence) et l'attente après « Fin » atteint ~27 s. À réserver à un poste avec GPU ou à un
  traitement côté serveur.
- **`base`** est rapide mais s'effondre dès que la voix est dégradée (59 % d'erreurs).
- **Erreurs critiques observées sur tous les modèles** : « montant » transcrit « mon temps » ou
  « moutons », « compagne » → « compagnie », « je vous rappellerai » → « je vous appelle ». Ce type
  d'erreur justifie la règle de la passerelle (ne pas reprendre de montant ou d'engagement issu d'un
  passage douteux) et la **relecture obligatoire** de la note.
- Aucun doublon de segment, aucune perte de phrase entière dans les 12 mesures (le texte est
  parfois mal reconnu, jamais omis).

Lecture :

- **WER** : proportion de mots erronés par rapport au script (0 % = parfait).
- **Latence** : délai entre la fin d'une phrase et l'affichage de son texte **définitif** (le texte
  provisoire apparaît pendant la phrase).
- **Facteur temps réel (RTF)** : temps de calcul / durée d'audio, deux canaux compris. Au-delà de
  ~0,8 sur le poste réel, le texte définitif prend du retard pendant les appels longs.
- **Fin → transcription complète** : attente entre le clic sur « Fin » et le début de la génération.

**Limites de ces mesures** : voix de synthèse ≠ voix réelles (accents, débit, bruit, compression
téléphonique, chevauchements). Elles valident la mécanique (pas de perte, pas de doublon, latence)
et comparent les modèles, mais la précision réelle doit être mesurée sur 30 à 50 appels fictifs
joués par des personnes, sur les postes de l'entreprise (`PROCEDURE_TEST_AUDIO.md`).

## 2. Coût de la transcription par heure

| Option | Coût de service par heure d'appel | Remarques |
|---|---|---|
| **Locale (faster-whisper, retenue par défaut)** | **0 €** | coût = puissance du poste ; aucune donnée audio envoyée ; à valider sur le matériel (RTF) |
| AssemblyAI Universal-Streaming Multilingual | ~0,15 $/h par flux → **~0,30 $/h** pour 2 canaux | facturé à la durée de session ; diarisation +0,02 $/h ; endpoint UE annoncé |
| Speechmatics temps réel | ~0,24–0,43 $/h par flux → ~0,5–0,9 $/h | selon le niveau de précision |
| Deepgram Nova-3 multilingue | ~0,35–0,55 $/h par flux → ~0,7–1,1 $/h | sources tierces contradictoires |
| Azure AI Speech temps réel | tarif horaire à lire sur la page Azure (non récupéré) | région UE, intégration Microsoft |

Tarifs relevés le 13/10/2026 sur les pages publiques ou des comparateurs : **à vérifier** sur les
grilles officielles avant toute décision. Les deux canaux (conseiller / interlocuteur) sont deux
flux, sauf si le fournisseur facture un flux multicanal au prix d'un seul.

## 3. Coût de la note (passerelle, Claude)

Hypothèses : appel de 4 minutes, transcription ~1 000–1 500 jetons, prompt ~1 500 jetons,
sortie structurée + raisonnement 1 500–3 500 jetons. Tarifs publics Anthropic (USD / million de
jetons, entrée / sortie) : Opus 5.5 4 / 20 ; Sonnet 5.5 2 / 10 ; Haiku 5.5 0,10 / 0,50.

| Modèle | Par appel | Par heure d'appels (15 appels de 4 min) |
|---|---|---|
| Claude Opus 5.5 (configuration par défaut de la passerelle) | 0,04 – 0,09 $ | 0,60 – 1,35 $ |
| Claude Sonnet 5.5 | 0,02 – 0,045 $ | 0,30 – 0,70 $ |
| Claude Haiku 5.5 | < 0,003 $ | < 0,05 $ |

Le coût réel de chaque note est renvoyé par la passerelle (`cost_usd`) et visible dans les
métriques de session. Le modèle se choisit sur la **qualité mesurée** (grille d'évaluation),
pas sur le prix seul.

## 4. Synthèse par appel (4 minutes)

| Scénario | Transcription | Note | Total par appel | Total par heure d'appels |
|---|---|---|---|---|
| Local + Opus 5.5 | 0 € | 0,04 – 0,09 $ | **0,04 – 0,09 $** | 0,60 – 1,35 $ |
| Local + Sonnet 5.5 | 0 € | 0,02 – 0,045 $ | 0,02 – 0,045 $ | 0,30 – 0,70 $ |
| AssemblyAI (2 flux) + Sonnet 5.5 | ~0,02 $ | 0,02 – 0,045 $ | ~0,04 – 0,065 $ | ~0,60 – 1,00 $ |
| Local + Haiku 5.5 | 0 € | < 0,003 $ | < 0,003 $ | < 0,05 $ |

À ajouter : hébergement de la passerelle (petite instance, mutualisée avec `phonecall-agent`,
quelques dizaines d'euros par mois) et, pour la transcription locale, le temps de mesure et
d'éventuelles mises à niveau de postes.
