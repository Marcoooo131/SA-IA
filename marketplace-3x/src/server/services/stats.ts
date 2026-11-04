/** Indicateurs des tableaux de bord (indépendant, fournisseur, administrateur). Lecture seule. */
import { db } from "../db";
import { balances } from "./finance";

const LIVE = ["VALIDATING", "VALIDATED", "AVAILABLE", "PAID"] as const;

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
function monthKey(d: Date) { return d.toISOString().slice(0, 7); }

export function seriesByDay<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number, days = 30) {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) map.set(dayKey(new Date(Date.now() - i * 86400e3)), 0);
  for (const r of rows) { const k = dayKey(date(r)); if (map.has(k)) map.set(k, (map.get(k) ?? 0) + value(r)); }
  return [...map.entries()].map(([day, v]) => ({ label: day.slice(5).split("-").reverse().join("/"), value: v }));
}
export function seriesByMonth<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number, months = 12) {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) map.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15)), 0);
  for (const r of rows) { const k = monthKey(date(r)); if (map.has(k)) map.set(k, (map.get(k) ?? 0) + value(r)); }
  return [...map.entries()].map(([m, v]) => ({ label: new Date(`${m}-15`).toLocaleDateString("fr-FR", { month: "short" }), value: v }));
}

export async function professionalDashboard(userId: string) {
  const items = await db.orderItem.findMany({
    where: { professionalId: userId },
    include: {
      order: { select: { status: true, createdAt: true, buyerId: true, paidAt: true } },
      product: { select: { category: { select: { name: true } }, owner: { select: { displayName: true, primaryRole: true, supplierProfile: { select: { companyName: true } } } } } },
      commissions: { where: { beneficiaryId: userId, kind: "PRO_COMMISSION" } },
    },
  });
  const paidItems = items.filter((i) => i.order.paidAt);
  const done = paidItems.filter((i) => !["CANCELLED", "REFUNDED"].includes(i.order.status));
  const revenue = done.reduce((a, i) => a + i.unitPriceCents * i.quantity, 0);
  const commissionOf = (i: (typeof items)[number]) => i.commissions.filter((c) => (LIVE as readonly string[]).includes(c.status)).reduce((a, c) => a + c.amountCents, 0);
  const b = await balances(userId);
  const [links, contracts, suppliers] = await Promise.all([
    db.affiliateLink.aggregate({ where: { professionalId: userId }, _sum: { clicks: true } }),
    db.collaborationContract.findMany({ where: { professionalId: userId }, select: { ownerId: true, status: true } }),
    db.catalogSelection.findMany({ where: { professionalId: userId }, select: { product: { select: { ownerId: true } } } }),
  ]);
  const affiliateOrders = done.filter((i) => i.saleType === "SUPPLIER_AFFILIATE").length;
  const byCat = new Map<string, number>(), bySupplier = new Map<string, number>();
  for (const i of done) {
    byCat.set(i.product.category.name, (byCat.get(i.product.category.name) ?? 0) + commissionOf(i));
    if (i.saleType === "SUPPLIER_AFFILIATE") {
      const n = i.product.owner.supplierProfile?.companyName ?? i.product.owner.displayName;
      bySupplier.set(n, (bySupplier.get(n) ?? 0) + i.unitPriceCents * i.quantity);
    }
  }
  const clicks = links._sum.clicks ?? 0;
  return {
    revenue,
    salesDone: done.filter((i) => i.order.status === "COMPLETED").length,
    salesInProgress: done.filter((i) => ["PAID", "SHIPPED", "DELIVERED", "DISPUTED"].includes(i.order.status)).length,
    commissionsGenerated: b.validating + b.validated + b.available + b.paid,
    commissionsPending: b.validating + b.validated + b.disputed,
    commissionsAvailable: b.available,
    commissionsPaid: b.paid,
    clientsBrought: new Set(done.map((i) => i.order.buyerId)).size,
    individualsAccompanied: new Set(contracts.map((c) => c.ownerId)).size,
    activeContracts: contracts.filter((c) => c.status === "ACTIVE").length,
    supplierPartners: new Set(suppliers.map((s) => s.product.ownerId)).size,
    clicks,
    conversionRate: clicks ? affiliateOrders / clicks : 0,
    daily: seriesByDay(done, (i) => i.order.paidAt!, commissionOf),
    monthly: seriesByMonth(done, (i) => i.order.paidAt!, commissionOf),
    salesMonthly: seriesByMonth(done, (i) => i.order.paidAt!, () => 1),
    byCategory: [...byCat.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    bySupplier: [...bySupplier.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    avgCommission: done.length ? Math.round(done.reduce((a, i) => a + commissionOf(i), 0) / done.length) : 0,
  };
}

/** Conseils générés à partir des performances (règles explicables, pas de « boîte noire »). */
export function professionalAdvice(d: Awaited<ReturnType<typeof professionalDashboard>>) {
  const tips: string[] = [];
  if (d.clicks > 30 && d.conversionRate < 0.02) tips.push("Vos liens génèrent du trafic mais peu de ventes : ciblez davantage vos partages (groupes spécialisés, clients existants).");
  if (d.clicks < 10) tips.push("Partagez vos liens commerciaux plus largement : chaque lien est traçable et vous attribue la vente.");
  if (d.byCategory[0]) tips.push(`Votre catégorie la plus rentable est « ${d.byCategory[0].label} » : renforcez votre sélection dans cette catégorie.`);
  if (d.activeContracts === 0) tips.push("Aucune collaboration active : consultez la prospection pour trouver des particuliers qui cherchent un accompagnement près de chez vous.");
  if (d.supplierPartners < 2) tips.push("Sélectionnez des produits d'au moins deux fournisseurs pour diversifier vos revenus.");
  if (d.commissionsAvailable > 0) tips.push("Des commissions sont disponibles : vérifiez que votre compte bénéficiaire est validé pour recevoir le versement.");
  return tips;
}

export async function supplierDashboard(userId: string) {
  const [products, active, orders, items, selections] = await Promise.all([
    db.product.count({ where: { ownerId: userId, status: { not: "REMOVED" } } }),
    db.product.count({ where: { ownerId: userId, status: "ACTIVE" } }),
    db.order.findMany({ where: { sellerId: userId, paidAt: { not: null } }, select: { id: true, status: true, subtotalCents: true, paidAt: true } }),
    db.orderItem.findMany({
      where: { order: { sellerId: userId, paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } } },
      include: { product: { select: { id: true, title: true } }, commissions: true, order: { select: { paidAt: true } } },
    }),
    db.catalogSelection.findMany({ where: { product: { ownerId: userId } }, select: { professionalId: true } }),
  ]);
  const valid = orders.filter((o) => !["CANCELLED", "REFUNDED"].includes(o.status));
  const top = new Map<string, { title: string; qty: number; revenue: number }>();
  for (const i of items) {
    const t = top.get(i.productId) ?? { title: i.product.title, qty: 0, revenue: 0 };
    t.qty += i.quantity; t.revenue += i.unitPriceCents * i.quantity; top.set(i.productId, t);
  }
  const proCommissions = items.flatMap((i) => i.commissions.filter((c) => c.kind === "PRO_COMMISSION" || (c.kind === "PLATFORM_FEE" && i.saleType === "SUPPLIER_AFFILIATE")));
  const b = await balances(userId);
  return {
    products, active,
    orders: valid.length,
    revenue: valid.reduce((a, o) => a + o.subtotalCents, 0),
    topProducts: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    professionals: new Set(selections.map((s) => s.professionalId)).size,
    commissionsGenerated: proCommissions.filter((c) => c.status !== "CANCELLED").reduce((a, c) => a + c.amountCents, 0),
    toShip: valid.filter((o) => o.status === "PAID").length,
    balances: b,
    monthly: seriesByMonth(valid, (o) => o.paidAt!, (o) => o.subtotalCents),
  };
}

export async function adminDashboard() {
  const [users, byRole, products, activeProducts, orders, gmvAgg, fees, comm, disputes, payouts, clicks, affOrders, recentPaid] = await Promise.all([
    db.user.count({ where: { status: { not: "DELETED" } } }),
    db.user.groupBy({ by: ["primaryRole"], where: { status: { not: "DELETED" } }, _count: true }),
    db.product.count(),
    db.product.count({ where: { status: "ACTIVE" } }),
    db.order.count({ where: { paidAt: { not: null } } }),
    db.payment.aggregate({ where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } }, _sum: { amountCents: true } }),
    db.commissionTransaction.groupBy({ by: ["status"], where: { beneficiary: "PLATFORM" }, _sum: { amountCents: true } }),
    db.commissionTransaction.groupBy({ by: ["status"], where: { kind: "PRO_COMMISSION" }, _sum: { amountCents: true } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.payout.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
    db.affiliateLink.aggregate({ _sum: { clicks: true } }),
    db.orderItem.count({ where: { saleType: "SUPPLIER_AFFILIATE", order: { paidAt: { not: null } } } }),
    db.payment.findMany({ where: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] }, succeededAt: { gte: new Date(Date.now() - 365 * 86400e3) } }, select: { amountCents: true, succeededAt: true } }),
  ]);
  const sum = (rows: { status: string; _sum: { amountCents: number | null } }[], st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + (r._sum.amountCents ?? 0), 0);
  const role = (r: string) => byRole.find((x) => x.primaryRole === r)?._count ?? 0;
  const saleTypes = await db.orderItem.groupBy({ by: ["saleType"], where: { order: { paidAt: { not: null } } }, _count: true });
  return {
    users, individuals: role("INDIVIDUAL"), professionals: role("PROFESSIONAL"), suppliers: role("SUPPLIER"),
    products, activeProducts, orders,
    gmv: gmvAgg._sum.amountCents ?? 0,
    platformRevenue: sum(fees, ["VALIDATING", "VALIDATED", "AVAILABLE", "PAID"]),
    platformRevenueRealized: sum(fees, ["AVAILABLE", "PAID"]),
    commissionsGenerated: sum(comm, ["VALIDATING", "VALIDATED", "AVAILABLE", "PAID"]),
    commissionsPaid: sum(comm, ["PAID"]),
    commissionsPending: sum(comm, ["VALIDATING", "VALIDATED", "AVAILABLE", "DISPUTED"]),
    payoutsTotal: payouts._sum.amountCents ?? 0,
    disputes,
    clicks: clicks._sum.clicks ?? 0,
    affiliateConversion: (clicks._sum.clicks ?? 0) ? affOrders / (clicks._sum.clicks ?? 1) : 0,
    gmvDaily: seriesByDay(recentPaid, (p) => p.succeededAt!, (p) => p.amountCents),
    gmvMonthly: seriesByMonth(recentPaid, (p) => p.succeededAt!, (p) => p.amountCents),
    saleTypes: saleTypes.map((s) => ({ label: s.saleType, value: s._count })),
  };
}
