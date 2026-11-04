"use server";
import { redirect } from "next/navigation";
import { safeAction, str } from "@/lib/actions";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { confirmPayment, failPayment } from "@/server/services/finance";
import { AppError } from "@/server/errors";

export const demoPayAction = safeAction(async (fd) => {
  if ((process.env.PAYMENT_PROVIDER ?? "demo") !== "demo") throw new AppError("Bac à sable désactivé");
  const actor = await requireActor();
  const id = str(fd, "paymentId");
  const payment = await db.payment.findFirst({ where: { id, buyerId: actor.id, provider: "demo" } });
  if (!payment) throw new AppError("Paiement introuvable");
  if (str(fd, "outcome") === "success") {
    await confirmPayment(id, `demo_pi_${id.slice(-10)}`);
    redirect(`/paiement/retour?payment=${id}`);
  }
  await failPayment(id, "failed");
  redirect("/panier?annule=1");
});
