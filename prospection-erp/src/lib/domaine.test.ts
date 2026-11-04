import { describe, expect, it } from 'vitest';
import { scorer } from './scoring';
import { prospect } from './fixtures.test-helpers';
import { metierDepuisNaf, tailleProspect, creeDepuisMoinsDe, ageJours } from './referentiel';
import { genererMessage, angleRecommande } from './messages';
import { PARAMETRES_DEFAUT, type Donnees } from './types';
import { simuler, simulerScenarios, delaiRecuperationMois, dureeVieMois, type Hypotheses } from './finance';
import { indicateurs, analyseMensuelle, moisFactures, ECHANTILLON_MIN } from './analytics';
import { construireUrl, versProspect } from './entreprises';
import { importerCsv, normaliserDate, parseCsv } from './csv';
import { donneesDemo } from './demo';

const NOW = new Date('2026-11-04T12:00:00Z');

describe('référentiel', () => {
  it('déduit le métier du code NAF', () => {
    expect(metierDepuisNaf('43.21A')).toBe('electricien');
    expect(metierDepuisNaf('4322B')).toBe('chauffagiste');
    expect(metierDepuisNaf('43.99B')).toBe('autre_btp');
    expect(metierDepuisNaf('62.01Z')).toBe('hors_btp');
    expect(metierDepuisNaf(undefined)).toBe('inconnu');
  });
  it('déduit la taille (effectif saisi prioritaire, sinon tranche INSEE)', () => {
    expect(tailleProspect({ trancheEffectif: 'NN' })).toBe('independant');
    expect(tailleProspect({ trancheEffectif: '02' })).toBe('2-5');
    expect(tailleProspect({ trancheEffectif: '03' })).toBe('6-10');
    expect(tailleProspect({ trancheEffectif: '11' })).toBe('11-20');
    expect(tailleProspect({ trancheEffectif: '21' })).toBe('plus_de_20');
    expect(tailleProspect({})).toBe('inconnue');
    expect(tailleProspect({ trancheEffectif: '21', effectifSaisi: 4 })).toBe('2-5');
  });
  it('filtre les créations récentes (30 j, 3, 6, 12 mois)', () => {
    expect(ageJours('2026-10-20', NOW)).toBe(15);
    expect(creeDepuisMoinsDe('2026-10-20', '30j', NOW)).toBe(true);
    expect(creeDepuisMoinsDe('2026-09-01', '30j', NOW)).toBe(false);
    expect(creeDepuisMoinsDe('2026-09-01', '3m', NOW)).toBe(true);
    expect(creeDepuisMoinsDe('2026-03-01', '6m', NOW)).toBe(false);
    expect(creeDepuisMoinsDe('2026-03-01', '12m', NOW)).toBe(true);
    expect(creeDepuisMoinsDe(undefined, '12m', NOW)).toBe(false);
  });
});

describe('scoring', () => {
  it("n'attribue aucun point sur des données inconnues et signale une confiance faible", () => {
    const s = scorer(prospect(), NOW);
    expect(s.total).toBe(0);
    expect(s.confiance).toBe('faible');
    expect(s.aCompleter.length).toBeGreaterThan(5);
  });
  it('respecte les pondérations 25/25/15/15/10/10 et plafonne à 100', () => {
    const s = scorer(prospect({
      metier: 'electricien', naf: '43.21A', effectifSaisi: 3, dateCreation: '2026-09-01', active: true,
      logicielActuel: 'papier_excel', activiteVerifiee: true, signauxActivite: ['recrutement', 'croissance_effectif', 'nouvel_etablissement', 'chantiers_publies'],
      email: 'jean@x.fr', emailNominatif: true, telephone: '01', siteWeb: 'x.fr',
      dirigeant: { prenom: 'Jean', nom: 'Dupont', qualite: 'Gérant', linkedinUrl: 'u', verifie: true },
      signauxInteret: ['demande_info', 'a_repondu_positivement'],
    }), NOW);
    expect(s.criteres.map((c) => c.max)).toEqual([25, 25, 15, 15, 10, 10]);
    expect(s.criteres.map((c) => c.points)).toEqual([25, 25, 15, 15, 10, 10]);
    expect(s.total).toBe(100);
    expect(s.confiance).toBe('élevée');
    expect(s.priorite).toBe('A');
  });
  it('justifie chaque critère et distingue « vérifié sans signal » de « inconnu »', () => {
    const a = scorer(prospect({ activiteVerifiee: true }), NOW).criteres.find((c) => c.id === 'activite')!;
    const b = scorer(prospect(), NOW).criteres.find((c) => c.id === 'activite')!;
    expect(a.evaluable).toBeGreaterThan(b.evaluable);
    expect(a.elements.every((e) => e.texte.length > 0)).toBe(true);
  });
  it('pénalise les entreprises hors cible', () => {
    const s = scorer(prospect({ metier: 'hors_btp', trancheEffectif: '22' }), NOW);
    expect(s.criteres[0].points).toBe(0);
    expect(s.criteres[0].evaluable).toBe(1);
  });
});

