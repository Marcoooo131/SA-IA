# Procédure de dépannage

Les journaux sont en JSON et ne contiennent que des identifiants (`call_id`, `recording_sid`).
Pour un appel donné : interface → fiche de l'appel → « Incidents de traitement », ou table
`processing_errors` (étape, tentative, code).

## Symptômes et causes

| Symptôme | Cause probable | Vérification / action |
|---|---|---|
| Aucun appel n'arrive | Callback Twilio non configuré, URL injoignable, proxy | Console Twilio → *Debugger* / *Error logs* (erreurs 11200, 15003…) ; `curl https://<hôte>/healthz` depuis l'extérieur |
| Webhooks rejetés en **403** | `PCA_PUBLIC_BASE_URL` différent de l'URL appelée par Twilio (schéma, hôte, port, chemin) ; mauvais Auth Token ; compte hors liste blanche | Journal « rejected webhook: invalid signature » ou « account not allowed ». Corriger l'URL publique (comparer avec la console Twilio), vérifier `PCA_TWILIO_AUTH_TOKEN` (le token **principal** du compte qui signe) et `PCA_TWILIO_ALLOWED_ACCOUNT_SIDS` |
| Webhooks rejetés en **400** | Paramètres inattendus (autre type de callback branché sur l'URL) | Vérifier que seul le *Recording Status Callback* pointe vers `/twilio/recording-status` |
| Appels bloqués en `received` | Aucun worker, Redis indisponible | `docker compose ps`, `redis-cli ping`, journaux du worker ; `cli maintenance` relance les appels bloqués |
| `recording_not_ready` répété | Enregistrement encore en traitement chez Twilio | Normal pendant quelques secondes ; sinon vérifier le statut dans la console |
| `recording_unavailable` / `recording_absent` | Enregistrement supprimé, stocké en externe, `absent` | Console Twilio → Recordings ; vérifier le stockage externe (T3) |
| `twilio_auth` | Clé API révoquée ou sans droit, mauvais compte | Recréer la clé API restreinte ; vérifier `PCA_TWILIO_ACCOUNT_SID` |
| `bad_content_type`, `corrupted_audio` | Réponse non audio (page d'erreur), format inattendu | Vérifier `PCA_TWILIO_MEDIA_FORMAT` ; récupérer l'enregistrement manuellement depuis la console pour contrôle |
| `audio_too_large` / `audio_too_long` | Appel très long | Ajuster `PCA_AUDIO_MAX_BYTES` / `PCA_AUDIO_MAX_DURATION_SECONDS` |
| `transcription_failed` répété | Fournisseur indisponible, modèle non chargé | Journaux du worker ; tester le fournisseur seul |
| `ai_schema` / `ai_not_json` | Réponse IA non conforme | Vérifier la version du SDK et du modèle ; relancer avec « Régénérer » ; si persistant, ouvrir un ticket avec la version du prompt |
| `ai_auth`, `ai_permission` | Clé Anthropic invalide / révoquée | Gestionnaire de secrets ; console Anthropic |
| `ai_rate_limited` | Quota atteint | Les tâches sont réessayées (jusqu'à 30 min) ; demander une hausse de quota |
| `ai_refusal` | Refus du modèle (après repli serveur) | Traiter l'appel manuellement ; signaler le cas |
| Nombreux signaux `unsupported_number` | Chiffres mal transcrits ou reformulés | Comparer avec la transcription ; si c'est le prompt, l'ajuster et réévaluer |
| CRM : `crm_pending` prolongé | CRM indisponible ou écriture non vérifiée | Fiche de l'appel → statut d'écriture ; « Relancer l'écriture CRM » ; à défaut copier le texte manuellement |
| Texte illisible / erreur « cannot be decrypted » | `PCA_DATA_ENCRYPTION_KEY` changée ou perdue | Restaurer la clé depuis le gestionnaire de secrets |

## Commandes utiles

```bash
python -m phonecall_agent.cli maintenance          # purge + relance des appels bloqués (une fois)
rq info --url "$PCA_REDIS_URL"                      # état de la file
rq requeue --all --queue phonecall --url "$PCA_REDIS_URL"   # relancer les tâches en échec
curl -H "Authorization: Bearer $PCA_METRICS_TOKEN" https://<hôte>/metrics
```

## Rejouer un appel

Les webhooks étant idempotents, renvoyer un callback n'a pas d'effet. Pour retraiter un appel en
échec, un administrateur peut : remettre son statut à `received` en base (après analyse), puis
lancer `cli maintenance`. Un superviseur peut régénérer le compte rendu d'un appel déjà transcrit
depuis l'interface (« Régénérer »).

## Rotation de la clé de chiffrement

Fernet prend en charge plusieurs clés (`MultiFernet`). Procédure à implémenter avant la
production : ajouter la nouvelle clé en tête, rechiffrer les lignes actives, retirer l'ancienne clé.

## Escalade

1. Incident de sécurité (fuite de secret, accès anormal dans le journal d'audit) : révoquer
   immédiatement la clé Twilio / Anthropic concernée, prévenir le RSSI et le DPO.
2. Compte rendu erroné enregistré dans le CRM : le corriger dans le CRM, rejeter la version dans
   l'interface, signaler le cas pour enrichir le jeu d'évaluation.
