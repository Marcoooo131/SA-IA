// Génère le PowerPoint modifiable à partir du même contenu que la version web (src/content.ts).
// Usage : npm run pptx  →  public/Nouvelle-organisation-Movers.pptx
// Node 22.18+ importe directement le TypeScript (suppression des types).
import pptxgen from 'pptxgenjs';
import { fileURLToPath } from 'node:url';
import {
  administratif,
  changes,
  colors,
  cover,
  day,
  deckTitle,
  prioExample,
  questions,
  resiliation,
  roles,
  rolesMessage,
  rotation,
  slides,
  takeovers,
  templateById,
  templates,
  templatesOverview,
  together,
  workload,
} from '../src/content.ts';

const OUT = fileURLToPath(new URL('../public/Nouvelle-organisation-Movers.pptx', import.meta.url));

// Couleurs sans « # » pour pptxgenjs
const C = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v.slice(1)]));
const MID = '6B6B6B';
const LINE = 'DCDCDC';
const FONT = 'Arial';

const W = 13.333;
const MX = 0.75; // marge horizontale
const CW = W - 2 * MX; // largeur utile

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.title = deckTitle;
pptx.subject = 'Présentation à l’équipe Movers';
pptx.lang = 'fr-FR';
pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };

const meta = (id) => slides.find((s) => s.id === id);
const isDark = (id) => meta(id).theme === 'dark';

function base(id) {
  const m = meta(id);
  const s = pptx.addSlide();
  s.background = { color: isDark(id) ? C.black : C.lightGrey };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.red }, line: { type: 'none' } });
  const n = slides.indexOf(m) + 1;
  s.addText(`${n} / ${slides.length}`, { x: W - 1.6, y: 7.0, w: 1.3, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: MID, align: 'right' });
  s.addNotes(m.notes);
  return s;
}

function header(s, id) {
  const m = meta(id);
  s.addText(m.kicker.toUpperCase(), { x: MX, y: 0.45, w: CW, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: C.red, charSpacing: 2 });
  s.addText(m.title, { x: MX, y: 0.75, w: CW, h: 0.75, fontFace: FONT, fontSize: 32, bold: true, color: isDark(id) ? C.white : C.black });
}

function card(s, x, y, w, h, fill, opts = {}) {
  s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: opts.line ?? { type: 'none' } });
}

function banner(s, text, y, red = true) {
  card(s, MX, y, CW, 0.75, red ? C.black : C.white);
  s.addShape(pptx.ShapeType.rect, { x: MX, y, w: 0.08, h: 0.75, fill: { color: red ? C.red : C.black }, line: { type: 'none' } });
  s.addText(text, { x: MX + 0.3, y, w: CW - 0.5, h: 0.75, fontFace: FONT, fontSize: 16, bold: true, color: red ? C.white : C.black, valign: 'middle' });
}

function badge(s, n, x, y, d = 0.36, fill = C.red, color = C.white) {
  s.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' } });
  s.addText(String(n), { x, y, w: d, h: d, fontFace: FONT, fontSize: d * 34, bold: true, color, align: 'center', valign: 'middle' });
}

// Fiche template : en-tête noir + liste de champs avec cases à cocher
function templateForm(s, t, x, y, w, rowH = 0.46) {
  const headH = 0.6;
  const h = headH + t.fields.length * rowH + 0.2;
  card(s, x, y, w, h, C.white);
  s.addShape(pptx.ShapeType.rect, { x, y, w, h: headH, fill: { color: C.black }, line: { type: 'none' } });
  badge(s, t.number, x + 0.2, y + 0.12);
  s.addText(t.name, { x: x + 0.7, y, w: w - 0.8, h: headH, fontFace: FONT, fontSize: 16, bold: true, color: C.white, valign: 'middle' });
  t.fields.forEach((field, i) => {
    const fy = y + headH + 0.1 + i * rowH;
    s.addShape(pptx.ShapeType.roundRect, { x: x + 0.25, y: fy + rowH / 2 - 0.1, w: 0.2, h: 0.2, rectRadius: 0.03, fill: { color: C.white }, line: { color: C.red, width: 1.75 } });
    s.addText(field, { x: x + 0.6, y: fy, w: w - 0.8, h: rowH, fontFace: FONT, fontSize: 15, bold: true, color: C.black, valign: 'middle' });
    if (i < t.fields.length - 1) s.addShape(pptx.ShapeType.line, { x: x + 0.25, y: fy + rowH, w: w - 0.5, h: 0, line: { color: LINE, width: 0.75 } });
  });
  return h;
}

