# 03 — Produit & UX : maquettes, parcours client, onboarding

[← Sommaire](README.md)

Les maquettes ci-dessous sont des **wireframes de structure** (hiérarchie, contenu, actions). La direction artistique
et le prototype cliquable sont l'objet de la Phase 2 ; ils seront testés avec 5 à 8 artisans et leurs clients avant
le développement.

## Direction artistique (proposition provisoire)

> **Remplacée le 18/11/2026** par la direction artistique et le design system du
> [05 §D](05-extension-acquisition.md#d-direction-artistique-et-design-system) (« le fil », contrastes vérifiés,
> trois interfaces sur un seul design system). Le texte ci-dessous est conservé pour l'historique.

- **Deux univers distincts :**
  - *Client final* : chaleureux, aéré, gros boutons tactiles, une seule décision par écran, couleurs **de l'entreprise cliente**
    (notre marque reste discrète : « Propulsé par Venio »).
  - *Espace entreprise* : précis et dense façon Linear/Stripe — fond clair neutre, une couleur d'accent, typographie
    *Inter*, tableaux lisibles, raccourcis clavier, mode sombre.
- **Couleur de marque provisoire :** bleu nuit `#14213D` + accent orange chantier `#F28C28` (évoque l'artisanat sans cliché).
- **Animations :** transitions de 150–250 ms entre questions, aucune animation bloquante ; respect de `prefers-reduced-motion`.
- **Accessibilité :** RGAA / WCAG 2.1 AA visé (contrastes, navigation clavier, libellés) — c'est aussi un argument auprès des collectivités plus tard.

---

## 12. Maquettes des interfaces principales

### 12.1 Page publique de l'entreprise (mobile)

```
┌───────────────────────────────┐
│ [logo] Rénov'Habitat 92       │
│ ★ 4,8 (avis saisis par l'ent.)│
├───────────────────────────────┤
│  [photo chantier plein écran] │
│  Salles de bain & cuisines    │
│  clés en main — Hauts-de-Seine│
│                               │
│ ┌───────────────────────────┐ │
│ │ Décrire mon projet  →     │ │  ← CTA principal, toujours visible (collant en bas)
│ └───────────────────────────┘ │
│  ✓ Visite & devis gratuits     │
│  ✓ Réponse sous 24 h           │
│  ✓ Artisan RGE · Décennale     │  ← réassurance déclarée par l'entreprise
├───────────────────────────────┤
│ Nos prestations  (cartes)     │
│ Réalisations  (galerie)       │
│ Zone : Boulogne, Issy… (carte)│
│ Horaires · Coordonnées        │
└───────────────────────────────┘
```

### 12.2 Parcours conversationnel

```
┌───────────────────────────────┐
│ ←  ▓▓▓▓▓▓▓░░░░  Étape 2 sur ~6 │  ← « ~ » : la longueur s'adapte aux réponses
│                               │
│ 🙂 Parfait, une salle de bain. │
│ Quels travaux envisagez-vous ? │
│                               │
│ ┌──────────┐ ┌──────────┐     │
│ │ [icône]  │ │ [icône]  │     │
│ │ Rénovation│ │ Douche   │    │
│ │ complète │ │ à l'ital.│     │
│ └──────────┘ └──────────┘     │
│ ┌──────────┐ ┌──────────┐     │
│ │ PMR /    │ │ Autre    │     │
│ │ sécurité │ │          │     │
│ └──────────┘ └──────────┘     │
│                               │
│ Votre progression est sauvegardée │
└───────────────────────────────┘

Étape photo :
┌───────────────────────────────┐
│ Avez-vous des photos de la pièce ?│
│ [📷 Prendre une photo] [🖼 Galerie]│
│ ┌─────────┐                   │
│ │ photo   │ ✎ Entourez la zone │  ← annotation au doigt
│ │ (○)     │                   │
│ └─────────┘                   │
│ [Passer cette étape]          │  ← jamais bloquant
└───────────────────────────────┘
```

### 12.3 Choix du créneau

```
┌───────────────────────────────┐
│ Visite technique · 1 h · chez vous │
│ 12 rue X, Boulogne ✓ dans la zone │
│                               │
│  Lun 1  Mar 2  Mer 3  Jeu 4 → │
│  ─────  ═════                 │
│  09:00   10:30   14:00        │
│  16:00                        │
│                               │
│ Pas de créneau qui convient ? │
│ [Être rappelé·e]              │  ← alternative, pas d'impasse
└───────────────────────────────┘
```

### 12.4 Récapitulatif et confirmation

```
┌───────────────────────────────┐
│ Vérifiez votre demande        │
│ Projet : SDB, douche à l'ital. ✎│
│ Surface : ~6 m²               ✎│
│ Photos : 3                    ✎│
│ Délai : d'ici 3 mois          ✎│
│ RDV : mar. 2 déc. 10:30 (1 h) ✎│
│ Adresse : 12 rue X, Boulogne  ✎│
│ Vous : Marie D. · 06…         ✎│
│ ☐ Recevoir un rappel par SMS   │  ← consentement explicite
│ [ Confirmer le rendez-vous ]  │
└───────────────────────────────┘
→ Écran de succès : ajouter à mon agenda (.ics / Google), lien « gérer mon RDV »,
  ce qui va se passer ensuite, contact direct.
```

### 12.5 Tableau de bord entreprise (ordinateur)

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ ◆ Venio    │ Bonjour Karim · mardi 2 décembre          [+ Rendez-vous]    │
│            ├──────────────────────────────────────────────────────────────┤
│ Accueil    │ À traiter (3)        │ Aujourd'hui (2)       │ Cette semaine  │
│ Demandes 3 │ • Marie D. SDB 6 m²  │ 10:30 Marie D. ✓conf. │ 7 RDV          │
│ Agenda     │   📷3 · ⏱ 3 mois     │ 15:00 Luc P.  ⚠ non   │ 1 absence      │
│ Dossiers   │ • …                  │        confirmé       │                │
│ Messages 1 ├──────────────────────┴───────────────────────┴────────────────┤
│ Parcours   │ Entonnoir 30 jours :  Visites 412 → Démarrages 168 → RDV 41   │
│ Statistiques│ Abandon max : « Budget » (étape 5)  [Voir les recommandations]│
│ Paramètres │  ⓘ Volume encore faible : tendance, pas une conclusion.        │
└────────────┴──────────────────────────────────────────────────────────────┘
```
*(Les chiffres de cette maquette sont des valeurs d'illustration ; l'application n'affichera que des données réelles.)*

### 12.6 Dossier client

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Marie D. · Salle de bain · [Nouvelle demande ▾]    Assigné : Karim ▾      │
├───────────────────────────────┬──────────────────────────────────────────┤
│ Résumé                        │ Messages                                 │
│ « Rénovation complète SDB     │ Marie : Voici une photo du plafond.      │
│  ~6 m², douche italienne,     │ Vous : Merci, je regarde mardi.          │
│  délai < 3 mois, budget       │ [Écrire…]           [📎] [Envoyer]       │
│  10–15 k€. »  ⓘ généré par IA │                                          │
│  · réponses brutes ↓          ├──────────────────────────────────────────┤
│ Réponses détaillées (8)       │ Historique                               │
│ Photos (3) [annotées]         │ 1/12 demande créée · RDV confirmé        │
│ Adresse + carte               │ 1/12 SMS confirmation envoyé (0,05 €)    │
│ Notes internes                │ 30/11 rappel J-1 programmé               │
└───────────────────────────────┴──────────────────────────────────────────┘
```

### 12.7 Éditeur de parcours

```
┌───────────────────────┬─────────────────────────────┬────────────────────┐
│ Étapes                │ Question                     │ Aperçu mobile      │
│ 1 Type de projet      │ Libellé : Quels travaux… ?   │ ┌──────────────┐   │
│ 2 Travaux SDB    ⑂    │ Type : cartes visuelles      │ │  (rendu      │   │
│ 3 Surface             │ Choix : [+]                  │ │   en direct) │   │
│ 4 Photos              │ Obligatoire : ☐              │ └──────────────┘   │
│ 5 Budget              │ Afficher si : Projet = SDB   │                    │
│ 6 Créneau             │ Alors : prestation = Visite  │ Brouillon v4       │
│ [+ étape]             │                              │ [Publier v4]       │
└───────────────────────┴─────────────────────────────┴────────────────────┘
Les parcours déjà commencés restent sur la version où ils ont débuté.
```

### 12.8 Back-office interne

Liste des entreprises (plan, statut, MRR, dernière activité, santé), fiche entreprise (abonnement, factures,
quotas, incidents, *accès support* avec demande de consentement), tableau MRR/ARR/churn/essais, coûts fournisseurs.
**Aucun accès par défaut aux dossiers clients.**

---

## 13. Parcours client final idéal

Objectif : **moins de 2 minutes 30 sur mobile**, sans compte, sans mot de passe.

| # | Étape | Principe | Ce qui est mesuré |
|---|---|---|---|
| 1 | Arrivée (lien Google Business, site, QR code sur camion, Facebook) | Page légère (< 1 s affichage sur 4G), CTA visible | Visite, canal, appareil |
| 2 | « Quel est votre projet ? » | Cartes visuelles, 1 tap | Démarrage |
| 3 | 2 à 5 questions adaptées | Conditions ; questions inutiles sautées ; valeurs par défaut | Vue / réponse / temps / abandon par étape |
| 4 | Photos (facultatif) + annotation | Jamais bloquant | Taux d'ajout |
| 5 | Adresse | Autocomplétion ; vérification zone → si hors zone : message honnête + rappel ou orientation | Hors zone |
| 6 | Créneau | Uniquement des créneaux réellement disponibles, durée selon le besoin ; alternative « être rappelé » | Créneaux vus / choisis |
| 7 | Coordonnées | Prénom, téléphone, email ; consentements séparés | — |
| 8 | Récapitulatif modifiable | Retour à une étape sans perdre le reste | Modifications |
| 9 | Confirmation | Email + .ics + lien de gestion ; SMS si accepté | Réservation |
| 10 | Avant le RDV | Rappels J-2 / J-1 avec « Confirmer / Reporter » | Taux de confirmation |
| 11 | Après | Remerciement, avis (si consentement), messagerie du dossier | Absences, avis |

**Reprise** : dès qu'un email ou téléphone est saisi, possibilité de recevoir le lien « reprendre ma demande »
(consentement transactionnel ; une seule relance, pas de harcèlement).

---

## 14. Parcours d'inscription et d'activation d'une entreprise

Indicateur clé : **temps jusqu'à la première réservation réelle** (objectif < 7 jours) et **publication en < 15 minutes**.

```
1. Page de vente → « Essai gratuit 14 jours » (sans carte)
2. Email + lien magique (ou Google)                       ~30 s
3. « Votre métier ? »  → Rénovation SDB / Cuisine / Déménagement / Autre
4. Nom, ville, zone d'intervention (rayon ou départements)   ~1 min
5. Modèle de parcours métier pré-rempli → aperçu immédiat    ~2 min
6. Prestations (pré-remplies) : durée, type de visite         ~2 min
7. Disponibilités : horaires types + « connecter Google Agenda » (recommandé)  ~2 min
8. Logo + couleur + 3 photos (facultatif)                     ~3 min
9. Publier → lien + QR code + kit de diffusion
   (bouton site web, texte Google Business Profile, signature email, autocollant camion)
10. Test guidé : « faites une fausse réservation vous-même » → voir le dossier arriver
11. J+1, J+3, J+7 : emails d'activation ; appel de bienvenue proposé (pilotes : systématique)
12. Fin d'essai : récapitulatif de valeur réelle (« 6 demandes, 4 RDV, 2 dossiers avec photos »)
    → choix de l'offre (Stripe Checkout)
```

Le point 9 est crucial : **notre produit ne génère pas de trafic tout seul**. Si l'artisan ne diffuse pas son lien,
il n'aura aucune réservation et partira. Le kit de diffusion (et notamment le lien sur la fiche Google Business Profile)
fait partie du produit, pas du marketing.
