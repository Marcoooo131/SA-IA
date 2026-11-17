# 04 — Business plan : budget, coûts, risques, MVP, feuille de route

[← Sommaire](README.md)

> **Avertissement chiffres.** Les prix fournisseurs (SMS, IA) proviennent de sources citées ; les coûts d'hébergement,
> de développement et de prestations juridiques sont des **ordres de grandeur à faire chiffrer par devis**.
> Aucune projection de chiffre d'affaires n'est présentée comme probable : les scénarios servent à connaître
> les seuils de rentabilité, pas à promettre un résultat.

---

## 15. Budget technique estimé

### 15.1 Effort de développement du MVP (Phases 2 à 5)

| Bloc | Jours-personne (fourchette) |
|---|---|
| Design system, maquettes, prototype testé | 15–20 |
| Socle SaaS : auth, tenants, rôles, RLS, audit, tests d'isolation | 25–30 |
| Stripe Billing, droits, quotas, back-office interne | 20–25 |
| Moteur de parcours (schéma, conditions, versions) + éditeur simple | 25–35 |
| Parcours public, sauvegarde/reprise, fichiers et annotations | 15–20 |
| Moteur de créneaux, réservations, holds, report/annulation, tests de concurrence | 25–30 |
| Synchro Google Calendar (+ Outlook) | 10–15 |
| Notifications email/SMS, automatisations simples, messagerie dossier | 15–20 |
| Tableau de bord, dossiers, statistiques de base | 15–20 |
| Site commercial, onboarding, documentation | 10–15 |
| Sécurité, charge, E2E, mise en production, observabilité | 15–20 |
| **Total** | **≈ 190–250 jours-personne** |

Soit environ **5 à 7 mois pour 2 développeurs** expérimentés à temps plein (ou plus long avec 1 seul).
Mon expérience est que ces estimations dérivent plutôt vers le haut ; d'où l'importance du périmètre MVP strict (§18).

### 15.2 Budget de lancement hors salaires (ordres de grandeur)

| Poste | Montant indicatif | Remarque |
|---|---|---|
| Développement externalisé (si vous ne codez pas en interne) | 190–250 j × TJM freelance | À faire chiffrer ; c'est de loin le poste principal |
| Design / identité (si externalisé) | quelques milliers d'€ | Logo, charte, maquettes clés |
| Juridique : CGV/CGU, politique de confidentialité, DPA (accord de sous-traitance RGPD) | quelques milliers d'€ | Par un avocat spécialisé SaaS/RGPD, indispensable |
| Dépôt de marque (INPI, puis UE si besoin) | quelques centaines d'€ | Après recherche d'antériorité |
| Test d'intrusion externe avant lancement payant | quelques milliers d'€ | Recommandé |
| Assurance RC pro / cyber | à chiffrer | |
| Outils et hébergement pendant le développement | 50–150 €/mois | |

---

## 16. Coûts mensuels récurrents

### 16.1 Coûts fixes au lancement (0 à ~100 clients)

| Poste | Ordre de grandeur / mois |
|---|---|
| Conteneurs API + front (UE) | 30–100 € |
| PostgreSQL managé avec sauvegardes PITR | 30–100 € |
| Stockage objet + sauvegardes externes | 5–20 € |
| Monitoring / erreurs / uptime (offres gratuites puis payantes) | 0–60 € |
| Email transactionnel | 0–30 € |
| Domaines, outils (Workspace, GitHub, design) | 30–80 € |
| Comptabilité, banque, assurance | 150–300 € |
| **Total hors salaires** | **≈ 250–700 €/mois** |

### 16.2 Coûts variables par client

| Poste | Hypothèse | Coût |
|---|---|---|
| SMS France | Brevo ≈ 0,045 € / SMS ; Twilio ≈ 0,08 $ / segment (+ numéro) — tarifs relevés en oct.–nov. 2026 | Pro (100 SMS) : ≈ 4,5–8 € |
| Frais Stripe (paiement + Billing) | à vérifier sur la grille Stripe en vigueur | ≈ 2–4 % du prix |
| IA (résumé de dossier) | Claude Haiku 5.5 : 0,10 $ / M tokens en entrée, 0,50 $ / M en sortie ; ≈ 3 000 + 300 tokens par dossier | ≈ 0,0005 $ par dossier, négligeable |
| Infra marginale | stockage photos, calcul | ≈ 0,5–2 € |

