import { z } from 'zod';

/** Schémas de validation utilisés au chargement des données persistées. */

const point = z.object({ x: z.number(), y: z.number() });

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['sejour', 'cuisine', 'chambre', 'couloir', 'entree', 'garage', 'salle_de_bain', 'wc', 'bureau', 'palier', 'cellier', 'autre']),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  openPlan: z.boolean().default(false),
});

const openingSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: z.enum(['porte', 'fenetre', 'baie', 'porte_garage', 'porte_interieure']),
  host: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('room'), roomId: z.string(), side: z.enum(['N', 'S', 'E', 'W']) }),
    z.object({ kind: z.literal('wall'), wallId: z.string() }),
  ]),
  offset: z.number(),
  width: z.number().positive(),
  exterior: z.boolean(),
  sectional: z.boolean().default(false),
});

const backgroundSchema = z.object({
  assetId: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  aspect: z.number().positive(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
  calibrated: z.boolean(),
});

const levelSchema = z.object({
  id: z.string(),
  name: z.string(),
  index: z.number().int(),
  height: z.number().positive(),
  rooms: z.array(roomSchema),
  walls: z.array(z.object({ id: z.string(), a: point, b: point, thickness: z.number().positive() })),
  openings: z.array(openingSchema),
  background: backgroundSchema.nullable(),
});

const deviceSchema = z.object({
  id: z.string(),
  productId: z.string(),
  levelId: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  quantity: z.number().int().min(1),
  origin: z.enum(['manuel', 'suggere']),
  validated: z.boolean(),
  suggestionKey: z.string().optional(),
  openingId: z.string().optional(),
  roomId: z.string().optional(),
  note: z.string().optional(),
});

const productSnapshot = z.object({
  id: z.string(),
  reference: z.string(),
  name: z.string(),
  priceInitial: z.number().nullable(),
  monthly: z.number().nullable(),
  packQuantity: z.number(),
});

export const productSchema = z.object({
  id: z.string(),
  reference: z.string().min(1),
  name: z.string().min(1),
  category: z.enum([
    'centrale',
    'clavier',
    'detecteur_mouvement',
    'detecteur_choc',
    'detecteur_fumee',
    'sirene_interieure',
    'sirene_exterieure',
    'pack_perimetrique',
    'boitier_save',
    'autre',
  ]),
  description: z.string(),
  priceInitial: z.number().min(0).nullable(),
  monthly: z.number().min(0).nullable(),
  billing: z.enum(['unitaire', 'lot', 'forfait', 'sur_devis']),
  packQuantity: z.number().int().min(1),
  bundleOf: z
    .enum([
      'centrale',
      'clavier',
      'detecteur_mouvement',
      'detecteur_choc',
      'detecteur_fumee',
      'sirene_interieure',
      'sirene_exterieure',
      'pack_perimetrique',
      'boitier_save',
      'autre',
    ])
    .optional(),
  icon: z.string(),
  compatibility: z.string(),
  active: z.boolean(),
  comments: z.string(),
  specs: z.record(z.string(), z.string()).optional(),
});

const packSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  monthly: z.number().min(0),
  initial: z.number().min(0),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(0) })),
  active: z.boolean(),
});

const discountSchema = z.object({
  id: z.string(),
  label: z.string(),
  target: z.enum(['materiel_supplementaire', 'initial_total', 'mensuel_total']),
  kind: z.enum(['pourcentage', 'montant']),
  value: z.number().min(0),
  active: z.boolean(),
  note: z.string(),
});

const settingsSchema = z.object({
  priceBasis: z.enum(['inconnue', 'HT', 'TTC']),
  vatRate: z.number().min(0).max(100).nullable(),
  installationFee: z.number().min(0).nullable(),
  autoBundle: z.boolean(),
  conditions: z.string(),
  validityDays: z.number().int().min(1),
});

export const catalogSchema = z.object({
  version: z.number().int(),
  updatedAt: z.string(),
  products: z.array(productSchema),
  packs: z.array(packSchema),
  discounts: z.array(discountSchema),
  settings: settingsSchema,
});

const quoteRecordSchema = z.object({
  id: z.string(),
  reference: z.string(),
  createdAt: z.string(),
  packId: z.string().nullable(),
  packName: z.string(),
  priceSnapshot: z.object({
    products: z.array(productSnapshot),
    pack: z
      .object({
        id: z.string(),
        name: z.string(),
        initial: z.number(),
        monthly: z.number(),
        items: z.array(z.object({ productId: z.string(), quantity: z.number() })),
      })
      .nullable(),
    discounts: z.array(discountSchema),
    settings: settingsSchema,
    catalogVersion: z.number(),
  }),
  totals: z.object({ initial: z.number(), monthly: z.number(), hasUnpricedItems: z.boolean() }),
  lines: z.array(
    z.object({
      label: z.string(),
      quantity: z.number(),
      unitInitial: z.number().nullable(),
      unitMonthly: z.number().nullable(),
      included: z.number(),
    }),
  ),
});

export const dossierSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int(),
  info: z.object({
    reference: z.string(),
    clientName: z.string(),
    address: z.string(),
    housingType: z.enum(['maison', 'appartement', 'duplex', 'local', 'autre']),
    surface: z.number().nullable(),
    floors: z.number().nullable(),
    rooms: z.number().nullable(),
    createdAt: z.string(),
    installationDate: z.string().nullable(),
    advisorNotes: z.string(),
    pets: z.enum(['oui', 'non', 'inconnu']),
    nightArming: z.enum(['oui', 'non', 'inconnu']),
  }),
  status: z.enum(['brouillon', 'audit_en_cours', 'audit_a_verifier', 'devis_genere', 'proposition_validee', 'cloture']),
  updatedAt: z.string(),
  plan: z.object({ levels: z.array(levelSchema) }),
  devices: z.array(deviceSchema),
  protectionMode: z.enum(['volumetrique', 'perimetrique']),
  auditValidations: z.record(z.string(), z.object({ validatedAt: z.string(), note: z.string() })),
  quoteDraft: z.object({
    packId: z.string().nullable(),
    adjustments: z.array(z.object({ productId: z.string(), delta: z.number().int() })),
    discountIds: z.array(z.string()),
  }),
  quotes: z.array(quoteRecordSchema),
  demoValidatedAt: z.string().nullable(),
});
