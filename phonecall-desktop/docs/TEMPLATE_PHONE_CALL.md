# Template générale Phone Call

Le compte rendu d'appel suit une **template générale unique**, inspirée des templates métier
Movers, Frontline et Appel sortant. Elle est **centralisée dans un fichier de configuration** :
`phone_call_template.yaml`. Modifier ce fichier suffit pour ajouter, retirer, renommer ou réordonner
des champs ; l'application, la note sans IA, la note rédigée par Claude et la vérification
automatique en dépendent toutes.

| Où | Rôle |
|---|---|
| `phonecall_desktop/notes/template/phone_call_template.yaml` | version de référence (dans le code) |
| `phone_call_template.yaml` à côté de `PhoneCallDesktop.exe` | copie modifiable livrée dans le zip (prioritaire) |
| `PCD_NOTE_TEMPLATE=chemin` dans `config.env` | autre fichier, si besoin |

## Structure

1. Identification de l'appel : type d'appel (entrant / sortant, Movers / Frontline / autre),
   service concerné, interlocuteur et rôle, nom et prénom, numéro de téléphone, agent, date et heure,
   objet ; *appel sortant* : interlocuteur visé, objectif.
2. Motif de l'appel : demande du client.
3. Situation du client : situation actuelle, historique utile, contraintes signalées ; *Movers* :
   adresse ou nouvelle adresse, date de déménagement, matériel sur place, audit, numéro WO,
   situation contractuelle ou résiliation.
4. Échanges et informations communiquées : informations communiquées, explications, questions et
   objections, réponses fournies.
5. Actions et solutions apportées : actions réellement effectuées, solutions proposées ; *Movers* :
   offre commerciale.
6. Résultat de l'appel : décision du client, résultat.
7. Suivi et prochaines étapes : rendez-vous, actions restantes avec leur responsable, échéance ou
   rappel, documents attendus, état du dossier ; *Movers* : contact repreneur ou tiers.
8. Informations complémentaires.

Les champs *en italique* sont **conditionnels** (`when:` dans le fichier) : ils n'apparaissent que
pour leur type d'appel. Les champs communs sont identiques pour tous les types. Le type est choisi
par le conseiller avant l'appel (listes « Sens » et « Type ») ou détecté automatiquement — il est
alors marqué « À confirmer ».

## Règle de complétude

Chaque champ affiché reçoit une valeur, avec un statut explicite :

| Statut | Affichage |
|---|---|
| information dite dans l'appel, ou donnée par le poste | la valeur (citations « » en mode sans IA) |
| absente | exactement **« Aucune information notifiée »** |
| évoquée mais incertaine | « À confirmer — raison : valeur » |
| contradictoire | « Contradiction à vérifier » suivie de chaque version, sans choisir |
| réellement non applicable | « Non applicable — raison » |

Sources : la conversation, et les **métadonnées du poste**, seule autre source autorisée et toujours
signalée comme telle : date et heure (horloge du poste), agent (`PCD_AGENT_NAME` dans `config.env`),
type d'appel choisi par le conseiller, durée. Le nom, le numéro, l'agent et les références (WO)
seulement entendus dans la conversation sont « À confirmer ». La date de l'appel n'est jamais prise
dans la conversation.

## Remplissage

| Mode (`PCD_NOTES_CLIENT`) | Comment les champs sont remplis |
|---|---|
| `local` (par défaut) — sans IA | règles du fichier (`rule:`) : phrases recopiées mot pour mot et classées par marqueurs (« je voudrais », « j'ai envoyé », « je vais »...), extracteurs dédiés (téléphone, adresse, WO, dates, décision, actions et responsables) |
| `anthropic` — Claude | le prompt et le schéma de sortie structurée sont générés depuis le fichier (`help:` de chaque champ) ; Claude remplit chaque champ avec un statut et les segments qui le justifient |

| Copilot Chat (Microsoft 365) — boutons sous la note, dans tous les modes | la demande (consignes + template à remplir + transcription) est copiée, Copilot Chat s'ouvre avec le compte professionnel ; la réponse recollée devient la note après vérification. Gratuit, mais par copier-coller : Copilot Chat n'a pas d'accès programmatique officiel, et piloter sa page serait un contournement |

## Vérification automatique (avant affichage)

- tous les champs affichés sont renseignés (sinon « Aucune information notifiée » + alerte) ;
- les formulations vagues (« non précisé », « N/A »...) sont remplacées par « Aucune information notifiée » ;
- chaque citation figure dans la transcription ; chaque nombre (date, montant, numéro) figure dans la
  transcription ou dans les métadonnées du poste, sinon alerte bloquante ;
- nom, numéro et WO venant seulement de la conversation passent en « À confirmer » ; une date d'appel
  qui ne vient pas du poste est retirée ;
- « Actions réellement effectuées » ne doit pas contenir de proposition ou d'action future ;
- alerte si aucune prochaine étape n'est identifiée ;
- mode Claude : les segments cités comme preuve doivent exister ;
- réponse de Copilot : mise en forme Markdown retirée, intitulés attendus présents, données du poste
  (date, agent, type choisi) rétablies si Copilot les a modifiées, mêmes contrôles de chiffres,
  de citations et d'actions effectuées.

Les points « À confirmer » et les contradictions sont listés sous la note.

## Transcription et note

La transcription brute et la note restent **séparées** pendant la session (deux panneaux) ; la note
ne remplace jamais la transcription. Avec l'historique activé, chacune est conservée selon la
politique configurée (`PCD_HISTORY_STORE_TRANSCRIPT`, `PCD_HISTORY_RETENTION_DAYS`).

## Modifier un champ (exemple)

```yaml
      - id: numero_contrat          # identifiant unique
        label: Numéro de contrat    # intitulé dans la note
        when: [movers]              # optionnel : seulement pour ce type
        help: "Numéro de contrat cité par le client."   # consigne pour Claude
        rule: {quotes: {speaker: any, max: 1, markers: [numéro de contrat, contrat numéro]}}
```

Après modification : relancer l'application, faire un essai avec `Mode demonstration.bat`, puis
faire valider la template par le métier.

## Tests

`tests/test_phone_call_template.py` (appel Movers, Frontline, sortant, sans information suffisante,
avec contradictions, avec plusieurs actions de suivi ; vérification automatique ; template
personnalisée) et `tests/test_direct_note.py` (mode Claude avec un client factice).
