// Jeu de données de DÉMONSTRATION, entièrement fictif (noms inventés, aucun SIREN réel),
// pour découvrir l'outil et l'analyse mensuelle. À effacer avant un usage réel.
import type { Campagne, Canal, Donnees, Interaction, Metier, Prospect, TypeInteraction } from './types';
import { PARAMETRES_DEFAUT } from './types';
import { METIERS } from './referentiel';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRENOMS = ['Julien', 'Sophie', 'Karim', 'Laura', 'Mathieu', 'Nadia', 'Thomas', 'Élodie', 'Yann', 'Camille', 'Romain', 'Inès', 'Loïc', 'Aurélie', 'Mehdi', 'Pauline'];
const NOMS = ['Morvan', 'Le Gall', 'Benali', 'Rousseau', 'Tessier', 'Guillou', 'Perrin', 'Carré', 'Lemoine', 'Hamon', 'Riou', 'Faure', 'Gautier', 'Kerbrat', 'Leroux', 'Marchal'];
const VILLES: [string, string][] = [['Rennes', '35000'], ['Vannes', '56000'], ['Saint-Malo', '35400'], ['Lorient', '56100'], ['Brest', '29200'], ['Quimper', '29000'], ['Saint-Brieuc', '22000'], ['Nantes', '44000']];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ajouterJours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function donneesDemo(now: Date = new Date()): Donnees {
  const r = prng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const nowIso = now.toISOString();
  const debutM1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const debutM2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const campagnes: Campagne[] = [
    { id: 'demo-c1', nom: 'LinkedIn – gérants du bâtiment (Bretagne)', canal: 'linkedin', cout: 160, dateDebut: iso(debutM2), description: 'Abonnement Sales Navigator 2 mois (démo)' },
    { id: 'demo-c2', nom: 'E-mails – entreprises créées < 6 mois', canal: 'email', cout: 30, dateDebut: iso(debutM2), description: 'Outil d\'envoi (démo)' },
    { id: 'demo-c3', nom: 'Appels – annuaire PagesJaunes', canal: 'telephone', cout: 420, dateDebut: iso(debutM2), description: 'Temps passé valorisé (démo)' },
    { id: 'demo-c4', nom: 'Courrier – artisans installés', canal: 'courrier', cout: 180, dateDebut: iso(debutM1), description: 'Impression + affranchissement (démo)' },
  ];
  const canalCampagne: Record<string, Canal> = { 'demo-c1': 'linkedin', 'demo-c2': 'email', 'demo-c3': 'telephone', 'demo-c4': 'courrier' };
  const tauxCanal: Record<Canal, number> = { linkedin: 0.34, email: 0.16, telephone: 0.3, courrier: 0.03, formulaire_web: 0.1, salon: 0.2, recommandation: 0.5, autre: 0.1 };
  const metiers = METIERS.map((m) => m.id) as Metier[];
  const bonusMetier: Partial<Record<Metier, number>> = { electricien: 0.12, plombier: 0.08, renovation: 0.1, peintre: -0.08 };

  const prospects: Prospect[] = [];
  const interactions: Interaction[] = [];
  for (let i = 0; i < 170; i++) {
    const metier = r() < 0.5 ? pick(['electricien', 'plombier', 'renovation', 'peintre'] as Metier[]) : pick(metiers);
    const def = METIERS.find((m) => m.id === metier)!;
    const [ville, cp] = pick(VILLES);
    const ageJ = r() < 0.35 ? Math.floor(r() * 180) : Math.floor(200 + r() * 4000);
    const tranche = pick(['NN', '00', '01', '02', '03', '11', undefined]);
    const prenom = pick(PRENOMS);
    const nom = pick(NOMS);
    const id = `demo-p${i}`;
    const connuDirigeant = r() < 0.8;
    const p: Prospect = {
      id,
      nom: `${pick(['Atelier', 'SARL', 'EURL', 'Ets', ''])} ${nom} ${def.pluriel.split(' ')[0].replace(/s$/, '')} (démo)`.trim(),
      naf: def.naf[0],
      metier,
      trancheEffectif: tranche,
      dateCreation: iso(ajouterJours(now, -ageJ)),
      active: true,
      codePostal: cp,
      commune: ville,
      departement: cp.slice(0, 2),
      dirigeant: connuDirigeant ? { prenom, nom, qualite: pick(['Gérant', 'Président', 'Entrepreneur individuel']), linkedinUrl: r() < 0.5 ? `https://www.linkedin.com/in/demo-${i}` : undefined, verifie: r() < 0.4 } : undefined,
      telephone: r() < 0.7 ? `01 99 00 ${String(10 + i).padStart(2, '0')} 00` : undefined,
      email: r() < 0.6 ? `contact@demo-${i}.example` : undefined,
      emailNominatif: false,
      logicielActuel: pick(['aucun', 'papier_excel', 'concurrent', 'inconnu', 'inconnu']),
      activiteVerifiee: r() < 0.5,
      signauxActivite: r() < 0.25 ? ['recrutement'] : r() < 0.3 ? ['chantiers_publies'] : [],
      signauxInteret: [],
      sources: { identite: 'saisie' },
      statut: 'a_contacter',
      notes: 'Prospect fictif de démonstration.',
      creeLe: nowIso,
      majLe: nowIso,
    };
    prospects.push(p);
    if (i >= 160) continue; // quelques prospects non encore contactés
    const campagneId = pick(['demo-c1', 'demo-c1', 'demo-c2', 'demo-c3', 'demo-c4']);
    const canal = canalCampagne[campagneId];
    const debut = canal === 'courrier' ? debutM1 : r() < 0.5 ? debutM2 : debutM1;
    const dateContact = ajouterJours(debut, Math.floor(r() * 27));
    if (dateContact >= now) continue;
    const variante = `${canal === 'linkedin' ? 'LI' : canal === 'email' ? 'EM' : canal === 'telephone' ? 'TEL' : 'COU'}-STD-${r() < 0.5 ? 'A' : 'B'}`;
    const add = (type: TypeInteraction, jours: number) => {
      const d = ajouterJours(dateContact, jours);
      if (d < now) interactions.push({ id: `${id}-${type}`, prospectId: id, date: iso(d), canal, type, campagneId, varianteMessage: type === 'message_envoye' || type === 'appel' ? variante : undefined });
      return d < now;
    };
    add(canal === 'telephone' ? 'appel' : 'message_envoye', 0);
    const proba = tauxCanal[canal] + (bonusMetier[metier] ?? 0) + (ageJ < 180 ? 0.12 : 0) + (variante.endsWith('B') && canal === 'linkedin' ? 0.08 : 0);
    if (r() < proba) {
      const positif = r() < 0.6;
      add(positif ? 'reponse_positive' : 'reponse_negative', 2);
      if (positif && r() < 0.65 && add('rdv', 6) && r() < 0.6) {
        add('signature', 12 + Math.floor(r() * 8));
      }
    }
  }
  // Statuts cohérents avec l'historique
  const rang: Record<string, number> = { message_envoye: 1, appel: 1, reponse_negative: 2, reponse_positive: 2, rdv: 3, essai: 4, signature: 5 };
  for (const p of prospects) {
    const its = interactions.filter((x) => x.prospectId === p.id);
    if (!its.length) continue;
    const top = its.reduce((a, b) => (rang[b.type] >= rang[a.type] ? b : a));
    p.statut = top.type === 'signature' ? 'client' : top.type === 'rdv' ? 'rdv' : top.type === 'reponse_negative' ? 'perdu' : top.type === 'reponse_positive' ? 'repondu' : 'contacte';
    if (its.some((x) => x.type === 'reponse_positive')) p.signauxInteret = ['a_repondu_positivement'];
  }
  return { version: 1, prospects, interactions, campagnes, parametres: { ...PARAMETRES_DEFAUT, signature: 'Alex – équipe commerciale', nomProduit: 'notre ERP bâtiment' } };
}
