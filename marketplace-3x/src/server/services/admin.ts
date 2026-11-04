import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { db } from "../db";
import { AppError, NotFoundError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertActive, assertAdmin } from "../auth/permissions";
import { audit } from "../audit";
import { notify } from "./notifications";
import { fireSearchAlerts } from "./catalog";
import { randomToken } from "../auth/password";

export async function listUsers(actor: Actor, f: { q?: string; role?: Role; status?: string; verification?: string; page?: number }) {
  assertAdmin(actor);
  const where: Prisma.UserWhereInput = {
    ...(f.q ? { OR: [{ email: { contains: f.q, mode: "insensitive" } }, { displayName: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.role ? { primaryRole: f.role } : {}),
    ...(f.status ? { status: f.status as never } : {}),
    ...(f.verification ? { OR: [{ professionalProfile: { verificationStatus: f.verification as never } }, { supplierProfile: { verificationStatus: f.verification as never } }] } : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [users, total] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, skip: (page - 1) * 50, include: { roles: true, professionalProfile: true, supplierProfile: true } }),
    db.user.count({ where }),
  ]);
  return { users, total, page };
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  assertAdmin(actor);
  if (userId === actor.id) throw new AppError("Vous ne pouvez pas suspendre votre propre compte");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status } }),
    ...(status === "SUSPENDED" ? [db.session.deleteMany({ where: { userId } }), db.product.updateMany({ where: { ownerId: userId, status: "ACTIVE" }, data: { status: "PAUSED" } })] : []),
  ]);
  await audit(actor.id, status === "SUSPENDED" ? "user.suspend" : "user.reactivate", "User", userId, { reason });
}

export async function setVerification(actor: Actor, userId: string, kind: "PROFESSIONAL" | "SUPPLIER", status: "VERIFIED" | "REJECTED" | "PENDING", note?: string) {
  assertAdmin(actor);
  const data = { verificationStatus: status, verifiedAt: status === "VERIFIED" ? new Date() : null, verificationNote: note ?? null };
  if (kind === "PROFESSIONAL") await db.professionalProfile.update({ where: { userId }, data });
  else await db.supplierProfile.update({ where: { userId }, data });
  await audit(actor.id, "user.verification", "User", userId, { kind, status, note: note ?? null });
  await notify(userId, "account.verified", status === "VERIFIED" ? "Profil vérifié" : status === "REJECTED" ? "Vérification refusée" : "Vérification en cours",
    status === "VERIFIED" ? "Votre profil professionnel est vérifié : toutes les fonctionnalités sont ouvertes." : note ?? "Votre dossier est en cours d'examen.",
    kind === "PROFESSIONAL" ? "/pro" : "/fournisseur");
}

export async function setRole(actor: Actor, userId: string, role: Role, grant: boolean) {
  assertAdmin(actor);
  if (!grant && userId === actor.id && role === "ADMIN") throw new AppError("Vous ne pouvez pas retirer votre propre accès administrateur");
  if (grant) await db.userRole.upsert({ where: { userId_role: { userId, role } }, create: { userId, role, grantedBy: actor.id }, update: {} });
  else await db.userRole.deleteMany({ where: { userId, role } });
  await audit(actor.id, grant ? "role.grant" : "role.revoke", "User", userId, { role });
}

export async function moderateProduct(actor: Actor, productId: string, decision: "approve" | "remove", note?: string) {
  assertAdmin(actor);
  const p = await db.product.findUnique({ where: { id: productId } });
  if (!p) throw new NotFoundError();
  await db.product.update({
    where: { id: productId },
    data: decision === "approve"
      ? { status: "ACTIVE", moderationNote: null, publishedAt: p.publishedAt ?? new Date() }
      : { status: "REMOVED", moderationNote: note ?? "Retiré par la modération" },
  });
  await audit(actor.id, `moderation.${decision}`, "Product", productId, { note: note ?? null });
  // DSA art. 17 : exposé des motifs communiqué à l'utilisateur concerné.
  await notify(p.ownerId, "moderation", decision === "approve" ? "Annonce validée" : "Annonce retirée",
    decision === "approve" ? `« ${p.title} » est en ligne.` : `« ${p.title} » a été retirée. Motif : ${note ?? "non-conformité aux règles de publication"}. Vous pouvez contester cette décision auprès du support.`,
    `/espace/annonces/${productId}`);
  if (decision === "approve") await fireSearchAlerts(productId);
}

export async function decideReport(actor: Actor, reportId: string, action: "dismiss" | "remove_product" | "suspend_user", decision: string) {
  assertAdmin(actor);
  const r = await db.report.findUnique({ where: { id: reportId } });
  if (!r || r.status !== "OPEN") throw new AppError("Signalement déjà traité");
  if (action === "remove_product" && r.targetType === "PRODUCT") await moderateProduct(actor, r.targetId, "remove", decision);
  if (action === "suspend_user") {
    const userId = r.targetType === "USER" ? r.targetId : (await db.product.findUnique({ where: { id: r.targetId } }))?.ownerId;
    if (userId) await setUserStatus(actor, userId, "SUSPENDED", decision);
  }
  await db.report.update({ where: { id: reportId }, data: { status: action === "dismiss" ? "DISMISSED" : "ACTIONED", decision, decidedAt: new Date() } });
  await audit(actor.id, "report.decide", "Report", reportId, { action, decision });
  if (r.reporterId) await notify(r.reporterId, "moderation", "Signalement traité", `Votre signalement a été examiné : ${decision}`);
}

