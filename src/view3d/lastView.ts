/** Dernière vue 3D choisie par le conseiller pour le devis (mémoire de session, non persistée). */
const lastViews = new Map<string, string>();

export function setLastViewSnapshot(dossierId: string, dataUrl: string) {
  lastViews.set(dossierId, dataUrl);
}

export function getLastViewSnapshot(dossierId: string): string | undefined {
  return lastViews.get(dossierId);
}