describe('messages', () => {
  const p = prospect({ nom: 'SARL DUPONT ELEC', metier: 'electricien', commune: 'RENNES', dateCreation: '2026-10-01', dirigeant: { prenom: 'Jean', nom: 'Dupont' } });
  it('personnalise avec les faits réels et respecte la limite LinkedIn', () => {
    const m = genererMessage(p, 'linkedin_invitation', 'lancement', 'A', PARAMETRES_DEFAUT, NOW);
    expect(m.texte.length).toBeLessThanOrEqual(200);
    expect(m.texte).toContain('Jean');
    expect(m.variante).toBe('LI-INV-LAN-A');
    const long = genererMessage(p, 'linkedin_message', 'standard', 'A', PARAMETRES_DEFAUT, NOW);
    expect(long.texte).toContain('électricien à Rennes');
    expect(long.texte).toContain('15 € HT par mois');
    expect(long.texte).toContain('Est-ce que vous utilisez déjà un logiciel');
    expect(long.bloquant).toBe(false);
  });
  it("recommande l'angle lancement pour une création récente", () => {
    expect(angleRecommande(p, NOW)).toBe('lancement');
    expect(angleRecommande(p, NOW, true)).toBe('relance');
  });
  it('bloque un message sans personnalisation possible', () => {
    const m = genererMessage(prospect({ nom: 'X' }), 'email', 'standard', 'A', PARAMETRES_DEFAUT, NOW);
    expect(m.bloquant).toBe(true);
    expect(m.objet).toBeTruthy();
  });
});

describe('finance', () => {
  const h: Hypotheses = { prixMensuelHT: 15, margeBrutePct: 80, churnMensuelPct: 0, dureeRetentionMois: 0, cac: 60, coutsFixesMensuels: 0, horizonMois: 12, tauxConversionPct: 2 };
  it('calcule MRR, ARR, CA, marge et résultat sans confondre CA et bénéfice', () => {
    const s = simuler(100, h);
    expect(s.mrr).toBe(1500);
    expect(s.arr).toBe(18000);
    expect(s.chiffreAffaires).toBe(18000);
    expect(s.margeBrute).toBeCloseTo(14400);
    expect(s.coutAcquisition).toBe(6000);
    expect(s.resultat).toBeCloseTo(8400);
    expect(s.contactsNecessaires).toBe(5000);
    expect(s.delaiRecuperation).toBe(5); // 60 € / 12 € de marge mensuelle
    expect(s.moisEquilibre).toBe(5);
  });
  it("intègre l'attrition et la durée de rétention", () => {
    expect(dureeVieMois({ churnMensuelPct: 5, dureeRetentionMois: 0 })).toBe(20);
    expect(dureeVieMois({ churnMensuelPct: 5, dureeRetentionMois: 8 })).toBe(8);
    const s = simuler(100, { ...h, churnMensuelPct: 10 });
    expect(s.chiffreAffaires).toBeLessThan(18000);
    expect(s.clientsRestants).toBeCloseTo(100 * 0.9 ** 12);
    expect(s.ltvMarge).toBeCloseTo(120);
    const r = simuler(10, { ...h, dureeRetentionMois: 3 });
    expect(r.chiffreAffaires).toBe(450);
  });
  it('simule les 6 scénarios demandés', () => {
    expect(simulerScenarios(h).map((s) => s.clients)).toEqual([10, 25, 50, 100, 250, 500]);
    expect(delaiRecuperationMois(0, h)).toBe(0);
  });
});