// ── 1. Couverture ────────────────────────────────────────────────
{
  const s = base('cover');
  // Bandes diagonales rouges, signature de la version web
  for (let i = 0; i < 5; i++) {
    s.addShape(pptx.ShapeType.parallelogram, { x: 9.0 + i * 0.85, y: 0, w: 1.6, h: 7.5, fill: { color: C.red, transparency: 50 - i * 12 }, line: { type: 'none' }, adjustPoint: 0.6 });
  }
  s.addText(cover.kicker.toUpperCase(), { x: 1.0, y: 0.95, w: 8, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.red, charSpacing: 2 });
  s.addText(
    [
      { text: 'Nouvelle organisation ', options: { color: C.white, breakLine: false } },
      { text: 'Movers', options: { color: C.red } },
    ],
    { x: 1.0, y: 1.35, w: 8.4, h: 2.5, fontFace: FONT, fontSize: 54, bold: true, valign: 'middle' },
  );
  s.addText(cover.subtitle, { x: 1.0, y: 3.95, w: 7.8, h: 0.9, fontFace: FONT, fontSize: 20, color: 'D6D6D6' });
  cover.pillars.forEach((p, i) => {
    const x = 1.0 + i * 2.75;
    card(s, x, 4.95, 2.6, 0.8, C.darkGrey);
    s.addShape(pptx.ShapeType.rect, { x: x + 0.18, y: 5.2, w: 0.08, h: 0.3, fill: { color: C.red }, line: { type: 'none' } });
    s.addText(p.label, { x: x + 0.35, y: 4.95, w: 2.2, h: 0.8, fontFace: FONT, fontSize: 13, bold: true, color: C.white, valign: 'middle' });
  });
  s.addText(cover.footer, { x: 1.0, y: 6.1, w: 8, h: 0.4, fontFace: FONT, fontSize: 13, color: 'A8A8A8' });
}

// ── 2. Journée ───────────────────────────────────────────────────
{
  const s = base('day');
  header(s, 'day');
  s.addText(day.intro, { x: MX, y: 1.6, w: CW, h: 0.6, fontFace: FONT, fontSize: 17, color: C.darkGrey });
  const barX = 3.1;
  const barW = W - MX - barX;
  [day.usual, day.special].forEach((tl, row) => {
    const y = 2.4 + row * 0.85;
    s.addText(tl.label, { x: MX, y, w: 2.3, h: 0.7, fontFace: FONT, fontSize: 14, bold: true, color: row ? C.red : C.black, valign: 'middle' });
    const total = tl.blocks.reduce((a, b) => a + b.hours, 0);
    let x = barX;
    tl.blocks.forEach((b) => {
      const w = (barW - 0.05) * (b.hours / total);
      const isIn = b.kind === 'in';
      card(s, x, y, w, 0.7, isIn ? C.white : C.black, isIn ? { line: { color: C.black, width: 2 } } : {});
      s.addText(
        [
          { text: `${b.hours} h   `, options: { fontSize: 24, bold: true, color: isIn ? C.black : C.red } },
          { text: `${b.title} · ${b.subtitle}`, options: { fontSize: 14, bold: true, color: isIn ? C.black : C.white } },
        ],
        { x: x + 0.2, y, w: w - 0.3, h: 0.7, fontFace: FONT, valign: 'middle' },
      );
      x += w + 0.05;
    });
  });
  s.addText(day.planningNote, { x: barX, y: 4.1, w: barW, h: 0.35, fontFace: FONT, fontSize: 12, italic: true, color: MID });
  day.activities.forEach((a, i) => {
    const x = MX + i * (CW / 2 + 0.1);
    const w = CW / 2 - 0.1;
    card(s, x, 4.75, w, 1.95, C.white);
    s.addShape(pptx.ShapeType.rect, { x, y: 4.75, w, h: 0.08, fill: { color: a.kind === 'out' ? C.red : C.black }, line: { type: 'none' } });
    s.addText(a.title, { x: x + 0.3, y: 4.95, w: w - 0.6, h: 0.45, fontFace: FONT, fontSize: 19, bold: true, color: C.black });
    a.steps.forEach((step, j) => {
      const sy = 5.5 + j * 0.38;
      badge(s, j + 1, x + 0.3, sy + 0.04, 0.28, a.kind === 'out' ? C.red : C.black);
      s.addText(step, { x: x + 0.7, y: sy, w: w - 1, h: 0.36, fontFace: FONT, fontSize: 14, bold: true, color: C.black, valign: 'middle' });
    });
  });
}

