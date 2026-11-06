// Journal d'activité horodaté : mémoire (interface), fichier JSONL par jour (traçabilité).
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { maintenant, resoudre } from './util.js';

export class Journal extends EventEmitter {
  constructor(dossier = 'data') {
    super();
    this.dossier = resoudre(dossier);
    this.entrees = [];
    fs.mkdirSync(this.dossier, { recursive: true });
  }

  /** niveau : info | succes | avertissement | erreur */
  ecrire(etape, message, niveau = 'info', extra = {}) {
    const t = maintenant();
    const e = { date: t.date, heure: t.heure, etape, message, niveau, ...extra };
    this.entrees.push(e);
    if (this.entrees.length > 2000) this.entrees.shift();
    fs.appendFileSync(path.join(this.dossier, `journal-${t.date}.jsonl`), JSON.stringify(e) + '\n');
    this.emit('entree', e);
    return e;
  }

  get fn() { return (etape, message, niveau, extra) => this.ecrire(etape, message, niveau, extra); }
}
