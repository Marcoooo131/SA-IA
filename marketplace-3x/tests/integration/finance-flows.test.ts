import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { address, buy, commissionsOfPayment, individualProduct, makeUser, supplierProduct } from "./fixtures";
import { addToCart, checkout, confirmReceipt, markDelivered, markShipped, openDispute, resolveDispute, cancelBySeller } from "@/server/services/orders";
import { confirmPayment, failPayment, payoutUser, refundOrder, runFinanceJobs, balances } from "@/server/services/finance";
import { recordAffiliateVisit, selectSupplierProduct } from "@/server/services/affiliate";
import { proposeToOwner, respondToOffer, entrustProducts } from "@/server/services/delegation";
import { updateCommerceSettings, getCommerceSettings } from "@/server/settings";

const sumBy = (rows: { beneficiary: string; amountCents: number }[], b: string) => rows.filter((r) => r.beneficiary === b).reduce((a, r) => a + r.amountCents, 0);

describe("Commande et paiement", () => {
  it("vente entre particuliers : commissions PENDING puis VALIDATING après confirmation du prestataire", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 100);
    const { paymentId } = await buy(buyer, p.id);
    let rows = await commissionsOfPayment(paymentId);
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
    expect(sumBy(rows, "SELLER")).toBe(9430);
    expect(sumBy(rows, "PLATFORM")).toBe(570);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    expect(order.status).toBe("PENDING_PAYMENT");

    await confirmPayment(paymentId);
    rows = await commissionsOfPayment(paymentId);
    expect(rows.every((r) => r.status === "VALIDATING")).toBe(true);
    expect((await db.order.findFirstOrThrow({ where: { paymentId } })).status).toBe("PAID");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("SOLD_OUT");
  });

  it("confirmation de paiement idempotente (webhook rejoué) : aucune double écriture", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 50);
    const { paymentId } = await buy(buyer, p.id);
    const results = await Promise.all([confirmPayment(paymentId), confirmPayment(paymentId), confirmPayment(paymentId)]);
    expect(results.filter((r) => r.processed)).toHaveLength(1);
    const ledger = await db.ledgerEntry.count({ where: { paymentId, event: "PAYMENT_SUCCEEDED" } });
    expect(ledger).toBe(1);
  });

  it("empêche la survente : le stock est réservé atomiquement", async () => {
    const supplier = await makeUser("SUPPLIER");
    const p = await supplierProduct(supplier, 20, 1, { type: "PERCENT", value: 1000 });
    const b1 = await makeUser("INDIVIDUAL");
    const b2 = await makeUser("INDIVIDUAL");
    await addToCart(b1, { productId: p.id });
    await addToCart(b2, { productId: p.id });
    const res = await Promise.allSettled([
      checkout(b1, address, "http://x"), checkout(b2, address, "http://x"),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const inv = await db.inventory.findFirstOrThrow({ where: { productId: p.id } });
    expect(inv.quantity).toBe(0);
  });

  it("paiement échoué : commandes annulées, stock restitué, commissions annulées", async () => {
    const supplier = await makeUser("SUPPLIER");
    const p = await supplierProduct(supplier, 20, 3, { type: "PERCENT", value: 1000 });
    const buyer = await makeUser("INDIVIDUAL");
    const { paymentId } = await buy(buyer, p.id, { quantity: 2 });
    expect((await db.inventory.findFirstOrThrow({ where: { productId: p.id } })).quantity).toBe(1);
    await failPayment(paymentId, "failed");
    expect((await db.inventory.findFirstOrThrow({ where: { productId: p.id } })).quantity).toBe(3);
    expect((await commissionsOfPayment(paymentId)).every((c) => c.status === "CANCELLED")).toBe(true);
    // un paiement annulé ne peut plus être confirmé
    expect((await confirmPayment(paymentId)).processed).toBe(false);
  });

  it("le prix vient toujours du serveur, jamais du client", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 80);
    await addToCart(buyer, { productId: p.id, ...( { priceCents: 1 } as object) });
    const { paymentId } = await checkout(buyer, { ...address, priceCents: 1 } as typeof address, "http://x");
    const pay = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(pay.amountCents).toBe(8000);
  });
});

