import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/server/db";
import { stripeClient } from "@/server/payments/stripe";
import { confirmPayment, failPayment, markRefundsSucceeded, refreshPayoutAccount } from "@/server/services/finance";

export const runtime = "nodejs";

/**
 * Webhook Stripe : signature vérifiée, traitement idempotent (table WebhookEvent),
 * seul point d'entrée qui confirme un paiement réel.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const already = await db.webhookEvent.findUnique({ where: { id: event.id } });
  if (already) return NextResponse.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid" && s.metadata?.paymentId) {
        const payment = await db.payment.findUnique({ where: { id: s.metadata.paymentId } });
        if (payment && payment.amountCents === s.amount_total && payment.providerRef === s.id) {
          await confirmPayment(payment.id, typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id);
        }
      }
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.paymentId) await failPayment(s.metadata.paymentId, event.type === "checkout.session.expired" ? "expired" : "failed");
      break;
    }
    case "charge.refunded": {
      const c = event.data.object as Stripe.Charge;
      if (typeof c.payment_intent === "string") await markRefundsSucceeded(c.payment_intent);
      break;
    }
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      const acc = await db.payoutAccount.findUnique({ where: { providerAccountId: a.id } });
      if (acc) await refreshPayoutAccount(acc.userId);
      break;
    }
  }
  // Enregistré après traitement : en cas d'erreur, Stripe rejoue l'événement (les traitements sont idempotents).
  await db.webhookEvent.create({ data: { id: event.id, provider: "stripe", type: event.type, payload: JSON.parse(raw) } }).catch(() => undefined);
  return NextResponse.json({ received: true });
}