export async function createReport(actor: Actor | null, input: { targetType: "PRODUCT" | "USER" | "MESSAGE"; targetId: string; reason: string; details?: string }) {
  if (actor) assertActive(actor);
  if (!input.reason || input.reason.length < 3) throw new AppError("Motif requis");
  return db.report.create({ data: { reporterId: actor?.id ?? null, targetType: input.targetType, targetId: input.targetId, reason: input.reason.slice(0, 120), details: input.details?.slice(0, 2000) } });
}

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Identifiant : minuscules, chiffres et tirets").max(60),
  icon: z.string().trim().max(40).default("Package"),
  parentId: z.string().optional().nullable(),
  position: z.coerce.number().int().default(0),
  restricted: z.boolean().default(false),
});

export async function upsertCategory(actor: Actor, id: string | null, raw: unknown) {
  assertAdmin(actor);
  const input = categorySchema.parse(raw);
  const c = id
    ? await db.category.update({ where: { id }, data: { ...input, parentId: input.parentId || null } })
    : await db.category.create({ data: { ...input, parentId: input.parentId || null } });
  await audit(actor.id, id ? "category.update" : "category.create", "Category", c.id, input);
  return c;
}

export const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "Code : 3 à 30 caractères A-Z, 0-9, - ou _"),
  type: z.enum(["PERCENT", "FIXED"]),
  value: z.coerce.number().int().min(1),
  minOrderCents: z.coerce.number().int().min(0).default(0),
  maxUses: z.coerce.number().int().min(1).optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
});

export async function createPromo(actor: Actor, raw: unknown) {
  assertAdmin(actor);
  const input = promoSchema.parse(raw);
  if (input.type === "PERCENT" && input.value > 10000) throw new AppError("Pourcentage maximal : 100 %");
  const p = await db.promoCode.create({ data: input });
  await audit(actor.id, "promo.create", "PromoCode", p.id, { ...input, validUntil: input.validUntil?.toISOString() ?? null });
  return p;
}

export async function togglePromo(actor: Actor, id: string) {
  assertAdmin(actor);
  const p = await db.promoCode.findUniqueOrThrow({ where: { id } });
  await db.promoCode.update({ where: { id }, data: { active: !p.active } });
  await audit(actor.id, p.active ? "promo.disable" : "promo.enable", "PromoCode", id);
}

// ───────────── RGPD ─────────────

/** Droit d'accès / portabilité : export JSON des données personnelles. */
export async function exportUserData(actor: Actor) {
  assertActive(actor);
  const data = await db.user.findUnique({
    where: { id: actor.id },
    include: {
      individualProfile: true, professionalProfile: true, supplierProfile: true, roles: true,
      products: { include: { images: true } }, favorites: true, orders: { include: { items: true } },
      sellerOrders: { include: { items: true } }, messages: true, notifications: true, reviewsWritten: true,
      savedSearches: true, delegationRequests: true, offersSent: true, offersReceived: true,
      commissions: true, payouts: true,
    },
  });
  if (!data) throw new NotFoundError();
  const { passwordHash: _ignored, ...rest } = data;
  await audit(actor.id, "gdpr.export", "User", actor.id);
  return rest;
}

/**
 * Droit à l'effacement : anonymisation du compte. Les données comptables et de transaction sont
 * conservées pendant la durée légale (obligations comptables / fiscales / DAC7) mais dissociées
 * des données d'identification directe. ⚠️ Durées de conservation à valider par le DPO / juriste.
 */
export async function deleteAccount(actor: Actor) {
  assertActive(actor);
  const openOrders = await db.order.count({
    where: { OR: [{ buyerId: actor.id }, { sellerId: actor.id }, { items: { some: { professionalId: actor.id } } }], status: { in: ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "DISPUTED"] } },
  });
  if (openOrders) throw new AppError("Des commandes sont en cours : la suppression sera possible une fois celles-ci terminées.");
  const pendingMoney = await db.commissionTransaction.count({ where: { beneficiaryId: actor.id, status: { in: ["VALIDATING", "VALIDATED", "AVAILABLE", "DISPUTED"] } } });
  if (pendingMoney) throw new AppError("Des montants vous sont encore dus : demandez leur versement avant de supprimer votre compte.");
  const anon = `supprime-${randomToken(6)}@anonyme.invalid`;
  await db.$transaction([
    db.product.updateMany({ where: { ownerId: actor.id, status: { not: "REMOVED" } }, data: { status: "REMOVED" } }),
    db.collaborationContract.updateMany({ where: { OR: [{ ownerId: actor.id }, { professionalId: actor.id }], status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: actor.id } }),
    db.favorite.deleteMany({ where: { userId: actor.id } }),
    db.savedSearch.deleteMany({ where: { userId: actor.id } }),
    db.notification.deleteMany({ where: { userId: actor.id } }),
    db.user.update({
      where: { id: actor.id },
      data: { email: anon, displayName: "Utilisateur supprimé", passwordHash: randomToken(), city: null, postalCode: null, avatarUrl: null, status: "DELETED" },
    }),
  ]);
  await audit(actor.id, "gdpr.delete", "User", actor.id);
}
