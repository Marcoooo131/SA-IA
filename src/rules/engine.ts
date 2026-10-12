import type {
  Dossier,
  Level,
  Opening,
  PlacedDevice,
  Point,
  Product,
  ProductCategory,
  ProtectionMode,
  Room,
  RoomSide,
} from '@/domain/types';
import { CATEGORY_LABELS, MODE_LABELS, OPENING_TYPE_LABELS, ROOM_TYPE_LABELS } from '@/domain/labels';
import {
  adjacentRooms,
  findDuplicateOpenings,
  isExteriorAt,
  levelHabitableArea,
  openingPlacement,
  roomArea,
  roomsOverlap,
  sideNormal,
} from '@/plan/geometry';
import { formatArea, formatNumber } from '@/lib/format';
import type { RulesConfig } from './config';

/**
 * Moteur de règles d'audit : fonction pure, indépendante de l'interface.
 * Il produit des PROPOSITIONS et des ALERTES ; il ne certifie rien.
 */

export type AlertStatus = 'manquant' | 'a_verifier' | 'suggestion' | 'valide';

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  manquant: 'Information manquante',
  a_verifier: 'Point à vérifier',
  suggestion: 'Suggestion automatique',
  valide: 'Validé par le conseiller',
};

export interface AuditAlert {
  id: string;
  ruleId: string;
  status: AlertStatus;
  /** Statut avant validation éventuelle par le conseiller. */
  baseStatus: Exclude<AlertStatus, 'valide'>;
  title: string;
  reason: string;
  nextAction: string;
  levelId?: string;
  target?: { kind: 'dossier' | 'level' | 'room' | 'opening' | 'device'; id: string };
  mode?: ProtectionMode;
  validationNote?: string;
}

export interface SuggestedDevice {
  key: string;
  category: ProductCategory;
  levelId: string;
  x: number;
  y: number;
  rotation: number;
  quantity: number;
  reason: string;
  roomId?: string;
  openingId?: string;
}

export interface ModeProposal {
  mode: ProtectionMode;
  devices: SuggestedDevice[];
  counts: Partial<Record<ProductCategory, number>>;
  limits: string[];
}

export interface LevelInventory {
  levelId: string;
  name: string;
  area: number;
  habitableArea: number;
  rooms: number;
  exteriorOpenings: number;
  smokeEstimate: number;
}

export interface AuditResult {
  inventory: {
    levels: LevelInventory[];
    totalArea: number;
    exteriorOpenings: { opening: Opening; level: Level }[];
    entryPoints: number;
  };
  proposals: Record<ProtectionMode, ModeProposal>;
  alerts: AuditAlert[];
}

const CIRCULATION: Room['type'][] = ['couloir', 'palier', 'entree'];
const isExteriorType = (t: Opening['type']) => t !== 'porte_interieure' && t !== 'passage';

function isDoor(o: Opening): boolean {
  return o.type === 'porte' || o.type === 'porte_garage';
}

function inwardPoint(level: Level, opening: Opening, inset: number): { p: Point; rotation: number } | null {
  const pl = openingPlacement(level, opening);
  if (!pl) return null;
  if (opening.host.kind === 'room') {
    const n = sideNormal(opening.host.side);
    const rot = (Math.atan2(-n.y, -n.x) * 180) / Math.PI;
    return { p: { x: pl.center.x - n.x * inset, y: pl.center.y - n.y * inset }, rotation: rot };
  }
  return { p: pl.center, rotation: (pl.angle * 180) / Math.PI };
}

function sideIsExterior(level: Level, room: Room, side: RoomSide): boolean {
  const seg = {
    N: { x: room.x + room.w / 2, y: room.y },
    S: { x: room.x + room.w / 2, y: room.y + room.h },
    W: { x: room.x, y: room.y + room.h / 2 },
    E: { x: room.x + room.w, y: room.y + room.h / 2 },
  }[side];
  return isExteriorAt(level, room.id, side, seg);
}

/**
 * Coin d'installation d'un détecteur de mouvement : on privilégie un coin
 * intérieur (deux murs mitoyens) orienté vers la diagonale opposée.
 */
