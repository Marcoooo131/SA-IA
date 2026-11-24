# 09 — Programme de lancement de Venio (document de référence)

> **Document vivant.** Il fait foi sur l'avancement, les décisions et le budget. Mis à jour à chaque étape validée.
> Tableau de bord interactif : voir le lien « Pilotage du lancement » dans la conversation (même contenu, avec suivi).
> Légende : **FAIT** = vérifié avec preuve · **ESTIMATION** = hypothèse chiffrée · **RECOMMANDATION** = avis ·
> **NON VÉRIFIÉ** = impossible à contrôler avec les outils disponibles.

| | |
|---|---|
| Ouvert le | 19/11/2026 |
| Phase actuelle | **Phase 1 — Fondations** |
| Étape actuelle | **1.3 — Valider la proposition de valeur (entretiens)** · 1.1 encore ouverte (réservation de vecall.fr, recherche de marques) |
| Étapes validées | **2 / 37 (5 %)** : 1.2, 3.1 — seules les étapes validées avec preuve comptent |
| Mode de financement | **Progressif par paliers (décision D0 du 19/11/2026)** : gratuit jusqu'à 10 clients, puis investissements financés par les revenus |
| Budget de départ (palier 0) | **≈ 30 à 45 € HT**, puis ≈ 2 à 5 €/mois |
| Budget engagé à ce jour | **0 €** (tout fonctionne sur des offres gratuites) |

---

## 1. Diagnostic

### 1.1 Maturité (appréciation, pas un calcul)

| Domaine | Niveau | Ce qui le justifie |
|---|---|---|
| Produit | **Bêta fonctionnelle** | Réservation, dossiers, agenda, emails réels, démo, appels manqués en simulation, abonnements Stripe en test — 100 tests automatisés au vert |
| Technique et sécurité | Partiel | Isolation des données solide (RLS testée) ; manquent sauvegardes, mot de passe oublié, vérification email, back-office, supervision |
| Téléphonie et SMS | Simulation uniquement | Aucun SMS réel ni ligne réelle ; fournisseur non choisi |
| Entreprise | **Inexistante** | Pas de société, pas de compte bancaire, pas de marque, domaine provisoire |
| Juridique | Brouillons | Pages légales en ligne à l'état de modèles ; aucun contrat de sous-traitance |
| Finances | Modèle seulement | Aucun devis réel (comptable, assurance, avocat) |
| Commercial | Préparé | Site, démo, vidéo, kit pilotes ; aucun client, aucun entretien réalisé |

**En une phrase : le logiciel est en avance, l'entreprise n'existe pas encore.** Le programme est donc surtout non
technique au début ; le développement restant (≈ 15 jours, voir 08 §10) se fait en parallèle des démarches.

### 1.2 Ce qui est acquis (ne pas refaire)

Application complète en ligne (venio-rdv.netlify.app + API Render + base Supabase Paris), design system, 5 modèles
métier, démonstration interactive, emails réels via Brevo, Stripe en mode test, récupération d'appels simulée avec
16 règles de filtrage, vidéo publicitaire (sans voix off), audit sécurité/RGPD/SMS (document 08), kit pilotes (06).

### 1.3 Ce qui est à corriger avant toute vente (voir 08 pour le détail)

Page Tarifs qui promet messagerie et multi-utilisateurs inexistants · pas de sauvegardes · pas de mot de passe
oublié ni de vérification email · pas de back-office · SMS et téléphonie jamais testés en réel · aucun paiement test.

### 1.4 Constats nouveaux de cet audit (19/11/2026)

