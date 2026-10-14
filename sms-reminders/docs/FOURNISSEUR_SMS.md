# Configurer le fournisseur SMS

Aucun fournisseur ni identifiant n'a été communiqué. L'application fonctionne donc en
**mode simulation** : le moteur exécute toutes les étapes (contrôles, rendu du template, choix de
l'expéditeur…) mais rien ne quitte le serveur. Ces SMS ont le statut « Simulé — non envoyé ».

## 1. Choisir le fournisseur — `SMR_SMS_PROVIDER`

| Valeur | Effet |
|---|---|
| `simulation` | défaut ; aucun envoi réel, bandeau « MODE SIMULATION » sur toutes les pages |
| `twilio` | envoi réel via l'API Twilio Programmable Messaging |
| `disabled` | aucun fournisseur : tous les envois sont bloqués (« aucun fournisseur SMS configuré ») |

Les envois réels restent en plus bloqués tant que l'administrateur n'a pas coché la validation
de conformité (*Paramètres → Conformité*).

## 2. Twilio

> L'adaptateur suit le contrat public de l'API Twilio et est testé contre un serveur simulé.
> **Il n'a jamais été testé avec un vrai compte.** Faire la recette décrite au § 5 avant usage.

Variables (fournies par l'administrateur du compte Twilio, stockées dans le gestionnaire de
secrets, jamais dans le dépôt) :

```
SMR_SMS_PROVIDER=twilio
SMR_TWILIO_ACCOUNT_SID=AC...
SMR_TWILIO_AUTH_TOKEN=...
SMR_TWILIO_VALIDATE_SIGNATURE=true
SMR_PUBLIC_BASE_URL=https://relances.exemple.interne     # URL HTTPS joignable par Twilio
```

- Envoi : `POST /2010-04-01/Accounts/{SID}/Messages.json` avec `To`, `Body` et `From` (ou
  `MessagingServiceSid` si l'expéditeur commence par `MG`).
- Accusés de livraison : `StatusCallback` = `SMR_PUBLIC_BASE_URL/webhooks/sms/twilio/status` ;
  signature `X-Twilio-Signature` vérifiée, compte vérifié. Statuts affichés : En file, Transmis
  à l'opérateur, Remis, Non remis, Échec.
- Erreurs : 429 / 5xx / réseau → nouvelle tentative (dans la fenêtre de validité) ; délai
  dépassé → « À vérifier » (la requête a pu être reçue) ; codes définitifs (21211 numéro
  invalide, 21610 désinscrit…) → « Erreur » ; 21610 ajoute le numéro à la liste d'opposition.

## 3. Numéros d'expédition (dans l'application)

*Paramètres → Numéros d'expédition* (administrateur) : un expéditeur pour **Movers**, un pour
**Takeovers**. Valeurs possibles selon le fournisseur et le contrat : numéro au format
international (`+33…`), identifiant alphanumérique (11 caractères maximum, il ne permet pas de
réponse), identifiant de service de messagerie (`MG…`).

Il n'existe aucun expéditeur par défaut : un rendez-vous sans service, ou un service sans
expéditeur, ne peut rien envoyer (« numéro d'expédition … non configuré »).

## 4. Ajouter un autre fournisseur

Créer une classe dans `sms_reminders/providers/` qui implémente `SmsProvider`
(`providers/base.py`) :

- `send(OutboundSms) -> SendResult` : `ok`, `provider_message_id`, `error_code`,
  `transient` (nouvelle tentative possible), `opted_out`, `uncertain` (la requête a pu aboutir :
  ne jamais renvoyer) ;
- `parse_status_callback(url, params, headers)` : vérifier l'authenticité (lever
  `PermissionError` sinon) et renvoyer un `DeliveryUpdate`.

L'enregistrer dans `providers/__init__.py:build_provider` et dans le validateur de
`config.Settings.sms_provider`. Le moteur, l'interface et les tests ne changent pas.

## 5. Recette avant production

1. Comptes de test et numéros de mobiles de l'équipe uniquement.
2. Configurer expéditeurs, templates et fournisseur sur un environnement `staging`.
3. Créer un rendez-vous à T+48 h 05 min pour chaque service ; vérifier l'envoi, l'expéditeur, le
   texte, l'accusé de livraison, puis confirmer avant J-1 et vérifier l'annulation.
4. Tester une erreur (numéro invalide) et une désinscription (STOP selon le fournisseur).
5. Arrêter le worker pendant une échéance et vérifier le passage en « Expiré ».
