// Score commercial sur 100 (section B). Règle d'or : une information inconnue ne rapporte AUCUN point
// et fait baisser le niveau de confiance ; chaque point attribué est justifié par une donnée connue.
import type { Prospect } from './types';
import {
  ageJours, estDirigeantDecideur, libelleMetier, libelleTaille, METIERS_CIBLES, tailleProspect,
  SIGNAUX_ACTIVITE, SIGNAUX_INTERET,
} from './referentiel';

export type NiveauConfiance = 'élevée' | 'moyenne' | 'faible';

export interface Element {
  /** Explication lisible : pourquoi ces points (ou pourquoi aucun point). */
  texte: string;
  points: number;
  /** Donnée inconnue : aucun point attribué, à compléter pour fiabiliser le score. */
  inconnu?: boolean;
}

export interface Critere {
  id: 'adequation' | 'besoin' | 'activite' | 'contact' | 'decideur' | 'interet';
  libelle: string;
  points: number;
  max: number;
  /** Part (0-1) des points du critère qui ont pu être évalués avec des données connues. */
  evaluable: number;
  elements: Element[];
}

export interface Score {
  total: number;
  criteres: Critere[];
  /** Part (0-1) des 100 points évaluée avec des données connues. */
  couverture: number;
  confiance: NiveauConfiance;
  priorite: 'A' | 'B' | 'C' | 'D';
  /** Données à rechercher en priorité pour fiabiliser le score. */
  aCompleter: string[];
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

function critere(id: Critere['id'], libelle: string, max: number, parts: { max: number; el: Element }[]): Critere {
  const brut = parts.reduce((s, p) => s + p.el.points, 0);
  const evalMax = parts.filter((p) => !p.el.inconnu).reduce((s, p) => s + p.max, 0);
  const totalMax = parts.reduce((s, p) => s + p.max, 0);
  return {
    id, libelle, max, points: clamp(brut, max),
    evaluable: totalMax ? Math.min(1, evalMax / totalMax) : 1,
    elements: parts.map((p) => p.el),
  };
}

export function scorer(p: Prospect, now: Date = new Date()): Score {
  const taille = tailleProspect(p);
  const age = ageJours(p.dateCreation, now);
  const criteres: Critere[] = [];

  // 1. Adéquation avec la cible (25) : métier 15 + taille 10
  const metierEl: Element = METIERS_CIBLES.includes(p.metier)
    ? { texte: `Métier cœur de cible : ${libelleMetier(p.metier)}${p.naf ? ` (NAF ${p.naf})` : ''}`, points: 15 }
    : p.metier === 'autre_btp'
      ? { texte: `Autre activité du bâtiment${p.naf ? ` (NAF ${p.naf})` : ''} : cible secondaire`, points: 8 }
      : p.metier === 'hors_btp'
        ? { texte: `Activité hors bâtiment${p.naf ? ` (NAF ${p.naf})` : ''}`, points: 0 }
        : { texte: 'Métier inconnu : aucun point', points: 0, inconnu: true };
  const trancheApprox = p.effectifSaisi === undefined && p.trancheEffectif ? ' (tranche INSEE, approximative)' : '';
  const tailleEl: Element =
    taille === 'inconnue' ? { texte: 'Effectif inconnu : aucun point', points: 0, inconnu: true }
      : taille === 'plus_de_20' ? { texte: 'Plus de 20 salariés : hors cible prioritaire', points: 0 }
        : taille === '11-20' ? { texte: `${libelleTaille(taille)}${trancheApprox} : cible secondaire`, points: 7 }
          : { texte: `${libelleTaille(taille)}${trancheApprox} : cœur de cible`, points: 10 };
  criteres.push(critere('adequation', 'Adéquation avec la cible', 25, [{ max: 15, el: metierEl }, { max: 10, el: tailleEl }]));

  // 2. Besoin potentiel de gestion (25) : outil actuel 12 + jeunesse 8 + charge administrative 5
  const logEl: Element =
    p.logicielActuel === 'aucun' ? { texte: 'N\'utilise aucun logiciel de gestion', points: 12 }
      : p.logicielActuel === 'papier_excel' ? { texte: 'Gère sur papier / Excel / Word', points: 12 }
        : p.logicielActuel === 'concurrent' ? { texte: 'Équipé d\'un logiciel concurrent (besoin de changer à démontrer)', points: 3 }
          : { texte: 'Outil de gestion actuel inconnu : aucun point', points: 0, inconnu: true };
  const ageEl: Element =
    age === undefined ? { texte: 'Date de création inconnue : aucun point', points: 0, inconnu: true }
      : age < 365 ? { texte: `Entreprise créée il y a ${age} jours : organisation à mettre en place`, points: 8 }
        : age < 3 * 365 ? { texte: 'Entreprise de 1 à 3 ans : structuration en cours', points: 4 }
          : { texte: 'Entreprise installée depuis plus de 3 ans', points: 0 };
  const chargeEl: Element =
    taille === 'inconnue' ? { texte: 'Charge administrative non estimable (effectif inconnu)', points: 0, inconnu: true }
      : taille === 'independant' ? { texte: 'Artisan seul : devis et factures à gérer sans aide administrative', points: 3 }
        : taille === 'plus_de_20' ? { texte: 'Structure plus grande, souvent déjà outillée', points: 1 }
          : { texte: 'Plusieurs salariés : plannings, devis et facturation à coordonner', points: 5 };
  criteres.push(critere('besoin', 'Besoin potentiel de gestion', 25, [{ max: 12, el: logEl }, { max: 8, el: ageEl }, { max: 5, el: chargeEl }]));

  // 3. Activité et développement (15) : entreprise active 3 + signaux observés 12
  const actifEl: Element =
    p.active === true ? { texte: 'Entreprise active au répertoire public', points: 3 }
      : p.active === false ? { texte: 'Entreprise cessée au répertoire public', points: 0 }
        : { texte: 'Statut administratif non vérifié', points: 0, inconnu: true };
  const ptsSignal: Record<string, number> = {
    recrutement: 5, croissance_effectif: 4, nouvel_etablissement: 4, chantiers_publies: 3, avis_clients_recents: 3, site_web_actif: 2,
  };
  const signauxEl: Element = p.signauxActivite.length
    ? {
      texte: 'Signaux observés : ' + p.signauxActivite.map((s) => `${SIGNAUX_ACTIVITE[s]} (+${ptsSignal[s]})`).join(', '),
      points: Math.min(12, p.signauxActivite.reduce((s, x) => s + (ptsSignal[x] ?? 0), 0)),
    }
    : p.activiteVerifiee
      ? { texte: 'Activité vérifiée : aucun signal de développement observé', points: 0 }
      : { texte: 'Activité non vérifiée (site, avis, offres d\'emploi) : aucun point', points: 0, inconnu: true };
  criteres.push(critere('activite', 'Activité et développement', 15, [{ max: 3, el: actifEl }, { max: 12, el: signauxEl }]));

  // 4. Facilité de prise de contact (15)
  const contactParts: { max: number; el: Element }[] = [
    {
      max: 6,
      el: p.email
        ? { texte: p.emailNominatif ? 'E-mail professionnel nominatif' : 'E-mail professionnel générique', points: p.emailNominatif ? 6 : 4 }
        : { texte: 'Aucun e-mail professionnel trouvé', points: 0, inconnu: true },
    },
    { max: 4, el: p.telephone ? { texte: 'Téléphone professionnel', points: 4 } : { texte: 'Aucun téléphone trouvé', points: 0, inconnu: true } },
    {
      max: 4,
      el: p.dirigeant?.linkedinUrl ? { texte: 'Profil LinkedIn du dirigeant', points: 4 } : { texte: 'Profil LinkedIn non trouvé', points: 0, inconnu: true },
    },
    { max: 1, el: p.siteWeb ? { texte: 'Site web (formulaire de contact possible)', points: 1 } : { texte: 'Pas de site web connu', points: 0, inconnu: true } },
  ];
  criteres.push(critere('contact', 'Facilité de prise de contact', 15, contactParts));

  // 5. Décideur identifiable (10) : identité 6 + rôle de décideur 2 + vérification 2
  const d = p.dirigeant;
  const identite = d?.nom && d?.prenom;
  criteres.push(critere('decideur', 'Décideur identifiable', 10, [
    { max: 6, el: identite ? { texte: `Dirigeant identifié : ${d!.prenom} ${d!.nom}`, points: 6 } : { texte: 'Dirigeant non identifié', points: 0, inconnu: true } },
    {
      max: 2,
      el: d?.qualite
        ? { texte: `Qualité : ${d.qualite}${estDirigeantDecideur(d.qualite) ? ' (décideur)' : ' (décision à confirmer)'}`, points: estDirigeantDecideur(d.qualite) ? 2 : 0 }
        : { texte: 'Rôle du contact inconnu', points: 0, inconnu: true },
    },
    { max: 2, el: d?.verifie ? { texte: 'Identité vérifiée (profil ou échange)', points: 2 } : { texte: 'Identité non vérifiée', points: 0, inconnu: !identite } },
  ]));

  // 6. Signaux d'intérêt (10) : uniquement des faits enregistrés
  const ptsInteret: Record<string, number> = {
    demande_info: 6, a_repondu_positivement: 5, recommande: 4, visite_site: 3, interaction_linkedin: 2,
  };
  criteres.push(critere('interet', 'Signaux d\'intérêt', 10, [{
    max: 10,
    el: p.signauxInteret.length
      ? { texte: p.signauxInteret.map((s) => `${SIGNAUX_INTERET[s]} (+${ptsInteret[s]})`).join(', '), points: p.signauxInteret.reduce((s, x) => s + (ptsInteret[x] ?? 0), 0) }
      : { texte: 'Aucun signal d\'intérêt enregistré', points: 0 },
  }]));

  const total = Math.round(criteres.reduce((s, c) => s + c.points, 0));
  const couverture = criteres.reduce((s, c) => s + c.evaluable * c.max, 0) / 100;
  const confiance: NiveauConfiance = couverture >= 0.75 ? 'élevée' : couverture >= 0.45 ? 'moyenne' : 'faible';
  const priorite = total >= 70 ? 'A' : total >= 50 ? 'B' : total >= 30 ? 'C' : 'D';
  const aCompleter = criteres.flatMap((c) => c.elements.filter((e) => e.inconnu).map((e) => e.texte.replace(/ : aucun point$/, '')));
  return { total, criteres, couverture, confiance, priorite, aCompleter };
}
