// Génération de messages courts, naturels et personnalisés (sections D et E).
// Un message n'est produit que pour UN prospect à la fois, à partir de ses données réelles :
// pas d'envoi de masse, pas de faits inventés (une donnée absente est simplement omise).
import type { Parametres, Prospect } from './types';
import { ageJours, libelleMetier, METIERS_CIBLES, tailleProspect } from './referentiel';

export type FormatMessage = 'linkedin_invitation' | 'linkedin_message' | 'email' | 'appel';
export type Angle = 'standard' | 'lancement' | 'croissance' | 'relance';

export const FORMATS: Record<FormatMessage, string> = {
  linkedin_invitation: 'LinkedIn – note d\'invitation (≤ 200 caractères)',
  linkedin_message: 'LinkedIn – message après connexion',
  email: 'E-mail',
  appel: 'Trame d\'appel téléphonique',
};

export const ANGLES: Record<Angle, string> = {
  standard: 'Approche standard',
  lancement: 'Lancement d\'activité (création récente)',
  croissance: 'Entreprise qui se développe',
  relance: 'Relance douce',
};

export interface Message {
  format: FormatMessage;
  angle: Angle;
  /** Identifiant du modèle (ex. LI-LAN-B) : enregistré avec la prise de contact pour mesurer son efficacité. */
  variante: string;
  objet?: string;
  texte: string;
  /** Éléments réels du profil utilisés pour personnaliser. */
  personnalisation: string[];
  avertissements: string[];
  /** Personnalisation insuffisante : le message ne doit pas être envoyé tel quel. */
  bloquant: boolean;
}

/** Angle recommandé d'après les faits connus du prospect. */
export function angleRecommande(p: Prospect, now: Date, dejaContacte = false): Angle {
  if (dejaContacte) return 'relance';
  const age = ageJours(p.dateCreation, now);
  if (age !== undefined && age < 365) return 'lancement';
  if (p.signauxActivite.some((s) => s === 'recrutement' || s === 'croissance_effectif' || s === 'nouvel_etablissement')) return 'croissance';
  return 'standard';
}

const prix = (p: Parametres) => `${p.prixMensuelHT.toLocaleString('fr-FR')} € HT par mois`;

function contexte(p: Prospect, now: Date) {
  const metierConnu = METIERS_CIBLES.includes(p.metier) || p.metier === 'autre_btp';
  const metier = metierConnu ? libelleMetier(p.metier) : undefined;
  const age = ageJours(p.dateCreation, now);
  const ancienneteTxt = age === undefined ? undefined
    : age < 45 ? 'tout récemment'
      : age < 365 ? `il y a ${Math.max(1, Math.round(age / 30.4))} mois`
        : undefined;
  const taille = tailleProspect(p);
  return {
    prenom: p.dirigeant?.prenom?.trim(),
    metier,
    commune: p.commune ? titre(p.commune) : undefined,
    nom: titre(p.nom),
    ancienneteTxt,
    seul: taille === 'independant',
    equipe: taille === '2-5' || taille === '6-10' || taille === '11-20',
    recrute: p.signauxActivite.includes('recrutement'),
    chantiers: p.signauxActivite.includes('chantiers_publies'),
  };
}

