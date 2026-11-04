/**
 * Abstraction du prestataire de paiement marketplace.
 * Modèle retenu : « charges et transferts séparés » (Stripe Connect) — l'acheteur paie la plateforme
 * via le prestataire agréé, puis les fonds sont transférés aux comptes connectés des bénéficiaires
 * (vendeurs, indépendants, fournisseurs) uniquement après validation. Les fonds restent chez le
 * prestataire agréé : la plateforme ne détient jamais les fonds sur son propre compte bancaire.
 * ⚠️ Point à valider (juriste / Stripe) : statut d'agent / régime d'exemption DSP2 du modèle choisi.
 */
export interface CheckoutRequest {
  paymentId: string;
  amountCents: number;
  description: string;
  customerEmail: string;
  transferGroup: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly name: "stripe" | "demo";
  readonly isSandbox: boolean;
  createCheckout(req: CheckoutRequest): Promise<{ providerRef: string; redirectUrl: string }>;
  refund(req: { paymentIntent: string | null; providerRef: string; amountCents: number; idempotencyKey: string }):
    Promise<{ providerRef: string; succeeded: boolean }>;
  transfer(req: { destination: string; amountCents: number; transferGroup?: string; idempotencyKey: string; description: string }):
    Promise<{ providerRef: string }>;
  createConnectedAccount(req: { email: string; userId: string; business: boolean }): Promise<{ accountId: string }>;
  onboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string>;
  accountStatus(accountId: string): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean }>;
}
