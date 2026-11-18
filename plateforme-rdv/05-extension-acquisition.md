# 05 — Extension stratégique : appels manqués, vitrine, Stripe, direction artistique

[← Sommaire](README.md)

> **Statut : conception à valider (18/11/2026). Rien de ce document n'est encore développé.**
> Il répond aux directives « Avant d'implémenter ces modules » : compatibilité avec l'existant, fournisseurs,
> coûts, limites par offre, événements et webhooks, sécurité, interfaces, tests — puis met à jour la feuille de route.
> Les prix fournisseurs viennent de pages publiques ou de comparatifs tiers relevés en novembre 2026 (sources en fin
> de document) : **à revérifier sur les grilles officielles avant toute décision tarifaire**.

## Sommaire

- [E. Nouvelle proposition de valeur](#e-nouvelle-proposition-de-valeur-trois-piliers)
- [A. Récupération des appels manqués](#a-récupération-automatique-des-appels-manqués)
- [C. Stripe et parcours commercial](#c-stripe-et-parcours-commercial)
- [D. Direction artistique et design system](#d-direction-artistique-et-design-system)
- [B. Vitrine commerciale et démonstration](#b-vitrine-commerciale-et-démonstration)
- [Offres et limites mises à jour](#offres-et-limites-mises-à-jour)
- [Sécurité et conformité](#sécurité-et-conformité-transverses)
- [Tests](#stratégie-de-tests)
- [Feuille de route mise à jour](#feuille-de-route-mise-à-jour)
- [Décisions attendues](#décisions-attendues-de-votre-part)

L'ordre ci-dessus est volontaire : la direction artistique (D) passe **avant** la vitrine (B), comme demandé, et
Stripe (C) avant la vitrine, parce que la page tarifs et l'inscription en dépendent.

---

## E. Nouvelle proposition de valeur (trois piliers)

| Pilier | Promesse | Ce qui la prouve dans le produit |
|---|---|---|
| **1. Ne plus perdre de prospects** | Un appel sans réponse devient une demande de rendez-vous. | Module A : SMS automatique, lien suivi, statistique « prospects récupérés ». |
| **2. Simplifier la prise de rendez-vous** | Le client décrit son besoin et réserve seul, en 2 minutes, sur mobile. | Parcours conversationnel, créneaux réels, photos, zone d'intervention (déjà en pilote 0.1). |
| **3. Automatiser le suivi** | Confirmations, rappels, report et annulation sans intervention. | File de notifications, liens signés, rappels J-1 (en place) ; messagerie (à venir). |

**Accroche proposée :** « Chaque appel, chaque visite, une opportunité de rendez-vous. »

**Ce que ça change dans le positionnement du [01-strategie.md](01-strategie.md) :** rien sur la cible (entreprises à
devis : rénovation, déménagement, services à domicile), beaucoup sur l'argumentaire. « Le premier rendez-vous qui vaut
quelque chose » reste la promesse de fond ; les appels manqués deviennent **la porte d'entrée commerciale**, parce que
le bénéfice est immédiat et mesurable : *« le mois dernier, 23 appels sans réponse, 9 rendez-vous récupérés »*.

**Mon avis franc :** c'est un bon levier, à condition de le mesurer honnêtement (voir A.6 : on n'affiche que ce qui
est réellement mesuré). C'est aussi le module qui a le plus de coûts variables et de contraintes légales : c'est
pourquoi il est conçu ci-dessous avec ses limites plutôt que présenté comme « illimité ».

---

## A. Récupération automatique des appels manqués

### A.1 Compatibilité avec l'existant

Le socle de la pilote 0.1 couvre déjà l'essentiel de l'aval :

| Besoin du module | Existant réutilisé | À ajouter |
|---|---|---|
| Lien vers le parcours | Page publique `/r/<slug>` + sessions de parcours | Paramètre d'origine `src=missed_call` + jeton de suivi |
| Envoi différé, réessais | Table `job` + worker (SKIP LOCKED, réessais espacés) | Types de tâche `missed_call_evaluate`, `sms_send` |
| Historique des envois | Table `notification` (canal `sms` déjà prévu, `cost_micros`) | Statut de livraison SMS |
| Quotas | `plan_entitlement` (`limit.sms_per_month`), `usage_counter` | Clés `feature.missed_calls`, `limit.phone_lines` |
| Isolation entreprises | RLS sur toutes les tables, `tenant_id` partout | Idem sur les nouvelles tables |
| Statistiques | `analytics_event`, entonnoir | Entonnoir « appel → SMS → clic → parcours → RDV » |

**Une contrainte d'hébergement bloquante :** en production, les fournisseurs de téléphonie appellent notre API par
webhook pendant ou juste après l'appel. L'offre gratuite de Render se met en veille et redémarre en 30 à 60 s environ :
un webhook peut échouer ou arriver en retard. **Le module A nécessite une instance toujours active** (Render Starter,
de l'ordre de 7 $/mois, à vérifier) ou un autre hébergeur sans mise en veille. La version gratuite actuelle suffit pour
développer et tester avec un fournisseur simulé.

### A.2 Comment détecter un appel manqué de façon fiable

Une application web ne voit pas les appels d'une ligne téléphonique classique. Il faut que l'appel passe, à un moment,
par une infrastructure qui nous prévient. Quatre modes, du plus simple au plus intégré :

| Mode | Principe | Fiabilité du « manqué » | Effort pour l'entreprise | Quand le proposer |
|---|---|---|---|---|
| **1. Renvoi sur non-réponse** *(recommandé au lancement)* | L'entreprise garde son numéro et programme chez son opérateur un renvoi « sur non-réponse / occupé / injoignable » vers un numéro Venio. Notre fournisseur reçoit l'appel renvoyé, diffuse un court message (« … vous allez recevoir un SMS »), raccroche, puis nous prévient. | **Élevée** : si l'appel arrive chez nous, c'est que l'entreprise n'a pas décroché. | Faible : un code à composer ou une option dans l'espace client de l'opérateur. | Artisans, indépendants, TPE sur mobile ou ligne fixe. |
| **2. Numéro hébergé** | Le numéro publié est un numéro Venio ; chaque appel est transféré vers le mobile de l'entreprise avec un délai de sonnerie (ex. 20 s). Le fournisseur nous renvoie l'issue : décroché, pas de réponse, occupé, échec. | **Élevée**, et on mesure aussi les appels décrochés. | Moyen : changer le numéro affiché ou le porter chez le fournisseur. | Entreprises qui créent un nouveau numéro, campagnes de pub. |
| **3. Standard professionnel existant** | Connexion aux webhooks du standard cloud de l'entreprise (Aircall, Ringover, 3CX…) qui signale lui-même les appels manqués. | Dépend du standard ; souvent bonne. | Faible si le standard est compatible. | PME déjà équipées. Un connecteur par standard, au cas par cas. |
| **4. Transfert d'appels vers notre infrastructure** | Variante du mode 2 pour un standard existant : il transfère les appels non pris vers un numéro Venio. | Élevée. | Moyen. | Quand le mode 3 n'existe pas pour ce standard. |

**Ce que je déconseille :** les applications mobiles qui lisent le journal d'appels du téléphone (fragile, interdit ou
très restreint par les stores, et données de tous les appels personnels).

**Point à vérifier avant de promettre le mode 1 :** que le numéro de l'appelant d'origine est bien transmis lors du
renvoi chez les principaux opérateurs français (Orange, SFR, Bouygues, Free) et pour les lignes fixes. C'est le cas
général, mais ce sera le premier test terrain avec les pilotes ; sans numéro d'origine, pas de SMS possible.

### A.3 Architecture indépendante du fournisseur

```
  Fournisseur téléphonie (Twilio, Telnyx, Vonage…, ou standard Aircall/Ringover…)
        │  webhook signé
        ▼
  POST /api/telephony/{provider}/{line_token}     ← une URL secrète par ligne
        │  1. vérifier la signature (adaptateur)   2. enregistrer l'événement brut (idempotent)
        │  3. traduire en événement normalisé       4. mettre à jour la machine d'états de l'appel
        ▼
  call (état normalisé) ──► à la fin de l'appel : tâche missed_call_evaluate (run_at = fin + délai de validation)
                                                        │
                                                        ▼
                                          moteur de règles (A.5) ─► décision + raison, journalisées
                                                        │ « envoyer »
                                                        ▼
                                          tâche sms_send ─► adaptateur SMS (Brevo, Twilio, Telnyx…)
                                                        │
                              webhook de livraison ◄────┘   clic sur le lien ─► /c/{jeton} ─► /r/{slug}?src=missed_call
```

**Deux interfaces internes, distinctes** (on peut acheter la téléphonie chez l'un et les SMS chez l'autre) :

```python
class TelephonyAdapter(Protocol):
    code: str                                    # "twilio", "telnyx", "aircall", "simulator"…
    def verify(self, request) -> None: ...       # signature du webhook, sinon 401
    def parse(self, request) -> list[CallEvent]: ...
    def answer_instructions(self, line) -> Response | None: ...   # modes 1/2 : message vocal, transfert

@dataclass
class CallEvent:
    provider: str; provider_call_id: str; type: CallEventType   # voir A.4
    from_number: str | None; to_number: str; occurred_at: datetime
    raw_ref: UUID                                 # pointeur vers l'événement brut conservé

class SmsAdapter(Protocol):
    code: str
    def send(self, to: str, body: str, sender: str, idempotency_key: str) -> SmsResult: ...
    def parse_delivery(self, request) -> DeliveryReport | None: ...
```

Un adaptateur **`simulator`** est livré en premier : il sert aux tests automatiques, au développement et à la
démonstration de la vitrine (aucun appel ni SMS réel).

**Premier fournisseur réel :** à choisir (décision 1). Mes critères : numéros français disponibles avec les justificatifs
demandés (adresse en France), webhooks d'appel complets, prix, support en Europe. Twilio et Telnyx sont les candidats
évidents ; pour les SMS seuls, Brevo est déjà utilisé pour les emails et semble moins cher vers la France (≈ 0,045 €
contre ≈ 0,08 $ chez Twilio, à vérifier).

### A.4 Événements normalisés

| Événement Venio | Sens | Exemple de source (à confirmer dans la documentation de chaque fournisseur) |
|---|---|---|
| `call.inbound` | Un appel arrive sur une ligne suivie | Webhook d'appel entrant |
| `call.answered` | Quelqu'un a décroché (l'entreprise, pas notre messagerie) | Statut du transfert « décroché » (mode 2) |
| `call.missed` | Sonnerie sans réponse, occupé, injoignable | Statut du transfert « pas de réponse / occupé » (mode 2) ; **tout appel reçu en mode 1** ; « appel manqué » d'un standard (mode 3) |
| `call.abandoned` | L'appelant a raccroché avant la fin de la sonnerie ou du message | Fin d'appel avec durée courte, sans réponse |
| `call.transferred` | L'appel a été passé à un autre poste ou numéro | Événement de transfert du standard |
| `call.completed` | Fin d'appel (durée, issue finale) | Webhook de fin d'appel |

**Machine d'états d'un appel :** `ringing → answered | missed | abandoned | transferred → completed`.
Un appel `answered` ou `transferred` puis décroché **n'est jamais** traité comme manqué, même si un événement
« manqué » arrive ensuite dans le désordre (les webhooks n'arrivent pas toujours dans l'ordre).

**Période de validation :** la décision n'est prise qu'à `fin d'appel + délai` (90 s par défaut, réglable de 30 s à
10 min). Pendant ce délai, un rappel décroché, un transfert abouti ou un second appel du même numéro **annulent ou
regroupent** la décision. C'est ce qui évite les SMS envoyés pendant une sonnerie prolongée ou un transfert.

### A.5 Règles de déclenchement (moteur de décision)

Chaque décision est journalisée avec sa **raison** (affichée dans l'historique : « Non envoyé — numéro masqué »).
Les règles s'appliquent dans cet ordre ; la première qui bloque l'emporte.

| # | Règle | Par défaut | Réglable |
|---|---|---|---|
| 1 | Module activé et ligne active | — | Oui |
| 2 | Appel confirmé « non pris en charge » après la période de validation | 90 s | 30 s – 10 min |
| 3 | Numéro appelant présent (pas « masqué », « anonyme », « inconnu ») | Bloque | Non |
| 4 | Numéro capable de recevoir un SMS : mobile français (+33 6, +33 7) ; autres pays et fixes : refus, ou vérification par le service de consultation du fournisseur s'il est activé | Mobiles FR seulement | Pays acceptés |
| 5 | Numéro non exclu (liste d'exclusion de l'entreprise, collaborateurs, numéros de l'entreprise elle-même, numéro Venio) — **évite les boucles** quand l'entreprise rappelle ou se transfère | — | Liste |
| 6 | Pas d'opposition : le numéro n'a pas répondu STOP (liste d'opposition propre à chaque entreprise) | Bloque | Non |
| 7 | Anti-rafale : un seul SMS pour plusieurs appels rapprochés du même numéro | 1 SMS / 24 h / numéro | 1 h – 7 j |
| 8 | Plafond par numéro sur une période | 3 SMS / 30 jours | Oui |
| 9 | Pas déjà traité : pas de SMS si l'appel a été rappelé et décroché entre-temps, ou si un autre scénario a déjà traité ce même appel (clé d'unicité par appel fournisseur) | — | Non |
| 10 | Pas de rendez-vous ou de demande en cours récente pour ce numéro (le prospect est déjà dans le circuit) | 7 jours | Oui |
| 11 | Plage d'envoi : jours et heures d'envoi autorisés | Lun.–sam. 8 h–20 h, hors jours fériés | Oui (dans les bornes légales, voir A.9) |
| 12 | Quota disponible (forfait + crédits) | — | Selon offre |

**Hors plage horaire :** l'appel est conservé et le SMS est programmé à l'ouverture suivante, **si** l'appel a moins de
12 h (réglable) ; au-delà, pas d'envoi, mais l'appel reste visible dans le tableau de bord pour rappel manuel.

**Erreurs d'envoi :** réessais espacés (comme les emails) sur les erreurs temporaires ; pas de réessai sur les erreurs
définitives (numéro invalide, opposition) ; alerte à l'entreprise si le taux d'échec dépasse 20 % sur 24 h.

### A.6 Suivi commercial et statistiques

Chaque appel suivi crée une ligne dans **Appels manqués** (nouvelle entrée de la navigation latérale) :

| Colonne | Source | Mesurable ? |
|---|---|---|
| Numéro (masqué partiellement : 06 •• •• 12 34), date, heure | Événement d'appel | Oui |
| Statut de l'appel (manqué, abandonné, rappelé…) | Machine d'états | Oui |
| SMS : envoyé / non envoyé + raison | Moteur de règles | Oui |
| Livraison : livré, échoué, en attente | Accusé de réception fournisseur | **Si le fournisseur et l'opérateur le transmettent** ; sinon « inconnu », jamais supposé |
| Lien ouvert | Lien court `/c/{jeton}` à usage suivi | Oui (un ouvreur de lien automatique peut créer un faux clic : signalé comme estimation) |
| Parcours commencé, réservation finalisée | Session et rendez-vous rattachés au jeton | Oui |
| Action : « Rappeler », « Marquer comme traité », « Exclure ce numéro » | — | — |

**Indicateurs (page Statistiques, onglet « Appels manqués ») :** appels manqués, SMS envoyés, taux de livraison,
clics, parcours commencés, rendez-vous obtenus, **taux de récupération = rendez-vous / appels manqués éligibles**,
et le détail des non-envois par raison. Avertissement de faible volume en dessous de 20 appels, comme pour l'entonnoir existant.

**Rapport mensuel de valeur** (déjà prévu dans la stratégie de fidélisation) : « 23 appels manqués, 17 SMS, 9 rendez-vous ».

### A.7 Modèles de SMS — attention au coût caché des caractères

Un SMS standard contient 160 caractères (153 par segment quand il y en a plusieurs). **Un seul caractère hors de
l'alphabet SMS de base (par exemple ô, ê, â, î, û, ç minuscule, À, les guillemets « », les apostrophes courbes ’) fait
passer tout le message à 70 caractères par segment.** Le message d'exemple du cahier des charges (265 caractères avec un lien
court) coûte ainsi **4 SMS** à cause de « bientôt » et « À » ; sans ces deux caractères, il en coûterait 2.

L'éditeur de modèles affichera donc en direct : nombre de caractères, **nombre de SMS facturés**, et proposera de
remplacer les caractères coûteux. Le lien est un lien court (≈ 25 caractères).

Modèles fournis — **chacun tient en un seul SMS** (vérifié : 85 à 157 caractères avec un nom d'entreprise de
15 caractères et un lien court de 26 caractères) :

| Ton | Texte (variables entre accolades) |
|---|---|
| Professionnel | `{Entreprise} : nous n'avons pas pu prendre votre appel. Décrivez votre besoin et réservez votre rendez-vous ici : {lien} STOP au {stop}` |
| Chaleureux | `Bonjour, ici {Entreprise} ! Désolés d'avoir manqué votre appel. Dites-nous tout et choisissez votre créneau : {lien} STOP au {stop}` |
| Commercial | `{Entreprise} : votre projet nous intéresse ! Décrivez-le en 2 min et réservez un RDV gratuit : {lien} STOP au {stop}` |
| Très court | `{Entreprise} : appel manqué, réservez ici {lien} STOP au {stop}` |

« é », « è », « à », « ù » et « É » font partie de l'alphabet de base : ils ne coûtent rien de plus et sont gardés.
Ce sont « ê », « â », « î », « ô », « û », « ç », « À » et la typographie courbe qu'il faut éviter.
La mention STOP est discutée en A.9.

### A.8 Paramétrage entreprise — rubrique « Récupération des appels manqués »

Dans **Paramètres → Appels manqués** :

1. **Activation** (interrupteur) et état de la ligne (« Renvoi détecté le 18/11 à 10 h 12 » après l'appel de test).
2. **Numéro(s) concerné(s)** et mode (A.2), avec un **assistant de mise en place** : numéro Venio à configurer,
   instructions de renvoi par opérateur, bouton « Appeler pour tester ».
3. **Message vocal** joué à l'appelant (mode 1) : texte ou enregistrement.
4. **Modèle de SMS** (4 tons + personnalisé), aperçu téléphone, compteur de SMS facturés.
5. **Lien de réservation** : page publique ou parcours précis.
6. **Horaires d'envoi**, jours fériés, comportement hors horaires.
7. **Délai de validation** avant envoi.
8. **Limites par numéro** : anti-rafale, plafond sur 30 jours.
9. **Numéros exclus** (collaborateurs, fournisseurs, numéros personnels) + import.
10. **Historique** (lien vers la page Appels manqués) et **consommation** du mois (A.10).

### A.9 Conformité — à faire valider par un avocat

- **Nature du SMS :** il répond à une démarche du prospect (il vient d'appeler l'entreprise). On peut soutenir qu'il ne
  s'agit pas de prospection commerciale au sens de l'article L34-5 du CPCE, qui exige un consentement préalable des
  particuliers. **Ce n'est pas acquis** : un texte trop promotionnel (ton « Commercial ») peut être requalifié. Position
  retenue en attendant l'avis juridique : contenu limité à la réponse à l'appel, identification de l'entreprise,
  **mention STOP systématique**, plage horaire prudente, pas de relance au-delà du plafond.
- **Plages horaires :** la charte de la profession (af2m) a été assouplie au 1er mars 2026 (envois promotionnels
  8 h–21 h 30, dimanches et fériés tolérés mais déconseillés) ; c'est une norme professionnelle, pas une loi, et les
  sources divergent. Valeur par défaut retenue : **lundi–samedi 8 h–20 h hors fériés** ; l'entreprise ne pourra pas
  sortir de 8 h–21 h 30.
- **Expéditeur :** en France, les SMS automatisés partent en général avec un **nom d'expéditeur alphanumérique**
  (ex. `BRIAND`) ; le prospect ne peut pas répondre par SMS, d'où la mention « STOP au {numéro court du fournisseur} »
  et le lien comme canal de réponse. Les SMS envoyés depuis un numéro mobile classique vers la France sont fortement
  restreints chez plusieurs fournisseurs (voir sources).
- **RGPD :** l'entreprise est responsable du traitement, Venio sous-traitant (déjà prévu au DPA). Numéros conservés
  12 mois par défaut, puis anonymisés dans les statistiques. Information de l'appelant par le message vocal (mode 1/2).
- **Opposition :** un STOP est appliqué à **cette entreprise** ; pas de liste partagée entre clients (chacun est
  responsable de sa relation avec ses prospects).

### A.10 Coûts, quotas et facturation

**Coût unitaire estimé par appel manqué traité (fourchettes, à revérifier) :**

| Poste | Estimation | Commentaire |
|---|---|---|
| SMS France, 1 segment | 0,04 – 0,08 € | ≈ 0,045 € chez Brevo, ≈ 0,0798 $ chez Twilio ; + frais éventuels (échec, anti-fraude) |
| Minutes d'appel reçues (mode 1, ≈ 20 s de message) | quelques centimes | Dépend du fournisseur et du type de numéro |
| Numéro Venio | ≈ 1 à 2 € / mois / ligne | Telnyx annonce des numéros français à partir de 1 $/mois |
| Consultation « mobile ou fixe » (optionnelle) | < 0,01 € | Seulement hors mobiles +33 6/7 |

**Ordre de grandeur :** un artisan qui manque 40 appels par mois, dont 30 éligibles → **≈ 1,5 à 2,5 € de SMS + ≈ 1 à 2 €
de numéro**. C'est faible au regard d'un abonnement à 69 €, mais pas nul : d'où un quota, jamais « illimité ».

**Mécanique :**
- Les SMS sont comptés **en segments** (« crédits SMS ») dans `usage_counter`, transactionnellement avant envoi.
- Quota mensuel inclus selon l'offre (voir [Offres](#offres-et-limites-mises-à-jour)), puis **packs prépayés**
  (paiement unique Stripe) : jamais de dépassement facturé par surprise.
- Alertes à 80 % et 100 % (email + bandeau). À 100 % sans crédit : les appels sont **toujours enregistrés**, les SMS
  ne partent plus, et le tableau de bord le dit (« 6 SMS non envoyés : quota atteint »).
- Coût réel par entreprise calculé à partir de `cost_micros` renvoyé ou estimé par fournisseur, visible dans le
  back-office interne pour surveiller la marge.
- Plafond de sécurité global par entreprise et par jour (ex. 200 SMS) contre les abus et le « SMS pumping ».

### A.11 Données (nouvelles tables, toutes avec `tenant_id` et RLS)

| Table | Rôle |
|---|---|
| `telephony_line` | Ligne suivie : numéro de l'entreprise, mode, fournisseur, numéro Venio, jeton secret du webhook, statut, date du dernier test |
| `telephony_event_raw` | Événement brut reçu (unicité `provider + provider_event_id`), conservé 30 jours pour diagnostic |
| `call` | Appel normalisé : fournisseur, identifiant, numéros, état, horodatages |
| `missed_call_recovery` | Décision (envoyé / non envoyé + raison), `notification_id` du SMS, jeton de lien, ouverture, session, rendez-vous |
| `missed_call_settings` | Réglages A.8 par entreprise (JSON validé côté serveur) |
| `sms_template` | Modèles (ton, texte, version) |
| `phone_exclusion` / `sms_opt_out` | Numéros exclus ; oppositions STOP par entreprise |

Contraintes d'unicité clés : un seul `missed_call_recovery` par `call` ; un seul SMS par clé d'idempotence
`tenant + numéro + fenêtre anti-rafale` (contrainte en base, pas seulement dans le code — même principe que
l'anti-double réservation existant).

---

## C. Stripe et parcours commercial

### C.1 Parcours

```
Vitrine ─► Fonctionnalités ─► Tarifs (choix offre + mensuel/annuel)
   └─► Inscription : email, mot de passe, nom de l'entreprise, métier   (4 champs, rien d'autre)
         ├─ Essai gratuit 14 jours (par défaut sans carte — réglable : carte exigée)
         └─ ou « Souscrire » ─► Stripe Checkout (paiement hébergé par Stripe)
                                   └─► webhook vérifié ─► abonnement local à jour ─► compte activé
   └─► Assistant de configuration (5 étapes, reprenable) :
         1. Modèle métier  2. Horaires et prestations  3. Page publique (logo, couleurs)
         4. Appels manqués (optionnel, « plus tard »)  5. Publier + lien à partager
```

Objectif mesuré : **première page publiée en moins de 10 minutes** (indicateur d'activation).
Les informations de facturation (SIRET, adresse, TVA intracommunautaire) sont demandées par Stripe Checkout au moment
de payer, pas à l'inscription.

### C.2 Ce qui est géré

| Besoin | Solution |
|---|---|
| Mensuel / annuel | Deux prix Stripe par offre ; `plan.stripe_price_id_*` (table `plan` existante) |
| Essai configurable | Durée et « carte exigée » par offre, dans le back-office |
| Changement d'offre | Portail client Stripe ; montée immédiate au prorata, descente à l'échéance (règles du [02 §11.2](02-architecture.md#112-cycle-de-vie)) |
| Résiliation, factures, moyen de paiement | **Portail client Stripe** (pas de réimplémentation) |
| Impayés | Relances automatiques Stripe + emails J0/J3/J7, accès maintenu 14 jours puis restreint (déjà spécifié) |
| Packs de SMS | Paiement unique Checkout ; crédits ajoutés à réception du webhook |
| TVA | Stripe Tax à évaluer (coût supplémentaire) ou TVA française seule au lancement |

### C.3 Webhooks Stripe traités

| Événement | Effet |
|---|---|
| `checkout.session.completed` | Lier client et abonnement Stripe à l'entreprise ; créditer un pack de SMS |
| `customer.subscription.created` / `updated` | Copie locale : offre, statut (`trialing`, `active`, `past_due`, `canceled`, `unpaid`), échéance |
| `customer.subscription.deleted` | Passage en lecture seule selon le cycle de vie |
| `customer.subscription.trial_will_end` | Email « votre essai se termine dans 3 jours » |
| `invoice.paid` | Réinitialiser les alertes d'impayé |
| `invoice.payment_failed` / `invoice.payment_action_required` | Bandeau et emails d'impayé |

Règles : signature vérifiée (`Stripe-Signature`) ; **table `stripe_event` avec unicité de l'identifiant d'événement**
(idempotence) ; traitement dans la file de tâches (réponse 200 immédiate) ; **l'état local se recalcule depuis l'objet
Stripe lu à nouveau** plutôt que de faire confiance à l'ordre d'arrivée ; seul le webhook active un compte, jamais la
page de retour du navigateur.

**Coûts Stripe :** ≈ 1,5 % + 0,25 € par paiement par carte européenne standard (1,9 % + 0,25 € carte premium) ; Stripe
Billing (abonnements) ajoute un pourcentage du volume facturé, **à vérifier sur la grille officielle**.

---

## D. Direction artistique et design system

### D.1 Identité : principes

**Idée directrice : « le fil ».** Venio relie un signal (un appel, une visite) à un rendez-vous. L'identité repose sur une
ligne continue et fine qui relie les éléments — dans le logo, les schémas de la vitrine et les états de progression du
parcours client. C'est notre motif reconnaissable, utilisé avec parcimonie, à la place des illustrations génériques.

| Valeur | Traduction visuelle |
|---|---|
| Confiance | Bleu nuit dominant, fonds chauds et clairs, textes très contrastés |
| Sérieux | Une seule couleur d'accent, grille stricte, aucun effet gratuit |
| Innovation | Captures réelles du produit, transitions courtes et précises |
| Simplicité | Une idée par section (vitrine), une question par écran (client), une action principale par vue (application) |

**Exclus :** dégradés décoratifs, couleurs saturées multiples, animations en boucle, illustrations de personnages,
« verre dépoli », ombres lourdes, mockups 3D inclinés.

### D.2 Couleurs (contrastes vérifiés, WCAG AA = 4,5:1 pour le texte)

| Jeton | Valeur | Usage | Contraste |
|---|---|---|---|
| `ink` | `#14213D` | Texte principal, boutons principaux, fond des sections fortes | 15,2:1 sur `paper` |
| `ink-muted` | `#4A5468` | Texte secondaire | 7,2:1 |
| `ink-subtle` | `#6B7385` | Légendes, métadonnées (≥ 14 px) | 4,5:1 (limite) |
| `paper` | `#FAF9F6` | Fond général (blanc chaud) | — |
| `surface` | `#FFFFFF` | Cartes, tableaux | — |
| `line` | `#E6E3DC` | Séparateurs (décoratif, pas d'information portée) | 1,2:1 |
| `signal` | `#F28C28` | Accent : pastilles, soulignés, graphiques, le « fil » ; **texte dessus en `ink`** | 6,5:1 avec `ink` |
| `signal-strong` | `#A6470A` | Liens et texte accentué sur fond clair ; bouton accent avec texte blanc | 5,7:1 / 6,0:1 |
| `success` | `#1F7A4D` | Réussite | 5,1:1 |
| `warning` | `#8A5A00` | Attention | 5,6:1 |
| `danger` | `#B42318` | Erreur, suppression | 6,2:1 |

**Correction de l'existant :** l'orange actuel `#F28C28` avec du texte blanc ne fait que 2,5:1 (illisible pour une
partie des utilisateurs). Il ne sera plus utilisé comme fond de bouton avec texte blanc.

**Pages de réservation des entreprises :** l'entreprise choisit sa couleur ; elle ne remplace que les jetons `brand`
et `brand-strong`, et **le système calcule automatiquement la couleur de texte** (blanc ou `ink`) et refuse ou corrige
une couleur qui ne permet pas 4,5:1. Notre marque reste discrète (« Propulsé par Venio »).

**Mode sombre :** utile pour l'application entreprise (usage long, souvent le soir pour les artisans) mais **pas
prioritaire**. Les jetons sont sémantiques dès maintenant (`surface`, `text`, `border`…) pour l'ajouter sans refonte ;
palette sombre prévue : fond `#0E1626`, texte `#E8EAF0` (15:1), accent `#F5A15A` (8,7:1). Pas de mode sombre sur la
vitrine ni sur les pages de réservation (la couleur de l'entreprise doit rester fidèle).

### D.3 Typographie

| Rôle | Police | Pourquoi |
|---|---|---|
| Titres de la vitrine uniquement | **Fraunces** (serif, libre de droits, OFL) en graisse 500–600, tailles 40–72 px | Donne une signature éditoriale et chaleureuse que les sites SaaS en sans-serif n'ont pas |
| Interface et textes partout | **Inter** (déjà utilisée) | Lisibilité, chiffres tabulaires pour les tableaux et horaires |
| Codes, numéros de dossier | **JetBrains Mono** (OFL), parcimonie | Distinguer les identifiants |

Polices **auto-hébergées** (pas de chargement depuis les serveurs de Google : RGPD et performance). Échelle : 12 · 14 ·
16 · 18 · 20 · 24 · 30 · 36 · 48 · 60 · 72 px ; interlignage 1,5 pour le texte, 1,1–1,2 pour les grands titres.
Proposition alternative si Fraunces ne vous plaît pas : tout en Inter, en jouant sur les graisses (plus sobre, moins
reconnaissable) — décision 6.

### D.4 Espacements, formes, mouvement

- Grille de 4 px ; espacements 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Vitrine : sections de 96–128 px de haut
  de marge ; application : densité 8–16 px.
- Rayons : 6 px (champs, boutons), 10 px (cartes), 16 px (grandes captures). Ombres : une seule, très légère, pour ce
  qui flotte (menus, modales).
- Mouvement : 150–250 ms, courbe `ease-out` ; seules les apparitions au défilement de la vitrine (une fois, pas en
  boucle) et les transitions entre questions ; tout est désactivé avec `prefers-reduced-motion`.
- Icônes : **Lucide** (libre, trait de 1,5 px), une seule famille partout.

### D.5 Composants du design system

Un **seul** paquet de composants partagé par les trois interfaces (vitrine, application, pages de réservation), décliné
par des variantes de densité et de couleur, pas par trois systèmes :

| Famille | Composants et états |
|---|---|
| Actions | Bouton (principal, secondaire, discret, danger ; tailles S/M/L ; chargement, désactivé), bouton icône, lien |
| Saisie | Champ texte, zone de texte, sélecteur, case, interrupteur, choix en tuiles (parcours client), date/heure, téléphone, téléversement de photos ; états : vide, focus, erreur + message, réussite, désactivé |
| Contenus | Carte, tableau (tri, filtres, sélection, vide, chargement en squelette), liste, badge de statut, avatar, indicateur chiffré (KPI) avec variation |
| Navigation | Barre latérale (application), en-tête (vitrine), onglets, fil d'Ariane, pagination, progression de parcours (« le fil ») |
| Retours | Notification éphémère (« toast »), bandeau, modale, confirmation destructive, état vide illustré par une capture réelle, page d'erreur, écran de réussite |
| Spécifiques | Créneau horaire, calendrier semaine/jour, carte « appel manqué », aperçu SMS dans un téléphone, cadre de capture d'écran (navigateur / mobile) |

**Mise en œuvre :** jetons dans le `@theme` Tailwind existant (`web/src/app/globals.css`), composants React dans
`web/src/components/ui/`, page interne `/design-system` qui affiche tous les composants et états (sert de référence et
de test visuel). Accessibilité RGAA / WCAG 2.1 AA vérifiée automatiquement (axe) sur cette page.

### D.6 Les trois interfaces

| | Vitrine | Application entreprise | Réservation (client final) |
|---|---|---|---|
| Objectif | Donner envie, rassurer, convertir | Être efficace chaque jour | Réserver sans effort |
| Densité | Très aérée | Dense et lisible | Aérée, gros boutons tactiles |
| Couleur dominante | `ink` + `paper`, accent `signal` | Neutres, accent rare (actions, alertes) | Couleur de l'entreprise |
| Typographie | Fraunces (titres) + Inter | Inter | Inter |
| Navigation | En-tête simple, 6 entrées | Barre latérale : Tableau de bord, Demandes, **Appels manqués**, Agenda, Statistiques, Parcours, Paramètres | Aucune : une question par écran, retour arrière |
| Spécificités | Captures réelles, démonstration interactive | Filtres, vues enregistrées, actions rapides, raccourcis clavier, notifications discrètes | Choix visuels, confirmations rassurantes, reprise par lien |

---

## B. Vitrine commerciale et démonstration

### B.1 Architecture

- **Même application Next.js** que le produit (`venio/web`), organisée en groupes de routes : `(site)` pour la
  vitrine, `app/` pour l'espace entreprise, `r/` pour les réservations. Avantages : un seul design system, les vrais
  composants réutilisés sur la vitrine, un seul déploiement Netlify.
- Pages de la vitrine **générées statiquement** (rapides, bien référencées) ; seules la démonstration et l'inscription
  appellent l'API.
- Contenus (ressources, FAQ, secteurs) en fichiers Markdown/MDX dans le dépôt : pas de CMS payant au lancement.
- Mesure d'audience **sans cookie de suivi** (Plausible ou équivalent auto-hébergé) : pas de bandeau cookies nécessaire
  tant qu'on ne dépose que des cookies strictement nécessaires (à confirmer avec l'avocat).

### B.2 Pages

| Page | Contenu | Éléments réels du produit utilisés |
|---|---|---|
| **Accueil** | Accroche, 3 piliers, visuel central (la démonstration en lecture automatique, **déclenchée au clic, pas en boucle**), preuves (chiffres des pilotes quand ils existent — aucun chiffre inventé), secteurs, tarifs résumés, appel à l'action | Captures de l'espace de démonstration |
| **Fonctionnalités** | Une section par fonctionnalité : explication, bénéfice, démonstration, exemple ; **section dédiée aux appels manqués** avec le schéma « le fil » (appel → SMS → parcours → RDV) | Parcours, créneaux, tableau de bord, appels manqués |
| **Secteurs** | Artisans, garages, immobilier, services à domicile, indépendants, entreprises de services : pour chacun, un exemple de parcours (questions réelles d'un modèle métier) et un cas d'usage | Modèles métier (3 existants ; les autres à créer avant d'être affichés) |
| **Tarifs** | 3 offres, bascule mensuel/annuel, comparateur complet, coûts SMS et packs, options, FAQ tarifs | Données lues dans la table `plan` (une seule source de vérité) |
| **Démonstration** | Simulation interactive (B.3), sans compte | Vrai moteur de réservation, espace de démonstration |
| **Ressources** | Guides : réduire les appels manqués, préparer une visite technique, réduire les absences, rédiger un SMS efficace… | — |
| **FAQ** | Commerciale et technique (renvoi d'appel, RGPD, résiliation, coûts SMS) | — |
| **Inscription / connexion** | 4 champs (C.1) | Existant, à restyler |
| **Légal** | Mentions légales, CGV, CGU, confidentialité, cookies, **DPA** | Modèles à faire valider par un avocat ; informations de votre société nécessaires (décision 8) |

### B.3 Démonstration interactive

Scénario en 7 étapes, sur un écran partagé « téléphone du prospect » / « espace de l'entreprise » :

1. Le visiteur clique « Simuler un appel » → l'écran de l'entreprise affiche l'appel sans réponse.
2. Après le délai de validation (raccourci à 3 s, et c'est dit), le téléphone reçoit le SMS.
3. Le visiteur touche le lien → **le vrai parcours** de réservation de l'entreprise fictive s'ouvre dans le téléphone.
4. Il répond aux questions (réponses pré-remplies proposées pour aller vite).
5. Il choisit un vrai créneau libre de l'agenda de démonstration.
6. Il voit la confirmation (et l'email de confirmation affiché, non envoyé).
7. Le prospect apparaît dans le tableau de bord de l'entreprise, avec la ligne « Appel manqué → RDV récupéré ».

**Séparation des données :**
- Un **espace de démonstration dédié** (`tenant.is_demo = true`), entreprise fictive clairement nommée (ex. « Rénovation
  Exemple — données fictives »), bandeau permanent « Démonstration : aucune donnée réelle, aucun SMS envoyé ».
- Chaque visiteur obtient un **bac à sable** (session de démonstration de 30 min) ; ses réservations n'apparaissent que
  pour lui et sont effacées automatiquement chaque nuit.
- Fournisseurs forcés sur `simulator` pour cet espace : **impossible d'envoyer un vrai SMS ou un vrai email**, garanti
  côté serveur (et testé).
- Limite de fréquence par adresse IP ; aucune saisie de vrai numéro de téléphone demandée.
- Les captures d'écran de la vitrine sont **générées automatiquement** depuis cet espace (script Playwright) : elles
  montrent toujours le produit réel, jamais un faux écran.

La démonstration statique existante (GitHub Pages, API simulée dans le navigateur) reste utile hors ligne, mais la
démonstration de la vitrine utilisera le vrai moteur.

---

## Offres et limites mises à jour

Remplace la grille du [02 §11.4](02-architecture.md#114-grille-doffres-proposée-hypothèses-à-valider-en-entretiens)
pour les lignes concernées (hypothèses, à valider en entretiens). Les prix restent inchangés à ce stade.

| | **Starter** 29 € | **Pro** 69 € | **Business** 149 € |
|---|---|---|---|
| Récupération des appels manqués | ✓ | ✓ | ✓ |
| Lignes téléphoniques suivies | 1 | 1 | 3 |
| Crédits SMS inclus / mois (1 crédit = 1 segment) | 50 | 200 | 600 |
| Usage des crédits | Appels manqués | Appels manqués + rappels | Tous |
| Statistiques appels manqués | Résumé | Complètes | Complètes + export |
| Modèles de SMS | 4 tons | + personnalisé | + par établissement |
| Packs de crédits supplémentaires | 100 crédits ≈ 10 € HT ; 500 crédits ≈ 40 € HT (à valider) | idem | idem |

**Pourquoi le module est dans toutes les offres :** c'est l'argument d'entrée ; le réserver au Pro ferait perdre l'effet
« démonstration de valeur » dès l'essai. Le coût est maîtrisé par les crédits, pas par l'exclusion.
**Marge des packs :** 100 crédits coûtent ≈ 4 à 8 € selon le fournisseur ; le prix de 10 € couvre aussi les échecs et le
support. À recalculer dès que le fournisseur est choisi.

Nouvelles clés dans `plan_entitlement` : `feature.missed_calls`, `limit.phone_lines`, `limit.sms_credits_per_month`
(remplace `limit.sms_per_month`), `limit.sms_per_day_safety`.

---

## Sécurité et conformité (transverses)

| Risque | Mesure |
|---|---|
| Faux webhook téléphonie ou Stripe | Signature vérifiée par l'adaptateur ; URL de webhook propre à chaque ligne avec jeton secret ; rejet et journalisation sinon |
| Rejeu, doublons | Unicité des identifiants d'événements en base ; traitements idempotents |
| SMS pumping (fraude qui fait envoyer des SMS vers des numéros surtaxés) | Mobiles français seulement par défaut, plafonds par numéro / jour / entreprise, alerte d'anomalie, protection du fournisseur si disponible |
| Boucles d'envoi | Exclusion des numéros de l'entreprise et de Venio, anti-rafale, unicité par appel |
| Fuite entre entreprises | RLS sur toutes les nouvelles tables + tests d'isolation étendus (déjà obligatoires en CI) |
| Données personnelles | Numéros partiellement masqués dans les listes, conservation limitée, export et suppression inclus |
| Démonstration détournée pour envoyer des SMS | Fournisseur `simulator` imposé côté serveur pour `is_demo`, test automatique dédié |
| Clés fournisseurs | Variables d'environnement côté serveur uniquement ; jamais dans le dépôt ni dans le navigateur |

---

## Stratégie de tests

| Niveau | Ce qui est testé |
|---|---|
| Unitaires | Moteur de règles A.5 (chaque règle et leur ordre), calcul des segments SMS, machine d'états d'appel avec événements dans le désordre, fuseaux horaires et jours fériés de la plage d'envoi |
| Intégration (PostgreSQL réel) | Idempotence des webhooks (même événement envoyé 5 fois → 1 SMS), anti-rafale sous concurrence (10 appels simultanés du même numéro → 1 SMS, garanti par contrainte), quotas transactionnels, isolation RLS des nouvelles tables |
| Adaptateurs | Charges utiles réelles enregistrées de chaque fournisseur (fixtures), vérification de signature valide/invalide |
| Stripe | Stripe CLI en mode test : essai, souscription, échec de paiement, résiliation, pack de SMS ; ordre inversé des événements |
| Bout en bout (Playwright) | Démonstration complète en 7 étapes ; inscription → essai → assistant → page publiée ; garantie « aucun envoi réel » en démonstration |
| Visuel et accessibilité | Page `/design-system` : captures de référence, axe (WCAG AA), contrastes des couleurs d'entreprise |
| Terrain (pilotes) | Renvoi sur non-réponse chez Orange, SFR, Bouygues, Free, fixe et mobile : numéro d'origine transmis ? délai réel ? |

---

## Feuille de route mise à jour

Point de départ : la **pilote 0.1 est en ligne** (parcours, créneaux, dossier, emails via Brevo, Netlify + Render +
Supabase). Durées estimées en semaines de développement par Claude, hors délais de vos décisions et des validations
juridiques ; elles se chevauchent en partie.

| # | Étape | Contenu | Durée | Critère de passage | Dépend de |
|---|---|---|---|---|---|
| **1** | **Direction artistique et design system** | Logo « le fil », jetons, composants et états, page `/design-system`, restylage de l'existant (application + réservation) | 2 sem. | Vous validez la page `/design-system` ; AA vérifié | Décision 6 |
| **2** | **Appels manqués — cœur** | Tables, adaptateur `simulator`, machine d'états, moteur de règles, SMS (adaptateur Brevo ou autre), liens suivis, page Appels manqués, paramètres, statistiques, quotas | 3–4 sem. | Tous les tests de la stratégie verts avec le simulateur | Étape 1 (interfaces) ; décisions 1–2 |
| **3** | **Appels manqués — premier fournisseur réel** | Adaptateur téléphonie (mode 1 puis 2), assistant de renvoi, appel de test, hébergement toujours actif | 1–2 sem. | Un vrai appel manqué → SMS reçu en < 2 min | Décisions 1, 3 ; comptes fournisseurs |
| **4** | **Stripe** | Offres, Checkout, portail, webhooks, essais, packs de SMS, impayés, assistant de configuration | 2–3 sem. | Scénarios Stripe CLI verts ; inscription → page publiée < 10 min | Décision 4 ; compte Stripe |
| **5** | **Vitrine** | Toutes les pages B.2, captures automatiques, SEO, mesure d'audience sans cookie, pages légales | 3 sem. | Lighthouse ≥ 90, contenus relus par vous | Étapes 1 et 4 ; décisions 7–8 |
| **6** | **Démonstration interactive** | Espace de démonstration, bacs à sable, scénario 7 étapes, remise à zéro nocturne | 1–2 sem. | Test E2E vert ; aucun envoi réel possible | Étapes 2 et 5 |
| **7** | **Pilotes appels manqués** | 3 à 5 entreprises, mesure du taux de récupération, ajustement des règles et des messages | 4 sem. (en parallèle de 5–6) | Taux de récupération mesuré sur ≥ 100 appels manqués | Étape 3 ; validation juridique |
| **8** | **Lancement commercial** | Selon le [04 §19](04-business-plan.md#19-feuille-de-route-jusquau-lancement) : bêta payante, préparation commerciale, test d'intrusion, lancement | — | Critères du 04 §18 | Étapes 1–7 |

Restent prévus après ces étapes (inchangé) : synchronisation Google/Outlook, messagerie client, invitations de
collaborateurs, éditeur de parcours complet, mode sombre de l'application.

---

## Décisions attendues de votre part

1. **Fournisseur de téléphonie** pour le premier adaptateur réel : Twilio, Telnyx ou autre (je recommande de comparer
   les deux sur un essai réel avant de choisir) — c'est vous qui ouvrez le compte.
2. **Fournisseur SMS** : Brevo (compte déjà ouvert, ≈ 0,045 €/SMS) ou le même que la téléphonie.
3. **Hébergement de l'API** : passage à une offre toujours active (≈ 7 $/mois chez Render) au moment de l'étape 3.
4. **Stripe** : ouverture du compte, essai avec ou sans carte, TVA (Stripe Tax ou non).
5. **Offres** : module appels manqués dans toutes les offres et crédits SMS proposés ci-dessus — d'accord ?
6. **Direction artistique** : « le fil », bleu nuit + orange signal, Fraunces pour les titres de la vitrine — ou
   variante tout Inter ?
7. **Secteurs affichés** : on ne montre que des secteurs dont le modèle métier existe ; garages, immobilier et
   indépendants demandent 3 nouveaux modèles — à créer avant la vitrine ?
8. **Légal** : raison sociale, SIREN, adresse, directeur de publication, hébergeurs, médiateur ; et un avocat pour
   relire CGV, CGU, DPA et la position sur les SMS d'appels manqués (A.9).

---

## Sources (relevées en novembre 2026, à revérifier)

- Twilio, tarifs SMS France : <https://www.twilio.com/en-us/sms/pricing/fr>
- Twilio, limites d'envoi vers les mobiles français : <https://support.twilio.com/hc/en-us/articles/223133827-Limitations-on-sending-SMS-to-French-mobile-numbers>
- Telnyx, règles SMS France (expéditeur alphanumérique) : <https://support.telnyx.com/en/articles/6531603-france-sms-guidelines>
- Telnyx, numéros français : <https://telnyx.com/phone-numbers/france>
- Comparatif européen des prix SMS (Brevo, Twilio, Sweego) : <https://www.sweego.io/pricing/european-sms-price-comparison>
- Prix des SMS Brevo (comparatif tiers) : <https://getkanal.com/fr/blog/brevo-sms>
- Assouplissement af2m des horaires de SMS promotionnels (2026) : <https://fr.themedialeader.com/laf2m-assouplit-lenvoi-des-sms-promotionnels-le-dimanche-et-les-jours-feries/>
- Règles de prospection par SMS (consentement, STOP) : <https://skipcall.io/blog/regles-sms-prospection>
- Frais Stripe en France (cartes européennes) : <https://www.indy.fr/guide/comptabilite-en-ligne/commerce/stripe-comptabilite/frais-stripe/>
- Stripe, grille officielle : <https://stripe.com/fr/pricing>
