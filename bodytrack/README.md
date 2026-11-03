# BODYTRACK – coaching musculation & nutrition

Application web progressive (PWA) installable sur smartphone : séances en direct, records, nutrition,
simulateur de poids, suivi physique, coach analytique et bilans. **Local d'abord** : tout fonctionne
hors connexion, avec synchronisation Supabase optionnelle.

En ligne (GitHub Pages) : `…/SA-IA/bodytrack/`

## Démarrer

```bash
cd bodytrack
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires des calculs (Vitest)
npm run test:db    # migration + tests de sécurité RLS sur un PostgreSQL jetable
npm run build      # build de production + service worker
```

Au premier lancement : **Créer mon profil** (calculateur métabolique) ou **Explorer la démo**
(12 semaines de données fictives, stockées à part et supprimées en quittant la démo).

## Fonctionnalités

| Module | Contenu |
|---|---|
| Accueil | Profil physique (poids, moyenne 7 j, variation 30 j), activité de la semaine, jauges nutritionnelles, records récents, « Ton bilan du jour » calculé, aperçu du coach |
| Entraînement | Programmes (création, modification, duplication, modèles PPL / Upper-Lower / Full Body / split), planification par jour ou en rotation, **séance en direct** (charges, reps, validation, échauffements, notes, dernière séance affichée et copiable, suggestion de surcharge progressive à valider), **chrono de repos** (pause, reprise, ±15 s, ignorer, son, vibration, notification), résumé et comparaison, historique modifiable, records, volume par muscle (directes / secondaires) |
| Exercices | Bibliothèque de 49 exercices (10 groupes musculaires, consignes), exercices personnalisés, page statistique par exercice (meilleure charge, reps, 1RM estimé, volume, progression 7 j → 1 an, graphiques) |
| Nutrition | Journal (4 repas), base de 60 aliments (Ciqual / USDA), aliments personnalisés, Open Food Facts (recherche, code-barres, scan caméra si disponible), favoris, duplication, réutilisation, calculateur Mifflin-St Jeor / TDEE, macros, saisie manuelle, recalage sur la dépense observée, tendances, **simulateur** (modèle dynamique + fourchette, 4 scénarios) |
| Progression | Poids (moyennes 7 / 30 j), mensurations, photos privées avec comparaison, journal physique, objectifs (poids, force, reps, régularité, nutrition, mensurations), récompenses, séries de jours bienveillantes, calendrier, bilans hebdomadaire et mensuel (export PDF), score de régularité expliqué |
| Profil | Données personnelles, préférences, notifications, compte et synchronisation, export JSON / CSV, restauration, suppression du compte et des données |

## Calculs (tous dans `src/lib/calc` et `src/lib/analytics`, testés)

- **Métabolisme de base** : Mifflin-St Jeor ; **TDEE** = BMR × facteur d'activité (1,2 à 1,9).
- **Objectifs** : surplus borné à +100…+500 kcal, déficit à −200…−750 kcal, jamais sous le BMR ni 1 500 / 1 200 kcal.
  Protéines et lipides en g/kg, glucides = reste. Historique des objectifs conservé (chaque jour est comparé à l'objectif en vigueur).
- **Dépense observée** : apport moyen − pente du poids × 7 700 kcal/kg (≥ 18 jours saisis sur 28), appliquée seulement après validation.
- **1RM estimé** : Epley, charge × (1 + reps / 30), présenté comme une estimation.
- **Records** : charge, 1RM estimé, reps à charge ≥, meilleure série, volume de séance — recalculés depuis les séries (pas de doublon).
- **Poids** : moyenne mobile calendaire 7 jours, variations entre moyennes, pente par régression.
- **Simulateur** : dépense(t) = maintien + 10 × facteur d'activité × (poids(t) − poids initial) ; densité énergétique 5 500–7 700 kcal/kg
  et ± 5 % sur le maintien pour la fourchette. Comparaison avec la règle linéaire à titre indicatif.
- **Score de régularité** : 40 séances / 30 journal / 20 protéines / 10 pesées — mesure d'assiduité, pas de qualité physique.

## Données, hors connexion et synchronisation

- Les données sont dans **IndexedDB** (photos compressées en JPEG 1280 px incluses) ; le service worker met en cache l'application.
- Chaque modification entre dans une file d'attente. Connecté et en ligne, la file est envoyée à Supabase (upsert, suppression douce),
  puis les changements distants sont récupérés via `server_updated_at` ; la modification la plus récente l'emporte.
- Sans configuration Supabase, l'application reste entièrement fonctionnelle en mode local (pense à exporter des sauvegardes).

### Activer Supabase

1. Créer un projet Supabase et appliquer `supabase/migrations/20261103000000_bodytrack_init.sql`
   (tables, RLS « chaque utilisateur ne voit que ses lignes », vue `personal_records`, bucket privé `progress-photos`,
   fonction `delete_my_account`).
2. Créer `bodytrack/.env.production` (et `.env.local` pour le développement) :
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=<clé publique anon / publishable>
   ```
   **Jamais la clé `service_role`** : l'application la refuse. Les droits sont imposés par la base.
3. Dans Authentication → URL Configuration, ajouter l'adresse de l'application aux URL de redirection.

Tables : `profiles`, `nutrition_goals`, `exercise_library`, `workout_programs`, `workout_sessions`, `workout_exercises`,
`workout_sets`, `food_library`, `meals`, `meal_items`, `weight_logs`, `body_measurements`, `progress_photos`,
`journal_entries`, `user_goals`, `achievements`, `weekly_reports` ; `users` = `auth.users` ; `personal_records` = vue.

## Limites assumées

- Les calories sont des estimations à partir de valeurs de référence ; les produits Open Food Facts ne sont jamais complétés par
  des valeurs inventées (un produit incomplet doit être complété depuis l'étiquette).
- Le coach décrit des tendances et propose des ajustements à valider ; il ne pose aucun diagnostic (blessure, surentraînement).
- Les rappels quotidiens programmés nécessiteraient un serveur de notifications push ; seule la notification de fin de repos est proposée.
