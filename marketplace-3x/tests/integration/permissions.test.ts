import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { buy, individualProduct, makeUser } from "./fixtures";
import { updateProduct, setProductStatus, decideProductOffer, makeProductOffer } from "@/server/services/catalog";
import { getOrderDetail, markShipped } from "@/server/services/orders";
import { confirmPayment } from "@/server/services/finance";
import { proposeToOwner, respondToOffer, entrustProducts, proposePrice, decidePriceProposal } from "@/server/services/delegation";
import { updateCommerceSettings, getCommerceSettings } from "@/server/settings";
import { setUserStatus, setVerification } from "@/server/services/admin";
import { registerUser, authenticate, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { sendMessage, startConversation } from "@/server/services/messaging";

describe("Permissions", () => {
  it("seul le propriétaire modifie son annonce", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const other = await makeUser("INDIVIDUAL");
    const p = await individualProduct(owner);
    await expect(updateProduct(other, p.id, { title: "Piraté" })).rejects.toThrow();
    await expect(setProductStatus(other, p.id, "remove")).rejects.toThrow();
  });

  it("l'indépendant mandaté édite l'annonce mais ne fixe pas le prix", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const p = await individualProduct(owner, 100, { minPriceCents: 8000 });
    const offer = await proposeToOwner(pro, owner.id, { commissionBps: 2000, mode: "SALES_ONLY", durationDays: 30, message: "Collaboration proposée" });
    const contract = await respondToOffer(owner, offer.id, true);
    await entrustProducts(owner, contract!.id, [p.id]);
    await updateProduct(pro, p.id, { title: "Titre optimisé par le pro", description: "Description retravaillée par l'indépendant", priceCents: 1 });
    let fresh = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.title).toBe("Titre optimisé par le pro");
    expect(fresh.priceCents).toBe(10000); // le prix n'a pas bougé
    await expect(setProductStatus(pro, p.id, "remove")).rejects.toThrow();

    const prop = await proposePrice(pro, p.id, 9000, "Marché");
    await expect(decidePriceProposal(pro, prop.id, true)).rejects.toThrow(/propriétaire/);
    await decidePriceProposal(owner, prop.id, true);
    fresh = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.priceCents).toBe(9000);
  });

  it("l'indépendant n'accepte une offre d'acheteur qu'au-dessus du plancher", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const buyer = await makeUser("INDIVIDUAL");
    const p = await individualProduct(owner, 100, { minPriceCents: 8500 });
    const offer = await proposeToOwner(pro, owner.id, { commissionBps: 2000, mode: "SALES_ONLY", durationDays: 30, message: "Collaboration proposée" });
    const c = await respondToOffer(owner, offer.id, true);
    await entrustProducts(owner, c!.id, [p.id]);
    const low = await makeProductOffer(buyer, p.id, 7000);
    await expect(decideProductOffer(pro, low.id, true)).rejects.toThrow(/plancher/);
    await decideProductOffer(owner, low.id, true); // le propriétaire, lui, peut
  });

  it("une proposition ne peut être acceptée que par son destinataire", async () => {
    const owner = await makeUser("INDIVIDUAL");
    const pro = await makeUser("PROFESSIONAL");
    const intruder = await makeUser("INDIVIDUAL");
    const offer = await proposeToOwner(pro, owner.id, { commissionBps: 2000, mode: "SALES_ONLY", durationDays: 30, message: "Collaboration proposée" });
    await expect(respondToOffer(intruder, offer.id, true)).rejects.toThrow();
    await expect(respondToOffer(pro, offer.id, true)).rejects.toThrow();
  });

  it("une commande n'est visible que par ses parties", async () => {
    const seller = await makeUser("INDIVIDUAL");
    const buyer = await makeUser("INDIVIDUAL");
    const stranger = await makeUser("INDIVIDUAL");
    const p = await individualProduct(seller, 30);
    const { paymentId } = await buy(buyer, p.id);
    await confirmPayment(paymentId);
    const order = await db.order.findFirstOrThrow({ where: { paymentId } });
    await expect(getOrderDetail(stranger, order.id)).rejects.toThrow();
    const { order: asBuyer } = await getOrderDetail(buyer, order.id);
    // l'acheteur ne voit pas la répartition financière du vendeur
    expect(asBuyer.items.flatMap((i) => i.commissions)).toHaveLength(0);
    await expect(markShipped(buyer, order.id, { carrier: "colissimo" })).rejects.toThrow();
  });

  it("seul l'administrateur modifie les paramètres commerciaux, avec validation", async () => {
    const admin = await makeUser("ADMIN");
    const user = await makeUser("SUPPLIER");
    const s = await getCommerceSettings();
    await expect(updateCommerceSettings(user, { ...s, p2pFeeBps: 0 })).rejects.toThrow();
    await expect(updateCommerceSettings(admin, { ...s, p2pFeeBps: -5 })).rejects.toThrow();
    await expect(updateCommerceSettings(admin, { ...s, delegationCommissionMinBps: 5000, delegationCommissionMaxBps: 1000 })).rejects.toThrow();
    const audits = await db.auditLog.count({ where: { action: "settings.update" } });
    await updateCommerceSettings(admin, { ...s, p2pFeeBps: 600 });
    expect(await db.auditLog.count({ where: { action: "settings.update" } })).toBe(audits + 1);
    await updateCommerceSettings(admin, s);
  });

  it("un compte suspendu ne peut plus agir et seul l'admin vérifie les profils", async () => {
    const admin = await makeUser("ADMIN");
    const pro = await makeUser("PROFESSIONAL", { verified: false });
    await expect(setVerification(pro, pro.id, "PROFESSIONAL", "VERIFIED")).rejects.toThrow();
    await setVerification(admin, pro.id, "PROFESSIONAL", "VERIFIED");
    const u = await makeUser("INDIVIDUAL");
    await setUserStatus(admin, u.id, "SUSPENDED", "Fraude");
    const suspended = { ...u, status: "SUSPENDED" as const };
    await expect(individualProduct(suspended)).rejects.toThrow(/suspendu/);
  });

  it("messagerie : seuls les participants écrivent", async () => {
    const a = await makeUser("INDIVIDUAL");
    const b = await makeUser("INDIVIDUAL");
    const c = await makeUser("INDIVIDUAL");
    const conv = await startConversation(a, b.id, "Bonjour", "Votre article est-il disponible ?");
    await sendMessage(b, conv.id, "Oui !");
    await expect(sendMessage(c, conv.id, "Intrusion")).rejects.toThrow();
  });
});

