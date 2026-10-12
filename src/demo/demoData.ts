import type { Catalog, Dossier, Level, Opening, OpeningType, Room, RoomSide, RoomType } from '@/domain/types';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { runAudit } from '@/rules/engine';
import { applyProposal } from '@/rules/apply';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';

/**
 * Données de démonstration ENTIÈREMENT FICTIVES.
 * Aucune donnée client réelle n'est utilisée.
 */

export const SCHEMA_VERSION = 1;

function room(id: string, name: string, type: RoomType, x: number, y: number, w: number, h: number, openPlan = false): Room {
  return { id, name, type, x, y, w, h, openPlan };
}

function op(
  id: string,
  code: string,
  type: OpeningType,
  roomId: string,
  side: RoomSide,
  offset: number,
  opts: { width?: number; exterior?: boolean; sectional?: boolean } = {},
): Opening {
  const width = opts.width ?? { porte: 0.9, fenetre: 1.2, baie: 2.4, porte_garage: 2.5, porte_interieure: 0.8 }[type];
  return {
    id,
    code,
    type,
    host: { kind: 'room', roomId, side },
    offset,
    width,
    exterior: opts.exterior ?? type !== 'porte_interieure',
    sectional: opts.sectional ?? false,
  };
}

export function demoHousePlan(): Level[] {
  const rdc: Level = {
    id: 'lvl_demo_rdc',
    name: 'Rez-de-chaussée',
    index: 0,
    height: 2.6,
    background: null,
    walls: [],
    rooms: [
      room('r_garage', 'Garage', 'garage', 0, 0, 3.5, 6),
      room('r_cellier', 'Cellier', 'cellier', 0, 6, 3.5, 3),
      room('r_couloir', 'Couloir', 'couloir', 3.5, 0, 2.5, 5.5),
      room('r_entree', 'Entrée', 'entree', 3.5, 5.5, 2.5, 3.5),
      room('r_cuisine', 'Cuisine ouverte', 'cuisine', 6, 0, 4, 3, true),
      room('r_wc', 'WC / buanderie', 'wc', 10, 0, 3, 3),
      room('r_sejour', 'Séjour', 'sejour', 6, 3, 7, 6, true),
    ],
    openings: [
      op('o_porte_entree', 'RDC-O01', 'porte', 'r_entree', 'S', 1.25),
      op('o_garage', 'RDC-O02', 'porte_garage', 'r_garage', 'W', 3, { sectional: true }),
      op('o_cellier_fen', 'RDC-O03', 'fenetre', 'r_cellier', 'W', 1.5, { width: 0.8 }),
      op('o_cellier_porte', 'RDC-O04', 'porte', 'r_cellier', 'S', 1.75),
      op('o_cuisine_fen', 'RDC-O05', 'fenetre', 'r_cuisine', 'N', 2),
      op('o_wc_fen', 'RDC-O06', 'fenetre', 'r_wc', 'N', 1.5, { width: 0.6 }),
      op('o_sejour_baie', 'RDC-O07', 'baie', 'r_sejour', 'S', 3.5),
      op('o_sejour_fen', 'RDC-O08', 'fenetre', 'r_sejour', 'E', 3),
      op('o_int_garage', 'RDC-O09', 'porte_interieure', 'r_garage', 'E', 2),
      op('o_int_entree', 'RDC-O10', 'porte_interieure', 'r_entree', 'N', 1.25),
      op('o_int_sejour', 'RDC-O11', 'porte_interieure', 'r_entree', 'E', 1.75),
      op('o_int_cuisine', 'RDC-O12', 'porte_interieure', 'r_couloir', 'E', 1.5),
      op('o_int_cellier', 'RDC-O13', 'porte_interieure', 'r_cellier', 'E', 1.5),
    ],
  };
  const r1: Level = {
    id: 'lvl_demo_r1',
    name: 'Étage (R+1)',
    index: 1,
    height: 2.5,
    background: null,
    walls: [],
    rooms: [
      room('r_ch1', 'Chambre 1', 'chambre', 3.5, 0, 4.5, 3.5),
      room('r_ch2', 'Chambre 2', 'chambre', 8, 0, 5, 3.5),
      room('r_palier', 'Couloir étage', 'couloir', 3.5, 3.5, 9.5, 1.5),
      room('r_ch3', 'Chambre 3', 'chambre', 3.5, 5, 4.5, 4),
      room('r_sdb', 'Salle de bain', 'salle_de_bain', 8, 5, 2.5, 4),
      room('r_bureau', 'Bureau', 'bureau', 10.5, 5, 2.5, 4),
    ],
    openings: [
      op('o_ch1_fen', 'R1-O01', 'fenetre', 'r_ch1', 'N', 2.25),
      op('o_ch2_fen', 'R1-O02', 'fenetre', 'r_ch2', 'N', 2.5),
      op('o_ch3_fen', 'R1-O03', 'fenetre', 'r_ch3', 'S', 2.25),
      op('o_sdb_fen', 'R1-O04', 'fenetre', 'r_sdb', 'S', 1.25, { width: 0.6 }),
      op('o_bureau_fen', 'R1-O05', 'fenetre', 'r_bureau', 'S', 1.25, { width: 1 }),
      op('o_int_ch1', 'R1-O06', 'porte_interieure', 'r_ch1', 'S', 3),
      op('o_int_ch2', 'R1-O07', 'porte_interieure', 'r_ch2', 'S', 1),
      op('o_int_ch3', 'R1-O08', 'porte_interieure', 'r_ch3', 'N', 3),
      op('o_int_sdb', 'R1-O09', 'porte_interieure', 'r_sdb', 'N', 1.25),
      op('o_int_bureau', 'R1-O10', 'porte_interieure', 'r_bureau', 'N', 1.25),
    ],
  };
  return [rdc, r1];
}