**Marge brute estimée par client Pro (69 € HT) : environ 80–90 %**, à condition que les SMS au-delà du forfait
soient vendus en packs (jamais offerts sans limite).

### 16.3 Seuils de rentabilité (scénarios, pas prévisions)

ARPA supposé ≈ 60 € HT (mélange Starter/Pro/Business), marge brute ≈ 85 % → ≈ 51 € de marge par client et par mois.

| Structure de coûts fixes mensuels | Clients payants nécessaires |
|---|---|
| Fondateurs non rémunérés, ≈ 600 € de fixes | ≈ 12 |
| + 1 salaire chargé (hypothèse 5 000 €) | ≈ 110 |
| + 2 salaires + marketing (hypothèse 13 000 €) | ≈ 260 |

Ce qui détermine la réussite n'est donc pas la technique mais **le coût d'acquisition et le churn** des TPE,
deux points à mesurer dès les pilotes. Votre outil `prospection-erp/` (scoring, suivi des canaux, CAC) peut être
réutilisé tel quel pour cette prospection.

### Sources
- SMS : [Kanal — Brevo SMS prix 2026](https://getkanal.com/fr/blog/brevo-sms), [Leptidigital — Twilio](https://www.leptidigital.fr/logiciels/twilio/), [Twilio — tarifs France](https://www.twilio.com/en-us/sms/pricing/fr), [Sweego — comparatif SMS Europe](https://www.sweego.io/pricing/european-sms-price-comparison)
- IA : grille tarifaire Anthropic (Claude Haiku 5.5) en vigueur en novembre 2026.

---

## 17. Risques techniques et commerciaux

| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| **Pas assez de besoin payant** (« mon téléphone me suffit ») | Moyenne | Fatal | Validation *avant* le code : entretiens, pilotes concierge, pré-ventes |
| **Les artisans ne diffusent pas leur lien** → aucune réservation → départ | Élevée | Élevé | Kit de diffusion, intégration Google Business Profile, suivi d'activation, appel de bienvenue |
| Churn élevé des TPE | Élevée | Élevé | Annuel avec remise, valeur visible (rapport mensuel « demandes reçues »), historique des dossiers |
| Coût d'acquisition trop élevé pour 29–69 €/mois | Moyenne | Élevé | Canaux peu chers : partenariats (négoces, fabricants, réseaux d'artisans, CAPEB/FFB locales), bouche-à-oreille, contenus, parrainage |
| Concurrent installé ajoute la qualification (Calendly, Cal.com) | Moyenne | Moyen | Profondeur métier + benchmarks agrégés + français/terrain |
| Double réservation, bug de fuseau horaire | Faible si testé | Élevé (confiance) | Contrainte d'exclusion en base, holds, tests de concurrence, tout stocké en UTC |
| Fuite de données entre entreprises | Faible si RLS | Fatal | RLS + tests d'isolation en CI + test d'intrusion |
| Validation des API Google/Microsoft (écrans OAuth, revue de sécurité) | Moyenne | Moyen (délai) | Lancer la vérification Google tôt ; prévoir le lien .ics en attendant |
| Délivrabilité email/SMS, réglementation SMS (plages horaires, prospection) | Moyenne | Moyen | Fournisseurs reconnus, SPF/DKIM/DMARC, consentements, aucun SMS marketing sans opt-in |
| Hallucination de l'IA | Moyenne | Moyen | IA limitée au résumé, réponses brutes toujours affichées, aucune génération de prix ; mention « généré par IA » (transparence AI Act) |
| Dépendance Stripe | Faible | Moyen | Données d'abonnement répliquées localement |
| Dérive du périmètre (tout faire avant de vendre) | **Élevée** | Élevé | MVP figé (§18), revue mensuelle « est-ce que ça fait signer ? » |
| Équipe trop petite pour support + dev + vente | Élevée | Élevé | Self-service, documentation, priorisation du support des pilotes |

