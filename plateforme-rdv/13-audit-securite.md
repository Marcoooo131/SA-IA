# 13 — Audit de sécurité automatisé (étape 3.9, palier 0) — 24/11/2026

> Audit réalisé avec des outils gratuits reconnus, sur le code de la branche et la base de production. Il ne remplace
> pas un test d'intrusion par un professionnel (prévu au palier 2) : les failles de logique propres à l'application
> ne sont pas toutes détectables automatiquement.

## Résultats

| Contrôle | Outil | Résultat | Suite donnée |
|---|---|---|---|
| Dépendances Python | pip-audit | **14 alertes sur Starlette 0.46.2** (blocage du serveur par un gros envoi de fichier, déni de service via l'en-tête Range, reconstruction d'URL) | **Corrigé** : FastAPI 0.165 / Starlette 1.10 ; 0 vulnérabilité connue ; 117 tests au vert |
| Code Python | bandit | 14 alertes « injection SQL possible » (B608), 2 faibles | **Faux positifs vérifiés un par un** : seuls des noms de colonnes figés dans le code sont insérés ; toutes les valeurs sont des paramètres liés |
| Dépendances web | npm audit | PostCSS (embarqué par Next.js) : 1 élevée, 1 modérée | **Risque accepté** : PostCSS ne traite qu'au moment de la construction les feuilles de style du site, jamais un contenu fourni par un utilisateur. Correctif = Next.js 16 (changement majeur) → planifié |
| Base Supabase | conseiller de sécurité | Extensions dans le schéma public (citext, btree_gist, pg_net) ; journal des migrations sans politique | Vérifié : **aucun droit** des rôles anonymes sur les tables, aucune fonction privilégiée appelable par eux ; **droit d'exécution de pg_net retiré** aux rôles anonymes (migration 0010) ; extensions laissées en place (les déplacer casserait le type des emails) |
| Cloisonnement des entreprises | test automatique `test_rls_coverage.py` (nouveau) | 4 tables sans RLS | Toutes documentées depuis leur création comme tables techniques **sans donnée personnelle** ; inscrites comme exceptions nommées. Le test échouera si une future table est oubliée |
| Sauvegardes | test `test_backup.py` | — | Schéma `backup` inaccessible à l'application, vérifié |

## Mesures déjà en place (rappel)

Mots de passe Argon2 · jetons de session et de réinitialisation stockés hachés · cookie HttpOnly, Secure, SameSite ·
limites de débit (connexion, inscription, mot de passe oublié, démo) · RLS forcée par entreprise avec rôle applicatif
sans contournement · en-têtes de sécurité (nosniff, DENY, no-store sur l'API) · photos ré-encodées sans métadonnées ·
webhooks signés et idempotents · journal des consultations de dossiers, ouvertures de fichiers, exports, suppressions.

## À refaire

À chaque ajout de dépendance et au moins une fois par mois : `pip-audit`, `npm audit --omit=dev`, conseiller de
sécurité Supabase. Test d'intrusion par un professionnel au palier 2 (≈ 30 à 50 clients).