export function demoHouseDossier(catalog: Catalog = createDefaultCatalog()): Dossier {
  const now = new Date();
  const dossier: Dossier = {
    id: 'dos_demo_maison',
    schemaVersion: SCHEMA_VERSION,
    info: {
      reference: 'MOV-DEMO-0001',
      clientName: 'Client démo – Famille Exemple (fictif)',
      address: '12 rue de l’Exemple, 00000 Ville-Démo (adresse fictive)',
      housingType: 'maison',
      surface: 200,
      floors: 2,
      rooms: 9,
      createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
      installationDate: new Date(now.getTime() + 21 * 86400000).toISOString().slice(0, 10),
      advisorNotes:
        'Déménagement d’un client existant. Maison sur deux niveaux, garage attenant. Le client a un chat. Dossier de démonstration.',
      pets: 'oui',
      nightArming: 'inconnu',
    },
    status: 'audit_en_cours',
    updatedAt: now.toISOString(),
    plan: { levels: demoHousePlan() },
    devices: [],
    protectionMode: 'volumetrique',
    auditValidations: {},
    quoteDraft: { packId: 'pack_serenite', adjustments: [], discountIds: [], priceOverrides: [], moved: [], packOverride: null, packTransferred: false, totalOverride: null },
    quotes: [],
    demoValidatedAt: null,
  };
  const audit = runAudit(dossier, DEFAULT_RULES_CONFIG, catalog.products);
  dossier.devices = applyProposal([], audit.proposals.volumetrique, catalog.products);
  // Un équipement ajouté manuellement par le conseiller (sirène intérieure)
  dossier.devices.push({
    id: 'dev_demo_sirene',
    productId: 'prd_sirene_int',
    levelId: 'lvl_demo_rdc',
    x: 5.6,
    y: 0.4,
    rotation: 90,
    quantity: 1,
    origin: 'manuel',
    validated: true,
    note: 'Ajoutée par le conseiller à la demande du client.',
  });
  return dossier;
}

export function demoApartmentDossier(): Dossier {
  const now = new Date();
  const level: Level = {
    id: 'lvl_demo_appt',
    name: 'Appartement',
    index: 0,
    height: 2.5,
    background: null,
    walls: [],
    rooms: [
      room('a_entree', 'Entrée', 'entree', 0, 0, 2, 2.5),
      room('a_sejour', 'Séjour', 'sejour', 2, 0, 6, 4.5),
      room('a_ch', 'Chambre', 'chambre', 0, 2.5, 2, 2),
    ],
    openings: [
      op('ao_porte', 'RDC-O01', 'porte', 'a_entree', 'N', 1),
      op('ao_baie', 'RDC-O02', 'baie', 'a_sejour', 'E', 2.25, { width: 2 }),
    ],
  };
  return {
    id: 'dos_demo_appart',
    schemaVersion: SCHEMA_VERSION,
    info: {
      reference: 'MOV-DEMO-0002',
      clientName: 'Client démo – M. Fictif',
      address: '',
      housingType: 'appartement',
      surface: 62,
      floors: 1,
      rooms: 3,
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
      installationDate: null,
      advisorNotes: 'Plan en cours de saisie (exemple de dossier incomplet).',
      pets: 'inconnu',
      nightArming: 'oui',
    },
    status: 'brouillon',
    updatedAt: new Date(now.getTime() - 3600000).toISOString(),
    plan: { levels: [level] },
    devices: [],
    protectionMode: 'perimetrique',
    auditValidations: {},
    quoteDraft: { packId: 'pack_essentiel', adjustments: [], discountIds: [], priceOverrides: [], moved: [], packOverride: null, packTransferred: false, totalOverride: null },
    quotes: [],
    demoValidatedAt: null,
  };
}

export function emptyDossier(id: string, reference: string): Dossier {
  const now = new Date().toISOString();
  return {
    id,
    schemaVersion: SCHEMA_VERSION,
    info: {
      reference,
      clientName: '',
      address: '',
      housingType: 'maison',
      surface: null,
      floors: 1,
      rooms: null,
      createdAt: now,
      installationDate: null,
      advisorNotes: '',
      pets: 'inconnu',
      nightArming: 'inconnu',
    },
    status: 'brouillon',
    updatedAt: now,
    plan: {
      levels: [
        { id: `${id}_lvl0`, name: 'Rez-de-chaussée', index: 0, height: 2.5, rooms: [], walls: [], openings: [], background: null },
      ],
    },
    devices: [],
    protectionMode: 'volumetrique',
    auditValidations: {},
    quoteDraft: { packId: 'pack_essentiel', adjustments: [], discountIds: [], priceOverrides: [], moved: [], packOverride: null, packTransferred: false, totalOverride: null },
    quotes: [],
    demoValidatedAt: null,
  };
}
