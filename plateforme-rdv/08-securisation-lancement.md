# 08 — Filtrage des appels, protection des données, consommation SMS et préparation au lancement

> Complète le cahier des charges (01 à 07) sans le remplacer. Rédigé le 19/11/2026 à partir du **code réellement en
> production** (commit `c2c1521`, branche `claude/saas-booking-platform-xvbma3`). Chaque « ✅ » renvoie à du code
> vérifié ou à un test ; tout le reste est explicitement « à faire » ou « à vérifier ». Aucune modification du
> produit n'a été faite pour ce document : ce sont des propositions à valider.

---

## 0. Synthèse

**Verdict : Venio fonctionne de bout en bout en mode test, mais n'est pas prêt à encaisser un premier client
payant.** Rien d'inquiétant sur l'architecture (isolation des données, paiements, moteur de règles SMS sont
solides), mais il manque des briques qu'un client payant considère comme acquises, et plusieurs prérequis non
techniques.

**Ce qui bloque réellement le lancement payant (et rien d'autre) :**

| # | Bloquant | Nature | Effort |
|---|---|---|---|
| B1 | Pas de **mot de passe oublié** ni de **vérification de l'email** | Technique | 1,5 j |
| B2 | **Aucune sauvegarde** de la base (offre gratuite Supabase) ni test de restauration | Technique + 25 $/mois | 1 j |
| B3 | La page **Tarifs promet ce qui n'existe pas** : messagerie client, plusieurs utilisateurs, limites affichées mais non appliquées | Conformité commerciale | 0,5 j |
| B4 | **Aucun SMS réel envoyé ni ligne téléphonique réelle** : la récupération d'appels est vérifiée uniquement en simulation | Choix fournisseur + tests | 3–5 j |
| B5 | Pas de **back-office** : modifier un quota, suspendre un compte ou voir une consommation demande du SQL | Technique | 4 j |
| B6 | **Structure juridique, CGV, contrat de sous-traitance, assurance**, validation du SMS par un avocat | Non technique | Externe |
| B7 | Stripe : **aucun paiement test** réalisé de bout en bout, puis passage en mode réel | Vous + 0,5 j | — |

**Économie :** avec les quotas actuels, **aucun abonnement ne devient déficitaire**, même si le client consomme 100 %
de ses SMS inclus : le quota est un plafond dur. Marge brute ≈ 70 % sur l'ensemble. Le seuil de rentabilité est
≈ **78 clients** si l'activité doit payer une rémunération chargée de 3 500 €/mois. Le vrai risque économique n'est
pas le SMS mais **le temps de support** et le **prix des packs SMS si le fournisseur est Twilio** (marge de 5 % sur
le pack de 500).

**Filtrage des appels :** on ne peut pas connaître le motif d'un appel classique sans intégration. Recommandation en
trois niveaux : (1) règles enrichies + **tri par l'appelant lui-même en arrivant sur la page** (coût nul, à faire
avant les pilotes) ; (2) **serveur vocal « tapez 1 pour un rendez-vous »** en option, dès que le fournisseur de
téléphonie est choisi ; (3) messagerie vocale transcrite et qualifiée par IA, plus tard, si les pilotes le justifient.

---

## 1. État des lieux vérifié dans le code

### 1.1 Développé et testé