describe("Authentification", () => {
  it("inscription, connexion, réinitialisation du mot de passe", async () => {
    const email = `auth-${Date.now()}@test.local`;
    await expect(registerUser({ role: "INDIVIDUAL", email, password: "court", displayName: "Test", acceptTerms: true })).rejects.toThrow(/10 caractères/);
    const u = await registerUser({ role: "PROFESSIONAL", email, password: "motdepasse123", displayName: "Test Pro", acceptTerms: true });
    const roles = await db.userRole.findMany({ where: { userId: u.id } });
    expect(roles.map((r) => r.role).sort()).toEqual(["INDIVIDUAL", "PROFESSIONAL"]);
    expect((await db.professionalProfile.findUniqueOrThrow({ where: { userId: u.id } })).verificationStatus).toBe("UNVERIFIED");
    await expect(registerUser({ role: "INDIVIDUAL", email, password: "motdepasse123", displayName: "Doublon", acceptTerms: true })).rejects.toThrow(/existe déjà/);
    await expect(authenticate(email, "mauvais-mdp-1")).rejects.toThrow(/incorrects/);
    expect((await authenticate(email, "motdepasse123")).id).toBe(u.id);
    const token = await requestPasswordReset(email);
    await resetPassword(token!, "nouveaumdp456");
    await expect(resetPassword(token!, "encoreun789x")).rejects.toThrow(/expiré/); // jeton à usage unique
    expect((await authenticate(email, "nouveaumdp456")).id).toBe(u.id);
    // pas d'énumération de comptes
    expect(await requestPasswordReset("inconnu@test.local")).toBeUndefined();
  });
});
