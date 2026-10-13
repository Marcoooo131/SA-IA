# Procédure de test audio (poste Windows réel)

Ces tests **ne peuvent pas être automatisés** dans la CI (pas de carte son sur les machines
d'intégration). Ils sont à réaliser sur chaque modèle de poste et de casque utilisé, avec des
**conversations fictives** (deux collègues jouant un script, ou un script lu par une voix de
synthèse) — jamais avec un vrai client avant validation.

Préparation :

1. `PhoneCallDiag.exe` (ou `python -m phonecall_desktop.diag`) : noter la liste des périphériques.
2. Profil de test : `PCD_ENVIRONMENT=dev`, `PCD_AUDIO_BACKEND=wasapi`, `PCD_RECOGNIZER=whisper`,
   `PCD_NOTES_CLIENT=simulated` (ou `gateway` vers une passerelle de **recette**).
3. Script d'appel : utiliser les scénarios de `phonecall_desktop/synthetic.py` (déménagement,
   résiliation), lus par deux personnes, l'une dans Teams / le softphone (interlocuteur), l'autre
   au poste testé (conseiller).

## A. Capture

| # | Test | Mode opératoire | Résultat attendu |
|---|---|---|---|
| A1 | Son du PC | `diag --record 10` en jouant une vidéo / un appel test sur le casque | « son détecté » sur le loopback du casque, niveau > −45 dBFS |
| A2 | Micro | `diag --record 10` en parlant | « son détecté » sur le micro du casque |
| A3 | Mauvais périphérique | choisir « Haut-parleurs » alors que l'appel sort dans le casque | vu-mètre « aucun son » + alerte après 10 s |
| A4 | Casque USB | appel Teams avec casque USB, sources = casque | les deux voix transcrites, étiquettes correctes |
| A5 | Casque Bluetooth (A2DP → HFP) | appel Teams avec casque BT ; choisir le périphérique « Mains libres » | les deux voix captées ; noter la qualité (8–16 kHz) |
| A6 | Haut-parleurs + micro du PC | sans casque | la voix de l'interlocuteur apparaît une fois (écho barré) ; noter les doublons restants |
| A7 | Changement de périphérique en cours d'appel | débrancher / rebrancher le casque USB pendant la capture | message « périphérique perdu », puis « capture reprise » ; pas de plantage |
| A8 | Passage Bluetooth en HFP pendant la capture | lancer la capture avant de décrocher sur un casque BT | message de perte puis reprise (ou alerte claire) — noter le comportement |
| A9 | Plusieurs applications audio | musique + appel sur le même périphérique | la musique est aussi transcrite (limitation connue) — vérifier le message de consigne |
| A10 | Softphone dans le navigateur | appel depuis un softphone web (Chrome/Edge) | voix de l'interlocuteur captée par le loopback |
| A11 | Softphone en mode exclusif / Citrix | selon l'outil de l'entreprise | noter si le son est capté |
| A12 | Micro bloqué par Windows | désactiver l'accès micro des applications de bureau | message explicite, pas de capture silencieuse ignorée |
| A13 | Aucun périphérique | désactiver tous les périphériques | message « Aucune source audio détectée » |

## B. Transcription en direct

| # | Test | Résultat attendu |
|---|---|---|
| B1 | Apparition progressive | texte gris pendant la phrase, puis texte définitif < 4 s après la fin de la phrase (mesurer) |
| B2 | Pas de doublon | chaque phrase n'apparaît qu'une fois |
| B3 | Pauses longues | un silence de 30 s ne crée ni texte parasite ni blocage |
| B4 | Derniers mots | cliquer sur « Fin » au milieu d'une phrase : la phrase entamée figure dans la transcription finale |
| B5 | Poste chargé | ouvrir plusieurs applications lourdes : le message de retard peut apparaître, aucun texte perdu à la fin |
| B6 | Noms, chiffres, montants | lire « deux mois offerts », « 49 euros », un nom propre : noter les erreurs |

## C. Note et interface

| # | Test | Résultat attendu |
|---|---|---|
| C1 | Fin → note | états : Capture en cours → Transcription en cours → Génération de la note → Terminé |
| C2 | Contenu | la note ne contient aucune information absente de l'appel ; propositions non acceptées non présentées comme réalisées |
| C3 | Copier | coller dans le Bloc-notes puis dans le champ Phone Call du CRM de recette : texte identique, accents corrects |
| C4 | Modifier | modifier, enregistrer, copier : la version modifiée est copiée |
| C5 | Coupure réseau | débrancher le réseau avant « Fin » : erreur explicite, transcription conservée, « Relancer la génération » fonctionne au retour du réseau |
| C6 | Nouvelle conversation | efface transcription et note |
| C7 | Arrêt garanti | après « Fin » : l'icône micro de Windows disparaît ; fermer la fenêtre pendant une capture arrête la capture |
| C8 | Indicateur | le bandeau rouge et le chronomètre restent visibles pendant toute la capture |

## D. Mesures à reporter

Pour chaque poste / casque : WER estimé sur le script (mots erronés / mots prononcés), latence
médiane du texte définitif, charge CPU pendant la capture (Gestionnaire des tâches), durée entre
« Fin » et la note, nombre de corrections apportées à la note. Le script
`scripts/benchmark_stt.py` donne les mêmes mesures sur une conversation de synthèse et sert de
référence de comparaison entre postes.
