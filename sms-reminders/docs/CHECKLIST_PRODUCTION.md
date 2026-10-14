# Check-list avant mise en production

## À fournir

| # | Élément | Où le renseigner | Effet tant qu'il manque |
|---|---|---|---|
| 1 | Choix du fournisseur SMS et identifiants (Twilio : Account SID + Auth Token, ou autre fournisseur à intégrer) | variables `SMR_SMS_PROVIDER`, `SMR_TWILIO_*` | mode simulation : aucun SMS réel |
| 2 | Expéditeur **Movers** | *Paramètres → Numéros d'expédition* | SMS Movers bloqués |
| 3 | Expéditeur **Takeovers** | idem | SMS Takeovers bloqués |
| 4 | Six textes de templates validés | *Paramètres → Templates* | SMS de l'étape bloqués (« Template non configuré ») |
| 5 | Validation juridique / DPO (voir [CONFORMITE.md](CONFORMITE.md)) | *Paramètres → Conformité* | envois réels bloqués |
| 6 | URL publique HTTPS de l'application | `SMR_PUBLIC_BASE_URL` | pas d'accusés de livraison |
| 7 | Hébergement (serveur, PostgreSQL, sauvegardes, proxy HTTPS, synchronisation NTP) | [INSTALLATION.md](INSTALLATION.md) | — |
| 8 | Comptes utilisateurs et rôles (ou SSO d'entreprise) | `SMR_UI_USERS` | — |
| 9 | Accès CRM (API officielle ou export automatisé), si souhaité | nouveau `CrmConnector` (`sms_reminders/crm`) | imports CSV / Excel manuels |
| 10 | Format réel des exports CRM (intitulés de colonnes, présence d'un identifiant de rendez-vous) | correspondance proposée à l'import | correspondance manuelle à chaque import |

## Décisions métier à confirmer (valeurs par défaut actuelles)

| Décision | Défaut | Paramètre |
|---|---|---|
| Fenêtre de validité de chaque SMS (au-delà : expiré, jamais envoyé en retard) | 60 min | `grace_minutes_*` |
| Rendez-vous importé après une échéance | pas d'envoi rétroactif | `late_policy` |
| Point de départ du 2e SMS J-1 | heure prévue du 1er + 3 h | `j1_second_anchor` |
| Délai minimal avant le rendez-vous | 60 min | `min_minutes_before_appointment` |
| Nouvelles tentatives en cas d'erreur temporaire | 3 (2, 10, 30 min) | `max_attempts`, `retry_delays_minutes` |
| Plage horaire sans envoi | désactivée | `quiet_hours_*` |
| Anti-doublon (même étape déjà envoyée) | 24 h | `duplicate_window_hours` |
| Intervalle minimal avant une relance manuelle | 60 min | `manual_min_interval_minutes` |
| Taille maximale d'un SMS | 3 segments | `max_segments` |
| Conservation des données | 180 jours après le rendez-vous | `retention_days` |
| Rendez-vous déplacé : renvoyer les relances pour la nouvelle date | oui (sauf même étape envoyée < 24 h) | — |
| Taux de confirmation : période et dénominateur | rendez-vous non annulés des 30 derniers jours (7/30/90 au choix) | tableau de bord |

## Travaux techniques restants

- [ ] Recette avec le vrai fournisseur ([FOURNISSEUR_SMS.md](FOURNISSEUR_SMS.md) § 5).
- [ ] Outil de migration de schéma (Alembic) avant la première évolution de la base en production.
- [ ] SSO d'entreprise (OIDC) à la place des comptes locaux.
- [ ] Supervision : alerte si le worker ne tourne plus (aucun passage depuis N minutes) ou si des
      SMS « À vérifier » / « Bloqué » / « Erreur » apparaissent.
- [ ] Traitement des réponses SMS (STOP, confirmations) si le fournisseur et l'expéditeur le
      permettent — non implémenté ; aucune réponse n'est interprétée aujourd'hui.
- [ ] Connecteur CRM une fois l'interface officielle connue.
- [ ] Inscription au registre des traitements, contrats de sous-traitance, information des clients.