// ── 3. Rôles ─────────────────────────────────────────────────────
{
  const s = base('roles');
  header(s, 'roles');
  const widths = [3.1, 3.1, 2.55, 2.55];
  const gap = (CW - widths.reduce((a, b) => a + b, 0)) / 3;
  let x = MX;
  roles.forEach((r, i) => {
    const w = widths[i];
    const team = i < 2;
    card(s, x, 1.75, w, 3.75, team ? C.black : C.white);
    s.addText(r.count, { x: x + 0.25, y: 1.95, w: w - 0.5, h: 0.45, fontFace: FONT, fontSize: 19, bold: true, color: team ? C.white : C.black });
    s.addText(r.title.toUpperCase(), { x: x + 0.25, y: 2.4, w: w - 0.5, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.red, charSpacing: 1.5 });
    s.addText(
      r.tasks.map((t) => ({ text: t, options: { bullet: { code: '2713' }, breakLine: true } })),
      { x: x + 0.2, y: 2.8, w: w - 0.35, h: 2.6, fontFace: FONT, fontSize: 13, color: team ? C.white : C.black, valign: 'top', paraSpaceAfter: 6 },
    );
    x += w + gap;
  });
  banner(s, rolesMessage, 5.95, false);
}

// ── 4. Les cinq templates ────────────────────────────────────────
{
  const s = base('templates');
  header(s, 'templates');
  s.addText(templatesOverview.rule, { x: MX, y: 1.6, w: CW, h: 0.5, fontFace: FONT, fontSize: 18, color: C.white });
  const w = (CW - 4 * 0.2) / 5;
  templates.forEach((t, i) => {
    const x = MX + i * (w + 0.2);
    const prio = t.id === 'prio';
    card(s, x, 2.3, w, 2.1, prio ? C.red : C.darkGrey);
    s.addText(String(t.number), { x: x + w - 0.8, y: 2.35, w: 0.65, h: 0.7, fontFace: FONT, fontSize: 36, bold: true, color: prio ? 'F28A90' : '4A4A4A', align: 'right' });
    s.addText(t.name, { x: x + 0.2, y: 3.0, w: w - 0.3, h: 0.9, fontFace: FONT, fontSize: 15, bold: true, color: C.white, valign: 'top' });
    s.addText(`${t.fields.length} champs`, { x: x + 0.2, y: 3.9, w: w - 0.3, h: 0.35, fontFace: FONT, fontSize: 11, color: prio ? C.white : 'BBBBBB' });
  });
  s.addText(templatesOverview.goalsTitle.toUpperCase(), { x: MX, y: 4.8, w: CW, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: C.red, charSpacing: 2 });
  const gw = (CW - 3 * 0.25) / 4;
  templatesOverview.goals.forEach((g, i) => {
    const x = MX + i * (gw + 0.25);
    s.addShape(pptx.ShapeType.rect, { x, y: 5.25, w: gw, h: 0.04, fill: { color: C.red }, line: { type: 'none' } });
    s.addText(g.label, { x, y: 5.4, w: gw, h: 0.9, fontFace: FONT, fontSize: 14, color: C.white, valign: 'top' });
  });
}