| Constat | Nature | Source |
|---|---|---|
| **Une société américaine, Venio Systems (Fairfax, Virginie), commercialise des logiciels sous le nom « Venio » (VenioOne, Venio Cloud) depuis les années 2000** | FAIT | [veniosystems.com](https://www.veniosystems.com/company), [Legal Technology Hub](https://www.legaltechnologyhub.com/vendors/venioone-by-venio/) |
| **venio.fr** est enregistré depuis 2007, **venio.com** depuis 2003, **venio.io** (01/2026) et **venio.app** (2020) aussi ; **getvenio.com** a été enregistré par un tiers le 06/11/2026 | FAIT (registres RDAP officiels, interrogés le 19/11/2026) | rdap.nic.fr, rdap.verisign.com |
| getvenio.fr et venio-rdv.fr sont libres ; venio.eu : NON VÉRIFIÉ | FAIT / NON VÉRIFIÉ | rdap.nic.fr |
| Présence de marques « VENIO » à l'INPI ou à l'EUIPO | **NON VÉRIFIÉ** (bases officielles non interrogeables depuis nos outils) | Étape 1.1 |
| Starter à 29 € devient fragile si le support dépasse 30 min/client/mois | ESTIMATION | § 4 |

---

## 2. Financement progressif par paliers (décision D0)

| Palier | Déclenchement | Contenu | Coût estimé (HT) |
|---|---|---|---|
| **0** | De 0 à 10 clients | Micro-entreprise (création gratuite), hébergement gratuit + sauvegardes chiffrées gratuites, documents juridiques à partir des modèles officiels (Commission européenne, CNIL), SMS uniquement sur demande explicite (serveur vocal), audit de sécurité automatisé, pilotes | ≈ 30–45 € au départ (domaine, tests SMS), ≈ 2–5 €/mois |
| **1** | Dès 10 clients payants | Passage en SAS, dépôt de la marque, Supabase Pro + Render payant | ≈ 600–1 000 € + ≈ 30 €/mois |
| **2** | Vers 30 à 50 clients | Avocat (CGV, RGPD, SMS), assurance RC Pro + cyber, expert-comptable, test d'intrusion | ≈ 3 000–8 000 € + ≈ 250–400 €/mois |

**Risques acceptés au palier 0 :** nom non protégé par une marque ; documents non relus par un avocat ; pas
d'assurance (le patrimoine personnel d'un entrepreneur individuel est séparé du patrimoine professionnel par défaut
depuis 2022) ; hébergement gratuit limité (≈ 20 à 30 clients au maximum) ; **un seul titulaire** pour la
micro-entreprise alors que vous êtes deux associés, d'où un accord écrit indispensable (étape 1.4).
**Non négociable même au palier 0 :** sauvegardes, mot de passe oublié, paiements testés, page Tarifs conforme,
SMS uniquement sur demande explicite, audit de sécurité sans faille critique ouverte.

## 2 bis. Feuille de route : 9 phases, 37 étapes

L'ordre suit les dépendances réelles. Une étape n'est validée qu'avec sa preuve. Les phases 2 (finances) et 5
(prix) avancent **en continu** : le tableau financier (§ 3) est mis à jour à chaque étape.

| Phase | Étapes |
|---|---|
| **1. Fondations** | 1.1 Vérifier le nom (marque, domaines) · 1.2 Positionnement, concurrence et secteurs cibles · 1.3 Valider la proposition de valeur (entretiens) · 1.4 Statut de départ (micro-entreprise) et accord écrit entre associés · 1.5 Créer la micro-entreprise et ouvrir un compte dédié · 1.6 Acheter le domaine, adresses email (marque au palier 1) |
| **2. Finances** | 2.1 Budget par paliers et seuils de déclenchement · 2.2 Modèle financier à trois scénarios (version validée) · 2.3 Devis réels préparés pour les paliers 1 et 2 |
| **3. Produit et technique** | 3.1 Corrections commerciales urgentes (page Tarifs) · 3.2 Sauvegardes chiffrées gratuites et restauration testée · 3.3 Comptes : mot de passe oublié, vérification email, sessions, rôles et invitations · 3.4 Back-office et gestion des quotas · 3.5 Téléphonie et SMS réels, tests multi-opérateurs · 3.6 Filtrage des appels (niveau 1) et garde-fous SMS · 3.7 RGPD technique : suppression, export, conservation, journal d'accès · 3.8 Stripe réel : paiements, impayés, résiliations, factures · 3.9 Audit de sécurité automatisé gratuit : code, dépendances, RLS, configuration, charge, appareils |
| **4. Juridique** | 4.1 Mentions légales, CGV, CGU (modèles ; relecture avocat au palier 2) · 4.2 RGPD à partir des modèles officiels · 4.3 SMS sur demande explicite (serveur vocal) et vérification juridique documentée · 4.4 Assurance : report documenté jusqu'au palier 2 |
| **5. Tarification** | 5.1 Étude concurrentielle complète · 5.2 Grille Starter / Professional / Enterprise chiffrée (HT, TTC, coûts, marges) · 5.3 Validation des prix par les entretiens et les pilotes, configuration Stripe |
| **6. Site et marque** | 6.1 Identité visuelle (ajustée si le nom change) · 6.2 Site définitif : contenus, SEO, contact, domaine · 6.3 Parcours inscription → paiement → configuration vérifié · 6.4 Aide en ligne et organisation du support |
| **7. Commercial** | 7.1 Clients idéaux, argumentaire, supports · 7.2 Pilotes (3 à 5 entreprises) · 7.3 Retours et corrections · 7.4 Offre de lancement et plan d'acquisition sans publicité payante |
| **8. Tests** | 8.1 Batterie complète de 14 scénarios critiques en préproduction · 8.2 Tests de reprise : panne fournisseur, restauration |
| **9. Lancement** | 9.1 Revue finale go / no-go · 9.2 Ouverture officielle, communication, suivi des 30 premiers jours |

