import type { Prospect } from './types';

export function prospect(patch: Partial<Prospect> = {}): Prospect {
  return {
    id: 'p1', nom: 'Test', metier: 'inconnu', logicielActuel: 'inconnu', activiteVerifiee: false,
    signauxActivite: [], signauxInteret: [], sources: {}, statut: 'a_qualifier',
    creeLe: '2026-01-01T00:00:00Z', majLe: '2026-01-01T00:00:00Z', ...patch,
  };
}