// ── 5. PRIO ──────────────────────────────────────────────────────
{
  const s = base('prio');
  header(s, 'prio');
  templateForm(s, templateById('prio'), MX, 1.75, 5.0, 0.5);
  const x = MX + 5.3;
  const w = CW - 5.3;
  card(s, x, 1.75, w, 3.85, C.white, { line: { color: C.black, width: 1.5 } });
  s.addShape(pptx.ShapeType.rect, { x, y: 1.75, w, h: 0.4, fill: { color: C.darkGrey }, line: { type: 'none' } });
  s.addText('CRM · Nouvelle tâche', { x: x + 0.2, y: 1.75, w: 3, h: 0.4, fontFace: FONT, fontSize: 11, color: 'CCCCCC', valign: 'middle' });
  s.addText('EXEMPLE FICTIF', { x: x + w - 1.65, y: 1.82, w: 1.5, h: 0.26, fontFace: FONT, fontSize: 9, bold: true, color: '6B4B00', fill: { color: 'FFF3CD' }, align: 'center', valign: 'middle' });
  s.addText(prioExample.title, { x: x + 0.2, y: 2.2, w: w - 0.4, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.black });
  s.addTable(
    prioExample.values.map(([label, value]) => [
      { text: label, options: { color: MID, bold: true } },
      { text: value, options: { color: C.black, bold: true } },
    ]),
    { x: x + 0.15, y: 2.6, w: w - 0.3, colW: [2.2, w - 2.5], fontFace: FONT, fontSize: 12, border: { type: 'solid', pt: 0.5, color: LINE }, rowH: 0.36, valign: 'middle' },
  );
  s.addText(`À éviter : ${prioExample.avoid}`, { x, y: 5.75, w, h: 0.45, fontFace: FONT, fontSize: 13, color: C.darkGrey, line: { color: C.red, width: 1.25, dashType: 'dash' }, margin: 8, valign: 'middle' });
  banner(s, prioExample.message, 6.3);
}

// ── 6. Résiliation ───────────────────────────────────────────────
{
  const s = base('resiliation');
  header(s, 'resiliation');
  const fw = 5.0;
  templateForm(s, templateById('resiliation'), MX, 1.75, fw, 0.44);
  templateForm(s, templateById('resiliation-exception'), W - MX - fw, 1.75, fw, 0.44);
  badge(s, '=', W / 2 - 0.4, 2.9, 0.8);
  s.addText(resiliation.sameFields, { x: W / 2 - 0.9, y: 3.75, w: 1.8, h: 0.6, fontFace: FONT, fontSize: 12, bold: true, color: C.darkGrey, align: 'center' });
  card(s, MX, 5.9, 6.9, 0.85, C.black);
  s.addShape(pptx.ShapeType.rect, { x: MX, y: 5.9, w: 0.08, h: 0.85, fill: { color: C.red }, line: { type: 'none' } });
  s.addText(resiliation.rule, { x: MX + 0.3, y: 5.9, w: 6.5, h: 0.85, fontFace: FONT, fontSize: 15, bold: true, color: C.white, valign: 'middle' });
  card(s, MX + 7.1, 5.9, CW - 7.1, 0.85, C.white);
  s.addText(resiliation.doubt, { x: MX + 7.3, y: 5.9, w: CW - 7.4, h: 0.85, fontFace: FONT, fontSize: 15, bold: true, color: C.black, valign: 'middle' });
}

// ── 7. Takeovers ─────────────────────────────────────────────────
{
  const s = base('takeovers');
  header(s, 'takeovers');
  const t = templateById('takeovers');
  card(s, MX, 1.75, 2.8, 3.2, C.black);
  s.addText(`${t.fields.length} champs`, { x: MX + 0.25, y: 2.2, w: 2.4, h: 1.2, fontFace: FONT, fontSize: 36, bold: true, color: C.white });
  s.addText('à renseigner pour chaque dossier Takeovers', { x: MX + 0.25, y: 3.55, w: 2.4, h: 1, fontFace: FONT, fontSize: 15, color: 'CCCCCC', valign: 'top' });
  const gx = MX + 3.05;
  const gw = (CW - 3.05 - 0.2) / 2;
  takeovers.groups.forEach((g, i) => {
    const x = gx + (i % 2) * (gw + 0.2);
    const y = 1.75 + Math.floor(i / 2) * 1.7;
    card(s, x, y, gw, 1.5, C.white);
    s.addShape(pptx.ShapeType.rect, { x, y, w: gw, h: 0.06, fill: { color: C.red }, line: { type: 'none' } });
    s.addText(g.label.toUpperCase(), { x: x + 0.25, y: y + 0.15, w: gw - 0.4, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.red, charSpacing: 2 });
    g.fields.forEach((f, j) => {
      const fy = y + 0.5 + j * 0.42;
      s.addShape(pptx.ShapeType.roundRect, { x: x + 0.25, y: fy + 0.1, w: 0.2, h: 0.2, rectRadius: 0.03, fill: { color: C.white }, line: { color: C.red, width: 1.75 } });
      s.addText(f, { x: x + 0.6, y: fy, w: gw - 0.8, h: 0.4, fontFace: FONT, fontSize: 15, bold: true, color: C.black, valign: 'middle' });
    });
  });
  banner(s, takeovers.message, 5.6);
}

