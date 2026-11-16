const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const md = require("react-icons/md");
const tb = require("react-icons/tb");
const gi = require("react-icons/gi");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const OUT = process.argv[2];

const THEME = {
  name: "Defence Movers",
  headFontFace: "Arial",
  bodyFontFace: "Arial",
  colors: {
    dk1: "1A1A1A", lt1: "FFFFFF", dk2: "4A4F57", lt2: "F3F4F6",
    accent1: "D7141A", // rouge identité / Defence
    accent2: "1E9E4A", // vert Movers
    accent3: "E8F5EC", // fond vert clair
    accent4: "FCE9E9", // fond rouge clair
    accent5: "6B7280",
    accent6: "FFFFFF",
    hlink: "D7141A", folHlink: "8A0C10",
  },
};
const HEX = { green: "1E9E4A", red: "D7141A", white: "FFFFFF" };

async function icon(Comp, color, size = 256) {
  const svg = RDS.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = "Passage Defence → Movers";
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: "Title Only",
    background: { color: C.background2 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 11, h: 0.65, fontSize: 32, bold: true, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
  });

  pres.addSection({ title: "Procédure" });
  const s = pres.addSlide({ masterName: "Title Only", sectionTitle: "Procédure" });

  s.addText([
    { text: "Defence ", options: { color: C.accent1 } },
    { text: "ou ", options: { color: C.text1 } },
    { text: "Movers", options: { color: C.accent2 } },
    { text: " : où va le dossier ?", options: { color: C.text1 } },
  ], { placeholder: "title" });
  s.addText("Procédure de passage — aide à la décision pendant ou après l’échange client", {
    x: 0.5, y: 0.92, w: 11, h: 0.32, fontSize: 14, color: C.text2, margin: 0, isTextBox: true,
  });

  // ---------- Panels ----------
  const PY = 1.45, PH = 4.82;
  const L = { x: 0.5, w: 7.75 }, R = { x: 8.55, w: 4.28 };

  const panel = (p, fill, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: p.x, y: PY, w: p.w, h: PH, rectRadius: 0.12, fill: { color: C.background1 },
    line: { color: fill, width: 1.5 }, objectName: name,
    shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 6, offset: 2, angle: 90 },
  });
  panel(L, C.accent2, "Panneau Movers");
  panel(R, C.accent1, "Panneau Defence");

  const HH = 0.62;
  const header = async (p, fill, Ico, label, name) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: p.x, y: PY, w: p.w, h: HH, rectRadius: 0.12, fill: { color: fill }, line: { color: fill, width: 1.5 }, objectName: name });
    s.addShape(pres.shapes.RECTANGLE, { x: p.x, y: PY + HH - 0.25, w: p.w, h: 0.25, fill: { color: fill }, line: { color: fill, width: 1.5 }, objectName: name + " (bas)" });
    s.addImage({ data: await icon(Ico, HEX.white), x: p.x + 0.28, y: PY + (HH - 0.34) / 2, w: 0.34, h: 0.34, altText: label });
    s.addText(label, { x: p.x + 0.8, y: PY, w: p.w - 1.0, h: HH, fontSize: 20, bold: true, charSpacing: 1, color: C.background1, valign: "middle", margin: 0, isTextBox: true });
  };
  await header(L, C.accent2, fa.FaArrowRight, "PASSAGE MOVERS", "Bandeau Movers");
  await header(R, C.accent1, fa.FaTimes, "RESTER DEFENCE", "Bandeau Defence");

  const G = HEX.green, Rr = HEX.red;

  // Movers : lignes pleine largeur  [picto | situation | détails]
  const row = async (y, h, Ico, title, lines, warn, last) => {
    const D = 0.56, x0 = L.x + 0.3;
    s.addShape(pres.shapes.OVAL, { x: x0, y: y + (h - D) / 2, w: D, h: D, fill: { color: C.accent3 }, line: { color: C.accent3 }, objectName: "Pictogramme " + title });
    s.addImage({ data: await icon(Ico, G), x: x0 + 0.13, y: y + (h - D) / 2 + 0.13, w: D - 0.26, h: D - 0.26, altText: title });
    s.addText(title, { x: x0 + D + 0.2, y, w: 2.15, h, fontSize: 15, bold: true, color: C.text1, valign: "middle", margin: 0, isTextBox: true });
    const runs = lines.map((l, i) => ({ text: l, options: { fontSize: 12, color: C.text2, breakLine: i < lines.length - 1 || !!warn } }));
    if (warn) runs.push({ text: "⚠ " + warn, options: { fontSize: 12, bold: true, color: C.accent1 } });
    s.addText(runs, { x: x0 + D + 2.45, y, w: 4.1, h, valign: "middle", margin: 0, paraSpaceAfter: 1, isTextBox: true });
    if (!last) s.addShape(pres.shapes.LINE, { x: L.x + 0.3, y: y + h, w: L.w - 0.6, h: 0, line: { color: C.background2, width: 1 }, objectName: "Séparateur" });
  };
  const by = PY + HH + 0.05, rh = (PH - HH - 0.1) / 5;
  await row(by, rh, fa.FaBoxOpen, "1. Déménagement définitif",
    ["Quitte définitivement son logement", "Date de déménagement idéalement communiquée", "Justificatif si nécessaire"]);
  await row(by + rh, rh, md.MdRealEstateAgent, "2. Vente du logement",
    ["Vend sa maison ou son appartement", "Justificatif : compromis de vente signé ou offre d’achat"]);
  await row(by + 2 * rh, rh, fa.FaPlaneDeparture, "3. Départ définitif à l’étranger",
    ["Quitte définitivement la France", "Date de départ à communiquer"], "Voyage / séjour temporaire = pas de transfert");
  await row(by + 3 * rh, rh, gi.GiCandleLight, "4. Décès",
    ["Uniquement en cas de décès du titulaire du contrat"]);
  await row(by + 4 * rh, rh, fa.FaHeartBroken, "5. Divorce",
    ["Uniquement si le titulaire du contrat est concerné par le divorce"], null, true);

  // Defence : blocs empilés
  const item = async (x, y, w, Ico, title, lines) => {
    const D = 0.56;
    s.addShape(pres.shapes.OVAL, { x, y, w: D, h: D, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: "Pictogramme " + title });
    s.addImage({ data: await icon(Ico, Rr), x: x + 0.13, y: y + 0.13, w: D - 0.26, h: D - 0.26, altText: title });
    const runs = [{ text: title, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } }];
    lines.forEach((l, i) => { const q = l.startsWith('«'); runs.push({ text: l, options: { fontSize: 12, italic: q, color: q ? C.accent1 : C.text2, breakLine: i < lines.length - 1 } }); });
    s.addText(runs, { x: x + D + 0.18, y: y - 0.03, w: w - D - 0.18, h: 1.5, valign: "top", margin: 0, paraSpaceAfter: 3, isTextBox: true });
  };
  const rx = R.x + 0.28, rw = R.w - 0.45, T = PY + HH;
  const sep = (y) => s.addShape(pres.shapes.LINE, { x: R.x + 0.3, y, w: R.w - 0.6, h: 0, line: { color: C.background2, width: 1 }, objectName: "Séparateur" });
  await item(rx, T + 0.2, rw, tb.TbHomeCheck, "1. Le client reste dans son logement",
    ["Reste propriétaire ou locataire", "Souhaite simplement arrêter son contrat", "Ne déménage pas"]);
  sep(T + 1.5);
  await item(rx, T + 1.63, rw, md.MdStorefront, "2. Cessation d’activité",
    ["Cesse son activité professionnelle", "Mais conserve le local équipé de l’alarme"]);
  sep(T + 2.53);
  await item(rx, T + 2.66, rw, tb.TbMessageCircleX, "3. Phrases à proscrire",
    ["« Je pense déménager »", "« C’est en projet »", "« Je viens de mettre en vente la maison »", "« Je quitte temporairement »"]);

  // ---------- Critère principal ----------
  const BY = 6.45;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: BY, w: 12.33, h: 0.75, rectRadius: 0.12, fill: { color: C.text1 }, line: { color: C.text1 }, objectName: "Critère principal" });
  s.addShape(pres.shapes.OVAL, { x: 0.68, y: BY + 0.13, w: 0.49, h: 0.49, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: "Pastille clé" });
  s.addImage({ data: await icon(fa.FaKey, HEX.white), x: 0.795, y: BY + 0.245, w: 0.26, h: 0.26, altText: "Le bon sens" });
  s.addText([
    { text: "LE BON SENS   ", options: { bold: true, color: C.accent1, fontSize: 13, charSpacing: 1 } },
    { text: "Movers uniquement si le client ", options: { color: C.background1, fontSize: 16 } },
    { text: "déménage de façon certaine", options: { color: C.background1, fontSize: 16, bold: true } },
    { text: " et ", options: { color: C.background1, fontSize: 16 } },
    { text: "n’a plus aucun lien avec le logement quitté", options: { color: C.background1, fontSize: 16, bold: true } },
    { text: ", de façon définitive.", options: { color: C.background1, fontSize: 16 } },
  ], { x: 1.4, y: BY, w: 11.25, h: 0.75, valign: "middle", margin: 0, isTextBox: true });

  s.addNotes("Règle : transfert vers Movers uniquement pour déménagement définitif, vente du logement, départ définitif à l'étranger, décès du titulaire ou divorce concernant le titulaire. Le client qui reste dans son logement ou qui cesse son activité en conservant le local équipé reste chez Defence.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("ok", OUT);
})();
