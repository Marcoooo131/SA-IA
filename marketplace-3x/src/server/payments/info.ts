export function paymentProviderInfo() {
  const p = process.env.PAYMENT_PROVIDER ?? "demo";
  if (p === "stripe") {
    const test = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
    return { name: "stripe", sandbox: test, label: test ? "Stripe en mode test (cartes de test uniquement)" : "Stripe" };
  }
  return { name: "demo", sandbox: true, label: "bac à sable de paiement local" };
}
