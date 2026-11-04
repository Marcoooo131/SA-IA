import { db } from "../db";
import { queueEmail } from "../email/mailer";
import { brand } from "@/config/brand";

export type NotificationType =
  | "collaboration.offer" | "collaboration.request" | "collaboration.accepted" | "collaboration.refused"
  | "order.new" | "payment.confirmed" | "product.sold" | "commission.validated" | "commission.paid"
  | "shipment.sent" | "shipment.delivered" | "message.new" | "dispute.opened" | "dispute.resolved"
  | "price.proposal" | "price.decision" | "offer.new" | "offer.decision" | "account.verified"
  | "search.alert" | "refund.processed" | "moderation" | "referral.reward";

/** Types qui déclenchent aussi un e-mail. */
const EMAIL_TYPES = new Set<NotificationType>([
  "collaboration.offer", "collaboration.accepted", "collaboration.refused", "order.new", "payment.confirmed",
  "product.sold", "commission.paid", "shipment.sent", "dispute.opened", "dispute.resolved", "refund.processed",
  "account.verified", "search.alert",
]);

/**
 * Point d'entrée unique des notifications (centre de notifications + e-mail).
 * Architecture prête pour un canal push : ajouter un pilote ici.
 */
export async function notify(userId: string, type: NotificationType, title: string, body: string, link?: string) {
  const n = await db.notification.create({ data: { userId, type, title, body, link } });
  if (EMAIL_TYPES.has(type)) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
    if (user && user.status === "ACTIVE") {
      const url = link ? `${process.env.APP_URL ?? ""}${link}` : "";
      await queueEmail(user.email, `${brand.name} — ${title}`, `${body}\n\n${url}`.trim());
    }
  }
  return n;
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
