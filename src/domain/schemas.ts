import { z } from 'zod';

/** Schémas de validation utilisés au chargement des données persistées. */

const point = z.object({ x: z.number(), y: z.number() });

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['sejour', 'cuisine', 'chambre', 'couloir', 'entree', 'garage', 'salle_de_bain', 'wc', 'bureau', 'palier', 'cellier', 'escalier', 'veranda', 'autre']),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  openPlan: z.boolean().default(false),
  comment: z.string().optional(),
});

const openingSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: z.enum(['porte', 'fenetre', 'porte_fenetre', 'baie', 'porte_garage', 'porte_interieure', 'passage', 'autre']),
  host: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('room'), roomId: z.string(), side: z.enum(['N', 'S', 'E', 'W']) }),
    z.object({ kind: z.literal('wall'), wallId: z.string() }),
    z.object({ kind: z.literal('unplaced'), roomId: z.string() }),
  ]),
  offset: z.number(),
  width: z.number().positive(),
  exterior: z.boolean(),
  sectional: z.boolean().default(false),
  positionConfirmed: z.boolean().optional(),
  height: z.number().positive().optional(),
  comment: z.string().optional(),
  leaves: z.union([z.literal(1), z.literal(2)]).optional(),
  hinge: z.enum(['gauche', 'droite']).optional(),
  entry: z.boolean().optional(),
});

const furnitureSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  roomId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  w: z.number().positive(),
  d: z.number().positive(),
  h: z.number().positive(),
  variant: z.string().optional(),
  color: z.string().optional(),
  origin: z.enum(['genere', 'manuel']),
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
  furniture: z.array(furnitureSchema).default([]),
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
      moved: z.number().optional(),
    }),
  ),
});

const answersSchema = z.object({
  housingType: z.enum(['appartement', 'maison', 'autre']),
  surfaceBand: z.enum(['moins_50', '50_80', '80_120', '120_180', 'plus_180', 'exacte']),
  surfaceExact: z.number().nullable(),
  levels: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  bedrooms: z.number().int().min(0),
  mainRooms: z.number().int().min(1).default(1),
  kitchen: z.enum(['ouverte', 'separee', 'partielle']),
  corridor: z.boolean(),
  garage: z.enum(['aucun', 'attenant', 'separe']),
  exteriorAccesses: z.number().int().min(1),
  windows: z.number().int().min(0),
  bays: z.number().int().min(0),
  extraDoors: z.number().int().min(0),
  features: z.object({
    stairs: z.boolean(),
    extension: z.boolean(),
    veranda: z.boolean(),
    extraRoom: z.boolean(),
    garageCommunicating: z.boolean(),
    other: z.boolean(),
  }),
  comment: z.string(),
});

const generationSchema = z.object({
  templateId: z.string(),
  answers: answersSchema,
  generatedAt: z.string(),
  baseline: z.array(levelSchema),
  fromAnswers: z.array(z.string()),
  validatedAt: z.string().nullable(),
  warnings: z.array(z.string()),
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
    priceOverrides: z
      .array(z.object({ productId: z.string(), initial: z.number().min(0).optional(), monthly: z.number().min(0).optional() }))
      .default([]),
    moved: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(0) })).default([]),
    packOverride: z.object({ initial: z.number().min(0).optional(), monthly: z.number().min(0).optional() }).nullable().default(null),
    packTransferred: z.boolean().default(false),
    totalOverride: z
      .object({ initial: z.number().min(0).optional(), monthly: z.number().min(0).optional(), note: z.string().default('') })
      .nullable()
      .default(null),
    pdfVariants: z.array(z.string()).default([]),
  }),
  quotes: z.array(quoteRecordSchema),
  demoValidatedAt: z.string().nullable(),
  generation: generationSchema.nullable().default(null),
  wizardDraft: z
    .object({ templateId: z.string().nullable(), answers: answersSchema.nullable() })
    .nullable()
    .default(null),
});
