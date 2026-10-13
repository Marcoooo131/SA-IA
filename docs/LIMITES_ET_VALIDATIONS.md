# Limites du prototype et validations métier restantes

Ce document liste ce que le prototype **ne fait pas**, les simplifications retenues et les points à faire
valider avant toute utilisation réelle. Il doit accompagner toute présentation au management.

## 1. Statut du prototype

- Prototype de démonstration **non officiel**, non validé par Sector Alarm, sans intégration à un système interne (CRM, tarification, planification, signature).
- Ce n'est **pas une certification de sécurité** : l'outil aide à préparer l'audit ; le conseiller reste responsable de la proposition.
- La « validation commerciale » (statut *Proposition validée*) est une **action de démonstration** sans effet externe.
- Toutes les données préchargées (clients, adresses, plans, références `DEMO-…`) sont **fictives**.

## 2. Validations métier à obtenir

### Tarifs et offres (responsable commercial)
| Point | État dans le prototype |
|---|---|
| Prix matériel et suppléments mensuels des produits | Valeurs communiquées pour le prototype, **non officielles** |
| Prix individuels de la centrale et du clavier | Centrale 499 € (prix matériel configurable) et **0 €/mois** (règle validée, imposée par le calculateur) ; clavier 149 € sans supplément mensuel |
| Déménagement (reprise d'équipements, transfert d'abonnement) | Remise sur les **frais matériels uniquement** (0 €) ; la **mensualité est conservée** (règle communiquée). Conditions et frais éventuels de déplacement/réinstallation à confirmer |
| Composition et prix des Packs Essentiel et Sérénité | Valeurs communiquées, modifiables dans le catalogue |
| Pack périmétrique (5 détecteurs) : règles d'utilisation | Regroupement automatique quand c'est moins cher (désactivable) – à confirmer commercialement |
| Base HT / TTC et taux de TVA | **Inconnus** → aucune TVA calculée tant qu'elle n'est pas renseignée |
| Frais d'installation | **Inconnus** → « à confirmer » |
| Remises | Une remise d'exemple (10 % sur le matériel supplémentaire), non sélectionnée par défaut, **non validée** |
| Conditions commerciales, durée de validité | Texte provisoire à rédiger par le responsable commercial |
| Références produits officielles | Remplacées par des références fictives `DEMO-…` |

### Règles d'audit (responsable métier / technique)
Toutes les règles sont des **hypothèses de configuration** issues des données de travail :
- 1 centrale par logement/adresse ; 1 clavier, jusqu'à 4 selon les points d'entrée ;
- détecteurs de mouvement : pièces ouvertes et passages, couloirs (seuil de 4 m choisi pour le prototype), garage « à étudier », minimum 1 par étage, cuisine ouverte évaluée par comparaison de la diagonale avec la portée de référence de 10 m ;
- détecteurs de fumée : 50 m² indicatifs par détecteur, par niveau, garage exclu par défaut ; emplacement proposé dans les circulations puis le séjour (hors cuisine / salle de bain) – **heuristique de placement, pas une règle d'installation** ;
- détecteurs de choc : 1 par menuiserie extérieure, 2 par baie vitrée, aucun automatique sur porte sectionnelle ; en mode volumétrique, seules les portes d'accès sont équipées d'office (paramétrable) ;
- sirènes et boîtier Save : **aucune règle communiquée** → jamais proposés automatiquement (alerte « point à vérifier »).

À vérifier indépendamment : exigences réglementaires et normatives applicables, préconisations des fabricants
(hauteurs de pose, distances, zones d'exclusion), compatibilité animaux, usage de nuit / mode partiel.

## 3. Simplifications techniques

| Domaine | Simplification | Conséquence / piste |
|---|---|---|
| Pièces | Rectangles alignés sur les axes | Pièces en L à composer avec plusieurs rectangles ; polygones libres envisageables |
| Murs | Générés depuis les contours de pièces + cloisons libres ; épaisseurs standard (20 / 10 cm) | Pas de murs courbes ni d'épaisseurs réelles relevées |
| Hauteurs | Hauteur sous plafond par niveau, allèges / linteaux standards | Pas d'escaliers, trémies ni toitures |
| Plans générés par questionnaire | Disposition générique en bandes ou en L, pièces rectangulaires, dimensions indicatives ; ne représente pas le logement réel tant que le conseiller ne l'a pas vérifié et validé |
| Menuiseries saisies par quantité | Ouvertures « à positionner » sans position ni dimension relevée ; emplacement 2D/3D indicatif | À positionner sur le plan avant validation ; pas de vérification de chevauchement entre deux ouvertures d'un même mur |
| Mobilier générique | Volumes simples, placement par règles déterministes ; ne reproduit pas les meubles du client et ne sert pas à garantir la couverture des détecteurs | Visualisation uniquement ; corriger à la main si besoin |
| Analyse d'image | **Non développée** : pas de reconnaissance automatique des murs | Le conseiller trace la géométrie sur le fond calibré ; une analyse automatique ne pourrait proposer qu'une première interprétation à corriger |
| Import PDF | Première page uniquement, rendue en image | Plans multi-pages : importer la page utile |
| Couverture de détection | Secteur 110° / 10 m découpé à la pièce, **sans** calcul d'obstacles ni de hauteur | Simulation indicative uniquement, clairement libellée |
| Placement automatique | Positions proposées (coins, centres, ouvertures) à ajuster | Toujours relire et valider sur place |
| Vue 3D dans le PDF | Rendu WebGL hors écran ; si WebGL est indisponible, le PDF est produit sans vue 3D | — |
| Interface | Pensée pour un ordinateur (≥ 1 200 px) | Pas d'adaptation tablette/mobile |

## 4. Données et sécurité

- Stockage **local au navigateur** : pas de partage entre conseillers, pas de sauvegarde serveur ; vider les données du navigateur efface les dossiers (les données illisibles sont mises de côté, pas supprimées).
- Pas d'authentification, pas de gestion des droits, pas de journalisation des accès.
- Les PDF et images importées sont stockés dans IndexedDB du poste.
- Ne pas saisir de données personnelles réelles dans le prototype.

## 5. Évolutions proposées pour un pilote

1. **Back-end** : implémenter l'interface `Repository` (`src/persistence/storage.ts`) avec une API (dossiers, catalogue versionné, devis immuables, fichiers) et une base de données ; les modules métier sont déjà indépendants de l'interface.
2. **Authentification** (SSO entreprise) et rôles : conseiller, responsable (validation), administrateur catalogue.
3. **Catalogue officiel** : synchronisation avec le référentiel produits/tarifs, workflow de validation des prix, gestion des dates d'effet.
4. **Règles** : validation formelle par le métier, versionnement, tests de non-régression par règle.
5. **Saisie terrain** : mode tablette, photos par pièce, relevé de cotes.
6. **Intégrations** : CRM (création du dossier), planification de l'installation, signature électronique.
7. **Plans** : pièces polygonales, escaliers, aide à l'interprétation d'image (proposition à corriger).
