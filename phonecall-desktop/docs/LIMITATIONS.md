# Limitations connues

## Ce qui n'a pas été vérifié

| Point | Situation |
|---|---|
| **Capture WASAPI réelle** (loopback, micro, casques USB/Bluetooth, changement de périphérique) | Code écrit d'après la documentation et le code source de PyAudioWPatch ; sur un runner Windows de GitHub Actions **sans carte son** : WASAPI s'initialise, l'énumération renvoie 0 périphérique (message explicite), les deux `.exe` passent leur auto-test. **Aucune capture réelle n'a été faite.** → `PROCEDURE_TEST_AUDIO.md` |
| Fenêtre WebView2 (pywebview) | Non lancée (aucun bureau graphique dans la CI). L'interface est testée dans Chromium (Playwright) ; `--browser` sert de solution de repli |
| Qualité de transcription sur de vrais appels | Mesurée uniquement sur des voix de synthèse (espeak-ng, Piper). Les voix de synthèse ne reproduisent ni les accents, ni la compression téléphonique, ni les chevauchements de parole |
| Note sans IA (mode `local`, par défaut) | Testée sur des conversations synthétiques : les phrases citées sont recopiées mot pour mot, 10 lignes maximum. **Ce n'est pas un résumé** : le programme ne comprend pas l'appel, il peut citer une phrase peu utile ou en manquer une importante, et le motif vient de mots-clés de `business.yaml`. Qualité à évaluer sur de vrais appels (anonymisés) |
| Note générée par le vrai modèle d'IA (option) | Modes `gateway` et `anthropic` testés avec un **client Claude factice** (requête envoyée, prompt, schéma, contrôles, erreurs de clé, réseau, quota) ; aucun appel avec une vraie clé n'a été fait pendant le développement — premier essai réel à faire avec la clé de l'entreprise sur une conversation fictive |
| Exécutable signé, antivirus, déploiement Intune/GPO | Non réalisés. Le paquet non signé produit par la CI pèse ~220 Mo compressé (sans modèle de transcription) |

## Limites techniques de la capture

- Le loopback capte **tout** ce qui est joué sur le périphérique choisi (notifications, musique, autre appel).
- Pas de capture limitée à une seule application (Teams seul) : nécessiterait le *process loopback* de Windows 10 2004+ / 11, non exposé par PortAudio.
- PortAudio ne connaît pas le périphérique « communications » de Windows : il faut choisir le bon périphérique dans la liste.
- Bluetooth en mode mains libres (HFP) : son 8–16 kHz, reconnaissance dégradée ; le basculement A2DP → HFP en cours de capture est traité comme une perte de périphérique (reprise automatique tentée, non vérifiée sur matériel).
- Applications en mode exclusif, certains environnements Citrix/VDI : son possiblement non capté.
- Sans casque, la voix de l'interlocuteur est aussi captée par le micro ; la suppression de l'écho est textuelle (recoupement temps + similarité), donc imparfaite : doublons résiduels possibles, ou au contraire phrase du conseiller supprimée s'il répète mot pour mot l'interlocuteur au même moment.
- Le micro capte aussi les voix proches (open space) : attribuées au « Conseiller ».

## Limites de la transcription

- Séparation des interlocuteurs **par canal** uniquement : « Interlocuteur » = tout ce que joue le PC (il peut y avoir plusieurs personnes dans une conférence Teams, toutes étiquetées « Interlocuteur ») ; aucune identification de personne par la voix (volontaire).
- Mesures sur un runner 4 vCPU (voir `COUTS.md`) : modèle `small` = facteur temps réel 0,57 sur voix naturelle mais ~1 sur voix dégradée ; `medium` = 1,45 (trop lent sans GPU). Sur un poste plus lent, le texte définitif prend du retard (affiché, sans perte de texte) et l'attente après « Fin » s'allonge.
- Mots confondus même sur voix claire (« montant » → « mon temps ») : les montants, dates et engagements doivent toujours être vérifiés par le conseiller.
- Whisper peut « halluciner » sur du bruit ou de l'audio coupé (phrases génériques, boucles de répétition) : filtres en place (phrases connues, répétitions réduites et marquées incertaines), mais pas infaillibles.
- Les chiffres, montants, noms propres et numéros sont les éléments les moins fiables : la passerelle refuse de les reprendre s'ils viennent d'un passage incertain, et signale ceux qui ne figurent pas dans la transcription.
- Coupure d'une phrase très longue à 15 s : un mot peut être coupé à la jonction.
- Le mode test « scripté » ne lit qu'un scénario à la fois (`PCD_TEST_SCENARIO`).

## Limites de la note

- La note dépend de la transcription : une erreur de reconnaissance peut produire une information fausse mais « justifiée ». La relecture par le conseiller reste **obligatoire**.
- Le contrôle qualité est à base de règles : il détecte des catégories d'erreurs connues, pas toutes les erreurs.
- Format : texte libre défini par le prompt v2 ; à ajuster avec des Phone Call réels anonymisés et validés.

## Limites de sécurité du prototype

- Jetons statiques de passerelle (révocables) au lieu du SSO de l'entreprise.
- Le serveur local est protégé contre les autres sites web et les autres utilisateurs du réseau, mais pas contre un logiciel malveillant qui s'exécuterait déjà sous la session de l'utilisateur (hors périmètre de toute application de bureau).
- Pas de rotation automatique de la clé de l'historique.
