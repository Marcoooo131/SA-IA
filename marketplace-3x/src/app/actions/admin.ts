"use server";
import { revalidatePath } from "next/cache";
import { safeAction, str, bool } from "@/lib/actions";
import { requireRole } from "@/server/auth/session";
import { createPromo, decideReport, moderateProduct, setRole, setUserStatus, setVerification, togglePromo, upsertCategory } from "@/server/services/admin";
import { resolveDispute } from "@/server/services/orders";
import { payoutUser, refundOrder, runFinanceJobs } from "@/server/services/finance";
import { updateCommerceSettings, getCommerceSettings } from "@/server/settings";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import type { Role } from "@prisma/client";
import { parseEurosToCents } from "@/lib/money";

const admin = () => requireRole("ADMIN");

export const userStatusAction = safeAction(async (fd) => {
  const a = await admin();
  await setUserStatus(a, str(fd, "userId"), str(fd, "status") as "ACTIVE", str(fd, "reason") || "Décision administrateur");
  revalidatePath("/admin/utilisateurs"); return { ok: "Statut mis à jour" };
});
export const verifyAction = safeAction(async (fd) => {
  const a = await admin();
  await setVerification(a, str(fd, "userId"), str(fd, "kind") as "PROFESSIONAL", str(fd, "status") as "VERIFIED", str(fd, "note") || undefined);
  revalidatePath("/admin/utilisateurs"); return { ok: "Vérification enregistrée" };
});
export const roleAction = safeAction(async (fd) => {
  const a = await admin();
  await setRole(a, str(fd, "userId"), str(fd, "role") as Role, str(fd, "grant") === "1");
  revalidatePath(`/admin/utilisateurs/${str(fd, "userId")}`); return { ok: "Droits mis à jour" };
});
export const moderateAction = safeAction(async (fd) => {
  const a = await admin();
  await moderateProduct(a, str(fd, "productId"), str(fd, "decision") as "approve", str(fd, "note") || undefined);
  revalidatePath("/admin/produits"); return { ok: "Décision de modération enregistrée" };
});
export const reportDecisionAction = safeAction(async (fd) => {
  const a = await admin();
  await decideReport(a, str(fd, "reportId"), str(fd, "action") as "dismiss", str(fd, "decision") || "Examiné");
  revalidatePath("/admin/signalements"); return { ok: "Signalement traité" };
});
export const disputeDecisionAction = safeAction(async (fd) => {
  const a = await admin();
  await resolveDispute(a, str(fd, "disputeId"), { refund: str(fd, "refund") === "1", resolution: str(fd, "resolution") || "Décision de l'équipe", restock: bool(fd, "restock") });
  revalidatePath("/admin/litiges"); return { ok: "Litige résolu" };
});
export const disputeReviewAction = safeAction(async (fd) => {
  const a = await admin();
  await db.dispute.update({ where: { id: str(fd, "disputeId") }, data: { status: "UNDER_REVIEW" } });
  await audit(a.id, "dispute.review", "Dispute", str(fd, "disputeId"));
  revalidatePath("/admin/litiges"); return { ok: "Litige pris en charge" };
});
export const refundAction = safeAction(async (fd) => {
  const a = await admin();
  await refundOrder(a, str(fd, "orderId"), str(fd, "reason") || "Remboursement administrateur", { restock: bool(fd, "restock") });
  revalidatePath("/admin/commandes"); return { ok: "Remboursement effectué" };
});
export const payoutAction = safeAction(async (fd) => {
  const a = await admin();
  const p = await payoutUser(a, str(fd, "userId"));
  revalidatePath("/admin/finances"); return { ok: `Versement ${p.id} effectué` };
});
export const runJobsAction = safeAction(async () => {
  const a = await admin();
  const r = await runFinanceJobs();
  await audit(a.id, "finance.jobs_run", "System", null, r);
  revalidatePath("/admin/finances"); return { ok: `${r.released} commission(s) rendue(s) disponible(s), ${r.autoCompleted} réception(s) auto-confirmée(s), ${r.expiredPayments} paiement(s) expiré(s)` };
});
export const settingsAction = safeAction(async (fd) => {
  const a = await admin();
  const cur = await getCommerceSettings();
  const pct = (k: string) => Math.round(Number(str(fd, k).replace(",", ".")) * 100);
  const eur = (k: string) => parseEurosToCents(str(fd, k) || "0");
  const int = (k: string) => Number(str(fd, k));
  await updateCommerceSettings(a, {
    ...cur,
    p2pFeeBps: pct("p2pFee"), p2pFeeFixedCents: eur("p2pFeeFixed"), supplierDirectFeeBps: pct("supplierDirectFee"),
    commissionPlatformFeeBps: pct("commissionPlatformFee"), commissionPlatformFeeMinCents: eur("commissionPlatformFeeMin"),
    delegationCommissionMinBps: pct("delegationMin"), delegationCommissionMaxBps: pct("delegationMax"),
    supplierCommissionMinBps: pct("supplierMin"), supplierCommissionMaxBps: pct("supplierMax"),
    attributionWindowDays: int("attributionWindowDays"), attributionModel: str(fd, "attributionModel"),
    autoConfirmReceiptDays: int("autoConfirmReceiptDays"), holdDaysP2P: int("holdDaysP2P"), holdDaysProfessional: int("holdDaysProfessional"),
    minPayoutCents: eur("minPayout"), collaborationMaxDurationDays: int("collaborationMaxDurationDays"),
    requireVerifiedProfessional: bool(fd, "requireVerifiedProfessional"), requireVerifiedSupplier: bool(fd, "requireVerifiedSupplier"),
    requireModeration: bool(fd, "requireModeration"),
    prohibitedKeywords: str(fd, "prohibitedKeywords").split("\n").map((s) => s.trim()).filter((s) => s.length >= 2),
    referralEnabled: bool(fd, "referralEnabled"), referralRewardCents: eur("referralReward"), referralMinOrderCents: eur("referralMinOrder"),
  });
  revalidatePath("/admin/parametres"); return { ok: "Paramètres enregistrés (modification journalisée)" };
});
export const categoryAction = safeAction(async (fd) => {
  const a = await admin();
  await upsertCategory(a, str(fd, "id") || null, { name: str(fd, "name"), slug: str(fd, "slug"), icon: str(fd, "icon") || "Package", parentId: str(fd, "parentId") || null, position: Number(str(fd, "position") || 0), restricted: bool(fd, "restricted") });
  revalidatePath("/admin/categories"); return { ok: "Catégorie enregistrée" };
});
export const promoAction = safeAction(async (fd) => {
  const a = await admin();
  const type = str(fd, "type");
  const v = str(fd, "value");
  await createPromo(a, { code: str(fd, "code"), type, value: type === "PERCENT" ? Math.round(Number(v.replace(",", ".")) * 100) : parseEurosToCents(v), minOrderCents: str(fd, "minOrder") ? parseEurosToCents(str(fd, "minOrder")) : 0, maxUses: str(fd, "maxUses") || null, validUntil: str(fd, "validUntil") || null });
  revalidatePath("/admin/promos"); return { ok: "Code créé" };
});
export const promoToggleAction = safeAction(async (fd) => {
  const a = await admin();
  await togglePromo(a, str(fd, "id")); revalidatePath("/admin/promos"); return { ok: "Code mis à jour" };
});
