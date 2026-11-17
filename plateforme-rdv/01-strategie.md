# 01 — Stratégie : analyse, concurrence, positionnement, périmètre

[← Sommaire](README.md)

---

## 1. Analyse globale : ce que je pense vraiment du projet

### Ce qui est solide

- **Le modèle SaaS récurrent** est le bon : coûts marginaux faibles par client, revenu prévisible.
- **L'intuition « expérience conversationnelle plutôt que formulaire »** est juste : un parcours d'une question
  par écran, avec des choix visuels, convertit en général mieux qu'un long formulaire (c'est la thèse de Typeform).
  Mais c'est une hypothèse à mesurer sur *nos* parcours, pas une certitude.
- **La priorité à la fiabilité du calendrier** et à l'isolation des données est la bonne.
- **Vous avez déjà des actifs** dans ce dépôt : un outil de prospection d'artisans BTP (`prospection-erp/`),
  un plan 2D/3D avec générateur de pièces et devis (`src/`), un moteur de relances SMS testé (`sms-reminders/`).
  Ils pointent tous vers la même cible : le bâtiment et les services à domicile.

### Ce que je challenge

| Idée du cahier des charges | Mon avis | Proposition |
|---|---|---|
| « Plateforme universelle » pour 11 secteurs | Piège classique : un produit pour tout le monde n'est le meilleur pour personne, et le marketing coûte 11 fois plus cher. | Moteur générique, **mais** produit, site, modèles et vente centrés sur 2–3 métiers. |
| Concurrencer Calendly | Calendly est excellent pour « choisir un créneau » entre professionnels. On ne gagnera pas sur ce terrain. | Se battre sur ce que Calendly fait mal : **la qualification du besoin avant le rendez-vous** (Calendly limite les questions et la logique conditionnelle, voir §2.3). |
| Configurateur 3D dès le produit | Coûteux à produire par secteur, lourd sur mobile, gain de conversion non démontré. | MVP : **photos annotées + sélection sur schéma 2D**. 3D seulement si les pilotes le demandent, en réutilisant le moteur 3D déjà présent dans le dépôt. |
| Tests A/B pour chaque entreprise | Un artisan reçoit quelques dizaines à quelques centaines de visiteurs par mois : un test A/B y est statistiquement inexploitable. | **Benchmarks agrégés par métier** (tous clients confondus, anonymisés) + A/B seulement au-dessus d'un seuil de volume calculé. |
| Assistant IA qui répond à tout | Risque d'inventer des prix ; coûts variables ; obligations de transparence (AI Act art. 50). | MVP : parcours **déterministes**. IA limitée à des tâches sûres et utiles : résumé du dossier pour l'artisan, reformulation du besoin, détection d'incohérences. Chat libre plus tard, ancré sur la base de connaissances. |
| Messagerie temps réel WebSocket | Un artisan répond entre deux chantiers, pas en temps réel. | Messagerie asynchrone + notifications email/SMS ; mise à jour live via SSE, simple. WhatsApp plus tard. |
| Santé parmi les cibles | En France, héberger des données de santé impose un hébergeur certifié HDS ; Doctolib domine. | **Exclure la santé** du lancement. |
| Beauté parmi les cibles | Marché dominé par des places de marché (Planity, etc.) qui apportent aussi des clients ; panier faible. | **Exclure** du lancement. |

### Ma thèse en une phrase

> Le rendez-vous n'est pas le produit. Le produit, c'est **un prospect qualifié qui se présente au rendez-vous**.
> On facture la qualité du rendez-vous, pas le nombre de créneaux.

---

## 2. Étude concurrentielle

### 2.1 Méthode et limites

- Prix relevés via des comparatifs tiers datés de 2026 (CostBench, Zoho, Capterra, Koalendar, SchedulingKit…).
  Les sources divergent parfois (mensuel vs annuel, devises) : **les fourchettes ci-dessous sont indicatives,
  à vérifier sur les pages officielles** avant toute décision.
- Je n'ai pas trouvé de chiffres de parts de marché fiables : je n'en avance aucun.
- Les critiques utilisateurs proviennent d'avis publics (Capterra, G2, forums éditeurs) : anecdotiques, pas statistiques.

### 2.2 Tableau comparatif