describe("Cycle de validation des commissions", () => {
  it("VALIDATING → VALIDATED (réception) → AVAILABLE (délai) → PAID (versement)", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    await db.payoutAccount.create({ data: { userId: seller.id, provider: "demo", providerAccountId: `demo_${seller.id}`, status: "VERIFIED", payoutsEnabled: true } });
    const p = await individualProduct(seller, 100);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });

    await expect(confirmReceipt(buyer, order.id)).rejects.toThrow(); // pas encore expédiée
    await markShipped(seller, order.id, { carrier: "colissimo", trackingNumber: "X1" });
    await markDelivered(seller, order.id);
    await confirmReceipt(buyer, order.id);
    let rows = await commissionsOfPayment(paymentId);
    expect(rows.every((r) => r.status === "VALIDATED")).toBe(true);

    // Avant la fin du délai : rien n'est disponible, versement impossible
    await runFinanceJobs();
    await expect(payoutUser(null, seller.id)).rejects.toThrow();

    const s = await getCommerceSettings();
    await runFinanceJobs(new Date(Date.now() + (s.holdDaysP2P + 1) * 86400e3));
    rows = await commissionsOfPayment(paymentId);
    expect(rows.every((r) => r.status === "AVAILABLE")).toBe(true);

    const bal = await balances(seller.id);
    expect(bal.available).toBe(9430);
    // Deux demandes simultanées : un seul versement
    const res = await Promise.allSettled([payoutUser(null, seller.id), payoutUser(null, seller.id)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await balances(seller.id)).paid).toBe(9430);
    expect(await db.payout.count({ where: { userId: seller.id, status: "PAID" } })).toBe(1);
  });

  it("refuse le versement sans compte bénéficiaire vérifié", async () => {
    const u = await makeUser("INDIVIDUAL");
    await expect(payoutUser(null, u.id)).rejects.toThrow(/non vérifié/);
  });
});

describe("Remboursements, annulations et litiges", () => {
  it("remboursement : commissions annulées, écritures de journal, paiement remboursé", async () => {
    const admin = await makeUser("ADMIN");
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 60);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    await refundOrder(admin, order.id, "Retour accepté", { restock: true });
    expect((await commissionsOfPayment(paymentId)).every((c) => c.status === "CANCELLED")).toBe(true);
    expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("REFUNDED");
    expect(await db.ledgerEntry.count({ where: { orderId: order.id, event: "REFUND" } })).toBe(1);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ACTIVE");
    await expect(refundOrder(admin, order.id, "bis")).rejects.toThrow(); // pas de double remboursement
  });

  it("un non-administrateur ne peut pas rembourser", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 60);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    await expect(refundOrder(buyer, order.id, "moi")).rejects.toThrow();
  });

  it("annulation vendeur avant expédition : remboursement intégral automatique", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 45);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    await cancelBySeller(seller, order.id, "Article abîmé");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
  });

  it("litige : commissions gelées, puis restaurées si clos sans remboursement", async () => {
    const admin = await makeUser("ADMIN");
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 70);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    await markShipped(seller, order.id, { carrier: "colissimo" });
    const d = await openDispute(buyer, order.id, { reason: "NOT_RECEIVED", description: "Toujours pas reçu après 10 jours" });
    expect((await commissionsOfPayment(paymentId)).every((c) => c.status === "DISPUTED")).toBe(true);
    await expect(resolveDispute(buyer, d.id, { refund: true, resolution: "x" })).rejects.toThrow();
    await resolveDispute(admin, d.id, { refund: false, resolution: "Colis livré selon le transporteur" });
    expect((await commissionsOfPayment(paymentId)).every((c) => c.status === "VALIDATING")).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SHIPPED");
  });

  it("litige résolu par remboursement", async () => {
    const admin = await makeUser("ADMIN");
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 70);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    const d = await openDispute(buyer, order.id, { reason: "NOT_AS_DESCRIBED", description: "Ce n'est pas le bon modèle" });
    await resolveDispute(admin, d.id, { refund: true, resolution: "Non conforme" });
    expect((await commissionsOfPayment(paymentId)).every((c) => c.status === "CANCELLED")).toBe(true);
  });
});