// ── 8. Administratif ─────────────────────────────────────────────
{
  const s = base('administratif');
  header(s, 'administratif');
  templateForm(s, templateById('administratif'), MX, 1.75, 4.4, 0.44);
  const x = MX + 4.7;
  const w = CW - 4.7;
  const ew = (w - 0.2) / 2;
  administratif.essentials.forEach((e, i) => {
    const ex = x + i * (ew + 0.2);
    card(s, ex, 1.75, ew, 1.2, C.black);
    badge(s, i + 1, ex + 0.2, 1.95, 0.42);
    s.addText(
      [
        { text: e.title, options: { bold: true, fontSize: 16, color: C.white, breakLine: true } },
        { text: e.text, options: { fontSize: 13, color: 'CCCCCC' } },
      ],
      { x: ex + 0.75, y: 1.8, w: ew - 0.9, h: 1.1, fontFace: FONT, valign: 'middle' },
    );
  });
  card(s, x, 3.15, w, 2.0, C.white);
  s.addText(administratif.exampleNote.toUpperCase(), { x: x + w - 1.65, y: 3.05, w: 1.5, h: 0.26, fontFace: FONT, fontSize: 9, bold: true, color: '6B4B00', fill: { color: 'FFF3CD' }, align: 'center', valign: 'middle' });
  s.addText(
    [
      { text: `✗ ${administratif.before.label.toUpperCase()}`, options: { bold: true, fontSize: 10, color: MID, breakLine: true } },
      { text: administratif.before.text, options: { italic: true, fontSize: 13, color: C.darkGrey } },
    ],
    { x: x + 0.2, y: 3.25, w: 2.6, h: 1.8, fontFace: FONT, valign: 'middle' },
  );
  s.addShape(pptx.ShapeType.rightArrow, { x: x + 2.9, y: 4.0, w: 0.45, h: 0.3, fill: { color: C.red }, line: { type: 'none' } });
  s.addText(
    [
      { text: `✓ ${administratif.after.label.toUpperCase()}`, options: { bold: true, fontSize: 10, color: C.red, breakLine: true } },
      ...administratif.after.lines.flatMap(([label, value], i, arr) => [
        { text: `${label} : `, options: { bold: true, fontSize: 13, color: C.black } },
        { text: value, options: { fontSize: 13, color: C.black, breakLine: i < arr.length - 1 } },
      ]),
    ],
    { x: x + 3.5, y: 3.25, w: w - 3.65, h: 1.8, fontFace: FONT, valign: 'middle', paraSpaceAfter: 4 },
  );
  banner(s, administratif.key, 5.9);
}