| Acteur | Positionnement | Prix indicatifs 2026 | Points forts | Faiblesses / critiques | Opportunité pour nous |
|---|---|---|---|---|---|
| **Calendly** | Planification B2B, commerciaux, recrutement | Gratuit ; Standard ≈ 10 $/siège/mois (annuel) – 12 $ (mensuel) ; Teams ≈ 16–20 $/siège ; Enterprise sur devis | Marque, simplicité, intégrations, routage | Facturation par siège ; formulaires d'admission limités (plafond de questions signalé par des utilisateurs, logique de routage jugée limitée) ; routage réservé aux offres Teams | Qualification riche et conditionnelle, au forfait |
| **HubSpot Meetings** | Module du CRM HubSpot | Planificateur inclus dans l'offre gratuite ; Sales Hub Starter ≈ 15–20 $/siège (promotions fréquentes) ; Pro ≈ 90–100 $/siège + frais d'onboarding | Intégré au CRM, écosystème | Pensé pour équipes commerciales ; complexe et cher pour un artisan | Simplicité, métier, sans CRM lourd |
| **Cal.com** | Open source, développeurs, équipes | Gratuit ; Teams ≈ 12–15 $/utilisateur ; Organizations ≈ 28–37 $/utilisateur | Open source, auto-hébergeable, API, routage | Orientation technique ; peu adapté au grand public non technique | Expérience « clé en main » pour non-techniciens |
| **SimplyBook.me** | Réservation de services (salons, cours) | Gratuit (50 résa/mois) ; Basic ≈ 9,90 € ; Standard ≈ 29,90 € ; Premium ≈ 59,90 € (mensuel), quotas de réservations | Très complet (paiement, forfaits, multi-lieux) | Interface dense ; tarification par quotas et options payantes | Clarté, mobile, qualification |
| **Setmore** | Petites entreprises de services | Gratuit jusqu'à 4 utilisateurs ; Pro/Team ≈ 5–12 $/utilisateur (sources contradictoires) | Prix bas, offre gratuite généreuse | Peu de personnalisation, qualification basique | Ne pas se battre sur le prix |
| **Acuity (Squarespace)** | Indépendants et prestataires de services | ≈ 16 / 27 / 49 $ par mois (annuel), ≈ 20 / 34 / 61 $ (mensuel) selon nb d'agendas | Formulaires d'admission, paiements, SMS dès le 2e niveau | Design daté, pas de logique conversationnelle | Expérience moderne + qualification adaptative |
| **YouCanBookMe** | Agendas Google/Outlook partagés | Gratuit ; ≈ 8–18 $/membre/mois selon niveau (passage d'un modèle par calendrier à un modèle par paliers) | Simplicité, personnalisation | Peu de fonctionnalités métier | — |
| **RDV360** (FR) | TPE de services, annuaire grand public | Gratuit ; Pro 29,90 € HT ; Pro+ 39,90 € HT ; Pro++ 59,90 € HT / mois | Français, annuaire, rappels SMS | Orienté beauté/bien-être ; source de prix = concurrent, à vérifier | Repère de prix FR pour TPE |
| **Agendize** (FR) | Prise de RDV multicanal, réseaux et grands comptes | ≈ 25 €/utilisateur/mois ; Premium sur devis | Multi-sites, grands comptes | Orientation entreprise, moins TPE | — |
| **Planity** (FR) | Place de marché beauté | Non publié (selon sources : variable) | Apporte des clients (annuaire grand public) | Dépendance à la plateforme | Confirme d'éviter la beauté |
| **Typeform** (concurrent indirect) | Formulaires conversationnels | ≈ 28 / 56 / 91 $ par mois (annuel), plafonds de réponses (≈ 100 / 1 000 / 10 000) | Référence UX conversationnelle | Pas de calendrier natif ; prix en hausse en 2026 ; facturation aux réponses | **Notre vrai « concurrent » : la combinaison Typeform + Calendly + outil SMS**, que nous remplaçons en un seul produit métier |

Concurrents métiers à analyser plus finement en entretiens (non chiffrés ici faute de source vérifiée) :
logiciels de devis/facturation BTP (Obat, Tolteck, Batappli…), plateformes de mise en relation
(Habitatpresto, Travaux.com…), outils de prise de RDV pour garages (iDGARAGES…).
Les plateformes de mise en relation vendent des *leads* partagés entre plusieurs artisans : beaucoup
d'artisans s'en plaignent. **Notre promesse inverse : vos propres prospects, sur votre propre page, non revendus.**

### 2.3 Enseignements

1. **Le prix d'entrée du marché est bas** (gratuit à ≈ 15 $/utilisateur). Être « un Calendly de plus » ne justifie
   pas d'abonnement premium.
2. **La qualification est le maillon faible** de quasiment tous les outils de planification : quelques questions
   à la suite, logique conditionnelle limitée, pas de photos annotées, pas de structuration du dossier.
3. **Les outils de formulaires** (Typeform) ont l'UX mais pas le calendrier, pas les rappels, pas le dossier.
4. **La facturation par siège pénalise les petites équipes** ; un forfait par entreprise est un argument simple.
5. **Les rappels SMS sont souvent réservés aux offres supérieures** : c'est perçu comme une valeur payante.

### Sources

- Calendly : [Zoho — Calendly pricing breakdown 2026](https://www.zoho.com/bookings/explore/calendly-pricing-plans.html), [Zeeg — Calendly Pricing 2026](https://zeeg.me/en/blog/post/calendly-pricing-guide), [CostBench — Calendly](https://www.costbench.com/software/scheduling/calendly/)
- Critiques Calendly : [Capterra — avis Calendly](https://www.capterra.com/p/148036/Calendly/reviews/), [Communauté Calendly — « we need more than 10 questions »](https://community.calendly.com/how-do-i-40/we-need-more-than-10-questions-5953), [Communauté HubSpot — logique de routage Calendly](https://community.hubspot.com/t/calendly-integration-logic-issue/133843.md)
- Cal.com : [Zeeg — Cal.com Pricing 2026](https://zeeg.me/en/blog/post/cal-com-pricing), [PricingSaaS — changements 2026](https://pricingsaas.com/companies/cal/diffs/2026W10), [CostBench — Cal.com](https://www.costbench.com/software/scheduling/cal-com/)
- SimplyBook.me : [Koalendar](https://koalendar.com/blog/simplybook-me-pricing), [Capterra](https://www.capterra.com/p/140086/Simplybook-me/pricing/)
- Setmore : [Zoho — Setmore pricing](https://www.zoho.com/bookings/explore/setmore-pricing.html), [CostBench — Setmore](https://www.costbench.com/software/scheduling/setmore/)
- Acuity : [G2 — Acuity pricing](https://www.g2.com/products/acuity-scheduling/pricing), [Capterra — Acuity pricing](https://www.capterra.com/p/191978/Acuity-Scheduling/pricing/)
- YouCanBookMe : [Koalendar](https://koalendar.com/blog/youcanbookme-pricing), [Capterra UK](https://www.capterra.co.uk/software/163194/youcanbookme)
- HubSpot : [Blog HubSpot — Sales Hub pricing](https://blog.hubspot.com/sales/hubspot-sales-hub-pricing), [meetergo — HubSpot pricing](https://meetergo.com/en/magazine/hubspot-pricing)
- Acteurs français : [Pabau — tarifs RDV360](https://pabau.com/fr/blog/tarifs-rdv360/), [Agendize — tarifs](https://www.agendize.com/en/tarifs), [Capterra FR — Planity](https://www.capterra.fr/software/1027177/planity)
- Typeform : [Activepieces — Typeform pricing 2026](https://www.activepieces.com/blog/typeform-pricing-2026-plans-free-cap-and-real-cost.md), [formnx](https://formnx.com/typeform-pricing)

---

## 3. Positionnement recommandé

**Catégorie :** « prise de rendez-vous qualifiés » (*qualified booking*) pour entreprises de services à devis.

**Promesse :**
> **Chaque demande arrive complète. Chaque rendez-vous est confirmé.**
> Vos visiteurs décrivent leur projet en 2 minutes, photos à l'appui, et réservent directement votre visite.
> Vous arrivez préparé ; ils ne vous oublient pas.

**Clientèle prioritaire :** entreprises de 1 à 20 personnes, en rénovation et services à domicile, dont le panier
moyen est élevé (plusieurs milliers d'euros) et dont le premier rendez-vous est une visite technique ou un devis.

**Proposition de valeur, liée aux trois bénéfices mesurables du cahier des charges :**

| Bénéfice | Mécanisme produit | Indicateur mesuré dans l'outil |
|---|---|---|
| Plus de rendez-vous | Parcours court, mobile, disponible 24 h/24, reprise d'un parcours interrompu | Taux visiteur → rendez-vous, abandons par étape |
| Moins de temps de gestion | Plus d'appels de requalification ; agenda et rappels automatiques | Demandes traitées sans appel, temps de traitement |
| Meilleure information avant RDV | Dossier structuré : besoin, surfaces, photos annotées, adresse, budget, délai | Taux de dossiers complets, taux d'absence |

**Avantage concurrentiel (ordre de solidité croissante) :**
1. UX conversationnelle mobile — copiable, donc avantage temporaire.
2. Modèles de parcours métier prêts à l'emploi — copiable mais demande une vraie connaissance terrain.
3. **Données de conversion agrégées par métier** (« dans votre métier, demander le budget à l'étape 2 fait chuter
   la conversion ; à l'étape 6 non ») — s'améliore avec chaque client, difficile à rattraper. C'est l'actif durable.
4. Coût de changement : historique des dossiers, messagerie, automatisations configurées.

**Marque (provisoire, à vérifier INPI/EUIPO et disponibilité des domaines avant tout dépôt) :**
- **Venio** (latin « je viens ») — court, international, évoque la venue au rendez-vous. ← proposition de travail
- Alternatives : *Accueo*, *Prisio*, *Rendiva*.

Je n'ai pas vérifié l'antériorité de ces noms : une recherche de marque est indispensable.

---

## 4. Secteurs à cibler en premier

Critères notés de 1 à 5 : valeur d'un client pour l'entreprise (donc volonté de payer), besoin de qualification
avant RDV, faiblesse de l'outillage actuel, accessibilité commerciale pour nous, intensité concurrentielle (5 = faible).

| Secteur | Valeur client | Besoin de qualification | Outillage actuel faible | Accès commercial | Concurrence faible | Total | Décision |
|---|---|---|---|---|---|---|---|
| **Rénovation (SDB, cuisine, menuiseries, isolation, PAC/solaire)** | 5 | 5 | 4 | 4 (outil de prospection existant) | 4 | **22** | **Cible n°1** |
| **Déménagement / services à domicile à devis** | 4 | 5 | 4 | 4 (expérience Movers) | 4 | **21** | **Cible n°2** |
| Paysagistes, piscinistes | 4 | 4 | 4 | 3 | 4 | 19 | Extension rapide |
| Immobilier (estimation) | 5 | 4 | 3 | 3 | 2 (CRM immo installés) | 17 | Plus tard |
| Garages, carrosserie | 3 | 4 | 3 | 3 | 3 | 16 | Plus tard (bon cas 2D « zone du véhicule ») |
| Photographes, formation, conseil | 3 | 3 | 2 | 3 | 2 | 13 | Servis par Calendly |
| Beauté | 2 | 1 | 2 | 3 | 1 | 9 | Exclu |
| Santé | 4 | 3 | 2 | 2 | 1 | 12 | **Exclu** (HDS, Doctolib) |

*Ces notes sont mon jugement, pas des mesures : les entretiens de la phase de validation doivent les confirmer ou les infirmer.*

**Recommandation :** lancer sur **la rénovation de l'habitat** (avec 2–3 parcours : salle de bain, cuisine,
menuiseries/isolation) et **le déménagement**, puis élargir aux métiers voisins qui réutilisent les mêmes modèles.

---

## 5. Innovations qui peuvent nous différencier

Classées par rapport valeur / coût. ★ = dans le MVP.

| # | Innovation | Bénéfice | Coût | Statut |
|---|---|---|---|---|
| 1 | **Parcours métier prêts à l'emploi** (questions, ordre, choix visuels déjà testés) | Mise en service en 15 min, conversion meilleure dès le jour 1 | Moyen (contenu métier) | ★ |
| 2 | **Dossier de projet structuré** (résumé, surfaces, photos, adresse, budget, délai, score de complétude) | L'artisan arrive préparé, moins d'appels | Faible | ★ |
| 3 | **Photos annotées** (le client entoure la zone concernée sur sa photo) | Compréhension du besoin sans 3D | Faible | ★ |
| 4 | **Rendez-vous adapté au besoin** : durée, type (visite / visio / appel), zone géographique selon les réponses | Évite les créneaux inadaptés et les trajets inutiles | Moyen | ★ |
| 5 | **Zone d'intervention** : refus poli + orientation si adresse hors zone | Évite les déplacements inutiles | Faible | ★ |
| 6 | **Reprise par lien sécurisé** d'un parcours abandonné (+ relance si consentement) | Récupère des abandons | Faible | ★ |
| 7 | **Rappels SMS/email + confirmation en 1 clic** | Moins d'absences | Faible (moteur existant) | ★ |
| 8 | **Résumé IA du dossier pour l'artisan** (avec réponses brutes à côté, jamais de prix) | Lecture en 10 s | Faible (≈ fractions de centime par dossier) | ★ (désactivable) |
| 9 | **Benchmarks de conversion par métier** + recommandations fondées sur volumes suffisants | L'actif durable | Moyen | V1.1 (quand > 30 clients) |
| 10 | **Sélection sur schéma 2D** (pièce, façade, véhicule) | Compréhension | Moyen | V1.1 |
| 11 | **Pré-estimation par fourchette configurée par l'entreprise** (jamais inventée) | Filtre les prospects hors budget | Moyen | V1.2, opt-in |
| 12 | **Assistant conversationnel ancré** sur la base de connaissances de l'entreprise | Répond aux questions fréquentes | Moyen/élevé | V2 |
| 13 | Configurateur 3D | Effet « waouh », utile pour cuisine/salle de bain | Élevé | V2+, si prouvé |
| 14 | WhatsApp Business | Canal préféré de certains clients | Moyen (coûts Meta) | V2 |

**Refusé :** fausses urgences (« plus que 2 créneaux ! »), fausses disponibilités, faux avis. Contraire à notre
promesse et risqué juridiquement (pratiques commerciales trompeuses).

---

## 6. Fonctionnalités indispensables (MVP)

**Côté client final**
- Page publique de l'entreprise (modèle unique soigné, personnalisable : logo, couleurs, photos, prestations, zone, avis saisis par l'entreprise).
- Parcours conversationnel : une question par écran, boutons/cartes visuelles, choix multiples, curseur, date, texte libre, upload photos/documents, adresse avec autocomplétion, **conditions** (afficher/sauter une question, choisir la prestation).
- Sauvegarde automatique, retour arrière, barre de progression, reprise par lien.
- Choix du créneau en temps réel (prestation, collaborateur, zone), sans compte.
- Récapitulatif modifiable, confirmation, email + fichier .ics, lien de gestion (annuler/reporter).
- Mentions RGPD, consentements séparés (transactionnel vs marketing).

**Côté entreprise**
- Inscription, onboarding guidé avec modèle métier, publication en < 15 min.
- Tableau de bord : RDV du jour, nouvelles demandes, à traiter, taux de conversion et d'abandon de base.
- Réservations : vue liste + calendrier semaine, statuts, dossier client complet, notes internes.
- Disponibilités : horaires, pauses, congés, jours fériés, délais min/max, temps de trajet/tampon, blocages.
- Prestations : durée, type de RDV, collaborateurs éligibles.
- Éditeur de parcours **simple** (liste d'étapes + conditions « si… alors… »), aperçu, publication versionnée.
- Collaborateurs (2 rôles : propriétaire/admin, membre) — Pro.
- Synchronisation Google Calendar (lecture des occupations + écriture des RDV). Outlook juste après.
- Rappels email (Starter) et SMS (Pro) configurables J-x / H-x ; messagerie simple liée au dossier (Pro).

**Plateforme**
- Multi-tenant avec RLS, Stripe Billing (essai, mensuel/annuel, changement de formule, portail client, impayés),
  quotas, back-office interne (entreprises, abonnements, MRR, incidents), journal d'audit, export/suppression des données.

---

## 7. Fonctionnalités à reporter (et pourquoi)

| Reporté | Pourquoi | Quand |
|---|---|---|
| Configurateur 3D | Coût élevé par métier ; gain non prouvé ; mobile | Après validation sur pilotes |
| Chat IA libre | Risque d'invention, coûts variables, conformité | V2, ancré + garde-fous |
| A/B tests par entreprise | Volumes insuffisants | Quand l'entreprise dépasse un seuil calculé |
| Multi-établissements | Peu de demandes dans la cible TPE | Offre Business, V1.2 |
| API publique / webhooks sortants | Utile surtout aux plus gros clients | V1.2 |
| Domaines personnalisés | Simple mais support DNS/TLS | V1.1 (Business) |
| Paiement d'acompte au RDV | Rare pour une visite de devis ; utile pour déménagement | V1.2 (Stripe Connect) |
| WhatsApp | Coûts et validation Meta | V2 |
| Modules CRM, devis/facturation | Le marché a des outils ; intégrer plutôt que refaire | Après product-market fit |
| Éditeur visuel drag & drop complet | L'éditeur « liste + conditions » couvre 90 % des besoins pilotes | V1.1 |
| Application mobile native | PWA suffisante | Si demandée |