describe('suivi et analyse mensuelle', () => {
  it('compte les mois facturés', () => {
    expect(moisFactures('2026-10-01', '2026-10-01')).toBe(1);
    expect(moisFactures('2026-09-01', '2026-11-04')).toBe(3);
  });
  it('calcule CAC, MRR, CA et conversion par canal à partir du suivi', () => {
    const d: Donnees = {
      version: 1,
      prospects: [prospect({ id: 'a' }), prospect({ id: 'b' }), prospect({ id: 'c' })],
      campagnes: [{ id: 'c1', nom: 'LI', canal: 'linkedin', cout: 120, dateDebut: '2026-10-01' }],
      interactions: [
        { id: '1', prospectId: 'a', date: '2026-10-02', canal: 'linkedin', type: 'message_envoye', campagneId: 'c1', varianteMessage: 'LI-STD-A' },
        { id: '2', prospectId: 'a', date: '2026-10-05', canal: 'linkedin', type: 'signature', campagneId: 'c1' },
        { id: '3', prospectId: 'b', date: '2026-10-02', canal: 'linkedin', type: 'message_envoye', campagneId: 'c1' },
        { id: '4', prospectId: 'c', date: '2026-10-03', canal: 'email', type: 'message_envoye' },
      ],
      parametres: PARAMETRES_DEFAUT,
    };
    const ind = indicateurs(d, NOW);
    expect(ind.clientsAcquis).toBe(1);
    expect(ind.mrr).toBe(15);
    expect(ind.arr).toBe(180);
    expect(ind.caGenere).toBe(15 * moisFactures('2026-10-05', '2026-11-04'));
    expect(ind.cac).toBe(120);
    expect(ind.delaiRecuperation).toBe(10);
    expect(ind.parCanal.find((l) => l.cle === 'LinkedIn')!.tauxConversion).toBe(50);
    const a = analyseMensuelle(d, '2026-10', NOW);
    expect(a.cohorte).toBe(3);
    expect(a.meilleurCanal).toBeUndefined(); // échantillon < ECHANTILLON_MIN : aucune conclusion
    expect(a.recommandations[0].type).toBe('donnees');
  });
  it('produit des recommandations concrètes sur le jeu de démonstration', () => {
    const d = donneesDemo(NOW);
    expect(d.prospects.every((p) => p.nom.includes('(démo)'))).toBe(true);
    const a = analyseMensuelle(d, '2026-09', NOW);
    expect(a.cohorte).toBeGreaterThanOrEqual(ECHANTILLON_MIN);
    expect(a.meilleurCanal).toBeDefined();
    expect(a.recommandations.some((r) => r.type === 'renforcer')).toBe(true);
    expect(a.campagnes.length).toBeGreaterThan(0);
  });
});

describe('données publiques et import', () => {
  it("construit la requête vers l'API Recherche d'entreprises", () => {
    const u = new URL(construireUrl({ metiers: ['plombier', 'chauffagiste'], tailles: ['independant'], departement: '35' }, 2));
    expect(u.searchParams.get('activite_principale')).toBe('43.22A,43.22B');
    expect(u.searchParams.get('tranche_effectif_salarie')).toBe('NN,00');
    expect(u.searchParams.get('departement')).toBe('35');
    expect(u.searchParams.get('page')).toBe('2');
  });
  it('ne reprend que les données fournies par le répertoire', () => {
    const p = versProspect({
      siren: '123456789', nom_complet: 'DUPONT JEAN', activite_principale: '43.21A', tranche_effectif_salarie: null,
      date_creation: '2026-10-10', etat_administratif: 'A', complements: { est_entrepreneur_individuel: true },
      siege: { code_postal: '35000', libelle_commune: 'RENNES' },
      dirigeants: [{ type_dirigeant: 'personne physique', nom: 'DUPONT', prenoms: 'JEAN MARIE' }],
    }, NOW.toISOString());
    expect(p.metier).toBe('electricien');
    expect(p.dirigeant).toEqual({ prenom: 'Jean', nom: 'Dupont', qualite: 'Entrepreneur individuel' });
    expect(p.telephone).toBeUndefined();
    expect(p.email).toBeUndefined();
    expect(p.logicielActuel).toBe('inconnu');
    expect(tailleProspect(p)).toBe('independant');
  });
  it('importe un CSV (séparateur ;, guillemets, dates françaises)', () => {
    expect(parseCsv('a;b\n"x;1";"y ""z"""')).toEqual([['a', 'b'], ['x;1', 'y "z"']]);
    expect(normaliserDate('05/10/2026')).toBe('2026-10-05');
    expect(normaliserDate('20261005')).toBe('2026-10-05');
    const r = importerCsv('Dénomination;Code NAF;Date création;Code postal;Email\nPlomberie Martin;4322A;01/09/2026;35000;contact@pm.fr\n;;;;', NOW.toISOString());
    expect(r.prospects).toHaveLength(1);
    expect(r.prospects[0].metier).toBe('plombier');
    expect(r.prospects[0].emailNominatif).toBe(false);
    expect(r.prospects[0].dateCreation).toBe('2026-09-01');
  });
});
