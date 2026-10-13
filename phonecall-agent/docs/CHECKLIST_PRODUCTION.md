# Checklist de mise en production

Ne cocher qu'avec une preuve (document, ticket, résultat de test). **Aucun enregistrement réel ne
doit être traité tant que la section A n'est pas entièrement validée.**

## A. Autorisations (bloquant)
- [ ] D1 — AIPD réalisée et validée par le DPO ; base légale et information des clients sur l'usage des enregistrements.
- [ ] Sous-traitants validés (transcription, LLM, hébergeur) : DPA signés, localisation, durée de conservation et options de non-réutilisation chez chaque fournisseur.
- [ ] D6 — Politique de conservation validée et reportée dans `retention` (fichier métier) ; D7 décidée.
- [ ] Validation de la sécurité par le RSSI (revue de code, test d'intrusion du webhook et de l'interface).
- [ ] Responsables relation client : catégories, règles métier, exemples anonymisés, mentions interdites (M1–M4) ; `validated: true` dans la configuration métier.

## B. Twilio
- [ ] Clé API restreinte créée ; Auth Token et clé stockés dans le gestionnaire de secrets.
- [ ] *Enforce HTTP Auth on Media URLs* activé.
- [ ] Callback configuré en HTTPS sur l'URL publique exacte ; `PCA_PUBLIC_BASE_URL` identique.
- [ ] Double canal activé (si décidé) et correspondance canal ↔ rôle implémentée dans la transcription.
- [ ] Essai de bout en bout avec un enregistrement **synthétique** sur le compte réel.

## C. CRM
- [ ] Interface officielle documentée et autorisée (C1–C8) — sinon rester en mode copie manuelle.
- [ ] Connecteur écrit à partir de la documentation officielle, compte de service à droits minimaux.
- [ ] Tests de contrat (`tests/test_crm.py`) passés sur l'environnement de **recette** du CRM : création, mise à jour sans doublon, relecture, panne, délai dépassé.
- [ ] `PCA_CRM_AUTO_PUSH_READY=false` tant que le pilote n'a pas conclu autrement.

## D. Qualité
- [ ] Fournisseur de transcription choisi sur mesures (taux d'erreur sur 50+ appels anonymisés, chiffres et noms propres inclus).
- [ ] Jeu d'évaluation métier passé (`docs/EVALUATION.md`) : zéro erreur critique sur le jeu de référence, seuils de qualité atteints.
- [ ] `PROMPT_VERSION` figée ; versions du modèle et du SDK figées.
- [ ] `quality.always_human_review: true` pour le pilote.

## E. Sécurité et exploitation
- [ ] `PCA_ENVIRONMENT=production` (refus automatique des configurations dangereuses).
- [ ] Secrets injectés par le gestionnaire de secrets ; aucun `.env` sur les serveurs ; rotation planifiée.
- [ ] TLS sur le proxy ; interface accessible uniquement depuis le réseau interne / VPN ; `/twilio/*` seul exposé à Internet.
- [ ] SSO OIDC de l'entreprise à la place des comptes locaux ; rôles mappés sur les groupes.
- [ ] Base PostgreSQL et volumes chiffrés ; sauvegardes chiffrées testées (restauration).
- [ ] Migrations de schéma versionnées (Alembic) à la place de `init_db()`.
- [ ] Clé de chiffrement sauvegardée ; procédure de rotation (`MultiFernet`) écrite et testée.
- [ ] Image Docker construite, scannée (vulnérabilités), exécutée en utilisateur non root, système de fichiers en lecture seule.
- [ ] Supervision : `/healthz`, `/readyz`, `/metrics` collectés ; alertes sur taux d'échec, file en attente, rejets 403 du webhook, appels bloqués, coût journalier.
- [ ] Journaux centralisés, sans contenu de conversation (vérifié sur un échantillon).
- [ ] Limitation de débit sur `/login` et `/twilio/*` au niveau du proxy.
- [ ] Procédure de dépannage (`docs/DEPANNAGE.md`) connue de l'astreinte ; mode dégradé = copie manuelle.

## F. Pilote (phase 6)
- [ ] 5–10 conseillers volontaires formés ; consignes de relecture écrites.
- [ ] Objectifs mesurés : taux de correction, part de textes réécrits, erreurs critiques, temps gagné, coût par appel.
- [ ] Revue hebdomadaire des rejets et des corrections ; enrichissement du jeu d'évaluation.
- [ ] Décision formelle de passage à la phase 7 (montée en charge).
