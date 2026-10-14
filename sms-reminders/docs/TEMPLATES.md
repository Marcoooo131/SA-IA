# Ajouter et activer les templates SMS

Six emplacements existent dès l'installation, tous au statut **« Template non configuré »** :
tant qu'un emplacement n'a pas de version active valide, les SMS correspondants sont bloqués.

| Service | Étapes |
|---|---|
| Movers | SMS à 48 h · 1er SMS à 24 h · 2e SMS à 24 h |
| Takeovers | SMS à 48 h · 1er SMS à 24 h · 2e SMS à 24 h |

## Procédure (administrateur)

1. *Paramètres et templates → Templates SMS → Modifier* sur l'emplacement.
2. Saisir le texte, puis **Enregistrer une nouvelle version**. La version est créée **inactive**.
3. Relire l'**aperçu** : texte personnalisé (avec des données d'exemple, ou un vrai rendez-vous à
   venir du même service), nombre de caractères, encodage, **segments estimés**, variables sans
   valeur, caractères hors alphabet GSM.
4. Cocher « J'ai relu l'aperçu et ce texte est validé », puis **Activer la version**.

L'activation est refusée si : texte vide, variable inconnue, accolades mal fermées, ou message
estimé au-delà du nombre maximal de segments (3 par défaut, paramétrable).

## Variables

| Variable | Valeur |
|---|---|
| `{{prenom}}` | prénom du client |
| `{{nom}}` | nom du client |
| `{{numero_client}}` | numéro client interne — **facultatif** : n'apparaît que si le texte le contient |
| `{{date_rendez_vous}}` | `17/10/2026` |
| `{{heure_rendez_vous}}` | `14h30` |
| `{{service}}` | `Movers` ou `Takeovers` |

Si une variable utilisée n'a pas de valeur pour un client (prénom manquant…), l'envoi est
**bloqué** pour ce client (jamais de SMS avec un trou ou un `{{…}}` visible).

## Versions et historique

- Une version n'est **jamais modifiée** : chaque enregistrement crée une nouvelle version.
- Chaque SMS conserve la version utilisée, le texte exact envoyé et l'expéditeur
  (fiche rendez-vous → *Relances SMS → Texte*).
- La version utilisée est celle **active au moment de l'envoi**.
- *Désactiver* bloque immédiatement les envois de l'emplacement.

## Taille des messages

- Alphabet GSM-7 : 160 caractères pour 1 SMS, 153 par segment au-delà. `€ [ ] { } ^ ~ | \`
  comptent double.
- Un seul caractère hors GSM-7 (`ê`, `À`, `’` typographique, emoji…) fait passer
  tout le message en UCS-2 : 70 caractères pour 1 SMS, 67 par segment. L'aperçu les signale.
- L'estimation est indicative ; la facturation dépend du fournisseur.

## Contenu

Les rappels de rendez-vous doivent rester **strictement opérationnels** (pas d'offre commerciale)
et identifier clairement l'expéditeur. Faire valider les textes avant activation — voir
[CONFORMITE.md](CONFORMITE.md).
