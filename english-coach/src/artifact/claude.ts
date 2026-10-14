/**
 * Accès aux capacités de l'artefact claude.ai (window.claude.use).
 * Hors d'un artefact (ou si la capacité n'est pas accordée), chaque accès renvoie null.
 */

type Cap = any;

const cache = new Map<string, Promise<Cap | null>>();

export function useCapability(name: 'db' | 'user' | 'sample'): Promise<Cap | null> {
  let p = cache.get(name);
  if (!p) {
    const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<Cap | null> } }).claude;
    p = claude?.use ? claude.use(name).catch(() => null) : Promise.resolve(null);
    cache.set(name, p);
  }
  return p;
}
