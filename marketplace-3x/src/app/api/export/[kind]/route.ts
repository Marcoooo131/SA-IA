import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

const csv = (rows: (string | number | null | undefined)[][]) =>
  "﻿" + rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Exports administrateur (CSV, séparateur « ; » pour Excel FR). */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const actor = await getActor();
  if (!actor?.roles.includes("ADMIN")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { kind } = await params;
  let body = "";
  if (kind === "commissions") {
    const rows = await db.commissionTransaction.findMany({ orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } }, orderItem: { select: { title: true, saleType: true, order: { select: { number: true } } } } } });
    body = csv([["date", "commande", "article", "type_vente", "beneficiaire", "email", "nature", "statut", "montant_eur", "disponible_le", "versement"],
      ...rows.map((r) => [r.createdAt.toISOString(), r.orderItem.order.number, r.orderItem.title, r.orderItem.saleType, r.beneficiary, r.user?.email, r.kind, r.status, eur(r.amountCents), r.availableAt?.toISOString(), r.payoutId])]);
  } else if (kind === "ledger") {
    const rows = await db.ledgerEntry.findMany({ orderBy: { createdAt: "asc" } });
    body = csv([["date", "evenement", "compte", "montant_eur", "paiement", "commande", "commission", "versement", "remboursement"], ...rows.map((r) => [r.createdAt.toISOString(), r.event, r.accountRef, eur(r.amountCents), r.paymentId, r.orderId, r.commissionId, r.payoutId, r.refundId])]);
  } else if (kind === "dac7") {
    // Pré-rapport DAC7 : vendeurs, nombre de ventes et contreparties par année. À valider avec l'expert-comptable.
    const year = new Date().getFullYear();
    const items = await db.orderItem.findMany({ where: { order: { paidAt: { gte: new Date(`${year}-01-01`) }, status: { notIn: ["CANCELLED", "REFUNDED"] } } }, include: { order: { include: { seller: { include: { supplierProfile: true } } } }, commissions: true } });
    const map = new Map<string, { email: string; name: string; siret: string; count: number; gross: number; fees: number }>();
    for (const i of items) {
      const s = i.order.seller;
      const m = map.get(s.id) ?? { email: s.email, name: s.supplierProfile?.companyName ?? s.displayName, siret: s.supplierProfile?.siret ?? "", count: 0, gross: 0, fees: 0 };
      m.count++; m.gross += i.unitPriceCents * i.quantity;
      m.fees += i.commissions.filter((c) => c.beneficiary === "PLATFORM" || c.kind === "PRO_COMMISSION").reduce((a, c) => a + c.amountCents, 0);
      map.set(s.id, m);
    }
    body = csv([["annee", "vendeur", "email", "siret", "nb_ventes", "contrepartie_brute_eur", "commissions_et_frais_eur", "seuil_atteint (30 ventes ou 2000 €)"],
      ...[...map.values()].map((m) => [year, m.name, m.email, m.siret, m.count, eur(m.gross), eur(m.fees), m.count >= 30 || m.gross >= 200000 ? "OUI" : "non"])]);
  } else return NextResponse.json({ error: "unknown export" }, { status: 404 });
  await audit(actor.id, "export.download", "Export", kind);
  return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