export function motionCorner(level: Level, box: { x: number; y: number; w: number; h: number }, room?: Room, avoid: Point[] = []) {
  const inset = 0.25;
  const corners = [
    { p: { x: box.x + inset, y: box.y + inset }, sides: ['N', 'W'] as RoomSide[] },
    { p: { x: box.x + box.w - inset, y: box.y + inset }, sides: ['N', 'E'] as RoomSide[] },
    { p: { x: box.x + inset, y: box.y + box.h - inset }, sides: ['S', 'W'] as RoomSide[] },
    { p: { x: box.x + box.w - inset, y: box.y + box.h - inset }, sides: ['S', 'E'] as RoomSide[] },
  ];
  // Coin intérieur privilégié, en évitant les coins proches d'un détecteur déjà proposé
  const score = (c: (typeof corners)[number]) => {
    const interior = room ? c.sides.filter((s) => !sideIsExterior(level, room, s)).length : 0;
    const nearest = avoid.length ? Math.min(...avoid.map((a) => Math.hypot(a.x - c.p.x, a.y - c.p.y))) : 99;
    return interior * 2 + Math.min(3, nearest);
  };
  const best = [...corners].sort((a, b) => score(b) - score(a))[0];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rotation = (Math.atan2(cy - best.p.y, cx - best.p.x) * 180) / Math.PI;
  return { ...best.p, rotation };
}

