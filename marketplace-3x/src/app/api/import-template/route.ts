import { IMPORT_COLUMNS } from "@/server/services/import";

export function GET() {
  const sample = ["Aspirateur eau et poussière 20 L", "Moteur 1200 W, cuve inox, garantie 2 ans.", "pro", "129,00", "149,00", "85,00", "30", "neuf", "ProClean", "ASP-20", "5,90", "2", "FIXED", "12,00", ""];
  const csv = `${IMPORT_COLUMNS.join(";")}\n${sample.map((v) => (v.includes(";") ? `"${v}"` : v)).join(";")}\n`;
  return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="modele-import-marketplace3x.csv"' } });
}