**Durée réaliste (ESTIMATION) : 10 à 14 semaines**, dont 4 à 6 imposées par des délais externes (création de
société ≈ 1 à 3 semaines, publication de la marque, devis, pilotes de 4 semaines).

---

## 3. Tableau financier vivant

### 3.1 Postes de coûts (€ HT, au 19/11/2026)

| Poste | Coût initial | Coût mensuel | Coût variable | Statut |
|---|---|---|---|---|
| Hébergement API (Render Starter) | 0 € | ≈ 6,50 € (7 $) | Instance plus grosse au-delà de ≈ 100 clients | ESTIMATION (grille publique) — non engagé |
| Base de données (Supabase Pro, sauvegardes 7 j) | 0 € | ≈ 23 € (25 $) | Calcul supplémentaire au-delà de ≈ 100 clients | ESTIMATION ([sources 08](08-securisation-lancement.md#sources-consultées-le-19112026-à-revérifier-avant-décision)) — non engagé |
| Site (Netlify) | 0 € | 0 € (gratuit) puis ≈ 18 € (Pro) | — | En place (gratuit) |
| Stockage de sauvegardes externe (UE) | 0 € | < 5 € | — | ESTIMATION |
| Emails (Brevo) | 0 € | 0 € jusqu'à 300/jour | Offre payante au-delà | En place (gratuit) |
| SMS France | — | — | 0,045 € (Brevo) à 0,074 € (Twilio) par SMS | ESTIMATION (comparatifs, grilles à confirmer) |
| Téléphonie (numéro + minutes entrantes) | — | ≈ 1,24 € par ligne (1,35 $) | ≈ 0,009 €/min | ESTIMATION ([Twilio](https://www.twilio.com/en-us/voice/pricing/fr)) |
| IA (qualification des appels, niveau 3) | 0 € | 0 € | ≈ 0,01–0,03 € par message vocal | Non prévu avant les pilotes |
| Stripe | 0 € | 0 € | 1,5 % + 0,25 € par paiement (carte UE) + 0,7 % Billing | ESTIMATION (grille Stripe) |
| Domaines | 15–60 € | ≈ 2 € | — | À acheter (étape 1.6) |
| Marque INPI (3 classes) | 270 € | — | Renouvellement 10 ans | FAIT (barème INPI : 190 € + 40 €/classe) |
| Création de la société | ≈ 252–292 € | — | — | ESTIMATION (forfait annonce légale 199 € HT + greffe) |
| Comptabilité | 0–300 € | ≈ 80–200 € | + paie du président ≈ 30–80 €/mois | ESTIMATION (études de prix 2026), devis à obtenir |
| Banque professionnelle | 0 € | ≈ 10–30 € | — | ESTIMATION |
| Assurance RC Pro + cyber | — | ≈ 25–170 € (300–2 000 €/an) | Selon chiffre d'affaires | ESTIMATION, **fourchette large**, devis indispensable |
| Avocat (CGV, RGPD, avis SMS) | 1 500–4 000 € | — | Mises à jour ponctuelles | ESTIMATION, devis |
| Test d'intrusion | 1 500–4 000 € | — | Annuel ensuite | ESTIMATION, devis |
| Marketing | 300–1 000 € | 200–500 € | — | RECOMMANDATION : pas de publicité payante avant les pilotes |
| Support client | — | Temps des associés | ≈ 15 min/client/mois valorisées 30 €/h | ESTIMATION, **poste le plus incertain** |
| Outils internes (emails pro, documents) | 0 € | ≈ 15–30 € | Par utilisateur | ESTIMATION |
| Trésorerie de sécurité | 1 900–2 700 € | — | — | RECOMMANDATION : 3 mois de frais fixes |

**TVA :** tous les montants sont HT. La TVA (20 %) payée sur les achats est récupérable une fois la société assujettie ;
les services facturés depuis l'étranger (Render, Supabase, Twilio, Stripe) relèvent généralement de l'autoliquidation.
L'assurance n'est pas soumise à la TVA mais à une taxe sur les conventions d'assurance incluse dans la prime.
À confirmer avec le comptable (étape 2.3).

**Dépenses réellement engagées : 0 €.**

### 3.2 Budget complet (ponctuel, € HT) — désormais réparti entre les paliers 1 et 2

| Poste | Bas | Haut | Nature |
|---|---|---|---|
| Création de la SAS (annonce, greffe, bénéficiaires effectifs) | 252 | 292 | Obligatoire |
| Statuts et pacte d'associés par un avocat | 0 | 1 500 | Recommandé à deux associés |
| Dépôt de marque (3 classes) | 270 | 270 | Recommandé |
| Recherche d'antériorité professionnelle | 0 | 800 | Optionnel |
| Domaines | 15 | 60 | Nécessaire |
| Avocat : CGV, CGU, confidentialité, sous-traitance, avis SMS | 1 500 | 4 000 | Nécessaire |
| Test d'intrusion léger | 1 500 | 4 000 | Fortement recommandé |
| Assurance (1re année) | 300 | 2 000 | Nécessaire |
| Mise en place comptable | 0 | 300 | Selon cabinet |
| Infrastructure pendant 3 mois de préparation | 100 | 130 | Nécessaire |
| Tests téléphonie et SMS | 20 | 60 | Nécessaire |
| Supports commerciaux de lancement | 300 | 1 000 | Hypothèse |
| **Sous-total dépenses** | **4 257** | **14 412** | |
| Trésorerie de sécurité (3 mois de fixes) | 1 900 | 2 700 | Réserve, pas une dépense |
| **Total à prévoir** | **≈ 6 200** | **≈ 17 100** | |

### 3.3 Coût mensuel au lancement (≤ 25 clients, sans rémunération des dirigeants)

| | € HT / mois |
|---|---|
| Infrastructure (API, base, domaine) | ≈ 32 |
| Comptable, assurance, banque, outils | ≈ 290 |
| Marketing (scénario réaliste) | ≈ 300 |
| **Total fixe** | **≈ 620** |
| Variable par client (SMS, ligne, Stripe, support) | ≈ 14 à 27 selon le scénario |

### 3.4 Trois scénarios (prix de vente = grille actuelle 29 / 69 / 149 €, **hypothèse de travail jusqu'à la phase 5**)

| Hypothèse | Prudent | Réaliste | Ambitieux |
|---|---|---|---|
| Répartition Starter / Pro / Business | 60 / 35 / 5 % | 40 / 45 / 15 % | 30 / 50 / 20 % |
| Part du quota SMS consommée | 90 % | 60 % | 50 % |
| Prix du SMS | 0,074 € (Twilio) | 0,054 € (OVH) | 0,045 € (Brevo) |
| Support par client et par mois | 30 min | 15 min | 10 min |
| Désabonnement mensuel | 4 % | 2,5 % | 1,5 % |
| Coût d'acquisition d'un client (CAC) | 300 € | 150 € | 80 € |
| Marketing mensuel | 200 € | 300 € | 500 € |
| **Revenu moyen par client** | 49 € | 65 € | 73 € |
| **Coût variable par client** | 27,04 € | 18,05 € | 14,14 € |
| **Marge sur coût variable** | 45 % | 72 % | 81 % |
| **Valeur vie client (LTV)** | 549 € | 1 878 € | 3 924 € |
| **LTV / CAC** | 1,8 (insuffisant) | 12,5 | 49 |
| Seuil : frais fixes seuls | 24 clients | 13 clients | 14 clients |
| Seuil : + 1 dirigeant (3 600 €/mois chargés) | 192 clients | 92 clients | 77 clients |
| Seuil : + 2 dirigeants | 363 clients | 172 clients | 140 clients |

**Résultat mensuel selon le nombre de clients (€ HT ; « dirigeant » = 3 600 € chargés, ESTIMATION) :**

| Clients | Prudent : CA / marge brute / résultat avec 1 dirigeant | Réaliste | Ambitieux |
|---|---|---|---|
| 10 | 490 / 188 / −3 902 | 650 / 438 / −3 752 | 730 / 557 / −3 833 |
| 25 | 1 225 / 518 / −3 572 | 1 625 / 1 142 / −3 048 | 1 825 / 1 440 / −2 950 |
| 50 | 2 450 / 964 / −3 126 | 3 250 / 2 214 / −1 976 | 3 650 / 2 809 / −1 581 |
| 100 | 4 900 / 2 062 / −2 028 | 6 500 / 4 561 / +371 | 7 300 / 5 752 / +1 362 |
| 250 | 12 250 / 5 218 / +1 128 | 16 250 / 11 465 / +7 275 | 18 250 / 14 442 / +10 052 |
| 500 | 24 500 / 10 467 / +6 377 | 32 500 / 22 962 / +18 772 | 36 500 / 28 916 / +24 526 |

**Impôt sur les sociétés** (FAIT sous conditions, à confirmer par le comptable) : taux réduit de 15 % jusqu'à
42 500 € de bénéfice annuel pour les PME éligibles, 25 % au-delà. Exemple réaliste à 250 clients : bénéfice annuel
estimé ≈ 87 300 € avec un dirigeant rémunéré → IS ≈ 17 600 €.

**Lecture critique :**
- Le chiffre d'affaires de 10 clients ne paie même pas les frais fixes : **la phase de démarrage se finance par
  les apports des associés**, sans rémunération, pendant probablement 12 mois ou plus.
- Le scénario prudent montre que **le Starter à 29 € avec beaucoup de support est à peine rentable** : il faudra
  soit le rendre autonome (aide en ligne, pas de support téléphonique), soit le relever, soit le retirer. À
  trancher en phase 5.
- La rentabilité dépend bien plus du **coût d'acquisition** et du **désabonnement** que du prix des SMS.

---

## 4. Risques qui pourraient empêcher le lancement

| Risque | Gravité | Réponse |
|---|---|---|
| Nom « Venio » indisponible ou contesté (marque antérieure, domaines pris) | **Bloquant** | Étape 1.1, avant toute dépense |
| Mésentente ou indisponibilité entre associés (temps, argent, rôles) | **Bloquant** | Étape 1.4 : accord écrit |
| Aucune entreprise prête à payer (proposition de valeur non validée) | **Bloquant** | Étape 1.3 : entretiens avant de finir le développement |
| Absence de sauvegardes en production | Critique | Étape 3.2 |
| SMS après appel manqué jugé non conforme | Élevé | Étape 4.3 ; serveur vocal en repli |
| Trésorerie insuffisante pour couvrir 12 mois de frais fixes | Élevé | Étape 2.1 |
| Délais externes (création, banque, fournisseur téléphonique) | Moyen | Démarrer les démarches tôt, en parallèle du technique |

---

## 5. Décisions stratégiques à prendre

| # | Décision | Quand | Statut |
|---|---|---|---|
| D0 | Mode de financement | — | **Décidé le 19/11/2026 : progressif par paliers** |
| D1 | Nom | Étape 1.1 | **Provisoire : « Vecall »** (définitif après recherche de marques) |
| D2 | Titulaire de la micro-entreprise, partage entre associés, rôles, temps consacré (accord écrit) | Étape 1.4 | En attente |
| D3 | Secteur de départ | Étape 1.2 | **Décidé le 23/11/2026 : rénovation et bâtiment** |
| D4 | Seuils exacts de passage aux paliers 1 et 2 | Étape 2.1 | En attente |
| D5 | Fournisseur de téléphonie et de SMS | Étape 3.5 | En attente |
| D6 | Invitations et messagerie | Étape 3.1 | **Décidé le 24/11/2026 : retirées de l'offre, annoncées « pas encore disponibles »** |
| D7 | Grille tarifaire | Étape 5.2 | **Décidé le 24/11/2026 : offre unique à 39 € HT/mois ou 390 € HT/an, 100 SMS inclus** (à confirmer par les entretiens) |

---

## 6. Journal des décisions

| Date | Décision | Par |
|---|---|---|
| 18/11/2026 | Brevo pour emails et SMS ; rien de facturable ne part tant que ce n'est pas autorisé | Associés |
| 18/11/2026 | Direction artistique « le fil », police Fraunces | Associés |
| 18/11/2026 | Stripe en mode test uniquement | Associés |
| 19/11/2026 | Pas d'accès à Hugging Face (voix off) ; pas de connexion Stripe via formulaire | Associés |
| 19/11/2026 | **D0 : lancement progressif, gratuit jusqu'à 10 clients puis investissements par paliers** | Associés |
| 23/11/2026 | Nom provisoire « Vecall » (« Venio » et « Callify » écartés) ; vecall.fr à réserver par l'associé | Associés |
| 23/11/2026 | D3 : secteur de départ rénovation et bâtiment | Associés |
| 24/11/2026 | Étape 1.2 validée : positionnement approuvé sans modification | Associés |
| 24/11/2026 | Offre unique à 39 € HT/mois (390 € HT/an), 100 SMS inclus ; seuil ≈ 167 clients pour un dirigeant rémunéré | Associés |
| 24/11/2026 | En ligne : mot de passe oublié, vérification email, page Tarifs conforme, CGV et pages légales ; étape 3.1 validée | Associés |

## 7. Journal du budget

| Date | Mouvement | Montant | Cumul engagé |
|---|---|---|---|
| 19/11/2026 | Ouverture du programme | 0 € | 0 € |
| 19/11/2026 | Budget de départ ramené à ≈ 30–45 € HT (palier 0) ; les §3.2 et §3.3 deviennent les budgets des paliers 1 et 2 | — | 0 € |

---

## 8. Étape en cours : 1.1 — Vérifier le nom « Venio »

Voir le tableau de bord et la conversation du 19/11/2026 pour le détail des actions. Résultat attendu : décision D1
documentée (garder ou changer), avec les captures des recherches INPI, EUIPO et domaines.

## Sources

Création de société : [Keobiz](https://www.keobiz.fr/le-mag/cout-creation-sas/), [Legalplace](https://www.legalplace.fr/guides/cout-creation-sas/), [Qonto](https://qonto.com/fr/blog/creation-entreprise/sas/cout-creation-sas) ·
Marque INPI : [barème INPI](https://www.inpi.fr/inpi-block/download-document?id=20514), [Captain Contrat](https://www.captaincontrat.com/protection-des-creations/depot-de-marque/cout-depot-marque-inpi) ·
Comptabilité : [étude 2026 des tarifs en ligne](https://les-experts-comptables.fr/ressources/etude-tarifs-experts-comptables-en-ligne) ·
Assurance : [Coover](https://www.coover.fr/responsabilite-civile-pro/metiers/start-up), [Companeo](https://www.companeo.com/assurance-rc-pro/actualites/assurance-rc-pro-informatique) ·
Concurrents : [Calendly](https://toolradar.com/tools/calendly/pricing), [Cal.com](https://zeeg.me/en/blog/post/cal-com-pricing), [SimplyBook.me](https://koalendar.com/blog/simplybook-me-pricing), [Setmore](https://koalendar.com/blog/setmore-pricing), [HubSpot](https://www.hublead.io/fr/blog/hubspot-new-pricing), [RDV360](https://pabau.com/fr/blog/tarifs-rdv360/), [outils « missed call text back »](https://www.getapp.com/all-software/a/beepback/) ·
Venio Systems : [veniosystems.com](https://www.veniosystems.com/company) · Coûts techniques : voir les sources du document 08.
