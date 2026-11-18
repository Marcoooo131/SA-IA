# 06 — Kit pilotes « appels manqués » (étape 7)

> Statut au 18/11/2026 : **préparé, non démarré.** Un pilote réel exige trois prérequis qui ne dépendent pas du code : un fournisseur de téléphonie choisi et branché (étape 3), la validation juridique du SMS de rappel (05 §A.9) et l'accord écrit de chaque entreprise pilote. Tant qu'ils manquent, **aucun SMS réel n'est envoyé** (`VENIO_PAID_SENDING_ENABLED=false`).

## 1. Objectif et question à trancher

Mesurer, sur de vrais appels, **la part des appels manqués qui deviennent un rendez-vous** grâce au SMS, et vérifier que le module ne crée ni gêne ni plainte.

Critère de passage (05, feuille de route) : taux de récupération mesuré sur **au moins 100 appels manqués éligibles**, toutes entreprises confondues.

| Indicateur | Définition (calculée par Venio, page Appels manqués) | Seuil « on continue » | Seuil « on revoit » |
|---|---|---|---|
| Taux d'envoi | SMS envoyés / appels manqués | — (dépend des règles) | > 30 % d'appels bloqués pour « numéro fixe » ou « hors horaires » → revoir les règles |
| Taux de clic | liens ouverts / SMS envoyés | ≥ 25 % | < 10 % |
| **Taux de récupération** | rendez-vous attribués / SMS envoyés | **≥ 8 %** | < 3 % |
| Plaintes / STOP | réponses STOP ou plaintes / SMS envoyés | < 2 % | ≥ 5 % ou une plainte formelle |
| Coût par rendez-vous récupéré | coût SMS du pilote / rendez-vous récupérés | < 5 € | > 15 € |

Les seuils sont des hypothèses de départ (04-business-plan) : ils servent à décider, pas à promettre un résultat.

## 2. Profil des entreprises pilotes (3 à 5)

- Artisan ou TPE de terrain (rénovation, garage, déménagement, immobilier), **≥ 15 appels manqués par semaine** (à vérifier sur la facture opérateur ou le journal du téléphone avant de signer).
- Ligne professionnelle chez un opérateur qui permet le **renvoi sur non-réponse** vers un numéro (condition technique du fournisseur retenu).
- Accepte de garder ses habitudes pendant 4 semaines et un point de 20 minutes par semaine.
- Diversité : au moins deux métiers différents.

Pistes de recrutement : réseau personnel, chambres de métiers (CMA), groupements d'artisans, garages indépendants du quartier. Proposition : **3 mois gratuits de l'offre Pro + crédits SMS offerts pendant le pilote**, en échange des mesures et d'un retour honnête.

## 3. Déroulé (4 semaines)

| Semaine | Ce qui se passe | Qui |
|---|---|---|
| S-1 | Signature de l'accord pilote (§5). Création de l'espace, parcours adapté, horaires, liste d'exclusion (famille, fournisseurs, clients récurrents). | Vous + l'entreprise |
| S-1 | Branchement : renvoi sur non-réponse vers le numéro du fournisseur, test avec 3 appels depuis des numéros connus. Activation de l'envoi réel **pour cette entreprise seulement**. | Vous |
| S1 | Délai de validation à 2 min, modèle de SMS par défaut, plafond journalier bas (20 SMS). Observation. | Venio |
| S2 | Point : lecture des statistiques ensemble, ajustement du texte du SMS et des horaires. | Vous + l'entreprise |
| S3 | Test d'une variante du SMS (une seule modification à la fois). | Venio |
| S4 | Bilan chiffré, entretien de fin (§6), décision : continuer en payant, continuer gratuitement, arrêter. | Vous + l'entreprise |

Garde-fous pendant tout le pilote : plafond journalier par entreprise, plafond global par l'interrupteur `VENIO_PAID_SENDING_ENABLED`, arrêt immédiat possible depuis les réglages (« Désactiver la récupération »). En cas de plainte : arrêt de l'entreprise concernée, analyse sous 48 h.

## 4. Ce qu'il faut mesurer à la main (hors Venio)

- Le nombre d'appels manqués réels selon l'opérateur, pour vérifier que le renvoi sur non-réponse les transmet tous.
- Les rendez-vous obtenus par rappel manuel de l'entreprise (sans SMS), pour comparer.
- Le temps passé par l'entreprise à rappeler, avant et pendant le pilote (estimation déclarative).

## 5. Accord pilote — points à faire figurer (à rédiger avec l'avocat)

1. Venio agit comme **sous-traitant** (RGPD art. 28) pour le compte de l'entreprise, responsable du traitement des numéros de ses appelants.
2. L'entreprise confirme que le SMS de rappel répond à une **demande initiée par l'appelant** (il a appelé) et accepte le modèle de texte validé (identification de l'entreprise, mention STOP).
3. Durées de conservation : numéros et journaux d'appels 12 mois, puis suppression ou anonymisation.
4. Gratuité et durée du pilote, conditions de sortie, aucune obligation d'achat.
5. Autorisation d'utiliser des **chiffres agrégés et anonymisés** dans la communication, et de citer le nom de l'entreprise **seulement** avec un accord séparé.

## 6. Entretien de fin (20 minutes)

1. Combien de rendez-vous pensez-vous avoir récupérés ? (avant de montrer les chiffres)
2. Un client vous a-t-il parlé du SMS ? En bien, en mal ?
3. Le dossier reçu était-il suffisant pour préparer le rendez-vous ?
4. Qu'est-ce qui vous a gêné ou inquiété ?
5. À quel prix continueriez-vous ? (ne pas suggérer de montant)
6. Recommanderiez-vous Venio à un confrère ? Pourquoi ?

## 7. Après les pilotes

Mettre à jour le 05 (règles par défaut, modèle de SMS, seuils) et le 04 (hypothèses de conversion et de coût) avec les chiffres réels, puis passer à l'étape 8 si le critère de passage est atteint.
