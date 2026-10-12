import type { PlacedDevice, Product } from '@/domain/types';
import { productForCategory } from '@/catalog/defaultCatalog';
import { uid } from '@/lib/id';
import type { ModeProposal } from './engine';

/**
 * Applique une proposition sur le plan :
 * - conserve les équipements manuels et les suggestions validées ;
 * - remplace les suggestions non validées ;
 * - n'ajoute jamais deux fois la même suggestion (clé de règle) ni un détecteur
 *   sur une ouverture déjà équipée manuellement.
 */
export function applyProposal(devices: PlacedDevice[], proposal: ModeProposal, products: Product[]): PlacedDevice[] {
  const kept = devices.filter((d) => d.origin === 'manuel' || d.validated);
  const keys = new Set(kept.map((d) => d.suggestionKey).filter(Boolean));
  const equippedOpenings = new Set(kept.map((d) => d.openingId).filter(Boolean));
  const added: PlacedDevice[] = [];
  for (const s of proposal.devices) {
    if (keys.has(s.key)) continue;
    if (s.openingId && s.category === 'detecteur_choc' && equippedOpenings.has(s.openingId)) continue;
    const product = productForCategory(products, s.category);
    if (!product) continue;
    added.push({
      id: uid('dev'),
      productId: product.id,
      levelId: s.levelId,
      x: s.x,
      y: s.y,
      rotation: s.rotation,
      quantity: s.quantity,
      origin: 'suggere',
      validated: false,
      suggestionKey: s.key,
      openingId: s.openingId,
      roomId: s.roomId,
      note: s.reason,
    });
  }
  return [...kept, ...added];
}

/** Liste de matériel (productId -> quantité) issue des équipements placés. */
export function billOfMaterials(devices: { productId: string; quantity: number }[]): Map<string, number> {
  const bom = new Map<string, number>();
  for (const d of devices) bom.set(d.productId, (bom.get(d.productId) ?? 0) + Math.max(0, d.quantity));
  return bom;
}

/** Liste de matériel d'une proposition (sans la placer). */
export function proposalBom(proposal: ModeProposal, products: Product[]): Map<string, number> {
  const bom = new Map<string, number>();
  for (const s of proposal.devices) {
    const p = productForCategory(products, s.category);
    if (!p) continue;
    bom.set(p.id, (bom.get(p.id) ?? 0) + s.quantity);
  }
  return bom;
}
