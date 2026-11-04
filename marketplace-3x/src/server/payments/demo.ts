import type { PaymentProvider } from "./provider";
import { randomToken } from "../auth/password";

/**
 * BAC À SABLE DE DÉMONSTRATION — aucun argent réel n'est encaissé ni versé.
 * Le paiement est confirmé manuellement sur /paiement/demo/[id] (bandeau explicite), qui rejoue
 * exactement le même traitement qu'un webhook réel. Désactivé dès que PAYMENT_PROVIDER=stripe.
 * Toutes les opérations sont marquées provider="demo" en base et affichées comme telles.
 */
export const demoProvider: PaymentProvider = {
  name: "demo",
  isSandbox: true,
  async createCheckout(req) {
    return { providerRef: `demo_cs_${randomToken(10)}`, redirectUrl: `/paiement/demo/${req.paymentId}` };
  },
  async refund() {
    return { providerRef: `demo_re_${randomToken(10)}`, succeeded: true };
  },
  async transfer() {
    return { providerRef: `demo_tr_${randomToken(10)}` };
  },
  async createConnectedAccount() {
    return { accountId: `demo_acct_${randomToken(8)}` };
  },
  async onboardingLink(_accountId, returnUrl) {
    return `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}demo_onboarding=1`;
  },
  async accountStatus() {
    return { payoutsEnabled: true, detailsSubmitted: true };
  },
};