function unionBox(rooms: Room[]) {
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function count(devices: SuggestedDevice[]): Partial<Record<ProductCategory, number>> {
  const out: Partial<Record<ProductCategory, number>> = {};
  for (const d of devices) out[d.category] = (out[d.category] ?? 0) + d.quantity;
  return out;
}

export function shockQuantity(opening: Opening, config: RulesConfig): number {
  if (opening.sectional && config.shock.skipSectional) return 0;
  if (opening.type === 'baie') return config.shock.perBay;
  return config.shock.perOpening;
}

export function runAudit(
  dossier: Dossier,
  config: RulesConfig,
  products: Product[],
): AuditResult {
  const alerts: AuditAlert[] = [];
  const add = (a: Omit<AuditAlert, 'status' | 'baseStatus'> & { status: Exclude<AlertStatus, 'valide'> }) => {
    if (alerts.some((x) => x.id === a.id)) return;
    alerts.push({ ...a, baseStatus: a.status });
  };
  const { info, plan } = dossier;
  const levels = [...plan.levels].sort((a, b) => a.index - b.index);

  // -------------------------------------------------------------------------
  // Informations du dossier
  // -------------------------------------------------------------------------
  if (!info.address.trim())
    add({
      id: 'dossier:adresse',
      ruleId: 'R-DOSSIER',
      status: 'manquant',
      title: 'Adresse du logement manquante',
      reason: 'Une centrale est prévue par logement associé à une adresse.',
      nextAction: "Renseigner l'adresse dans l'onglet Logement.",
      target: { kind: 'dossier', id: dossier.id },
    });
  if (!info.surface)
    add({
      id: 'dossier:surface',
      ruleId: 'R-DOSSIER',
      status: 'manquant',
      title: 'Surface approximative non renseignée',
      reason: 'La surface déclarée sert à contrôler la cohérence du plan.',
      nextAction: "Renseigner la surface dans l'onglet Logement.",
      target: { kind: 'dossier', id: dossier.id },
    });
  if (!info.installationDate)
    add({
      id: 'dossier:installation',
      ruleId: 'R-DOSSIER',
      status: 'manquant',
      title: "Date d'installation souhaitée non renseignée",
      reason: 'Information utile pour planifier l’intervention.',
      nextAction: "Demander la date souhaitée au client.",
      target: { kind: 'dossier', id: dossier.id },
    });
  if (info.pets === 'inconnu')
    add({
      id: 'dossier:animaux',
      ruleId: 'R-MODE',
      status: 'manquant',
      title: "Présence d'animaux non renseignée",
      reason: 'Elle influence le choix entre mode volumétrique et périmétrique.',
      nextAction: 'Poser la question au client et compléter le dossier.',
      target: { kind: 'dossier', id: dossier.id },
    });
  if (info.nightArming === 'inconnu')
    add({
      id: 'dossier:nuit',
      ruleId: 'R-MODE',
      status: 'manquant',
      title: 'Usage de nuit (système activé à domicile) non renseigné',
      reason: "Le client souhaite-t-il se déplacer à l'intérieur avec le système activé ?",
      nextAction: 'Poser la question au client et compléter le dossier.',
      target: { kind: 'dossier', id: dossier.id },
    });

  // -------------------------------------------------------------------------
  // Plan
  // -------------------------------------------------------------------------
  if (!levels.length || levels.every((l) => !l.rooms.length)) {
    add({
      id: 'plan:vide',
      ruleId: 'R-PLAN',
      status: 'manquant',
      title: 'Aucune pièce saisie',
      reason: 'Le plan est nécessaire pour proposer les équipements.',
      nextAction: "Dessiner les pièces ou importer un plan dans l'onglet Plan 2D.",
    });
  }
  if (dossier.generation && !dossier.generation.validatedAt)
    add({
      id: 'plan:genere',
      ruleId: 'R-PLAN',
      status: 'a_verifier',
      title: 'Plan généré automatiquement, non vérifié',
      reason: 'Le plan a été produit à partir du questionnaire : c’est une représentation générique, pas un relevé du logement réel.',
      nextAction: 'Vérifier dimensions, ouvertures et disposition dans le Plan 2D, puis cliquer sur « Valider le plan ».',
    });
  if (info.floors && levels.length && info.floors !== levels.length)
    add({
      id: 'plan:etages',
      ruleId: 'R-PLAN',
      status: 'a_verifier',
      title: "Nombre d'étages différent du dossier",
      reason: `Dossier : ${info.floors} étage(s) déclaré(s), plan : ${levels.length} niveau(x).`,
      nextAction: 'Ajouter le niveau manquant ou corriger le dossier.',
    });

  const totalArea = levels.reduce((s, l) => s + l.rooms.reduce((t, r) => t + roomArea(r), 0), 0);
  if (info.surface && totalArea > 0 && Math.abs(totalArea - info.surface) / info.surface > 0.2)
    add({
      id: 'plan:surface',
      ruleId: 'R-PLAN',
      status: 'a_verifier',
      title: 'Surface du plan éloignée de la surface déclarée',
      reason: `Plan : ${formatArea(totalArea)}, dossier : ${formatArea(info.surface)} (écart > 20 %).`,
      nextAction: "Vérifier les dimensions des pièces ou l'échelle du plan importé.",
    });

  for (const level of levels) {
    if (!level.rooms.length && levels.length > 0)
      add({
        id: `level:${level.id}:vide`,
        ruleId: 'R-PLAN',
        status: 'manquant',
        title: `${level.name} : aucune pièce`,
        reason: 'Le niveau existe mais ne contient pas de pièce.',
        nextAction: 'Dessiner les pièces de ce niveau ou le supprimer.',
        levelId: level.id,
        target: { kind: 'level', id: level.id },
      });
    if (level.background && !level.background.calibrated)
      add({
        id: `level:${level.id}:echelle`,
        ruleId: 'R-PLAN',
        status: 'a_verifier',
        title: `${level.name} : échelle du plan importé non définie`,
        reason: "Sans dimension de référence, les surfaces tracées sur l'image peuvent être fausses.",
        nextAction: "Utiliser l'outil « Échelle » avec une dimension connue (ex. largeur d'une porte).",
        levelId: level.id,
        target: { kind: 'level', id: level.id },
      });
    for (let i = 0; i < level.rooms.length; i++)
      for (let j = i + 1; j < level.rooms.length; j++)
        if (roomsOverlap(level.rooms[i], level.rooms[j]))
          add({
            id: `room:${level.rooms[i].id}:${level.rooms[j].id}:chevauchement`,
            ruleId: 'R-PLAN',
            status: 'a_verifier',
            title: `${level.name} : pièces qui se chevauchent`,
            reason: `« ${level.rooms[i].name} » et « ${level.rooms[j].name} » se superposent.`,
            nextAction: 'Corriger les dimensions ou la position des pièces.',
            levelId: level.id,
            target: { kind: 'room', id: level.rooms[i].id },
          });
    for (const [a, b] of findDuplicateOpenings(level))
      add({
        id: `opening:${a.id}:${b.id}:doublon`,
        ruleId: 'R-CHOC',
        status: 'a_verifier',
        title: `${level.name} : ouvertures en doublon (${a.code} / ${b.code})`,
        reason: 'Deux ouvertures occupent le même emplacement : risque de double comptage.',
        nextAction: "Supprimer l'une des deux ouvertures.",
        levelId: level.id,
        target: { kind: 'opening', id: b.id },
      });
    for (const o of level.openings) {
      if (o.exterior && o.host.kind === 'room') {
        const pl = openingPlacement(level, o);
        if (pl && !isExteriorAt(level, o.host.roomId, o.host.side, pl.center))
          add({
            id: `opening:${o.id}:exterieur`,
            ruleId: 'R-CHOC',
            status: 'a_verifier',
            title: `${o.code} marquée extérieure mais contiguë à une pièce`,
            reason: "La géométrie indique une pièce de l'autre côté de cette ouverture.",
            nextAction: "Vérifier l'indicateur « donne sur l'extérieur ».",
            levelId: level.id,
            target: { kind: 'opening', id: o.id },
          });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Inventaire
  // -------------------------------------------------------------------------
  const exteriorOpenings = levels.flatMap((level) =>
    level.openings.filter((o) => o.exterior && isExteriorType(o.type)).map((opening) => ({ opening, level })),
  );
  const entryPoints = exteriorOpenings.filter(({ opening }) => isDoor(opening)).length;
  const ground = levels[0];
  if (ground && ground.rooms.length && !exteriorOpenings.some(({ opening }) => isDoor(opening)))
    add({
      id: 'plan:acces',
      ruleId: 'R-CLAVIER',
      status: 'manquant',
      title: "Aucun accès extérieur identifié",
      reason: 'Le clavier se place près du point d’entrée principal.',
      nextAction: "Ajouter la porte d'entrée et cocher « donne sur l'extérieur ».",
    });

  const inventoryLevels: LevelInventory[] = levels.map((l) => {
    const habitable = config.smoke.includeGarage ? l.rooms.reduce((s, r) => s + roomArea(r), 0) : levelHabitableArea(l);
    return {
      levelId: l.id,
      name: l.name,
      area: l.rooms.reduce((s, r) => s + roomArea(r), 0),
      habitableArea: habitable,
      rooms: l.rooms.length,
      exteriorOpenings: l.openings.filter((o) => o.exterior && isExteriorType(o.type)).length,
      smokeEstimate: habitable > 0 ? Math.ceil(habitable / config.smoke.coverageM2) : 0,
    };
  });

  // -------------------------------------------------------------------------
  // Équipements communs : centrale, clavier, fumée
  // -------------------------------------------------------------------------
  const common: SuggestedDevice[] = [];
  const groundRooms = ground ? ground.rooms : [];
  const centralRoom =
    groundRooms.find((r) => r.type === 'couloir') ??
    groundRooms.find((r) => r.type === 'cellier') ??
    groundRooms.find((r) => r.type === 'entree') ??
    groundRooms[0];
  if (ground && centralRoom) {
    common.push({
      key: 'centrale',
      category: 'centrale',
      levelId: ground.id,
      x: centralRoom.x + Math.min(0.5, centralRoom.w / 2),
      y: centralRoom.y + Math.min(0.5, centralRoom.h / 2),
      rotation: 0,
      quantity: config.centralPerDwelling,
      reason: 'Une centrale par logement associé à une adresse.',
      roomId: centralRoom.id,
    });
  }

  const mainDoor =
    exteriorOpenings.find(({ opening, level }) => {
      if (opening.type !== 'porte' || opening.host.kind !== 'room') return false;
      const hostRoomId = opening.host.roomId;
      return level.rooms.find((r) => r.id === hostRoomId)?.type === 'entree';
    }) ?? exteriorOpenings.find(({ opening }) => opening.type === 'porte');
  if (mainDoor) {
    const ip = inwardPoint(mainDoor.level, mainDoor.opening, 0.25);
    if (ip) {
      const along = (mainDoor.opening.width / 2 + 0.4) * 1;
      const ang = ((ip.rotation + 90) * Math.PI) / 180;
      common.push({
        key: 'clavier',
        category: 'clavier',
        levelId: mainDoor.level.id,
        x: ip.p.x + Math.cos(ang) * along,
        y: ip.p.y + Math.sin(ang) * along,
        rotation: ip.rotation,
        quantity: config.keypad.default,
        reason: `Clavier près de l'accès principal (${mainDoor.opening.code}).`,
        openingId: mainDoor.opening.id,
      });
    }
  }
  if (entryPoints > 1)
    add({
      id: 'clavier:points-entree',
      ruleId: 'R-CLAVIER',
      status: 'a_verifier',
      title: `${entryPoints} points d'entrée identifiés`,
      reason: `1 clavier proposé. Jusqu'à ${Math.min(entryPoints, config.keypad.max)} claviers envisageables (maximum ${config.keypad.max}), sous réserve de validation.`,
      nextAction: "Valider avec le client l'usage des différents accès et ajuster le nombre de claviers.",
    });

  for (const l of levels) {
    const inv = inventoryLevels.find((i) => i.levelId === l.id)!;
    if (!inv.smokeEstimate) continue;
    const candidates = l.rooms
      .filter((r) => r.type !== 'garage' || config.smoke.includeGarage)
      .filter((r) => !['cuisine', 'salle_de_bain', 'wc', 'escalier', 'veranda'].includes(r.type))
      .sort((a, b) => {
        const pa = CIRCULATION.includes(a.type) ? 0 : a.type === 'sejour' ? 1 : 2;
        const pb = CIRCULATION.includes(b.type) ? 0 : b.type === 'sejour' ? 1 : 2;
        return pa - pb || roomArea(b) - roomArea(a);
      });
    const pool = candidates.length ? candidates : l.rooms;
    for (let i = 0; i < inv.smokeEstimate; i++) {
      const room = pool[i % pool.length];
      const round = Math.floor(i / pool.length);
      common.push({
        key: `fumee:${l.id}:${i}`,
        category: 'detecteur_fumee',
        levelId: l.id,
        x: room.x + room.w / 2 + (round ? 0.6 * round : 0),
        y: room.y + Math.max(0.35, Math.min(room.h * 0.25, room.h / 2 - 0.6)),
        rotation: 0,
        quantity: 1,
        reason: `Estimation indicative ${l.name} : ${formatArea(inv.habitableArea)} / ${config.smoke.coverageM2} m².`,
        roomId: room.id,
      });
    }
    add({
      id: `fumee:${l.id}`,
      ruleId: 'R-FUMEE',
      status: 'a_verifier',
      title: `${l.name} : ${inv.smokeEstimate} détecteur(s) de fumée estimé(s)`,
      reason: `Surface retenue ${formatArea(inv.habitableArea)}, couverture indicative de départ ${config.smoke.coverageM2} m² par détecteur. Estimation, pas une règle d'installation.`,
      nextAction: 'Vérifier les exigences applicables et les préconisations du fabricant, puis valider.',
      levelId: l.id,
    });
  }

  // -------------------------------------------------------------------------
  // Détecteurs de choc et d'ouverture
  // -------------------------------------------------------------------------
  const shockFor = (scope: 'toutes' | 'acces' | 'aucune'): SuggestedDevice[] => {
    const out: SuggestedDevice[] = [];
    for (const { opening, level } of exteriorOpenings) {
      if (scope === 'aucune') continue;
      if (scope === 'acces' && !isDoor(opening)) continue;
      const qty = shockQuantity(opening, config);
      if (!qty) continue;
      const ip = inwardPoint(level, opening, 0.15);
      if (!ip) continue;
      out.push({
        key: `choc:${opening.id}`,
        category: 'detecteur_choc',
        levelId: level.id,
        x: ip.p.x,
        y: ip.p.y,
        rotation: ip.rotation,
        quantity: qty,
        reason:
          opening.type === 'baie'
            ? `${opening.code} – baie vitrée : quantité indicative ${qty}.`
            : `${opening.code} – ${OPENING_TYPE_LABELS[opening.type].toLowerCase()} donnant sur l'extérieur.`,
        openingId: opening.id,
      });
    }
    return out;
  };
  for (const { opening, level } of exteriorOpenings) {
    if (opening.sectional && config.shock.skipSectional)
      add({
        id: `choc:${opening.id}:sectionnelle`,
        ruleId: 'R-CHOC',
        status: 'a_verifier',
        title: `${opening.code} : porte de garage sectionnelle non équipée automatiquement`,
        reason: 'La règle communiquée exclut l’ajout automatique sur les portes sectionnelles.',
        nextAction: 'Étudier une solution adaptée avec le client si nécessaire.',
        levelId: level.id,
        target: { kind: 'opening', id: opening.id },
      });
    if (opening.type === 'baie')
      add({
        id: `choc:${opening.id}:baie`,
        ruleId: 'R-CHOC',
        status: 'suggestion',
        title: `${opening.code} : baie vitrée – ${config.shock.perBay} détecteurs indicatifs`,
        reason: 'Quantité indicative communiquée pour une baie vitrée.',
        nextAction: 'Confirmer le nombre de vantaux sur place.',
        levelId: level.id,
        target: { kind: 'opening', id: opening.id },
      });
  }

  // -------------------------------------------------------------------------
  // Détecteurs de mouvement
  // -------------------------------------------------------------------------
  const volumetricMotion: SuggestedDevice[] = [];
  const perimeterMotion: SuggestedDevice[] = [];
  const { rangeM } = config.motion;
  for (const level of levels) {
    const used = new Set<string>();
    const placedHere: SuggestedDevice[] = [];
    const pushMotion = (room: Room, box: { x: number; y: number; w: number; h: number }, reason: string, extraIds: string[] = []) => {
      const c = motionCorner(level, box, room, placedHere);
      placedHere.push({
        key: `mvt:${room.id}`,
        category: 'detecteur_mouvement',
        levelId: level.id,
        x: c.x,
        y: c.y,
        rotation: c.rotation,
        quantity: 1,
        reason,
        roomId: room.id,
      });
      used.add(room.id);
      extraIds.forEach((id) => used.add(id));
    };

    // Séjour, éventuellement avec cuisine ouverte
    for (const room of level.rooms.filter((r) => r.type === 'sejour')) {
      const openKitchens = adjacentRooms(level, room).filter((r) => r.type === 'cuisine' && (r.openPlan || room.openPlan));
      if (openKitchens.length) {
        const box = unionBox([room, ...openKitchens]);
        const diag = Math.hypot(box.w, box.h);
        pushMotion(room, diag <= rangeM ? box : room, `Séjour${diag <= rangeM ? ' et cuisine ouverte' : ''} : zone de passage principale.`, diag <= rangeM ? openKitchens.map((k) => k.id) : []);
        add({
          id: `mvt:${room.id}:cuisine-ouverte`,
          ruleId: 'R-MOUVEMENT',
          status: 'a_verifier',
          title: `${level.name} : cuisine ouverte sur le séjour`,
          reason:
            diag <= rangeM
              ? `Diagonale de la zone ${formatNumber(diag, 1)} m ≤ portée de référence ${rangeM} m : un détecteur peut suffire, sous réserve des obstacles et de l'orientation.`
              : `Diagonale de la zone ${formatNumber(diag, 1)} m > portée de référence ${rangeM} m : un second détecteur peut être nécessaire.`,
          nextAction: 'Vérifier sur place la couverture (obstacles, orientation, fiche fabricant).',
          levelId: level.id,
          target: { kind: 'room', id: room.id },
          mode: 'volumetrique',
        });
      } else {
        pushMotion(room, room, 'Séjour : pièce ouverte et zone de passage.');
      }
    }
    for (const room of level.rooms.filter((r) => r.type === 'entree' && !used.has(r.id)))
      pushMotion(room, room, "Entrée : zone de passage depuis l'accès principal.");
    for (const room of level.rooms.filter((r) => (r.type === 'couloir' || r.type === 'palier') && !used.has(r.id))) {
      const len = Math.max(room.w, room.h);
      if (len >= config.motion.corridorMinLength) pushMotion(room, room, `Couloir de ${formatNumber(len, 1)} m : passage important.`);
      else
        add({
          id: `mvt:${room.id}:couloir`,
          ruleId: 'R-MOUVEMENT',
          status: 'a_verifier',
          title: `${level.name} : ${room.name} à évaluer`,
          reason: `Couloir court (${formatNumber(len, 1)} m) : besoin de protection à évaluer.`,
          nextAction: 'Décider sur place si un détecteur est utile.',
          levelId: level.id,
          target: { kind: 'room', id: room.id },
          mode: 'volumetrique',
        });
    }
    for (const room of level.rooms.filter((r) => r.type === 'garage')) {
      if (config.motion.studyGarage) {
        pushMotion(room, room, 'Garage : ajout à étudier.');
        add({
          id: `mvt:${room.id}:garage`,
          ruleId: 'R-MOUVEMENT',
          status: 'a_verifier',
          title: `${level.name} : détecteur pour le garage à étudier`,
          reason: 'Un détecteur est proposé dans le garage ; son utilité dépend des usages et des accès.',
          nextAction: 'Valider ou supprimer la suggestion avec le client.',
          levelId: level.id,
          target: { kind: 'room', id: room.id },
          mode: 'volumetrique',
        });
      }
    }
    // Minimum par étage
    if (placedHere.length < config.motion.minPerLevel && level.rooms.length) {
      const room =
        level.rooms.find((r) => CIRCULATION.includes(r.type)) ?? [...level.rooms].sort((a, b) => roomArea(b) - roomArea(a))[0];
      pushMotion(room, room, `Minimum ${config.motion.minPerLevel} détecteur par étage (règle communiquée).`);
    }
    volumetricMotion.push(...placedHere);

    // Mode périmétrique : minimum par étage dans la circulation principale
    if (level.rooms.length) {
      const room =
        level.rooms.find((r) => CIRCULATION.includes(r.type)) ??
        level.rooms.find((r) => r.type === 'sejour') ??
        [...level.rooms].sort((a, b) => roomArea(b) - roomArea(a))[0];
      const c = motionCorner(level, room, room);
      for (let i = 0; i < config.motion.minPerLevel; i++)
        perimeterMotion.push({
          key: `mvt:${room.id}${i ? `:${i}` : ''}`,
          category: 'detecteur_mouvement',
          levelId: level.id,
          x: c.x,
          y: c.y,
          rotation: c.rotation,
          quantity: 1,
          reason: `Minimum ${config.motion.minPerLevel} par étage (règle communiquée) ; utilisable en mode absence, à désactiver en mode partiel.`,
          roomId: room.id,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Propositions par mode
  // -------------------------------------------------------------------------
  const volumetricDevices = [...common, ...volumetricMotion, ...shockFor(config.shock.volumetricScope)];
  const perimeterDevices = [...common, ...perimeterMotion, ...shockFor('toutes')];

  const volumetricLimits = [
    'Zones de détection théoriques : simulation indicative (110° / 10 m), sans prise en compte certaine des obstacles.',
    "Les déplacements à l'intérieur déclenchent la détection lorsque le système est activé.",
  ];
  if (info.pets === 'oui')
    volumetricLimits.push('Présence d’animaux : compatibilité non garantie, à vérifier selon le modèle et les réglages.');
  if (info.nightArming === 'oui')
    volumetricLimits.push('Usage de nuit souhaité : le mode volumétrique seul limite les déplacements, à étudier.');
  if (config.shock.volumetricScope !== 'toutes')
    volumetricLimits.push("Protection des fenêtres et baies non systématique : besoin à étudier ouverture par ouverture.");
  const perimeterLimits = [
    "Vise à permettre les déplacements à l'intérieur système activé, si les équipements et les règles applicables le permettent (à vérifier).",
    'Nombre d’équipements plus élevé : une ouverture extérieure = au moins un détecteur.',
  ];
  if (info.pets === 'oui') perimeterLimits.push('Animaux : les détecteurs de mouvement éventuels restent à paramétrer (non garanti).');

  if (info.pets === 'oui')
    add({
      id: 'mode:animaux',
      ruleId: 'R-MODE',
      status: 'a_verifier',
      title: 'Animaux présents : limite du mode volumétrique',
      reason: 'La compatibilité animaux n’est pas garantie sans vérification des équipements et de la configuration.',
      nextAction: 'Vérifier les fiches produits ou privilégier une configuration périmétrique.',
      mode: 'volumetrique',
    });
  if (info.nightArming === 'oui')
    add({
      id: 'mode:nuit',
      ruleId: 'R-MODE',
      status: 'a_verifier',
      title: 'Usage de nuit souhaité',
      reason: "Se déplacer à l'intérieur système activé suppose une configuration périmétrique adaptée.",
      nextAction: 'Comparer les deux modes et vérifier la configuration possible.',
      mode: 'perimetrique',
    });

  add({
    id: 'sirenes',
    ruleId: 'R-SIRENE',
    status: 'a_verifier',
    title: 'Sirènes : aucune règle communiquée',
    reason: "Aucune règle de dimensionnement n'a été fournie pour les sirènes intérieure et extérieure.",
    nextAction: 'Décider avec le client et ajouter manuellement si besoin.',
  });

  const proposals: Record<ProtectionMode, ModeProposal> = {
    volumetrique: { mode: 'volumetrique', devices: volumetricDevices, counts: count(volumetricDevices), limits: volumetricLimits },
    perimetrique: { mode: 'perimetrique', devices: perimeterDevices, counts: count(perimeterDevices), limits: perimeterLimits },
  };

  // Synthèse des suggestions
  for (const mode of ['volumetrique', 'perimetrique'] as ProtectionMode[]) {
    const c = proposals[mode].counts;
    const parts = (Object.keys(c) as ProductCategory[]).map((k) => `${c[k]} × ${CATEGORY_LABELS[k].toLowerCase()}`);
    if (parts.length)
      add({
        id: `proposition:${mode}`,
        ruleId: 'R-MODE',
        status: 'suggestion',
        title: `Proposition ${MODE_LABELS[mode].toLowerCase()}`,
        reason: parts.join(', ') + '.',
        nextAction: mode === dossier.protectionMode ? 'Appliquer la proposition sur le plan puis ajuster.' : 'Comparer avec le mode retenu.',
        mode,
      });
  }

  // -------------------------------------------------------------------------
  // Contrôle des équipements placés
  // -------------------------------------------------------------------------
  const placed = placedCountsByCategory(dossier.devices, products);
  const chosen = proposals[dossier.protectionMode].counts;
  if ((placed.centrale ?? 0) === 0 && levels.some((l) => l.rooms.length))
    add({
      id: 'placement:centrale',
      ruleId: 'R-CENTRALE',
      status: 'a_verifier',
      title: 'Aucune centrale positionnée',
      reason: 'Une centrale est prévue par logement.',
      nextAction: 'Appliquer la proposition ou positionner la centrale.',
    });
  if ((placed.centrale ?? 0) > config.centralPerDwelling)
    add({
      id: 'placement:centrale:trop',
      ruleId: 'R-CENTRALE',
      status: 'a_verifier',
      title: 'Plusieurs centrales positionnées',
      reason: `${placed.centrale} centrales pour un logement associé à une adresse.`,
      nextAction: 'Supprimer les centrales en trop.',
    });
  if ((placed.clavier ?? 0) > config.keypad.max)
    add({
      id: 'placement:clavier:max',
      ruleId: 'R-CLAVIER',
      status: 'a_verifier',
      title: `Plus de ${config.keypad.max} claviers positionnés`,
      reason: `${placed.clavier} claviers positionnés, maximum envisagé ${config.keypad.max}.`,
      nextAction: 'Réduire le nombre de claviers.',
    });
  for (const cat of ['detecteur_mouvement', 'detecteur_choc', 'detecteur_fumee'] as ProductCategory[]) {
    const p = placed[cat] ?? 0;
    const s = chosen[cat] ?? 0;
    if (p < s && dossier.devices.length)
      add({
        id: `placement:${cat}:ecart`,
        ruleId: 'R-ECART',
        status: 'a_verifier',
        title: `${CATEGORY_LABELS[cat]} : ${p} positionné(s) pour ${s} proposé(s)`,
        reason: `Écart avec la proposition ${MODE_LABELS[dossier.protectionMode].toLowerCase()}.`,
        nextAction: 'Compléter le placement ou valider ce choix en le justifiant.',
        mode: dossier.protectionMode,
      });
  }

  // Validations du conseiller
  for (const a of alerts) {
    const v = dossier.auditValidations[a.id];
    if (v) {
      a.status = 'valide';
      a.validationNote = v.note;
    }
  }

  return {
    inventory: { levels: inventoryLevels, totalArea, exteriorOpenings, entryPoints },
    proposals,
    alerts,
  };
}

export function placedCountsByCategory(devices: PlacedDevice[], products: Product[]): Partial<Record<ProductCategory, number>> {
  const out: Partial<Record<ProductCategory, number>> = {};
  for (const d of devices) {
    const p = products.find((x) => x.id === d.productId);
    if (!p) continue;
    const cat = p.category === 'pack_perimetrique' ? 'detecteur_choc' : p.category;
    const qty = d.quantity * (p.category === 'pack_perimetrique' ? p.packQuantity : 1);
    out[cat] = (out[cat] ?? 0) + qty;
  }
  return out;
}

export function roomLabel(room: Room): string {
  return room.name || ROOM_TYPE_LABELS[room.type];
}

export function alertCounts(alerts: AuditAlert[]): Record<AlertStatus, number> {
  const out: Record<AlertStatus, number> = { manquant: 0, a_verifier: 0, suggestion: 0, valide: 0 };
  for (const a of alerts) out[a.status]++;
  return out;
}
