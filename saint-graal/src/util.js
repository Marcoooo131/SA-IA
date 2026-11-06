// Outils communs : configuration, dates, normalisation de texte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fusion(base, sur) {
  if (!sur || typeof sur !== 'object' || Array.isArray(sur)) return sur ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(sur)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object'
      ? fusion(base[k], v) : v;
  }
  return out;
}

/** Charge la config versionnée + config/local.config.json (surcharges du poste) + surcharges passées. */
export function chargerConfig(surcharges = {}) {
  const lire = (f) => JSON.parse(fs.readFileSync(path.join(RACINE, 'config', f), 'utf8'));
  let cfg = lire('saint-graal.config.json');
  const local = path.join(RACINE, 'config', 'local.config.json');
  if (fs.existsSync(local)) cfg = fusion(cfg, JSON.parse(fs.readFileSync(local, 'utf8')));
  if (process.env.SAINT_GRAAL_CONFIG) cfg = fusion(cfg, JSON.parse(fs.readFileSync(process.env.SAINT_GRAAL_CONFIG, 'utf8')));
  cfg = fusion(cfg, surcharges);
  cfg.selecteurs = fusion(lire('crm-selectors.json'), surcharges.selecteurs || {});
  return cfg;
}

export const resoudre = (p) => (p ? (path.isAbsolute(p) ? p : path.join(RACINE, p)) : p);

/** Minuscules, sans accents, espaces normalisés : pour reconnaître un collaborateur. */
export const sansAccents = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[\s ]+/g, ' ').trim();

/** Normalisation STRICTE d'un libellé (Case Reason) : seuls les espaces et la casse sont tolérés. */
export const libelleStrict = (s) => String(s ?? '').replace(/[\s ]+/g, ' ').trim().toLowerCase();

const pad = (n) => String(n).padStart(2, '0');

/**
 * Convertit une valeur de cellule ou un texte en date ISO "AAAA-MM-JJ" (sans fuseau), ou null.
 * Accepte : Date (exceljs, minuit UTC), "JJ/MM/AAAA[ hh:mm]", "AAAA-MM-JJ", numéro de série Excel.
 */
export function versIso(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return versIso(new Date(Math.round((v - 25569) * 86400000)));
  }
  if (typeof v === 'object' && v.result !== undefined) return versIso(v.result);
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return valide(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valide(+m[1], +m[2], +m[3]);
  return null;
}
function valide(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

/** "AAAA-MM-JJ" → format CRM ("dd/MM/yyyy", "MM/dd/yyyy" ou "yyyy-MM-dd"). */
export function formaterDate(iso, format = 'dd/MM/yyyy') {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return format.replace('yyyy', y).replace('MM', m).replace('dd', d);
}

/** Texte affiché par le CRM → ISO, selon le format CRM configuré. */
export function lireDateCrm(texte, format = 'dd/MM/yyyy') {
  const s = String(texte ?? '').trim();
  if (!s) return null;
  if (format.startsWith('MM')) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? valide(+m[3], +m[1], +m[2]) : null;
  }
  return versIso(s);
}

export const isoVersFr = (iso) => (iso ? formaterDate(iso, 'dd/MM/yyyy') : '');

export function maintenant() {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    heure: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    horodatage: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
