# Prospection ERP BTP — stratégie commerciale à 15 € HT / mois

Outil web (React + TypeScript, **local-first**) qui met en œuvre la stratégie commerciale d'un ERP pour le bâtiment
vendu **≈ 15 € HT / mois** : beaucoup de clients pertinents, un coût d'acquisition maîtrisé, des canaux peu coûteux,
pas de démarche « grands comptes ».

En ligne (après déploiement GitHub Pages) : `…/SA-IA/prospection/`.

```bash
cd prospection-erp
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires (Vitest)
npm run build      # build de production dans dist/
```

Toutes les données (prospects, historique, campagnes, réglages) restent **dans le navigateur** (localStorage).
Exportez-les régulièrement depuis *Paramètres* (JSON). Un jeu de **données de démonstration fictives** se charge
depuis l'accueil ou *Paramètres*.

## Correspondance avec le cahier des charges (section 18)

| Exigence | Où | Comment |
|---|---|---|
| **A. Cibles** : indépendants, 2-5, 6-10, 11-20 salariés ; électriciens, plombiers, chauffagistes, peintres, menuisiers, couvreurs, maçons, carreleurs, plaquistes, rénovation, multiservices | `src/lib/referentiel.ts` | Métiers ↔ codes NAF (ex. 43.21A électricité, 43.22B chauffage, 43.31Z plâtrerie, 81.10Z multiservices) ; tailles ↔ tranches INSEE (NN/00, 01-02, 03, 11). |
| Attention particulière aux créations récentes | Recherche, Prospects, scoring, messages | Filtres dédiés, +8 points de besoin, angle de message « lancement », rappel sur le tableau de bord. |
| **B. Score /100** (25/25/15/15/10/10), justifié, avec niveau de confiance | `src/lib/scoring.ts`, fiche prospect | Chaque point est expliqué ; **une donnée inconnue rapporte 0 point** et réduit la confiance (élevée ≥ 75 % des points évaluables, moyenne ≥ 45 %, sinon faible). Priorité A ≥ 70, B ≥ 50, C ≥ 30, D. |
| **C. Multicanal peu coûteux** | Recherche, fiche prospect, Campagnes | 1) API publique *Recherche d'entreprises* (gratuite, sans clé) ; 2) liens Google / PagesJaunes / Annuaire des entreprises ; 3) filtre de création ; 4) recherche LinkedIn du dirigeant ; 5) coordonnées saisies **avec leur source** ; 6) messages ; 7) historique et conversions. Import CSV (export Sirene, annuaire…). |
| Suivi précis de chaque canal | Tableau de bord, Campagnes, Optimisation | Contactés, réponses, RDV, clients, taux de réponse, conversion, coût, CAC, délai de récupération par canal et par campagne. |
| **D. LinkedIn TPE** : gérants, artisans, fondateurs ; messages courts et personnalisés ; pas d'envoi de masse | `src/lib/messages.ts`, fiche prospect | Note d'invitation ≤ 200 caractères, message après connexion, e-mail, trame d'appel. Personnalisation à partir des **seuls faits connus** (prénom, métier, ville, date de création, recrutement). Message bloqué si ni prénom ni métier. Un prospect à la fois, relu, envoyé par l'utilisateur ; plafond quotidien réglable. |
| **E. Entreprises nouvellement créées** : < 30 jours, < 3, 6, 12 mois | Recherche, Prospects | Filtre sur la date de création. L'API publique ne filtre pas par date : le filtre s'applique aux pages parcourues (affiner par département / code postal pour couvrir le périmètre ; BODACC en complément). |
| **F. Calculateur de rentabilité** | `src/lib/finance.ts`, onglet Rentabilité | Clients, MRR, ARR, CA, marge brute, coût des campagnes, CAC, délai de récupération, conversion par canal, attrition ; scénarios **10, 25, 50, 100, 250, 500 clients** ; marge réelle, coûts de prospection et durée de rétention paramétrables. **CA ≠ marge brute ≠ résultat** affichés séparément. |
| **G. Optimisation mensuelle** | `src/lib/analytics.ts`, onglet Optimisation | Par mois : canal qui apporte le plus de clients, secteur qui convertit le mieux, profils les plus réactifs (taille, ancienneté, rôle), messages les plus efficaces (variantes A/B tracées), campagnes les moins rentables (CAC non récupéré en 12 mois de marge) → recommandations concrètes, comparaison au mois précédent, rapport copiable. |

## Règles de prudence intégrées

- **Rien n'est inventé** : les champs non fournis par une source restent vides ; le score ne les compte pas.
- **Échantillon minimal** : aucune conclusion sur un segment de moins de 10 prospects contactés ; une tendance
  appuyée sur moins de 3 clients est signalée « à confirmer ».
- L'« IA » d'optimisation est un ensemble de **règles statistiques transparentes** (pas de modèle opaque) : chaque
  recommandation cite ses chiffres.
- **Aucune automatisation LinkedIn** (interdite par ses conditions d'utilisation) ni envoi groupé d'e-mails.
- Prospection B2B : adresses professionnelles, mention d'arrêt dans les e-mails, statut « Ne pas contacter » respecté.
  Conservez uniquement les données utiles (RGPD).

## Calculs

- Marge mensuelle par client = prix × marge brute (%) — ex. 15 € × 80 % = **12 €**.
- Durée de vie = durée de rétention imposée, sinon 1 / attrition mensuelle (3 % → 33 mois).
- CAC = coût des campagnes ÷ clients acquis ; délai de récupération = CAC ÷ marge mensuelle.
- Scénarios : cohorte acquise au mois 0, facturée en début de mois, qui résilie selon l'attrition ;
  résultat = marge brute cumulée − coût d'acquisition − coûts fixes de prospection (avant les autres charges).
- Attribution d'un client : au **premier contact** sortant (canal, campagne, modèle de message).

## Limites

- Tranches d'effectif INSEE approximatives (1-2, 3-5, 6-9, 10-19) et parfois absentes pour les petites entreprises :
  saisissez l'effectif réel quand il est connu.
- L'API publique doit être joignable depuis le navigateur ; en cas d'échec, utilisez l'import CSV.
- Données propres à chaque navigateur (pas de partage d'équipe) : exporter / restaurer pour changer de poste.