// ── 9. Rotation ──────────────────────────────────────────────────
{
  const s = base('rotation');
  header(s, 'rotation');
  // Cycle : quatre étapes autour d'un cercle, « Nouveau cycle » au centre
  const cx = 3.6;
  const cy = 4.3;
  const r = 1.85;
  s.addShape(pptx.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { type: 'none' }, line: { color: '444444', width: 3 } });
  const pos = [
    [cx, cy - r],
    [cx + r, cy],
    [cx, cy + r],
    [cx - r, cy],
  ];
  rotation.steps.forEach((step, i) => {
    const [px, py] = pos[i];
    const w = Math.max(1.7, step.length * 0.12 + 0.7);
    s.addShape(pptx.ShapeType.roundRect, { x: px - w / 2, y: py - 0.28, w, h: 0.56, rectRadius: 0.28, fill: { color: i === 0 ? C.red : C.darkGrey }, line: { color: i === 0 ? C.red : '3A3A3A', width: 1 } });
    s.addText(`${i + 1}. ${step}`, { x: px - w / 2, y: py - 0.28, w, h: 0.56, fontFace: FONT, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle' });
  });
  s.addShape(pptx.ShapeType.ellipse, { x: cx - 0.9, y: cy - 0.9, w: 1.8, h: 1.8, fill: { color: C.black }, line: { color: C.red, width: 1.5, dashType: 'dash' } });
  s.addText(`↻\n5. ${rotation.restart}`, { x: cx - 0.9, y: cy - 0.9, w: 1.8, h: 1.8, fontFace: FONT, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle' });

  const x = 6.6;
  const w = W - MX - x;
  s.addText(rotation.purpose, { x, y: 1.75, w, h: 0.8, fontFace: FONT, fontSize: 18, color: C.white });
  s.addText(
    [...rotation.steps, `${rotation.restart} : retour au déménagement`].map((t, i) => ({
      text: `${i + 1}.  ${t}`,
      options: { breakLine: true, color: i === 4 ? 'BBBBBB' : C.white },
    })),
    { x, y: 2.6, w, h: 2.1, fontFace: FONT, fontSize: 16, bold: true, valign: 'top', paraSpaceAfter: 6 },
  );
  card(s, x, 4.95, w, 1.55, C.darkGrey);
  const hw = (w - 0.9) / 2;
  s.addText(rotation.now.label.toUpperCase(), { x: x + 0.25, y: 5.1, w: 1.6, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.white, fill: { color: C.red }, align: 'center', valign: 'middle' });
  s.addText(rotation.now.text, { x: x + 0.25, y: 5.45, w: hw, h: 0.9, fontFace: FONT, fontSize: 13, color: C.white, valign: 'top' });
  s.addShape(pptx.ShapeType.rightArrow, { x: x + 0.3 + hw, y: 5.6, w: 0.35, h: 0.25, fill: { color: C.red }, line: { type: 'none' } });
  s.addText(rotation.later.label.toUpperCase(), { x: x + 0.75 + hw, y: 5.1, w: 2.2, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: C.white, line: { color: C.white, width: 1, dashType: 'dash' }, align: 'center', valign: 'middle' });
  s.addText(rotation.later.text, { x: x + 0.75 + hw, y: 5.45, w: hw, h: 0.9, fontFace: FONT, fontSize: 13, color: C.white, valign: 'top' });
}

// ── 10. Charge de travail ────────────────────────────────────────
{
  const s = base('workload');
  header(s, 'workload');
  s.addText(workload.intro, { x: MX, y: 1.6, w: CW, h: 0.5, fontFace: FONT, fontSize: 17, color: C.darkGrey });
  const w = (CW - 0.4) / 3;
  workload.rules.forEach((rule, i) => {
    const x = MX + i * (w + 0.2);
    card(s, x, 2.3, w, 2.7, C.white);
    s.addShape(pptx.ShapeType.rect, { x, y: 2.3, w, h: 0.95, fill: { color: C.black }, line: { type: 'none' } });
    s.addText(
      [
        { text: 'EN CAS DE', options: { fontSize: 10, bold: true, color: 'AAAAAA', breakLine: true } },
        { text: rule.situation, options: { fontSize: 18, bold: true, color: C.white } },
      ],
      { x: x + 0.25, y: 2.3, w: w - 0.4, h: 0.95, fontFace: FONT, valign: 'middle' },
    );
    s.addText(`→ ${rule.effect}`, { x: x + 0.25, y: 3.4, w: w - 0.45, h: 1.5, fontFace: FONT, fontSize: 15, color: C.black, valign: 'top' });
  });
  card(s, MX, 5.35, CW, 1.05, C.black);
  s.addText(workload.goalsTitle.toUpperCase(), { x: MX + 0.3, y: 5.35, w: 1.7, h: 1.05, fontFace: FONT, fontSize: 12, bold: true, color: C.red, charSpacing: 2, valign: 'middle' });
  const gw = (CW - 2.2) / 3;
  workload.goals.forEach((g, i) => {
    s.addText(`✓  ${g}`, { x: MX + 2.0 + i * gw, y: 5.35, w: gw - 0.1, h: 1.05, fontFace: FONT, fontSize: 14, bold: true, color: C.white, valign: 'middle' });
  });
}

// ── 11. Ce qui change (tableau) ──────────────────────────────────
{
  const s = base('changes');
  header(s, 'changes');
  const cols = changes.columns;
  const fills = { change: C.red, same: C.black, later: 'D9D9D9' };
  const textColor = { change: C.white, same: C.white, later: C.black };
  const rows = Math.max(...cols.map((c) => c.items.length));
  const table = [
    cols.map((c) => ({
      text: [
        { text: c.title, options: { bold: true, fontSize: 17, breakLine: true } },
        { text: c.tag.toUpperCase(), options: { fontSize: 10, bold: true } },
      ],
      options: { fill: { color: fills[c.tone] }, color: textColor[c.tone] },
    })),
    ...Array.from({ length: rows }, (_, r) =>
      cols.map((c) => ({
        text: c.items[r] ?? '',
        options: { fill: { color: c.tone === 'later' ? 'F7F7F7' : C.white }, color: C.black, italic: c.tone === 'later' },
      })),
    ),
  ];
  s.addTable(table, { x: MX, y: 1.75, w: CW, colW: [4.4, 3.71, 3.72], fontFace: FONT, fontSize: 14, border: { type: 'solid', pt: 1, color: LINE }, valign: 'middle', margin: 0.12, rowH: [0.8, ...Array(rows).fill(0.62)] });
}

// ── 12. On avance ensemble ───────────────────────────────────────
{
  const s = base('together');
  header(s, 'together');
  s.addShape(pptx.ShapeType.rect, { x: MX, y: 2.2, w: 0.07, h: 3.6, fill: { color: C.red }, line: { type: 'none' } });
  s.addText(together.quote, { x: MX + 0.3, y: 2.1, w: 6.3, h: 3.8, fontFace: FONT, fontSize: 19, color: 'E6E6E6', valign: 'middle', lineSpacingMultiple: 1.2 });
  const x = 7.6;
  const w = W - MX - x;
  s.addText(together.reflexesTitle.toUpperCase(), { x, y: 2.15, w, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: C.red, charSpacing: 2 });
  together.reflexes.forEach((r, i) => {
    const y = 2.65 + i * 1.08;
    card(s, x, y, w, 0.92, C.darkGrey);
    badge(s, i + 1, x + 0.2, y + 0.21, 0.5);
    s.addText(r, { x: x + 0.9, y, w: w - 1.05, h: 0.92, fontFace: FONT, fontSize: 16, bold: true, color: C.white, valign: 'middle' });
  });
}

// ── 13. Questions ────────────────────────────────────────────────
{
  const s = base('questions');
  s.addShape(pptx.ShapeType.ellipse, { x: 0.9, y: 2.0, w: 3.2, h: 3.2, fill: { color: C.red }, line: { type: 'none' } });
  s.addText('?', { x: 0.9, y: 2.0, w: 3.2, h: 3.2, fontFace: FONT, fontSize: 150, bold: true, color: C.white, align: 'center', valign: 'middle' });
  s.addText(questions.title, { x: 4.7, y: 2.2, w: 8, h: 1.2, fontFace: FONT, fontSize: 60, bold: true, color: C.white });
  s.addText(questions.subtitle, { x: 4.7, y: 3.45, w: 8, h: 0.6, fontFace: FONT, fontSize: 22, color: 'CCCCCC' });
  s.addText(together.reflexesTitle.toUpperCase(), { x: 4.7, y: 4.4, w: 8, h: 0.35, fontFace: FONT, fontSize: 12, bold: true, color: C.red, charSpacing: 2 });
  s.addText(together.reflexes.map((r, i) => `${i + 1}. ${r}`).join('\n'), { x: 4.7, y: 4.8, w: 8, h: 1.2, fontFace: FONT, fontSize: 15, color: C.white, valign: 'top', paraSpaceAfter: 4 });
}

await pptx.writeFile({ fileName: OUT });
console.log(`PowerPoint généré : ${OUT}`);
