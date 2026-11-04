// Suivi des performances (sections C et F) et analyse mensuelle automatique (section G).
// Les recommandations reposent sur des règles statistiques transparentes et ne concluent rien
// tant que l'échantillon est trop petit.
import type { Canal, Campagne, Donnees, Interaction, Prospect } from './types';
import { CANAUX, libelleMetier, metierDef, libelleTaille, tailleProspect, trancheAge, estDirigeantDecideur } from './referentiel';
import { delaiRecuperationMois, eur, pct } from './finance';

export const ECHANTILLON_MIN = 10;

const SORTANTS = new Set(['message_envoye', 'appel']);
const REPONSES = new Set(['reponse_positive', 'reponse_negative', 'rdv', 'essai', 'signature']);

export interface Parcours {
  prospect: Prospect;
  premierContact?: Interaction;
  canal?: Canal;
  campagneId?: string;
  variante?: string;
  repondu: boolean;
  reponsePositive: boolean;
  rdv: boolean;
  dateSignature?: string;
  dateResiliation?: string;
}

export function parcours(d: Donnees): Parcours[] {
  const parProspect = new Map<string, Interaction[]>();
  for (const i of d.interactions) {
    const l = parProspect.get(i.prospectId) ?? [];
    l.push(i);
    parProspect.set(i.prospectId, l);
  }
  return d.prospects.map((p) => {
    const its = (parProspect.get(p.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const premier = its.find((i) => SORTANTS.has(i.type));
    const sig = its.find((i) => i.type === 'signature');
    const res = sig ? its.find((i) => i.type === 'resiliation' && i.date >= sig.date) : undefined;
    return {
      prospect: p,
      premierContact: premier,
      canal: premier?.canal,
      campagneId: premier?.campagneId,
      variante: premier?.varianteMessage,
      repondu: its.some((i) => REPONSES.has(i.type)),
      reponsePositive: its.some((i) => i.type !== 'reponse_negative' && REPONSES.has(i.type)),
      rdv: its.some((i) => i.type === 'rdv' || i.type === 'essai' || i.type === 'signature'),
      dateSignature: sig?.date,
      dateResiliation: res?.date,
    };
  });
}

export interface Ligne {
  cle: string;
  contactes: number;
  reponses: number;
  rdv: number;
  clients: number;
  tauxReponse: number;
  tauxConversion: number;
}

export function agreger(ps: Parcours[], cle: (p: Parcours) => string | undefined): Ligne[] {
  const m = new Map<string, Ligne>();
  for (const p of ps) {
    if (!p.premierContact) continue;
    const k = cle(p);
    if (!k) continue;
    const l = m.get(k) ?? { cle: k, contactes: 0, reponses: 0, rdv: 0, clients: 0, tauxReponse: 0, tauxConversion: 0 };
    l.contactes++;
    if (p.repondu) l.reponses++;
    if (p.rdv) l.rdv++;
    if (p.dateSignature) l.clients++;
    m.set(k, l);
  }
  return [...m.values()]
    .map((l) => ({ ...l, tauxReponse: (100 * l.reponses) / l.contactes, tauxConversion: (100 * l.clients) / l.contactes }))
    .sort((a, b) => b.clients - a.clients || b.tauxConversion - a.tauxConversion || b.contactes - a.contactes);
}

/** Nombre de mois facturés entre deux dates (facturation en début de mois entamé). */
export function moisFactures(debut: string, fin: string): number {
  const a = new Date(debut + 'T00:00:00Z');
  const b = new Date(fin + 'T00:00:00Z');
  if (b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (30.4375 * 86_400_000)) + 1;
}

export interface LigneCampagne {
  campagne: Campagne;
  contactes: number;
  reponses: number;
  clients: number;
  tauxConversion: number;
  cac: number;
  delaiRecuperation: number;
  caGenere: number;
}

export interface Indicateurs {
  prospects: number;
  contactes: number;
  reponses: number;
  rdv: number;
  clientsAcquis: number;
  clientsActifs: number;
  resiliations: number;
  mrr: number;
  arr: number;
  caGenere: number;
  margeGeneree: number;
  coutCampagnes: number;
  cac: number;
  delaiRecuperation: number;
  /** Attrition mensuelle observée (%) = résiliations / mois-clients exposés ; undefined sans recul suffisant. */
  churnObserve?: number;
  tauxReponse: number;
  tauxConversion: number;
  parCanal: Ligne[];
  campagnes: LigneCampagne[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function indicateurs(d: Donnees, now: Date = new Date()): Indicateurs {
  const ps = parcours(d);
  const { prixMensuelHT: prix, margeBrutePct } = d.parametres;
  const today = iso(now);
  const contactes = ps.filter((p) => p.premierContact);
  const clients = ps.filter((p) => p.dateSignature);
  const actifs = clients.filter((p) => !p.dateResiliation);
  let ca = 0;
  let moisExposes = 0;
  const caParProspect = new Map<string, number>();
  for (const c of clients) {
    const fin = c.dateResiliation ?? today;
    const n = moisFactures(c.dateSignature!, fin);
    ca += n * prix;
    caParProspect.set(c.prospect.id, n * prix);
    moisExposes += n;
  }
  const resiliations = clients.length - actifs.length;
  const coutCampagnes = d.campagnes.reduce((s, c) => s + (c.cout || 0), 0);
  const cac = clients.length ? coutCampagnes / clients.length : coutCampagnes > 0 ? Infinity : 0;
  const campagnes: LigneCampagne[] = d.campagnes.map((camp) => {
    const lignes = contactes.filter((p) => p.campagneId === camp.id);
    const cl = lignes.filter((p) => p.dateSignature);
    const cacC = cl.length ? camp.cout / cl.length : camp.cout > 0 ? Infinity : 0;
    return {
      campagne: camp,
      contactes: lignes.length,
      reponses: lignes.filter((p) => p.repondu).length,
      clients: cl.length,
      tauxConversion: lignes.length ? (100 * cl.length) / lignes.length : 0,
      cac: cacC,
      delaiRecuperation: delaiRecuperationMois(cacC, d.parametres),
      caGenere: cl.reduce((s, p) => s + (caParProspect.get(p.prospect.id) ?? 0), 0),
    };
  });
  return {
    prospects: ps.length,
    contactes: contactes.length,
    reponses: contactes.filter((p) => p.repondu).length,
    rdv: contactes.filter((p) => p.rdv).length,
    clientsAcquis: clients.length,
    clientsActifs: actifs.length,
    resiliations,
    mrr: actifs.length * prix,
    arr: actifs.length * prix * 12,
    caGenere: ca,
    margeGeneree: (ca * margeBrutePct) / 100,
    coutCampagnes,
    cac,
    delaiRecuperation: delaiRecuperationMois(cac, d.parametres),
    churnObserve: moisExposes >= 12 ? (100 * resiliations) / moisExposes : undefined,
    tauxReponse: contactes.length ? (100 * contactes.filter((p) => p.repondu).length) / contactes.length : 0,
    tauxConversion: contactes.length ? (100 * clients.length) / contactes.length : 0,
    parCanal: agreger(ps, (p) => (p.canal ? CANAUX[p.canal] : undefined)),
    campagnes,
  };
}

// ---------------------------------------------------------------------------------------------
// Analyse mensuelle (section G)

export interface Recommandation {
  type: 'renforcer' | 'reduire' | 'tester' | 'donnees';
  titre: string;
  detail: string;
}

export interface AnalyseMensuelle {
  mois: string;
  cohorte: number;
  reponses: number;
  clients: number;
  parCanal: Ligne[];
  parMetier: Ligne[];
  parTaille: Ligne[];
  parAnciennete: Ligne[];
  parRole: Ligne[];
  parVariante: Ligne[];
  campagnes: LigneCampagne[];
  meilleurCanal?: Ligne;
  meilleurSecteur?: Ligne;
  meilleurProfil?: Ligne;
  meilleurMessage?: Ligne;
  campagnesMoinsRentables: LigneCampagne[];
  recommandations: Recommandation[];
  precedent?: { mois: string; cohorte: number; tauxReponse: number; tauxConversion: number };
}

export function moisPrecedent(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Ligne la plus performante parmi celles qui ont un échantillon suffisant. */
function meilleur(lignes: Ligne[], critere: 'tauxConversion' | 'tauxReponse' | 'clients'): Ligne | undefined {
  const ok = lignes.filter((l) => l.contactes >= ECHANTILLON_MIN);
  return ok.sort((a, b) => b[critere] - a[critere] || b.tauxConversion - a.tauxConversion || b.tauxReponse - a.tauxReponse)[0];
}

const secteur = (m: Prospect['metier']) => metierDef(m)?.pluriel ?? libelleMetier(m);
const prudence = (clients: number) => (clients < 3 ? ' Tendance à confirmer le mois prochain (moins de 3 clients).' : '');

export function analyseMensuelle(d: Donnees, mois: string, now: Date = new Date()): AnalyseMensuelle {
  const tous = parcours(d);
  const cohorteDe = (m: string) => tous.filter((p) => p.premierContact?.date.startsWith(m));
  const ps = cohorteDe(mois);
  const parCanal = agreger(ps, (p) => (p.canal ? CANAUX[p.canal] : undefined));
  const parMetier = agreger(ps, (p) => secteur(p.prospect.metier));
  const parTaille = agreger(ps, (p) => libelleTaille(tailleProspect(p.prospect)));
  const parAnciennete = agreger(ps, (p) => trancheAge(p.prospect.dateCreation, new Date(p.premierContact!.date + 'T00:00:00Z')));
  const parRole = agreger(ps, (p) => (estDirigeantDecideur(p.prospect.dirigeant?.qualite) ? 'Dirigeant / gérant' : p.prospect.dirigeant?.qualite ? 'Autre fonction' : 'Rôle inconnu'));
  const parVariante = agreger(ps, (p) => p.variante ?? 'Message non tracé');
  const ind = indicateurs(d, now);
  const fin = `${mois}-31`;
  const debut = `${mois}-01`;
  const campagnes = ind.campagnes.filter((c) => c.campagne.dateDebut <= fin && (!c.campagne.dateFin || c.campagne.dateFin >= debut));
  const { prixMensuelHT, margeBrutePct } = d.parametres;
  const margeMois = (prixMensuelHT * margeBrutePct) / 100;
  // Une campagne est peu rentable si son CAC n'est pas récupéré en 12 mois de marge
  const seuilRecup = 12;
  const campagnesMoinsRentables = campagnes
    .filter((c) => c.campagne.cout > 0 && (c.clients === 0 ? c.contactes >= ECHANTILLON_MIN || c.campagne.cout >= seuilRecup * margeMois : c.delaiRecuperation > seuilRecup))
    .sort((a, b) => b.cac - a.cac);

  const meilleurCanal = meilleur(parCanal, 'clients');
  const meilleurSecteur = meilleur(parMetier, parMetier.some((l) => l.clients > 0 && l.contactes >= ECHANTILLON_MIN) ? 'tauxConversion' : 'tauxReponse');
  const meilleurProfil = meilleur([...parTaille, ...parAnciennete, ...parRole], 'tauxReponse');
  const meilleurMessage = meilleur(parVariante.filter((l) => l.cle !== 'Message non tracé'), 'tauxReponse');

  const recos: Recommandation[] = [];
  const cohorte = ps.length;
  if (cohorte === 0) {
    recos.push({ type: 'donnees', titre: 'Aucune prise de contact ce mois-ci', detail: 'Enregistrez chaque message envoyé ou appel (avec canal, campagne et modèle de message) pour alimenter l\'analyse.' });
  } else if (cohorte < ECHANTILLON_MIN) {
    recos.push({ type: 'donnees', titre: `Échantillon trop faible (${cohorte} prospects contactés)`, detail: `Aucune conclusion fiable en dessous de ${ECHANTILLON_MIN} contacts par segment : continuez la prospection avant de réallouer le budget.` });
  }

  // Canaux
  const canauxOk = parCanal.filter((l) => l.contactes >= ECHANTILLON_MIN);
  if (meilleurCanal && meilleurCanal.clients > 0) {
    recos.push({ type: 'renforcer', titre: `Renforcer le canal ${meilleurCanal.cle}`, detail: `${meilleurCanal.clients} client(s) pour ${meilleurCanal.contactes} contacts (${pct(meilleurCanal.tauxConversion)} de conversion, ${pct(meilleurCanal.tauxReponse)} de réponse). Canal qui apporte le plus de clients : consacrez-lui une part plus importante du temps de prospection.${prudence(meilleurCanal.clients)}` });
  }
  for (const l of canauxOk) {
    if (l !== meilleurCanal && l.reponses === 0) {
      recos.push({ type: 'reduire', titre: `Réduire ou retravailler le canal ${l.cle}`, detail: `Aucune réponse sur ${l.contactes} contacts : revoyez le ciblage et le message, ou réaffectez ce temps au canal le plus performant.` });
    }
  }
  // Secteurs
  if (meilleurSecteur && meilleurSecteur.reponses > 0) {
    recos.push({ type: 'renforcer', titre: `Prioriser le secteur « ${meilleurSecteur.cle} »`, detail: `Secteur le plus performant ce mois-ci : ${pct(meilleurSecteur.tauxConversion)} de conversion et ${pct(meilleurSecteur.tauxReponse)} de réponse sur ${meilleurSecteur.contactes} contacts. Lancez une recherche ciblée sur ces codes NAF.${prudence(meilleurSecteur.clients)}` });
  }
  for (const l of parMetier.filter((x) => x.contactes >= ECHANTILLON_MIN && x.reponses === 0)) {
    recos.push({ type: 'reduire', titre: `Mettre en pause le secteur « ${l.cle} »`, detail: `0 réponse sur ${l.contactes} contacts. Testez un angle de message différent avant d'y revenir.` });
  }
  // Profils
  if (meilleurProfil && meilleurProfil.reponses > 0) {
    recos.push({ type: 'renforcer', titre: `Profil le plus réactif : ${meilleurProfil.cle}`, detail: `${pct(meilleurProfil.tauxReponse)} de réponse sur ${meilleurProfil.contactes} contacts : filtrez vos prochaines recherches sur ce profil.` });
  }
  const recentes = parAnciennete.find((l) => l.cle === 'Créée depuis moins de 3 mois');
  if (cohorte > 0 && (!recentes || recentes.contactes < ECHANTILLON_MIN)) {
    recos.push({ type: 'tester', titre: 'Tester davantage les entreprises nouvellement créées', detail: `Seulement ${recentes?.contactes ?? 0} entreprise(s) de moins de 3 mois contactée(s) : utilisez le filtre « créées depuis moins de 3 mois » avec l'angle « lancement d'activité » pour mesurer ce segment.` });
  }
  // Messages
  const variantesOk = parVariante.filter((l) => l.contactes >= ECHANTILLON_MIN && l.cle !== 'Message non tracé');
  if (meilleurMessage) {
    const moins = variantesOk.filter((l) => l !== meilleurMessage && meilleurMessage.tauxReponse - l.tauxReponse >= 5);
    recos.push({ type: 'renforcer', titre: `Généraliser le message ${meilleurMessage.cle}`, detail: `${pct(meilleurMessage.tauxReponse)} de réponse sur ${meilleurMessage.contactes} envois.${moins.length ? ` Abandonnez ${moins.map((l) => `${l.cle} (${pct(l.tauxReponse)})`).join(', ')}.` : ''}` });
  } else if (cohorte >= ECHANTILLON_MIN) {
    recos.push({ type: 'tester', titre: 'Mettre en place un test A/B des messages', detail: `Aucun modèle n'atteint ${ECHANTILLON_MIN} envois tracés : alternez les variantes A et B et enregistrez la variante utilisée à chaque envoi.` });
  }
  const nonTrace = parVariante.find((l) => l.cle === 'Message non tracé');
  if (nonTrace && cohorte && nonTrace.contactes / cohorte > 0.3) {
    recos.push({ type: 'donnees', titre: 'Tracer les modèles de messages', detail: `${nonTrace.contactes} contacts sur ${cohorte} n'indiquent pas le message utilisé : l'efficacité des messages ne peut pas être mesurée.` });
  }
  // Campagnes
  for (const c of campagnesMoinsRentables.slice(0, 3)) {
    recos.push({
      type: 'reduire',
      titre: `Revoir la campagne « ${c.campagne.nom} »`,
      detail: c.clients === 0
        ? `${eur(c.campagne.cout)} dépensés, ${c.contactes} contacts, aucun client.`
        : `CAC de ${eur(c.cac)} : ${Math.round(c.delaiRecuperation)} mois de marge (${eur(margeMois, 2)}/mois) pour le récupérer, au-delà de ${seuilRecup} mois.`,
    });
  }
  // Qualité des données
  const sansCanal = ps.filter((p) => !p.campagneId).length;
  if (cohorte && sansCanal / cohorte > 0.3 && d.campagnes.length) {
    recos.push({ type: 'donnees', titre: 'Rattacher les contacts à une campagne', detail: `${sansCanal} contacts sans campagne : le coût d'acquisition par campagne est sous-estimé.` });
  }

  const prec = cohorteDe(moisPrecedent(mois));
  const precedent = prec.length
    ? {
      mois: moisPrecedent(mois),
      cohorte: prec.length,
      tauxReponse: (100 * prec.filter((p) => p.repondu).length) / prec.length,
      tauxConversion: (100 * prec.filter((p) => p.dateSignature).length) / prec.length,
    }
    : undefined;

  return {
    mois, cohorte,
    reponses: ps.filter((p) => p.repondu).length,
    clients: ps.filter((p) => p.dateSignature).length,
    parCanal, parMetier, parTaille, parAnciennete, parRole, parVariante, campagnes,
    meilleurCanal, meilleurSecteur, meilleurProfil, meilleurMessage, campagnesMoinsRentables,
    recommandations: recos, precedent,
  };
}

/** Messages enregistrés aujourd'hui (contrôle du quota anti-envoi de masse). */
export function messagesDuJour(d: Donnees, now: Date = new Date()): number {
  const t = iso(now);
  return d.interactions.filter((i) => i.date === t && i.type === 'message_envoye').length;
}
