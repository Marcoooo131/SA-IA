/**
 * Import de catalogue fournisseur (CSV ou Excel). Chaque ligne est validée individuellement ;
 * les lignes valides sont créées, les erreurs sont rapportées ligne par ligne.
 * Colonnes : titre, description, categorie, prix, prix_conseille, prix_gros, stock, etat, marque,
 * sku, frais_port, delai_expedition, commission_type (PERCENT|FIXED), commission_valeur, image_url
 */
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { assertRole } from "../auth/permissions";
import { AppError } from "../errors";
import { createProduct } from "./catalog";
import { parseEurosToCents } from "@/lib/money";

export const IMPORT_COLUMNS = [
  "titre", "description", "categorie", "prix", "prix_conseille", "prix_gros", "stock", "etat", "marque", "sku",
  "frais_port", "delai_expedition", "commission_type", "commission_valeur", "image_url",
] as const;

const conditionMap: Record<string, string> = {
  neuf: "NEW", new: "NEW", "comme neuf": "LIKE_NEW", like_new: "LIKE_NEW", "tres bon": "VERY_GOOD", "très bon": "VERY_GOOD",
  bon: "GOOD", good: "GOOD", correct: "FAIR", fair: "FAIR",
};

export async function parseImportFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (file.size > 5 * 1024 * 1024) throw new AppError("Fichier trop volumineux (5 Mo maximum)");
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    return res.data;
  }
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => { headers[i] = String(c.value ?? "").trim().toLowerCase(); });
    const rows: Record<string, string>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const r: Record<string, string> = {};
      row.eachCell((c, i) => { if (headers[i]) r[headers[i]] = c.text ?? String(c.value ?? ""); });
      if (Object.values(r).some((v) => v.trim())) rows.push(r);
    });
    return rows;
  }
  throw new AppError("Format accepté : .csv ou .xlsx");
}

export async function importCatalog(actor: Actor, rows: Record<string, string>[]) {
  assertRole(actor, "SUPPLIER");
  if (rows.length > 2000) throw new AppError("2000 lignes maximum par import");
  const cats = await db.category.findMany();
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
  const created: string[] = [];
  const errors: { line: number; message: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    try {
      const cat = (r.categorie ?? "").trim().toLowerCase();
      const categoryId = bySlug.get(cat) ?? byName.get(cat);
      if (!categoryId) throw new AppError(`Catégorie inconnue « ${r.categorie ?? ""} »`);
      const money = (v?: string) => (v && v.trim() ? parseEurosToCents(v) : null);
      const commissionType = (r.commission_type ?? "").trim().toUpperCase();
      const commissionValue = (r.commission_valeur ?? "").trim();
      let commission: { type: "PERCENT" | "FIXED"; value: number } | null = null;
      if (commissionType && commissionValue) {
        if (commissionType === "PERCENT") commission = { type: "PERCENT", value: Math.round(Number(commissionValue.replace(",", ".")) * 100) };
        else if (commissionType === "FIXED") commission = { type: "FIXED", value: parseEurosToCents(commissionValue) };
        else throw new AppError("commission_type : PERCENT ou FIXED");
      }
      const p = await createProduct(actor, {
        title: r.titre, description: r.description, categoryId,
        condition: conditionMap[(r.etat ?? "neuf").trim().toLowerCase()] ?? "NEW",
        priceCents: money(r.prix), recommendedPriceCents: money(r.prix_conseille), wholesalePriceCents: money(r.prix_gros),
        stock: Number(r.stock || 0), brand: r.marque || null, sku: r.sku || null,
        shippingCents: money(r.frais_port) ?? 0, shippingDays: Number(r.delai_expedition || 3), shippingMethods: ["colissimo"],
        affiliateEnabled: !!commission, commission,
        imageUrls: r.image_url && /^https?:\/\/|^\//.test(r.image_url) ? [r.image_url.trim()] : [],
      });
      created.push(p.id);
    } catch (e) {
      const msg = e instanceof AppError ? e.message
        : e && typeof e === "object" && "issues" in e ? (e as { issues: { path: unknown[]; message: string }[] }).issues.map((x) => `${x.path.join(".")} : ${x.message}`).join(" ; ")
        : "Ligne invalide";
      errors.push({ line, message: msg });
    }
  }
  return { created: created.length, errors };
}