### Répartition des responsabilités RGPD
- **Données des entreprises clientes (comptes, facturation)** : nous sommes *responsable de traitement*.
- **Données de leurs prospects (dossiers, photos, messages)** : l'entreprise cliente est *responsable de traitement*,
  nous sommes *sous-traitant* → **DPA (art. 28)** annexé aux CGV, registre, liste des sous-traitants ultérieurs
  (hébergeur, SMS, email, IA), hébergement UE, notification de violation, aide à l'exercice des droits.
- **Analyses agrégées inter-clients (benchmarks)** : uniquement sur données anonymisées et prévu explicitement au contrat.
- **Santé exclue** (exigence HDS). À réévaluer seulement avec un hébergeur certifié.

---

## 18. MVP commercialisable

**Définition : le plus petit produit qu'un artisan de rénovation accepte de payer 69 € par mois au bout de 14 jours d'essai.**

Contenu (détail en [01-strategie.md §6](01-strategie.md#6-fonctionnalités-indispensables-mvp)) :
1. Inscription + onboarding avec **3 modèles métier** (salle de bain, cuisine, déménagement).
2. Page publique + parcours conversationnel avec conditions, photos annotées, adresse/zone, reprise par lien.
3. Créneaux en temps réel, holds, confirmation, report/annulation, synchro Google Calendar.
4. Dossier structuré + résumé (IA désactivable) + notes + statuts.
5. Rappels email (+ SMS en Pro), confirmation en un clic, messagerie dossier simple.
6. Tableau de bord + entonnoir de conversion par étape.
7. Stripe Billing (essai, mensuel/annuel, portail), quotas, back-office interne.
8. Sécurité : RLS testé, journal d'audit, export et suppression des données, DPA.

**Hors MVP** : 3D, chat IA, A/B, multi-établissements, API, WhatsApp, devis/facturation, application native.

**Critères pour dire « le MVP fonctionne » (à mesurer sur les pilotes, seuils à ajuster) :**
- ≥ 60 % des pilotes publient leur page et reçoivent une réservation réelle en 14 jours ;
- les pilotes déclarent un gain de temps ou de qualité concret (verbatims + nombre d'appels évités) ;
- ≥ 40 % répondent « très déçu » à la question « si vous ne pouviez plus utiliser le produit ? » ;
- au moins 30 % des pilotes convertissent en payant à la fin de la période pilote.

---

## 19. Feuille de route jusqu'au lancement

| Période | Phase | Livrables | Critère de passage |
|---|---|---|---|
| **S1–S4** | **Validation** (sans code produit) | 20–30 entretiens d'artisans et déménageurs ; page de vente + liste d'attente ; test de prix ; **pilotes « concierge »** : parcours monté à la main avec des outils existants pour 5 entreprises | ≥ 5 entreprises prêtes à piloter, ≥ 3 pré-engagements écrits |
| S3–S8 | Identité & prototype | Nom vérifié, charte, design system, prototype cliquable des 3 parcours, tests utilisateurs (artisans + leurs clients) | Parcours compris sans aide, < 2 min 30 sur mobile |
| S6–S12 | Socle SaaS | Auth, tenants, RLS + tests, rôles, Stripe Billing, quotas, back-office, CI/CD, environnements | Tests d'isolation et de paiement verts |
| S10–S20 | Moteur de réservation | Parcours, éditeur simple, créneaux, réservations, synchro Google, page publique, dossier | 100 réservations simultanées → 0 doublon ; E2E verts |
| S18–S24 | Communication | Email, SMS, rappels, messagerie, automatisations modèles | Journal d'envoi complet, coûts suivis |
| **S22–S28** | **Bêta privée payante** | 10–20 entreprises, accompagnement rapproché, corrections | Critères MVP du §18 |
| S26–S30 | Préparation commerciale | Site final, tarifs validés, documentation, démo, CGV/DPA signés, test d'intrusion | Pentest sans faille critique ouverte |
| **≈ M7–M8** | **Lancement public** (France, 2–3 métiers) | Acquisition : partenariats, contenus métier, parrainage | Suivi CAC / activation / churn |
| Post-lancement | Optimisation puis différenciation | Benchmarks métier, éditeur avancé, schéma 2D, Outlook, Business ; puis IA conversationnelle, 3D si prouvée | Décisions fondées sur les données d'usage |

### Stratégie de lancement
1. **Pilotes fondateurs** (prix bloqué à vie contre retours et témoignages).
2. **Canaux à faible CAC** : fiches Google Business Profile (bouton de réservation), négoces de matériaux et
   fabricants (salles d'exposition), réseaux et fédérations d'artisans locales, groupements de déménageurs,
   prospection ciblée via `prospection-erp/` (créations d'entreprises récentes).
3. **Preuve** : études de cas chiffrées issues des données réelles des pilotes, avec leur accord.
4. **Parrainage** : un mois offert aux deux parties.

### Stratégie de fidélisation
- Rapport mensuel automatique de valeur (demandes, RDV, absences évitées, temps gagné estimé et expliqué).
- Historique des dossiers et messagerie : la plateforme devient la mémoire commerciale de l'entreprise.
- Benchmarks métier et recommandations (« les entreprises de votre métier qui demandent les photos convertissent… »).
- Formule annuelle ; écoute active des motifs de résiliation (questionnaire obligatoire mais court).

### Indicateurs de réussite (tableau de bord produit, Partie 16)

| Famille | Indicateurs | Source |
|---|---|---|
| Acquisition | Visiteurs du site, inscriptions, CAC par canal, conversion visiteur → essai | Analytics site, `prospection-erp` |
| Activation | % page publiée, % 1ʳᵉ réservation réelle, délai jusqu'à 1ʳᵉ réservation | Événements produit |
| Engagement | RDV / entreprise / mois, connexions hebdo, collaborateurs actifs, fonctionnalités utilisées | Événements produit |
| Valeur client | Taux visiteur → RDV de leurs pages, taux d'absence, complétude des dossiers | `analytics_event`, `booking` |
| Rétention | Conversion essai → payant, churn logo et revenu, motifs de départ | Stripe + questionnaire |
| Rentabilité | MRR, ARR, ARPA, coût infra / client, coût SMS et email / client, marge brute, LTV/CAC dès que les données le permettent | Stripe + `notification.cost_micros` + factures fournisseurs |

---

## 20. Ressources nécessaires

### Pour construire (jusqu'au lancement)

| Rôle | Charge | Indispensable ? |
|---|---|---|
| Fondateur·rice produit / commercial (entretiens, pilotes, vente, support) | Temps plein | **Oui** — c'est le rôle le plus déterminant |
| Développeur·se full-stack senior (Python + TypeScript) | Temps plein | Oui |
| Second·e développeur·se (front / produit) | Temps plein ou mi-temps | Fortement recommandé pour tenir ≈ 7 mois |
| Designer produit | 20–30 jours sur la période | Oui (externalisable) |
| Avocat SaaS/RGPD | Ponctuel | Oui |
| Expert sécurité (pentest) | Ponctuel | Oui avant facturation |

### Pour maintenir (après lancement, jusqu'à ≈ 300 clients)
- 1 à 2 développeurs (évolutions, maintenance, astreinte légère), 1 personne support/onboarding (à mi-temps au début),
  la fonction commerciale/marketing. L'infrastructure choisie (PaaS managé) ne nécessite pas d'ingénieur infra dédié.

---

## 21. Décisions à valider avant de coder

1. **Positionnement** : acceptez-vous de lancer sur « rendez-vous qualifiés pour la rénovation et le déménagement »
   plutôt que sur une plateforme universelle ?
2. **Nom** : « Venio » comme nom de travail (sous réserve de recherche d'antériorité) ou autre piste ?
3. **Équipe** : qui code, qui vend ? Cela change le budget du simple au triple.
4. **Hébergement** : PaaS français/UE (Scaleway, Clever Cloud) — préférence ?
5. **Authentification** : développée en interne (recommandé pour maîtriser coûts et données) ou service managé ?
6. **Validation** : êtes-vous d'accord pour consacrer les 4 premières semaines aux entretiens et pilotes concierge,
   avant tout développement du socle ?

Dès validation, la Phase 2 commencera par le prototype cliquable des trois parcours métier et le design system.
