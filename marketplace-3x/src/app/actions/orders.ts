"use server";
import { revalidatePath } from "next/cache";
import { safeAction, str } from "@/lib/actions";
import { requireActor } from "@/server/auth/session";
import { cancelBySeller, confirmReceipt, leaveReview, markDelivered, markShipped, openDispute, reportLost } from "@/server/services/orders";

const done = (id: string, ok: string) => { revalidatePath(`/commandes/${id}`); return { ok }; };

export const shipAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await markShipped(a, id, { carrier: str(fd, "carrier"), trackingNumber: str(fd, "trackingNumber") });
  return done(id, "Expédition enregistrée, l'acheteur est prévenu.");
});
export const deliveredAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await markDelivered(a, id); return done(id, "Livraison enregistrée");
});
export const receiptAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await confirmReceipt(a, id); return done(id, "Réception confirmée. Merci !");
});
export const disputeAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await openDispute(a, id, { reason: str(fd, "reason"), description: str(fd, "description") });
  return done(id, "Litige ouvert : notre équipe va l'examiner. Les fonds sont bloqués en attendant.");
});
export const reviewAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await leaveReview(a, id, { targetId: str(fd, "targetId"), rating: Number(str(fd, "rating")), comment: str(fd, "comment") });
  return done(id, "Merci pour votre avis !");
});
export const cancelAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await cancelBySeller(a, id, str(fd, "reason") || "Annulation"); return done(id, "Commande annulée et remboursée");
});
export const lostAction = safeAction(async (fd) => {
  const a = await requireActor(); const id = str(fd, "orderId");
  await reportLost(a, id); return done(id, "Colis déclaré perdu : un litige a été ouvert");
});
