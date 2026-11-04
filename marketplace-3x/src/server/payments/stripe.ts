import Stripe from "stripe";
import type { PaymentProvider } from "./provider";

let client: Stripe | null = null;
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  client ??= new Stripe(key);
  return client;
}

/** Stripe Connect — charges et transferts séparés, comptes Express. Utiliser des clés sk_test_ hors production. */
export const stripeProvider: PaymentProvider = {
  name: "stripe",
  get isSandbox() { return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"); },
  async createCheckout(req) {
    const s = await stripeClient().checkout.sessions.create({
      mode: "payment",
      customer_email: req.customerEmail,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: req.amountCents, product_data: { name: req.description } } }],
      payment_intent_data: { transfer_group: req.transferGroup, metadata: { paymentId: req.paymentId } },
      metadata: { paymentId: req.paymentId },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    }, { idempotencyKey: req.idempotencyKey });
    return { providerRef: s.id, redirectUrl: s.url! };
  },
  async refund(req) {
    const r = await stripeClient().refunds.create(
      { payment_intent: req.paymentIntent ?? undefined, amount: req.amountCents },
      { idempotencyKey: req.idempotencyKey },
    );
    return { providerRef: r.id, succeeded: r.status === "succeeded" };
  },
  async transfer(req) {
    const t = await stripeClient().transfers.create({
      amount: req.amountCents, currency: "eur", destination: req.destination,
      transfer_group: req.transferGroup, description: req.description,
    }, { idempotencyKey: req.idempotencyKey });
    return { providerRef: t.id };
  },
  async createConnectedAccount(req) {
    const a = await stripeClient().accounts.create({
      type: "express", country: "FR", email: req.email,
      business_type: req.business ? "company" : "individual",
      capabilities: { transfers: { requested: true } },
      metadata: { userId: req.userId },
    });
    return { accountId: a.id };
  },
  async onboardingLink(accountId, returnUrl, refreshUrl) {
    const l = await stripeClient().accountLinks.create({ account: accountId, return_url: returnUrl, refresh_url: refreshUrl, type: "account_onboarding" });
    return l.url;
  },
  async accountStatus(accountId) {
    const a = await stripeClient().accounts.retrieve(accountId);
    return { payoutsEnabled: !!a.payouts_enabled, detailsSubmitted: !!a.details_submitted };
  },
};