describe("Ventes déléguées et affiliation", () => {
  it("cas 2 : vente déléguée 100 € à 20 % → 80 / 18 / 2", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(owner, 100);
    const offer = await proposeToOwner(pro, owner.id, { commissionBps: 2000, mode: "SALES_ONLY", durationDays: 30, message: "Je vends vos produits rapidement" });
    const contract = await respondToOffer(owner, offer.id, true);
    await entrustProducts(owner, contract!.id, [p.id]);
    const { paymentId } = await buy(buyer, p.id);
    const rows = await commissionsOfPayment(paymentId);
    expect(sumBy(rows, "SELLER")).toBe(8000);
    expect(sumBy(rows, "PROFESSIONAL")).toBe(1800);
    expect(sumBy(rows, "PLATFORM")).toBe(200);
    expect(rows.find((r) => r.beneficiary === "PROFESSIONAL")!.beneficiaryId).toBe(pro.id);
  });

  it("le taux du contrat est figé : un changement de paramètres n'affecte pas les contrats existants", async () => {
    const admin = await makeUser("ADMIN");
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(owner, 100);
    const offer = await proposeToOwner(pro, owner.id, { commissionBps: 3000, mode: "SALES_ONLY", durationDays: 30, message: "Proposition commerciale" });
    const contract = await respondToOffer(owner, offer.id, true);
    await entrustProducts(owner, contract!.id, [p.id]);
    const s = await getCommerceSettings();
    await updateCommerceSettings(admin, { ...s, delegationCommissionMaxBps: 2500 });
    const { paymentId } = await buy(buyer, p.id);
    const rows = await commissionsOfPayment(paymentId);
    expect(sumBy(rows, "SELLER")).toBe(7000);
    await updateCommerceSettings(admin, s);
  });

  it("refuse une commission hors bornes et un indépendant non vérifié", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const unverified = await makeUser("PROFESSIONAL", { verified: false });
    await expect(proposeToOwner(pro, owner.id, { commissionBps: 9000, mode: "SALES_ONLY", durationDays: 30, message: "Commission excessive" })).rejects.toThrow(/comprise entre/);
    await expect(proposeToOwner(unverified, owner.id, { commissionBps: 2000, mode: "SALES_ONLY", durationDays: 30, message: "Pas encore vérifié" })).rejects.toThrow(/vérifié/);
  });

  it("cas 3 : lien commercial → vente fournisseur 150 € avec 15 € de commission → 135 / 13 / 2", async () => {
    const supplier = await makeUser("SUPPLIER");
    const pro = await makeUser("PROFESSIONAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await supplierProduct(supplier, 150, 10);
    await selectSupplierProduct(pro, p.id);
    const profile = await db.professionalProfile.findUniqueOrThrow({ where: { userId: pro.id } });
    const att = await recordAffiliateVisit({ refCode: profile.refCode, productId: p.id, consented: true, visitorKey: "v1" });
    expect(att).not.toBeNull();
    const { paymentId } = await buy(buyer, p.id, { attributionIds: [att!.id] });
    const rows = await commissionsOfPayment(paymentId);
    expect(sumBy(rows, "SUPPLIER")).toBe(13500);
    expect(sumBy(rows, "PROFESSIONAL")).toBe(1300);
    expect(sumBy(rows, "PLATFORM")).toBe(200);
    await confirmPayment(paymentId);
    expect((await db.affiliateAttribution.findUniqueOrThrow({ where: { id: att!.id } })).convertedAt).not.toBeNull();
  });

  it("pas d'auto-attribution ni d'attribution expirée", async () => {
    const supplier = await makeUser("SUPPLIER");
    const pro = await makeUser("PROFESSIONAL");
    const p = await supplierProduct(supplier, 100, 10);
    await selectSupplierProduct(pro, p.id);
    const profile = await db.professionalProfile.findUniqueOrThrow({ where: { userId: pro.id } });
    expect(await recordAffiliateVisit({ refCode: profile.refCode, productId: p.id, consented: true, userId: pro.id })).toBeNull();
    const att = await recordAffiliateVisit({ refCode: profile.refCode, productId: p.id, consented: false });
    await db.affiliateAttribution.update({ where: { id: att!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const buyer = await makeUser("INDIVIDUAL");
    const { paymentId } = await buy(buyer, p.id, { attributionIds: [att!.id] });
    const rows = await commissionsOfPayment(paymentId);
    expect(sumBy(rows, "PROFESSIONAL")).toBe(0);
    expect(rows.find((r) => r.kind === "PLATFORM_FEE")!.amountCents).toBe(800); // vente directe fournisseur
  });

  it("code promo : remise financée par la plateforme, journal équilibré", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 100);
    await db.promoCode.create({ data: { code: `TEST${Date.now()}`.slice(0, 20), type: "FIXED", value: 1000 } });
    const promo = await db.promoCode.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
    const { paymentId } = await buy(buyer, p.id, { promoCode: promo.code });
    const pay = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(pay.amountCents).toBe(9000);
    const rows = await commissionsOfPayment(paymentId);
    expect(rows.reduce((a, r) => a + r.amountCents, 0)).toBe(9000);
    expect(sumBy(rows, "SELLER")).toBe(9430); // le vendeur n'est pas pénalisé par la remise
  });
});
