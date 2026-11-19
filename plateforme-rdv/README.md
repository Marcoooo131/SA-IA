# Plateforme SaaS de prise de rendez-vous qualifiés — Dossier de conception (Phase 1)

> **Statut : conception à valider, aucun développement produit lancé.**
> Ce dossier répond à la « Partie 17 — Première mission » du cahier des charges.
> Les chiffres concurrentiels sont issus de sources tierces datées de 2026 (liens dans chaque document) :
> ils doivent être revérifiés sur les pages officielles avant toute décision tarifaire.
> Aucun chiffre de marché (taille, croissance) n'est avancé faute de source fiable vérifiée.

## Décisions validées (17/11/2026)

- **Nom : Venio.**
- **Moteur généraliste**, adaptable à toute activité ; **lancement commercial avec des modèles prêts pour la rénovation et le déménagement** (et un modèle générique).
- **Répartition : développement par Claude, vente par le fondateur.**
- **Pilotes sur les versions de test** dès qu'elles sont stables.
- Développement : voir [`../venio/`](../venio/README.md) (version pilote 0.1).

## Extension stratégique (18/11/2026) — prioritaire

Trois piliers : **ne plus perdre de prospects** (récupération des appels manqués), **simplifier la prise de rendez-vous**,
**automatiser le suivi**. Conception complète, coûts, limites, webhooks, sécurité, tests et **nouvelle feuille de route** :
[05-extension-acquisition.md](05-extension-acquisition.md) (modules A à E). Elle prime sur les sections du 01–04 qu'elle
met à jour (grille d'offres §11.4, direction artistique, feuille de route §19).

## Sommaire

| # | Point demandé | Document |
|---|---|---|
| 1 | Analyse globale du projet | [01-strategie.md §1](01-strategie.md#1-analyse-globale--ce-que-je-pense-vraiment-du-projet) |
| 2 | Étude concurrentielle | [01-strategie.md §2](01-strategie.md#2-étude-concurrentielle) |
| 3 | Positionnement commercial | [01-strategie.md §3](01-strategie.md#3-positionnement-recommandé) |
| 4 | Secteurs à cibler en premier | [01-strategie.md §4](01-strategie.md#4-secteurs-à-cibler-en-premier) |
| 5 | Innovations différenciantes | [01-strategie.md §5](01-strategie.md#5-innovations-qui-peuvent-nous-différencier) |
| 6 | Fonctionnalités indispensables | [01-strategie.md §6](01-strategie.md#6-fonctionnalités-indispensables-mvp) |
| 7 | Fonctionnalités à reporter | [01-strategie.md §7](01-strategie.md#7-fonctionnalités-à-reporter-et-pourquoi) |
| 8 | Architecture technique détaillée | [02-architecture.md §8](02-architecture.md#8-architecture-technique-détaillée) |
| 9 | Schéma de la base de données | [02-architecture.md §9](02-architecture.md#9-schéma-de-la-base-de-données) + [schema.sql](schema.sql) |
| 10 | Architecture multi-tenant | [02-architecture.md §10](02-architecture.md#10-architecture-multi-tenant) |
| 11 | Fonctionnement des abonnements | [02-architecture.md §11](02-architecture.md#11-fonctionnement-des-abonnements) |
| 12 | Maquettes des interfaces principales | [03-produit-ux.md §12](03-produit-ux.md#12-maquettes-des-interfaces-principales) |
| 13 | Parcours client idéal | [03-produit-ux.md §13](03-produit-ux.md#13-parcours-client-final-idéal) |
| 14 | Parcours d'inscription entreprise | [03-produit-ux.md §14](03-produit-ux.md#14-parcours-dinscription-et-dactivation-dune-entreprise) |
| 15 | Budget technique estimé | [04-business-plan.md §15](04-business-plan.md#15-budget-technique-estimé) |
| 16 | Coûts mensuels récurrents | [04-business-plan.md §16](04-business-plan.md#16-coûts-mensuels-récurrents) |
| 17 | Risques techniques et commerciaux | [04-business-plan.md §17](04-business-plan.md#17-risques-techniques-et-commerciaux) |
| 18 | MVP commercialisable | [04-business-plan.md §18](04-business-plan.md#18-mvp-commercialisable) |
| 19 | Feuille de route jusqu'au lancement | [04-business-plan.md §19](04-business-plan.md#19-feuille-de-route-jusquau-lancement) |
| — | Ressources nécessaires | [04-business-plan.md §20](04-business-plan.md#20-ressources-nécessaires) |
| — | Décisions attendues de votre part | [04-business-plan.md §21](04-business-plan.md#21-décisions-à-valider-avant-de-coder) |
| A | Récupération des appels manqués | [05 §A](05-extension-acquisition.md#a-récupération-automatique-des-appels-manqués) |
| B | Vitrine commerciale et démonstration | [05 §B](05-extension-acquisition.md#b-vitrine-commerciale-et-démonstration) |
| C | Stripe et parcours commercial | [05 §C](05-extension-acquisition.md#c-stripe-et-parcours-commercial) |
| D | Direction artistique et design system | [05 §D](05-extension-acquisition.md#d-direction-artistique-et-design-system) |
| E | Proposition de valeur en trois piliers | [05 §E](05-extension-acquisition.md#e-nouvelle-proposition-de-valeur-trois-piliers) |
| — | Feuille de route mise à jour (18/11/2026) | [05 — Feuille de route](05-extension-acquisition.md#feuille-de-route-mise-à-jour) |
| — | Kit pilotes appels manqués (étape 7) | [06-pilotes.md](06-pilotes.md) |
| — | Liste de contrôle du lancement (étape 8) | [07-lancement.md](07-lancement.md) |
| — | Filtrage des appels, protection des données, quotas SMS, plan 30 jours, simulation économique | [08-securisation-lancement.md](08-securisation-lancement.md) |

## En une page

**Ma recommandation principale : ne pas lancer « une plateforme universelle de prise de rendez-vous ».**
Ce marché est saturé, peu cher (≈ 10 à 16 $ par utilisateur chez Calendly, offres gratuites chez Cal.com,
Setmore, SimplyBook.me) et dominé par des marques installées. Un nouvel entrant y gagne difficilement.

**Ce qui est en revanche mal servi :** le *premier rendez-vous qualifié* des entreprises dont chaque client
vaut cher et dont le rendez-vous nécessite des informations précises — visite technique, devis, estimation.
Aujourd'hui, ces entreprises bricolent un formulaire (Typeform, site web), un calendrier (Calendly ou agenda
papier) et des appels de requalification. Elles perdent des prospects et du temps.

**Positionnement proposé :** *« Le premier rendez-vous qui vaut quelque chose. »* — une plateforme qui
transforme un visiteur en **dossier de projet qualifié + rendez-vous confirmé**, avec photos, besoin structuré,
adresse vérifiée, et rappels qui réduisent les absences.

**Cible de lancement :** artisans et entreprises de rénovation / services à domicile à devis (salle de bain,
cuisine, menuiseries, chauffage/PAC, isolation, déménagement, paysagisme) — 2 à 3 métiers seulement au départ.
Cette cible est cohérente avec les actifs déjà présents dans ce dépôt (prospection ERP BTP, plan 2D/3D,
moteur de rappels SMS).

**Avantage concurrentiel visé (à prouver) :** des parcours de qualification *par métier* prêts à l'emploi,
dont la performance est mesurée sur l'ensemble de nos clients (benchmarks anonymisés), là où un artisan seul
n'a jamais assez de trafic pour optimiser son propre formulaire.

**Tarification à tester :** au forfait par entreprise (pas par utilisateur) — hypothèses 29 / 69 / 149 € HT
par mois, à valider par entretiens avant d'être figées.

**Prochaine étape :** 20 à 30 entretiens d'artisans + 5 « clients pilotes » avant d'écrire le socle SaaS.
