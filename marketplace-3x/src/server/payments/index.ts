import type { PaymentProvider } from "./provider";
import { demoProvider } from "./demo";
import { stripeProvider } from "./stripe";

export function paymentProvider(): PaymentProvider {
  const p = process.env.PAYMENT_PROVIDER ?? "demo";
  if (p === "stripe") return stripeProvider;
  if (p === "demo") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_PAYMENTS !== "true") {
      throw new Error("Le bac à sable de paiement est interdit en production (PAYMENT_PROVIDER=stripe requis).");
    }
    return demoProvider;
  }
  throw new Error(`Prestataire de paiement inconnu : ${p}`);
}

export function providerByName(name: string): PaymentProvider {
  return name === "stripe" ? stripeProvider : demoProvider;
}