| Domaine | Ce qui existe | Preuve |
|---|---|---|
| Réservation | Parcours conditionnel, créneaux réels, anti-double réservation (contrainte d'exclusion PostgreSQL), report / annulation par lien signé | Tests backend (100 au total) ; réservation réelle en production le 18/11 |
| Emails | Confirmation, rappel J-1, report, annulation, alertes entreprise via Brevo | **Envoi réel vérifié en production le 18/11** |
| Isolation | RLS PostgreSQL forcée sur toutes les tables d'entreprise, rôle applicatif sans BYPASSRLS | Tests API + SQL direct |
| Authentification | Mots de passe Argon2, jeton de session aléatoire **haché en base**, cookie HttpOnly + Secure + SameSite=Lax, 30 jours, limitation de débit | `security.py`, `identity.py`, `ratelimit.py` |
| Appels manqués | Webhook signé et idempotent, machine d'états, délai de validation (90 s), **16 motifs de refus** dont : numéro masqué, fixe/étranger, exclusions, STOP, appels rapprochés, 3 SMS max / numéro / 30 j, rappelé entre-temps, demande récente, horaires 8 h–21 h 30 + jours fériés, quota, plafond journalier | `telephony/rules.py`, 48 tests |
| Crédits SMS | Quota mensuel par offre (50 / 200 / 600), packs prépayés (100 et 500), débit avant envoi, remboursement si rien ne part | `billing`, `sms_credit_grant`, tests |
| Abonnements | Checkout, portail, webhooks signés, impayés avec délai de grâce, suspension des nouvelles réservations | 13 tests (Stripe simulé) |
| Démonstration | Espace jetable, aucun envoi, purge sous 2 h | 3 tests ; en ligne |
| Fichiers | Photos ré-encodées (suppression EXIF/GPS), accès réservé à l'entreprise | Tests |

### 1.2 Développé mais jamais vérifié en conditions réelles

- **Envoi de SMS** : l'adaptateur Brevo existe, mais aucun SMS n'est jamais parti (interrupteur `VENIO_PAID_SENDING_ENABLED` désactivé, lignes simulées uniquement).
- **Stripe** : vérifié contre un Stripe simulé ; la clé de test est sur Render, mais **aucun paiement test** n'a été fait.
- **Rôles** (`owner`, `admin`, `member`) : présents dans le code, mais un compte n'a qu'un utilisateur (pas d'invitation).

### 1.3 Prévu mais non développé

Téléphonie réelle · SMS de confirmation et de rappel · messagerie client · invitations de collaborateurs ·
**mot de passe oublié** · **vérification de l'email** · double authentification · liste et révocation des sessions ·
**back-office** · export et suppression des données d'un prospect · purge automatique selon une durée de conservation ·
journal des consultations de dossiers · **sauvegardes** · alertes de consommation SMS · accusés de réception SMS ·
supervision des erreurs.

---

## 2. Incohérences et risques détectés dans l'existant

| # | Constat (vérifié) | Risque | Correction proposée |
|---|---|---|---|
| I1 | La page Tarifs affiche **« Messagerie client » incluse** en Pro et Business (`feature.messaging`), fonctionnalité inexistante | Publicité trompeuse, litige client | Retirer la ligne tant que non livrée |
| I2 | Elle affiche **5 et 15 utilisateurs** alors qu'on ne peut pas inviter de collaborateur | Idem | Afficher « 1 utilisateur (invitations bientôt) » ou développer les invitations avant le lancement |
| I3 | « 100 rendez-vous / mois » et « 2 parcours » (Starter) sont **affichés mais appliqués nulle part** dans le code | Promesse incohérente, manque à gagner | Les appliquer ou les retirer |
| I4 | **Deux clés de quota SMS** coexistent : `limit.sms_per_month` (0/100/400, ancienne, inutilisée) et `limit.sms_credits_per_month` (50/200/600, utilisée) | Erreur de paramétrage future | Supprimer l'ancienne clé par migration |
| I5 | Le **plafond de sécurité de 200 SMS/jour** est une constante dans le code | Impossible à ajuster sans déploiement | Le passer en droit d'offre + surcharge par entreprise |
| I6 | Le parcours recueille un **consentement « rappels par SMS »** alors qu'aucun rappel SMS n'existe | Consentement recueilli sans finalité réelle | Masquer la case tant que la fonction n'existe pas |
| I7 | `audit_log` n'enregistre que 2 actions (changement de statut, publication de parcours) ; **aucune trace de qui consulte un dossier ou télécharge une photo** | Impossible d'enquêter après un incident | Journaliser les accès sensibles (§ 4.2) |
| I8 | Base Supabase gratuite : **pas de sauvegarde**, mise en pause après 7 jours sans trafic (contournée par une tâche de maintien) | Perte totale des données possible | Supabase Pro + export externe (§ 4.2) |
| I9 | **À vérifier** : où sont stockés les fichiers en production (`VENIO_STORAGE_BACKEND`). Le disque de l'offre gratuite Render est effacé à chaque déploiement | Perte des photos des prospects | Vérifier ; imposer le stockage Supabase privé |
| I10 | **À vérifier** : le trajet des requêtes `/api` (passent-elles par les fonctions Netlify, hébergées hors UE par défaut ?) | Transfert de données hors UE non documenté | Vérifier, documenter, router en direct vers l'API en UE si besoin |
| I11 | La marque **« Venio » n'a pas été vérifiée** (INPI, EUIPO) ; le domaine utilisé est un sous-domaine Netlify | Changement de nom forcé après lancement | Recherche d'antériorité avant toute dépense marketing |

---

## 3. Filtrage intelligent des appels

### 3.1 Ce qu'on peut réellement savoir d'un appel

Une application web ne voit **rien** d'un appel téléphonique classique. Ce que Venio peut savoir dépend entièrement
de l'intégration :

| Intégration | Comment | Ce que Venio sait | Ce que Venio ne sait pas |
|---|---|---|---|
| **Renvoi sur non-réponse** vers un numéro Venio (cible du module, voir 05 §A.5) | L'entreprise programme chez son opérateur « si je ne réponds pas en 20 s, renvoyer vers… » | Numéro appelant (si non masqué), heure, durée de sonnerie, raccroché avant ou après le renvoi | **Le motif de l'appel** |
| Standard téléphonique IP avec webhooks (Ringover, Aircall, OVH, 3CX…) | Événements du standard | Idem + appels pris, transferts, rappels sortants | Le motif |
| **Serveur vocal (SVI)** sur le numéro Venio | Message court + choix au clavier | **Le motif déclaré par l'appelant** (touche 1, 2…) | Rien de plus |
| Messagerie vocale + transcription | L'appelant laisse un message | Le contenu du message (si laissé) | Les appels sans message (la majorité) |

**Conséquence :** sans serveur vocal ni messagerie, le filtrage ne peut s'appuyer que sur **le numéro, l'heure et
l'historique**. C'est déjà beaucoup, car la majorité des « faux positifs » viennent de numéros connus.

### 3.2 Les sept catégories et comment les reconnaître

| Catégorie | Signal disponible sans SVI | Action recommandée |
|---|---|---|
| Demande de rendez-vous (nouveau prospect) | Numéro inconnu, mobile, non exclu | **SMS avec lien** (comportement actuel) |
| Demande d'information | Indiscernable d'un nouveau prospect | SMS neutre + **tri sur la page** (« autre demande → être rappelé ») |
| Rendez-vous déjà existant | Le numéro correspond à un contact avec **un rendez-vous à venir** | **Pas de lien de réservation** ; au choix : SMS « gérer votre rendez-vous » (lien de report/annulation existant) ou alerte à l'entreprise seulement |
| Appel administratif (fournisseur, banque, comptable) | Numéro dans la **liste d'exclusion** ; souvent un fixe | Ignoré (déjà en place pour les fixes et les exclusions) |
| Commercial / indésirable | **Préfixes réservés au démarchage par l'ARCEP** (0162, 0163, 0270, 0271, 0377, 0378, 0424, 0425, 0568, 0569, 0948, 0949 — liste à revérifier sur arcep.fr) ; sonnerie très courte (robot) ; nombreux appels courts depuis le même numéro | Ignoré, sans SMS |
| Client déjà connu (sans rendez-vous en cours) | Contact existant dans Venio | Réglable : SMS spécifique « client » ou alerte de rappel à l'entreprise (défaut : alerte) |
| Appel sans besoin de rendez-vous | Indiscernable sans SVI | Tri sur la page + étiquetage après coup par l'entreprise |

### 3.3 Les solutions comparées

| Solution | Fiabilité du motif | Coût par appel | Friction pour l'appelant | Développement | Remarques |
|---|---|---|---|---|---|
| Règles configurables (numéro, historique, horaires) | Moyenne | 0 € | Aucune | 2 j (extensions) | Base indispensable, déjà à moitié en place |
| **Tri sur la page d'arrivée** (« Votre appel concernait : un nouveau besoin / un rendez-vous existant / autre chose → être rappelé ») | Bonne, **déclarée par l'appelant** | 0 € | Un clic | 1,5 j | Transforme les SMS « inutiles » en demandes de rappel utiles |
| Étiquetage après coup par l'entreprise (« RDV », « info », « client », « fournisseur », « spam ») | Excellente, mais a posteriori | 0 € | Aucune | 1 j | Alimente les exclusions automatiques et les statistiques |
| **Serveur vocal** (« pour un rendez-vous tapez 1… ») | Très bonne | ≈ 0,005–0,01 € (minutes entrantes) | Réelle : une partie des appelants raccroche | 2 j + fournisseur | Fournit aussi la **demande explicite** de recevoir le SMS (meilleure base juridique) |
| Messagerie vocale + transcription + IA | Bonne quand un message est laissé | ≈ 0,01–0,03 € | Forte (laisser un message) | 4 j | Enregistrer des voix = données plus sensibles, information obligatoire, sous-traitant IA à encadrer |
| Analyse du contexte via le standard de l'entreprise | Faible pour le motif | 0 € | Aucune | 3 j par standard | Utile pour « rappelé / pris », pas pour le motif |

### 3.4 Recommandation

**Niveau 1 — avant les pilotes, inclus dans toutes les offres (≈ 5 j de développement, 0 € de coût variable)**

1. Nouvelles règles :
   - numéro d'un contact ayant **un rendez-vous à venir** → pas de lien de réservation ; SMS « gérer votre rendez-vous » si l'entreprise l'active, sinon alerte seule ;
   - contact déjà connu → alerte « client à rappeler » (réglable) ;
   - préfixes de démarchage ARCEP → ignorés ;
   - sonnerie de moins de 4 s → ignorée (raccroché immédiat, robots) ;
   - **les numéros de l'entreprise et de ses collaborateurs ne déclenchent jamais de SMS** (protection contre les boucles).
2. **SMS au texte neutre** : « Nous n'avons pas pu répondre à votre appel. Pour être rappelé ou réserver un créneau : [lien] ». Plus juste pour toutes les catégories, et moins « commercial » (§ 4.3).
3. **Tri en tête de la page** ouverte depuis le SMS : nouveau besoin → parcours ; rendez-vous existant → retrouver son rendez-vous ; autre chose → **demande de rappel** (nom, motif en une phrase) qui apparaît dans le tableau de bord.
4. Dans l'historique des appels : **étiquettes** en un clic et « ne plus jamais envoyer à ce numéro ».

**Niveau 2 — option dès que le fournisseur de téléphonie est choisi (≈ 2 j)**

Serveur vocal de 8 secondes maximum, enregistré par l'entreprise ou en synthèse vocale : *« Vous êtes chez [Entreprise].
Pour un rendez-vous ou un devis, tapez 1 : vous recevrez un lien par SMS. Pour un rendez-vous existant, tapez 2.
Sinon, restez en ligne. »* SMS uniquement sur la touche 1. Si l'appelant raccroche sans choisir : on revient au
niveau 1 (réglable). **À mesurer pendant les pilotes : le taux de raccrochage**, qui décide si l'option est proposée
par défaut.

**Niveau 3 — après les pilotes, si les chiffres le justifient**

Messagerie vocale transcrite et classée par IA, avec un résumé envoyé à l'entreprise. À ne lancer qu'avec : mention
dans le message d'accueil, conservation courte (30 jours), fournisseur de transcription en UE ou sous clauses
contractuelles, et validation juridique (§ 4.3).

**Indicateurs de réussite pendant les pilotes :** part des SMS menant au choix « autre chose » (< 25 %), taux de STOP
(< 2 %), plaintes (0), taux de récupération (≥ 8 %, voir 06).

---

## 4. Protection des données

### 4.1 Inventaire

| Donnée | Où | Sensibilité | Conservation proposée |
|---|---|---|---|
| Comptes utilisateurs (email, nom, mot de passe haché) | `app_user` | Moyenne | Durée du contrat + 3 ans (prescription) |
| Identité et coordonnées des prospects (nom, téléphone, email, adresse) | `contact` | **Élevée** (volume) | 3 ans après le dernier contact (référence CNIL pour la prospection), puis suppression |
| Besoins, réponses, notes internes | `case_file`, `intake_session`, `note` | **Élevée** (peut révéler la situation du foyer) | Comme le contact |
| Photos et documents | `file_object` + stockage | **Élevée** (intérieur de logement) | 1 an après le rendez-vous, sauf conservation demandée par l'entreprise |
| Numéros appelants, journaux d'appels et de SMS | `call`, `telephony_event_raw`, `notification` | Moyenne (données de trafic) | 12 mois ; événements bruts : 30 jours |
| Historique des rendez-vous | `booking`, `booking_event` | Moyenne | Comme le contact |
| Facturation | Stripe (+ `subscription`) | Moyenne | 10 ans (obligation comptable), chez Stripe |
| Journaux d'audit | `audit_log` | Moyenne | 1 an |
| Sauvegardes | Supabase + export externe | Toutes | 7 à 30 jours, chiffrées |

Aucune donnée « sensible » au sens de l'article 9 du RGPD n'est demandée, mais un prospect peut en écrire dans un
champ libre ou une photo : la politique de confidentialité doit le déconseiller et les champs libres le rappeler.

### 4.2 Mesures techniques : état et plan

| Mesure | État vérifié | Action | Priorité |
|---|---|---|---|
| Chiffrement des communications | HTTPS (Netlify, Render) ✅ ; connexion à la base : **mode SSL à vérifier** | Imposer `sslmode=require` vers Supabase | P0 |
| Chiffrement au repos | Assuré par l'hébergeur (disques chiffrés Supabase) ; aucun chiffrement applicatif | Suffisant pour le lancement ; chiffrer en plus les **notes internes** et jetons sensibles plus tard | P2 |
| Mots de passe | Argon2 ✅ | Longueur minimale 10 + liste des mots de passe les plus courants | P1 |
| **Mot de passe oublié, vérification email** | ❌ | Lien à usage unique (30 min), jeton haché, réponse identique que le compte existe ou non | **P0** |
| Double authentification | ❌ | TOTP optionnel, **obligatoire pour l'équipe Venio** (back-office) | P1 |
| Sessions | Cookie sécurisé ✅, jeton haché ✅ | Liste des appareils connectés + « déconnecter partout » ; déconnexion de toutes les sessions au changement de mot de passe | P1 |
| Rôles et permissions | 3 niveaux dans le code ✅ ; pas d'invitation | Invitations + matrice : le membre voit les dossiers mais pas la facturation ni les réglages SMS | P1 (P0 si on vend plusieurs utilisateurs) |
| Séparation des entreprises | RLS forcée ✅, testée ✅ | Ajouter un **test automatique qui échoue si une nouvelle table n'a pas de RLS** ; test d'intrusion externe | P0 (test), P1 (audit) |
| Accès de l'équipe Venio (support) | Seul le rôle propriétaire de la base contourne la RLS | Back-office **sans contournement de la RLS** : accès à un espace client uniquement sur demande du client, limité dans le temps, journalisé et visible par le client | P0 (avec le back-office) |
| Journalisation des accès sensibles | Partielle (2 actions) | Journaliser : consultation d'un dossier, téléchargement d'un fichier, export, suppression, changement de rôle, accès support ; consultable par le propriétaire | P1 |
| **Sauvegardes** | ❌ | Supabase Pro (sauvegarde quotidienne, 7 jours) **+ export chiffré hebdomadaire vers un stockage objet en UE** (compte distinct) | **P0** |
| Restauration | ❌ jamais testée | Procédure écrite + **test mensuel** sur une base jetable, durée mesurée (objectif : remise en service < 4 h, perte < 24 h) | **P0** |
| Gestion des incidents | ❌ | Procédure : détection, confinement (rotation des secrets, interrupteurs), évaluation, **notification CNIL sous 72 h** si risque (art. 33), information des entreprises clientes sans délai (art. 33.2), registre des violations | P0 (document) |
| Supervision | ❌ | Alertes d'erreurs (Sentry, offre gratuite) + surveillance de disponibilité | P1 |
| Dépendances et secrets | Secrets dans Render ✅ | Audit automatique des dépendances (pip-audit, npm audit) ; rotation des secrets documentée | P1 |
| Droits des personnes | ❌ aucun outil | Export et suppression d'un contact par l'entreprise ; suppression d'un compte entreprise avec restitution des données | P0 (suppression), P1 (export) |
| Durées de conservation | Seulement pour les démos ✅ | Tâche de purge nocturne selon le tableau 4.1 | P1 |

### 4.3 Cadre juridique : qui est responsable de quoi

**Deux rôles distincts pour Venio :**

| Traitement | Rôle de Venio | Rôle de l'entreprise cliente |
|---|---|---|
| Comptes clients, facturation, support, prospection de Venio auprès des artisans | **Responsable de traitement** | Personne concernée |
| Données des prospects et clients de l'entreprise (parcours, rendez-vous, appels, SMS, photos) | **Sous-traitant** (art. 28 RGPD) | **Responsable de traitement** |

**Conséquences concrètes :**

- Un **contrat de sous-traitance** (art. 28.3) annexé aux CGV : objet, durée, instructions, confidentialité, sécurité, sous-traitants ultérieurs (liste et information préalable des changements), assistance pour les droits des personnes et les violations, sort des données en fin de contrat, audits.
- La **politique de confidentialité côté prospect** est celle de l'entreprise cliente ; Venio fournit un modèle et l'affiche sur la page de réservation au nom de l'entreprise.
- Un **registre des traitements** (art. 30) pour chacun des deux rôles.
- **Sous-traitants ultérieurs** à lister : Render (hébergement de l'API, Francfort), Supabase (base de données, Paris), Netlify (site ; **localisation des fonctions à vérifier**), Brevo (emails et SMS, France), Stripe (paiements), futur fournisseur de téléphonie. Plusieurs sont des sociétés américaines : vérifier pour chacune l'adhésion au Data Privacy Framework ou les clauses contractuelles types.
- **Analyse d'impact (AIPD)** : probablement non obligatoire (pas de données sensibles à grande échelle), mais recommandée sous une forme légère pour la récupération d'appels (traitement systématique de numéros de personnes n'ayant rien demandé par écrit).

**SMS transactionnels ou prospection — le point juridique le plus important :**

| SMS | Qualification probable | Conditions |
|---|---|---|
| Confirmation, rappel, report d'un rendez-vous demandé | **Transactionnel** (exécution de la demande) | Information dans la politique de confidentialité ; pas de contenu promotionnel |
| **SMS après appel manqué** | **Zone grise** : réponse à un contact initié par la personne, mais qui l'invite à réserver | Formulation de service et non promotionnelle, un seul SMS, identification de l'entreprise, mention STOP, envoi en journée ; **à faire valider par un avocat**. Le serveur vocal (niveau 2) apporte une demande explicite, ce qui sécurise fortement le dispositif |
| Relance, promotion, newsletter | **Prospection** (art. L34-5 CPCE) | Consentement préalable des particuliers : **Venio ne doit pas proposer cette fonction** sans module de consentement dédié |

À noter : la réforme du démarchage téléphonique en vigueur depuis le 11 août 2026 (loi n° 2025-594, consentement
préalable pour les appels vers les consommateurs) vise les **appels vocaux** ; elle ne s'applique pas à nos SMS, mais
**elle encadre la prospection téléphonique que Venio fera lui-même** : les artisans sont des professionnels, le
démarchage B2B reste possible s'il est en rapport avec leur activité, à confirmer avec l'avocat.

**Documents à produire (modèles en ligne à l'état de brouillon, avec champs à compléter) :**
mentions légales · CGV (B2B, avec conditions d'abonnement, de résiliation, d'impayés et de responsabilité plafonnée) ·
conditions d'utilisation de la page de réservation · politique de confidentialité de Venio · modèle de politique
pour les entreprises clientes · contrat de sous-traitance · registre · procédure de violation · politique de
conservation. Cookies : le site n'utilise à ce jour que des cookies strictement nécessaires (session) → **pas de
bandeau requis**, à revérifier à chaque ajout d'outil de mesure.

**Points qui exigent un professionnel du droit :** qualification du SMS après appel manqué ; plafond de
responsabilité dans les CGV ; contrat de sous-traitance ; transferts hors UE ; nécessité d'une AIPD ; enregistrement
et transcription des messages vocaux (niveau 3) ; prospection commerciale de Venio.

---

## 5. Consommation SMS et quotas

### 5.1 Réponse directe à la question « Combien de SMS par abonnement ? »

Aujourd'hui : **Starter 50, Pro 200, Business 600 crédits SMS par mois** (1 crédit = 1 segment de 160 caractères
standards ; un SMS avec un caractère spécial compte double, ce que les modèles évitent). Au-delà : packs de 100
crédits (10 €) et 500 crédits (40 €), qui n'expirent pas. **Seuls les SMS de récupération d'appels consomment des
crédits** ; confirmations et rappels partent aujourd'hui par email.

Ces quotas sont des **hypothèses** de départ : les scénarios ci-dessous montrent qu'ils sont rentables, mais seuls
les pilotes diront s'ils sont suffisants.

### 5.2 Architecture cible

```
appel manqué ─┐            ┌─> fournisseur SMS ─> accusé de réception (webhook) ─┐
rappel J-1 ───┼─> décision ┤                                                      ├─> sms_message (statut, coût réel)
confirmation ─┘  (règles,  └─> refus motivé (journalisé)                          │
                  quota,                                                           └─> remboursement du crédit si non facturé
                  plafonds)
                       │
                       └─> grand livre des crédits : +forfait mensuel, +pack, −envoi, +remboursement, ±ajustement manuel
```

**Données (nouvelles ou modifiées) :**

| Élément | Rôle |
|---|---|
| `sms_message` (ou colonnes ajoutées à `notification`) | Une ligne par SMS : catégorie (`recovery`, `confirmation`, `reminder`, `manual`), segments, fournisseur, identifiant fournisseur, **coût réel**, statut (`queued`, `sent`, `delivered`, `failed`, `undeliverable`), erreur, horodatages |
| `credit_ledger` | Grand livre auditable des crédits (remplace le calcul implicite) : chaque mouvement avec sa cause |
| `tenant_entitlement_override` | **Surcharge par entreprise** posée depuis le back-office : clé, valeur, motif, auteur, date d'expiration |
| `plan_entitlement` (existant) | Quotas par offre, **modifiables depuis le back-office** ; un changement s'applique au mois suivant |

**Règles de consommation :** forfait du mois → crédits de packs → au-delà, selon l'offre : **blocage** (défaut,
jamais de facture surprise) ou **dépassement autorisé avec plafond** choisi par le client et facturé à l'usage par
Stripe. Les appels restent toujours enregistrés ; le tableau de bord indique les SMS non envoyés faute de crédits.

**Côté entreprise cliente :** page « Consommation » : crédits restants, SMS envoyés et délivrés par catégorie,
historique, achat de pack, seuil d'alerte réglable.

**Côté administrateur Venio (back-office) :** modifier les quotas d'une offre ou d'une entreprise, ajouter des crédits
gratuits avec motif, suspendre les envois d'une entreprise, voir la consommation, **le coût réel et la marge par
entreprise**, les anomalies.

**Alertes :** 80 % et 100 % du forfait (email + bandeau) ; achat de pack ; au-delà de 3× la moyenne des 4 dernières
semaines (client et équipe Venio).

### 5.3 Protections contre les abus

| Protection | État |
|---|---|
| 3 SMS max par numéro sur 30 jours, un seul SMS pour des appels rapprochés, opposition STOP, numéros masqués et fixes exclus, horaires, jours fériés | ✅ en place |
| Plafond journalier par entreprise (200) | ✅ mais constant → **à rendre configurable** |
| Quota dur par entreprise, crédits débités avant envoi | ✅ |
| Interrupteur global des envois payants | ✅ |
| Débit horaire par entreprise (ex. 30 SMS/h) | ❌ à ajouter |
| Détection d'anomalie (volume > 3× la moyenne) → pause automatique + alerte | ❌ à ajouter |
| **Budget global quotidien de la plateforme** (ex. 50 € de SMS/jour) → arrêt et alerte | ❌ à ajouter : c'est le filet contre une facture catastrophique |
| Boucles : jamais de SMS vers les numéros de l'entreprise, de ses collaborateurs ou des lignes Venio | ❌ à ajouter |
| Erreurs fournisseur : nouvel essai avec délai croissant sur erreur temporaire, aucun nouvel essai sur refus ; coupure automatique si > 20 % d'échecs sur 15 min | Partiel (échec journalisé, crédit rendu) |
| Préfixes à risque de fraude (« SMS pumping ») | Faible exposition : on n'écrit qu'à des numéros qui ont appelé ; seuls les mobiles français sont autorisés ✅ |

### 5.4 Scénarios de quotas (coût SMS de 0,054 € — OVH ; 0,074 € — Twilio)

| Scénario | Starter / Pro / Business | Coût si 100 % consommé (OVH) | Coût (Twilio) | Marge brute au pire* |
|---|---|---|---|---|
| **A — actuel** | 50 / 200 / 600 | 2,70 / 10,80 / 32,40 € | 3,70 / 14,70 / 44,40 € | 56 % / 67 % / 66 % |
| B — généreux | 100 / 400 / 1 000 | 5,40 / 21,60 / 54 € | 7,40 / 29,40 / 73,60 € | 47 % / 52 % / 52 % |
| C — réduit + usage | 25 / 100 / 300 puis 0,09 €/crédit | 1,35 / 5,40 / 16,20 € | 1,85 / 7,35 / 22,20 € | > 60 % partout, mais facture variable mal perçue par les artisans |

\* Marge après SMS, ligne, minutes, Stripe et 15 min de support par mois (détail § 8).

**Recommandation :** garder **A** pendant les pilotes, mesurer la consommation réelle, puis ajuster. Si le fournisseur
retenu est Twilio, **passer les packs à 12 € (100) et 45 € (500)** : à 40 € les 500, la marge tombe à 5 %. Ne jamais
proposer d'« illimité ». Si les rappels de rendez-vous par SMS sont ajoutés, prévoir **≈ 2 crédits par rendez-vous**
et le dire dans le comparatif (un Pro à 60 rendez-vous par mois consommerait 120 crédits en rappels seuls).

---

## 6. Tableau de contrôle du lancement (12 points)

Règle : **un point n'est validé que si sa preuve est jointe.** Aucun n'est validé aujourd'hui. **Progression : 0 / 12 = 0 %.**
Version interactive : page partagée (voir le lien dans la réponse), qui exige la preuve avant de valider.

| # | Point | Actions | Dépendances | Preuves exigées | Tests | Priorité | Responsable | Statut |
|---|---|---|---|---|---|---|---|---|
| 1 | Marque et nom de domaine | Recherche d'antériorité INPI / EUIPO sur « Venio » (classes 9, 35, 42) ; dépôt si libre ; achat du domaine ; DNS ; emails authentifiés (SPF, DKIM, DMARC) | — | Rapport de recherche, certificat de dépôt, facture du domaine, résultat DMARC | Email de test noté ≥ 9/10 (mail-tester) | Haute | Associé « business » | Non commencé |
| 2 | Entreprise et facturation | Création de la société, SIREN, compte bancaire pro, régime de TVA, numérotation des factures, activation du compte Stripe | — | Kbis, attestation de TVA, compte Stripe activé | Facture test conforme (mentions obligatoires) | **Bloquante** | Associé « business » + comptable | Non commencé |
| 3 | CGV, CGU, mentions légales | Rédaction avec un avocat à partir des brouillons ; acceptation horodatée à l'inscription | 2 | Documents signés par l'avocat, version publiée, horodatage d'acceptation en base | Inscription test → acceptation enregistrée | **Bloquante** | Avocat + associé | En cours (brouillons) |
| 4 | RGPD et sous-traitance | Contrat de sous-traitance, registre (deux rôles), liste des sous-traitants, politique de conservation, procédure de violation, avis sur le SMS d'appel manqué | 2, 3 | Documents validés, registre à jour, avis écrit de l'avocat | Exercice de violation simulée (1 h) | **Bloquante** | Avocat + CTO | En cours (brouillon) |
| 5 | Authentification sécurisée | Mot de passe oublié, vérification email, politique de mot de passe, sessions révocables, double authentification pour l'équipe | — | Code fusionné + tests | Parcours de réinitialisation ; jeton expiré refusé ; force brute bloquée | **Bloquante** | CTO | En cours |
| 6 | Séparation des données | Test automatique « toute table a la RLS », revue du back-office, test d'intrusion léger externe | 5 | Rapport de test d'intrusion, test automatique au vert | Tentatives d'accès croisé (API et SQL) | **Bloquante** | CTO + prestataire | À vérifier (tests internes au vert) |
| 7 | Sauvegardes et restauration | Supabase Pro, export hebdomadaire chiffré en UE, procédure écrite | Budget | Captures des sauvegardes, procédure, **compte rendu d'une restauration réelle** (durée, perte) | Restauration complète sur une base jetable | **Bloquante** | CTO | Non commencé |
| 8 | SMS testés sur plusieurs opérateurs | Choix du fournisseur, enregistrement de l'expéditeur, envois réels vers Orange, SFR, Bouygues, Free, MVNO ; STOP ; accusés de réception | 1, 4 | Tableau des envois (opérateur, délai, délivré, affichage de l'expéditeur), captures d'écran | 5 SMS × 5 opérateurs ; STOP effectif ; caractère spécial | **Bloquante** pour le module appels | CTO | Non commencé |
| 9 | Réservations et notifications | Campagne de tests sur mobile et ordinateur, emails sur Gmail / Outlook / Orange, rappel J-1, report, annulation, fuseau, changement d'heure | — | Rapport de test signé, captures | 20 scénarios scriptés | Haute | Associé + CTO | À vérifier (email réel OK le 18/11) |
| 10 | Impayés et résiliations | Paiement test, échec de carte (cartes de test Stripe), délai de grâce, suspension, réactivation, résiliation en fin de période, remboursement | 2 | Journal des événements Stripe de test, captures des états | 6 scénarios avec les cartes de test | **Bloquante** | CTO + associé | À vérifier (testé en simulation) |
| 11 | Limites de consommation SMS | Grand livre, alertes 80/100 %, page consommation, back-office, budget global, détection d'anomalie | 8 | Tests automatiques, captures | Épuisement de quota, pack, anomalie simulée, budget global atteint | **Bloquante** pour le module appels | CTO | En cours (quota et plafonds en place) |
| 12 | Assurance professionnelle | Devis RC Pro + cyber (responsabilité de l'éditeur, perte de données, violation) | 2 | Attestation d'assurance | — | Haute | Associé « business » | Non commencé |

---

## 7. Plan d'action sur 30 jours

Principe : **ce qui protège les données et l'argent d'abord**, les fonctionnalités ensuite. Lancement payant visé
**après** les pilotes, vers J+45, pas à J+30.

**Semaine 1 — Décisions et corrections sans regret**
- Corriger la page Tarifs (I1–I3) et masquer le consentement SMS inutile (I6). *CTO, 0,5 j*
- Passer Supabase en Pro, mettre en place l'export externe, **tester une restauration**. *CTO, 1 j, ≈ 25 $/mois (accord requis)*
- Vérifier le stockage des fichiers et le trajet des requêtes (I9, I10). *CTO, 0,5 j*
- Mot de passe oublié + vérification email. *CTO, 1,5 j*
- Recherche INPI/EUIPO, choix de la structure, prise de contact avec un avocat et un comptable. *Associé*
- **Choisir le fournisseur de téléphonie et de SMS** (§ 11). *Ensemble*

**Semaine 2 — Sécurité et RGPD**
- Back-office v1 (offres, surcharges, suspension, consommation, accès support journalisé). *CTO, 4 j*
- Journal des accès sensibles, sessions révocables, test « toute table a la RLS ». *CTO, 2 j*
- Suppression et export d'un contact ; purge selon les durées de conservation. *CTO, 2,5 j*
- Paiement test Stripe de bout en bout et scénarios d'impayés (point 10). *Associé + CTO*
- Rédaction juridique avec l'avocat (points 3 et 4). *Associé*

**Semaine 3 — Téléphonie et SMS réels**
- Branchement du fournisseur choisi (adaptateur), numéro de test, renvoi sur non-réponse depuis des lignes Orange, SFR, Bouygues, Free. *CTO, 3 j*
- Grand livre des crédits, accusés de réception, alertes 80/100 %, budget global, anomalies. *CTO, 3 j*
- Filtrage niveau 1 : nouvelles règles, tri sur la page, étiquettes. *CTO, 5 j (en partie semaine 4)*
- Campagne de tests SMS multi-opérateurs (point 8), tests de réservation (point 9).

**Semaine 4 — Pilotes et préparation commerciale**
- Démarrage de 3 pilotes en envoi réel plafonné (kit 06). *Associé*
- 5 tests utilisateurs observés (inscription → première réservation). *Associé*
- Test d'intrusion léger commandé ; assurance souscrite ; documents juridiques signés.
- Revue go / no-go sur le tableau du § 6.

**Après les premiers clients (ne bloque pas) :** serveur vocal (niveau 2), double authentification pour les
clients, rappels SMS, invitations (si l'offre « plusieurs utilisateurs » est retirée d'ici là), messagerie, IA
(niveau 3), chiffrement applicatif des notes, synchronisation d'agenda.

---

## 8. Audit économique

### 8.1 Hypothèses (€ HT / mois, à revérifier sur les grilles officielles)

| Poste | Hypothèse | Source / base |
|---|---|---|
| SMS France | 0,045 € (Brevo) · 0,054 € (OVH) · 0,074 € (Twilio, 0,0798 $) | Comparatifs 2026, grille Twilio |
| Numéro français | 1,24 € / ligne (1,35 $) | Grille Twilio Voice France |
| Minutes entrantes | 0,009 € / min, ≈ 30 s par appel transféré | Idem |
| Stripe | 1,5 % + 0,25 € (carte UE) + 0,7 % (Stripe Billing) | Grille Stripe |
| Support | **15 min / client / mois à 30 €/h** | Hypothèse : c'est le poste le plus incertain |
| Hébergement ≤ 30 clients | Render Starter 6,5 € + Supabase Pro 23 € + domaine 2 € | Grilles publiques |
| Hébergement ≤ 150 clients | ≈ 130 € (instance API plus grosse, calcul Supabase, Netlify Pro, emails) | Estimation |
| Frais fixes d'entreprise | ≈ 130 € (RC Pro + cyber, comptable, banque, outils) | Estimation, devis à obtenir |
| IA (niveau 3, plus tard) | ≈ 0,01–0,03 € par message vocal | Non inclus : option |

### 8.2 Coût et marge par client

| Usage | Starter (29 €) | Pro (69 €) | Business (149 €) |
|---|---|---|---|
| Léger (15 / 40 / 120 SMS) | coût 10,54 € · marge 64 % | 12,93 € · 81 % | 22,01 € · 85 % |
| Normal (35 / 120 / 380 SMS) | 11,75 € · 60 % | 17,76 € · 74 % | 37,72 € · 75 % |
| **Quota épuisé** (50 / 200 / 600 SMS) | 12,65 € · 56 % | 22,60 € · 67 % | 51,02 € · 66 % |

Sur le Starter, **le support (7,50 €) pèse plus que les SMS** : un client Starter qui demande une heure d'aide par
mois devient déficitaire. D'où l'importance de l'assistant de configuration et d'une aide en ligne.

### 8.3 Simulations (mix 40 % Starter, 45 % Pro, 15 % Business ; usage normal ; SMS à 0,054 €)

| Clients | Chiffre d'affaires | Coûts variables | Hébergement | Marge brute | Frais fixes | Résultat avant rémunérations | Coût moyen par client |
|---|---|---|---|---|---|---|---|
| 10 | 650 € | 183 € | 32 € | 435 € (67 %) | 130 € | 305 € | 21,50 € |
| 30 | 1 950 € | 550 € | 32 € | 1 368 € (70 %) | 130 € | 1 238 € | 19,40 € |
| 100 | 6 500 € | 1 835 € | 133 € | 4 532 € (70 %) | 130 € | 4 402 € | 19,68 € |
| 300 | 19 500 € | 5 505 € | 267 € | 13 728 € (70 %) | 130 € | 13 598 € | 19,24 € |

**Seuil de rentabilité** (revenu moyen 65 €, contribution 46,65 € par client) : **3 clients** pour couvrir
l'infrastructure seule ; **78 clients** pour une rémunération chargée de 3 500 €/mois ; **154 clients** pour deux.

### 8.4 Gros consommateurs

Avec le quota dur, un client ne peut pas coûter plus que ses crédits inclus + les packs qu'il paie. **La marge d'un
abonnement ne s'annulerait** qu'à : Starter ≈ 360 SMS/mois, Pro ≈ 1 080, Business ≈ 2 490 (au prix OVH), soit 5 à 7
fois le quota. Le risque réel est donc ailleurs :
- **packs SMS sous-tarifés si Twilio** (marge 22 % sur le pack de 100, **5 % sur celui de 500**) ;
- **un défaut de quota** (bogue, surcharge mal posée) → d'où le budget global quotidien et les alertes ;
- **le support**, non plafonné par nature.

---

## 9. Risques prioritaires

| # | Risque | Probabilité | Impact | Réponse |
|---|---|---|---|---|
| R1 | Perte de la base (aucune sauvegarde aujourd'hui) | Moyenne | **Critique** | Sauvegardes + restauration testée en semaine 1 |
| R2 | Accès d'une entreprise aux données d'une autre | Faible (RLS testée) | **Critique** | Test automatique de RLS, back-office sans contournement, test d'intrusion |
| R3 | Compte bloqué faute de « mot de passe oublié » | **Certaine** dès les premiers clients | Élevé | Semaine 1 |
| R4 | SMS d'appel manqué requalifié en prospection non consentie | Moyenne | Élevé (sanction CNIL, image) | Texte neutre, avis d'avocat, serveur vocal en option |
| R5 | Promesses commerciales non tenues (messagerie, utilisateurs, limites) | **Certaine** aujourd'hui | Élevé | Correction de la page Tarifs semaine 1 |
| R6 | Facture SMS anormale (bogue, abus) | Faible | Élevé | Budget global, anomalies, plafonds configurables |
| R7 | Nom « Venio » déjà protégé | Inconnue | Élevé | Recherche INPI/EUIPO avant toute dépense marketing |
| R8 | SMS non délivrés ou expéditeur filtré par un opérateur | Moyenne | Moyen | Tests multi-opérateurs, enregistrement de l'expéditeur, accusés de réception |
| R9 | Coût du support supérieur à l'hypothèse | Moyenne | Moyen (rentabilité Starter) | Aide en ligne, assistant, suivi du temps de support par client |
| R10 | Perte des photos (stockage éphémère) | À vérifier | Moyen | Vérification semaine 1 |
| R11 | Fournisseur de téléphonie qui exige des justificatifs (adresse en France, identité) avant d'attribuer un numéro | Élevée | Moyen (délai) | Lancer la demande dès le choix du fournisseur |
| R12 | Dépendance à des offres gratuites (veille Render, pause Supabase) | **Certaine** | Moyen | Offres payantes au lancement (≈ 30 €/mois) |

---

## 10. Modifications techniques proposées

| Priorité | Modification | Effort | Remarque |
|---|---|---|---|
| P0 | Corriger la page Tarifs et les droits d'offre (I1–I4, I6) | 0,5 j | Aucun risque technique |
| P0 | Mot de passe oublié, vérification email, politique de mot de passe | 1,5 j | |
| P0 | Sauvegarde externe + procédure et test de restauration | 1 j | + Supabase Pro |
| P0 | Back-office v1 : offres, surcharges par entreprise, suspension, consommation, accès support journalisé | 4 j | Rôle « équipe Venio » séparé, double authentification obligatoire |
| P0 | Test automatique « toute table d'entreprise a la RLS » | 0,5 j | |
| P0 | Suppression d'un contact et d'un compte entreprise | 1,5 j | |
| P0* | Adaptateur du fournisseur de téléphonie réel + accusés de réception SMS | 3 j | *Bloquant pour le module appels seulement |
| P0* | Grand livre des crédits, alertes 80/100 %, budget global, anomalies, plafond configurable | 3 j | |
| P1 | Filtrage niveau 1 (règles, texte neutre, tri sur la page, étiquettes) | 5 j | Avant les pilotes |
| P1 | Journal des accès sensibles, sessions révocables | 2 j | |
| P1 | Export d'un contact, purge selon les durées de conservation | 1,5 j | |
| P1 | Invitations et matrice de rôles | 2 j | P0 si l'offre multi-utilisateurs est maintenue |
| P1 | Supervision (Sentry, disponibilité), audit des dépendances | 0,5 j | |
| P2 | Serveur vocal (niveau 2) | 2 j | Après le choix du fournisseur |
| P2 | Rappels et confirmations par SMS | 2 j | Consomment des crédits |
| P2 | Double authentification pour les clients, chiffrement applicatif des notes | 2 j | |
| P3 | Messagerie vocale transcrite + IA (niveau 3), messagerie client | 4 j + | Après les pilotes |

**Total P0 hors téléphonie : ≈ 9 jours ; avec téléphonie et SMS : ≈ 15 jours.**

**Ce qu'on ne change pas :** l'architecture (API FastAPI, PostgreSQL avec RLS, file de tâches) tient ; le moteur de
règles SMS est extensible tel quel ; Stripe reste la source de vérité de la facturation.

---

## 11. Services et connecteurs proposés (aucune souscription sans votre accord)

| Service | Utilité | Coût indicatif |
|---|---|---|
| Supabase Pro | Sauvegardes quotidiennes, pas de mise en pause | 25 $/mois |
| Render Starter | API sans mise en veille | 7 $/mois |
| Stockage objet en UE (Scaleway, OVHcloud) | Copie externe chiffrée des sauvegardes | < 5 €/mois |
| Fournisseur de téléphonie + SMS : **Twilio** (le plus documenté, numéros français, SVI), **Telnyx** (moins cher), **OVHcloud** (français, SMS moins chers, API téléphonie plus limitée) | Récupération d'appels réelle | Numéro ≈ 1–2 €/mois + usage |
| Brevo SMS (déjà connecté pour les emails) | SMS sans nouveau fournisseur si la téléphonie est prise ailleurs | ≈ 0,045 €/SMS |
| Sentry (gratuit) + surveillance de disponibilité (gratuite) | Alertes d'erreurs et de panne | 0 € |
| Nom de domaine | Marque, emails authentifiés | ≈ 15 €/an |
| Avocat (forfait CGV + RGPD), expert-comptable, RC Pro + cyber | Points 2, 3, 4, 12 | Devis à demander |
| Test d'intrusion léger | Point 6 | ≈ 1 500 – 4 000 € (devis) |

---

## 12. Décisions attendues

1. Corriger la page Tarifs maintenant (retirer messagerie et utilisateurs multiples) ou développer invitations et messagerie avant le lancement ?
2. Fournisseur de téléphonie : Twilio, Telnyx ou OVHcloud ? Et SMS chez le même ou chez Brevo ?
3. Accord pour Supabase Pro (25 $/mois) et Render Starter (7 $/mois) dès maintenant ?
4. Quotas : on garde le scénario A pour les pilotes ?
5. Serveur vocal : option payante, incluse en Business, ou incluse partout ?
6. Qui porte le juridique et l'assurance côté associés ?

---

## Sources (consultées le 19/11/2026, à revérifier avant décision)

- Supabase, sauvegardes selon l'offre : [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/), [vallettasoftware.com](https://vallettasoftware.com/blog/post/supabase-backup-restore), grille officielle : <https://supabase.com/pricing>
- Twilio Voice France (numéro, minutes entrantes) : <https://www.twilio.com/en-us/voice/pricing/fr>
- Prix des SMS France : [OVHcloud](https://www.ovhcloud.com/fr/sms/prices/), [Brevo (getkanal)](https://getkanal.com/fr/blog/brevo-sms.md), [Twilio](https://twilio.com/sms/pricing/fr), [comparatif digitiz](https://digitiz.fr/meilleures-api-sms/)
- Réforme du démarchage téléphonique du 11 août 2026 : [actu-juridique.fr](https://www.actu-juridique.fr/affaires/droit-economique/reforme-du-demarchage-telephonique-mise-en-pratique-depuis-le-11-aout-2026/), [Selectra, cas des SMS](https://selectra.info/telecom/actualites/marche/demarchage-par-sms-angle-mort), [CNIL](https://cnil.fr/fr/node/168599)
- Sources du document 05 (Twilio, Telnyx, Brevo, Stripe) toujours valables.
