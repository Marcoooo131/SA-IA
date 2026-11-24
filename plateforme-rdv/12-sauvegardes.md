# 12 — Sauvegardes et restauration (étape 3.2, palier 0)

## Ce qui est en place

| | |
|---|---|
| Quoi | Un **instantané complet** de toutes les tables de l'application (sauf sessions, jetons de connexion et journal des migrations) |
| Quand | Chaque nuit à **2 h 17 UTC** (3 h 17 ou 4 h 17 à Paris), tâche `venio-sauvegarde-quotidienne` (pg_cron) |
| Où | Schéma `backup` de la base Supabase, **inaccessible à l'application** (rôle `venio_app`) et non exposé par l'API Supabase |
| Combien de temps | **7 jours** (3 jours seulement si la base dépasse 400 Mo, pour rester sous la limite gratuite de 500 Mo) |
| Coût | 0 € |
| Testé | Oui, automatiquement (`backend/tests/test_backup.py`) : suppression d'une entreprise puis restauration complète, comptes identiques, compteurs remis à niveau, application interdite d'accès |

## Ce que ça protège, et ce que ça ne protège pas

- ✅ Suppression accidentelle (une entreprise, des rendez-vous), migration ou bogue qui abîme des données, erreur de manipulation.
- ❌ **Perte du projet Supabase lui-même** (compte supprimé, incident majeur chez Supabase) : les instantanés sont dans la même base.
- ❌ Les **fichiers** (photos des prospects) du stockage Supabase ne sont pas copiés.

**Palier 1 (dès 10 clients payants)** : passer à Supabase Pro (sauvegardes quotidiennes gérées par Supabase, 7 jours)
et ajouter une copie externe chiffrée hebdomadaire. Décision déjà prévue au document 09.

## Vérifier que les sauvegardes tournent

Dans Supabase → SQL Editor :

```sql
SELECT label, taken_at, tables, total_rows FROM backup.snapshot ORDER BY taken_at DESC;
SELECT jobname, schedule FROM cron.job;
SELECT status, start_time, return_message FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

Il doit y avoir un instantané par jour, et le dernier doit dater de moins de 24 heures.

## Faire un instantané manuel (avant une opération risquée)

```sql
SELECT backup.take_snapshot(7);   -- renvoie le nom de l'instantané, à noter
```

## Restaurer (procédure d'incident)

**Attention : la restauration remplace TOUTES les données par celles de l'instantané.** Tout ce qui a été créé
depuis (rendez-vous, demandes) est perdu, et tout le monde est déconnecté.

1. **Prévenir** les entreprises clientes si le service doit être interrompu.
2. **Faire un instantané de l'état actuel**, même abîmé, pour pouvoir revenir en arrière :
   `SELECT backup.take_snapshot(7);`
3. **Choisir l'instantané** à restaurer : `SELECT label, taken_at FROM backup.snapshot ORDER BY taken_at DESC;`
4. **Restaurer** (une seule transaction, tout ou rien) : `SELECT backup.restore_snapshot('s20261125_021700_123456');`
   La fonction renvoie le nombre de lignes restaurées, qui doit égaler `total_rows` de l'instantané.
5. **Vérifier** : se connecter à l'espace d'une entreprise, ouvrir le tableau de bord et une demande.
6. **Consigner l'incident** (date, cause, instantané utilisé, données perdues) dans le registre des violations si
   des données personnelles ont été perdues ou exposées (voir le document 08 et le registre RGPD).

Durée mesurée en test local : moins d'une seconde pour une base de démonstration. Sur la base de production (14 Mo
au 24/11/2026), à mesurer lors du premier exercice.

## Exercice mensuel

Une fois par mois, sur une **copie** (jamais sur la production) : à faire au palier 1, quand une base de test séparée
existera. Au palier 0, le test automatique (`test_backup.py`) joue ce rôle à chaque modification du code.