function titre(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export function genererMessage(
  p: Prospect, format: FormatMessage, angle: Angle, variante: 'A' | 'B', params: Parametres, now: Date = new Date(),
): Message {
  const c = contexte(p, now);
  const perso: string[] = [];
  const avert: string[] = [];
  if (c.prenom) perso.push(`prénom (${c.prenom})`); else avert.push('Prénom du dirigeant inconnu : salutation neutre utilisée. Cherchez le nom du gérant avant d\'envoyer.');
  if (c.metier) perso.push(`métier (${c.metier})`); else avert.push('Métier inconnu : le message reste générique.');
  if (c.commune) perso.push(`ville (${c.commune})`);
  if (angle === 'lancement' && !c.ancienneteTxt) avert.push('Angle « lancement » choisi mais la création récente n\'est pas confirmée par une date : vérifiez avant d\'envoyer.');
  if (angle === 'lancement' && c.ancienneteTxt) perso.push(`création ${c.ancienneteTxt}`);
  if (angle === 'croissance' && !(c.recrute || c.equipe)) avert.push('Angle « croissance » sans signal de développement enregistré : préférez l\'approche standard.');
  if (c.recrute && angle === 'croissance') perso.push('offre d\'emploi publiée');
  if (p.statut === 'ne_pas_contacter') avert.push('Ce prospect a demandé à ne pas être contacté.');

  const bonjour = c.prenom ? `Bonjour ${c.prenom},` : 'Bonjour,';
  const activite = c.metier ? `votre activité de ${c.metier}${c.commune ? ` à ${c.commune}` : ''}` : `${c.nom}${c.commune ? ` à ${c.commune}` : ''}`;
  const produit = params.nomProduit || 'notre logiciel';
  const sig = params.signature ? `\n\n${params.signature}` : '';
  const code = `${{ linkedin_invitation: 'LI-INV', linkedin_message: 'LI', email: 'EM', appel: 'TEL' }[format]}-${{ standard: 'STD', lancement: 'LAN', croissance: 'CRO', relance: 'REL' }[angle]}-${variante}`;

  // Accroche selon l'angle (faits réels uniquement)
  const accroche = {
    standard: variante === 'A'
      ? `J'ai découvert ${c.metier ? activite : `${c.nom}${c.commune ? ` à ${c.commune}` : ''}`} et je me permets de vous écrire.`
      : `Je m'adresse aux ${c.metier ? `${c.metier}s` : 'artisans du bâtiment'}${c.commune ? ` du secteur de ${c.commune}` : ''} qui veulent passer moins de temps sur l'administratif.`,
    lancement: variante === 'A'
      ? `J'ai vu que ${c.nom} avait démarré ${c.ancienneteTxt ?? 'récemment'} — félicitations pour le lancement${c.metier ? ` de votre activité de ${c.metier}` : ''} !`
      : `Le démarrage d'une entreprise${c.metier ? ` de ${c.metier}` : ''} est le bon moment pour mettre en place une organisation simple : devis, factures et suivi des chantiers au même endroit.`,
    croissance: variante === 'A'
      ? (c.recrute ? `J'ai vu que ${c.nom} recrutait : bravo pour le développement !` : `${c.nom} se développe${c.metier ? ` dans le métier de ${c.metier}` : ''} : bravo !`)
      : `Quand l'équipe grandit, les plannings, devis et factures deviennent vite chronophages.`,
    relance: variante === 'A'
      ? `Je reviens vers vous suite à mon précédent message.`
      : `Je me permets une petite relance, sans insister.`,
  }[angle];

  const offre = angle === 'lancement'
    ? `${produit} permet de démarrer avec une gestion professionnelle dès les premiers chantiers (devis, factures, clients), à partir de ${prix(params)}, sans engagement lourd.`
    : `Nous proposons ${produit}, une solution de gestion pensée pour les professionnels du bâtiment, à partir de ${prix(params)}.`;
  const benefice = c.seul
    ? 'L\'objectif : faire gagner du temps à un artisan qui gère tout lui-même.'
    : c.equipe ? 'L\'objectif : simplifier la gestion quotidienne de l\'équipe et des chantiers.'
      : 'L\'objectif : simplifier la gestion quotidienne et faire gagner du temps.';
  const question = {
    standard: variante === 'A' ? 'Est-ce que vous utilisez déjà un logiciel pour gérer votre activité ?' : 'Comment gérez-vous aujourd\'hui vos devis et vos factures ?',
    lancement: variante === 'A' ? 'Avez-vous déjà choisi un outil pour vos devis et factures ?' : 'Seriez-vous ouvert à une démonstration de 15 minutes ?',
    croissance: variante === 'A' ? 'Comment organisez-vous aujourd\'hui vos devis et plannings ?' : 'Est-ce un sujet pour vous en ce moment ?',
    relance: variante === 'A' ? 'Est-ce que le sujet de la gestion (devis, factures) vous parle ?' : 'Si ce n\'est pas le moment, dites-le-moi simplement, je ne vous relancerai pas.',
  }[angle];

  let texte: string;
  let objet: string | undefined;
  switch (format) {
    case 'linkedin_invitation': {
      const court = angle === 'lancement' && c.ancienneteTxt
        ? `${bonjour} félicitations pour le lancement${c.metier ? ` de votre activité de ${c.metier}` : ''} ! J'accompagne les artisans du bâtiment sur leur gestion, ravi d'échanger.`
        : `${bonjour} j'échange avec des ${c.metier ? `${c.metier}s` : 'artisans du bâtiment'}${c.commune ? ` autour de ${c.commune}` : ''} sur la gestion au quotidien. Ravi de rejoindre votre réseau.`;
      texte = court.length <= 200 ? court : `${bonjour} j'échange avec des artisans du bâtiment sur leur gestion au quotidien. Ravi de rejoindre votre réseau.`;
      break;
    }
    case 'linkedin_message':
      texte = angle === 'relance'
        ? `${bonjour}\n\n${accroche}\n\n${question}${sig}`
        : `${bonjour}\n\n${accroche}\n\n${offre}\n${benefice}\n\n${question}${sig}`;
      break;
    case 'email':
      objet = {
        standard: c.metier ? `Gestion simplifiée pour ${c.metier}s${c.commune ? ` – ${c.commune}` : ''}` : `Gestion simplifiée pour ${c.nom}`,
        lancement: `Lancement de ${c.nom} : une gestion pro dès le départ`,
        croissance: `${c.nom} se développe : et la gestion ?`,
        relance: `Re : gestion de ${c.nom}`,
      }[angle];
      texte = angle === 'relance'
        ? `${bonjour}\n\n${accroche}\n\n${question}\n\nBonne journée${sig}`
        : `${bonjour}\n\n${accroche}\n\n${offre}\n${benefice}\n\n${question}\n\nBonne journée${sig}\n\n—\nVous ne souhaitez plus recevoir de message de notre part ? Répondez simplement « stop ».`;
      break;
    case 'appel':
      texte = [
        `1. Présentation (10 s) : « ${bonjour.replace(',', '')}, ${params.signature || '[votre prénom]'} de ${produit}. Je vous appelle rapidement, vous avez deux minutes ? »`,
        `2. Raison de l'appel : « ${accroche} »`,
        `3. Question ouverte : « ${question} »`,
        `4. Si intérêt : « ${offre} » → proposer une démo de 15 minutes.`,
        '5. Si refus : remercier, noter le motif, ne pas insister.',
      ].join('\n');
      break;
  }

  const bloquant = !c.metier && !c.prenom;
  if (bloquant) avert.unshift('Personnalisation insuffisante (ni prénom ni métier connus) : complétez la fiche avant d\'envoyer.');
  if (format === 'linkedin_invitation' && texte.length > 200) avert.push(`Note trop longue (${texte.length} caractères).`);
  return { format, angle, variante: code, objet, texte, personnalisation: perso, avertissements: avert, bloquant };
}
