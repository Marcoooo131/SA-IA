/**
 * Données de DÉMONSTRATION — toutes fictives et marquées isDemo=true.
 * Comptes de test (mot de passe commun : demo-m3x-2026) :
 *   admin@demo.m3x · camille@demo.m3x (particulier) · lucas@demo.m3x (acheteur)
 *   sofiane@demo.m3x (indépendant vérifié) · julie@demo.m3x (indépendante vérifiée) · noah@demo.m3x (indépendant à vérifier)
 *   technopro@demo.m3x (fournisseur) · maisonco@demo.m3x (fournisseur)
 * Les paiements de démonstration passent par le bac à sable (provider "demo") : aucun argent réel.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadActor, makeCode } from "../src/server/services/auth";
import { createProduct } from "../src/server/services/catalog";
import { addToCart, checkout, markShipped, markDelivered, confirmReceipt } from "../src/server/services/orders";
import { confirmPayment, runFinanceJobs } from "../src/server/services/finance";
import { proposeToOwner, respondToOffer, entrustProducts, createDelegationRequest } from "../src/server/services/delegation";
import { selectSupplierProduct, recordAffiliateVisit } from "../src/server/services/affiliate";
import { defaultCommerceSettings } from "../src/server/commission/settings-schema";

const db = new PrismaClient();
const PASSWORD = "demo-m3x-2026";

const categories = [
  { slug: "mode", name: "Vêtements & chaussures", icon: "Shirt", color: ["#f6d5c8", "#e8a48f"] },
  { slug: "electronique", name: "Électronique & informatique", icon: "Laptop", color: ["#cfe0f7", "#7ea6e0"] },
  { slug: "telephones", name: "Téléphones", icon: "Smartphone", color: ["#d9d3f5", "#9b8fe0"] },
  { slug: "maison", name: "Maison & décoration", icon: "Lamp", color: ["#f3e7c9", "#d9b86a"] },
  { slug: "mobilier", name: "Mobilier", icon: "Armchair", color: ["#e3d6c7", "#b08c68"] },
  { slug: "sport", name: "Sport & loisirs", icon: "Bike", color: ["#cdeedd", "#6cc49a"] },
  { slug: "jouets", name: "Jouets", icon: "Blocks", color: ["#fde2c4", "#f5a65b"] },
  { slug: "auto", name: "Automobile & accessoires", icon: "Car", color: ["#d6dde3", "#7d8ea0"] },
  { slug: "beaute", name: "Beauté & accessoires", icon: "Sparkles", color: ["#f8d6e3", "#e58cb0"] },
  { slug: "pro", name: "Produits professionnels", icon: "Briefcase", color: ["#d4e7e6", "#5fa8a3"] },
  { slug: "autres", name: "Autres", icon: "Package", color: ["#e5e5e5", "#a3a3a3"] },
];

function svg(title: string, colors: string[], i: number) {
  const [a, b] = colors;
  const safe = title.replace(/[<&>"]/g, "").slice(0, 28);
  const shapes = [
    `<rect x="230" y="190" width="340" height="300" rx="36" fill="white" fill-opacity=".55"/>`,
    `<circle cx="400" cy="340" r="170" fill="white" fill-opacity=".5"/>`,
    `<path d="M240 470 L400 180 L560 470 Z" fill="white" fill-opacity=".5"/>`,
  ][i % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>${shapes}
<text x="400" y="620" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="38" font-weight="600" fill="#1f2937" fill-opacity=".8">${safe}</text>
<text x="400" y="668" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#1f2937" fill-opacity=".5">Visuel de démonstration</text>
</svg>`;
}

async function user(email: string, displayName: string, role: Role, extra: { city?: string; postalCode?: string } = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const u = await db.user.create({
    data: {
      email, displayName, primaryRole: role, passwordHash, emailVerifiedAt: new Date(), isDemo: true,
      referralCode: makeCode("P"), city: extra.city, postalCode: extra.postalCode,
      roles: { create: [{ role }, ...(role === "INDIVIDUAL" || role === "ADMIN" ? [] : [{ role: "INDIVIDUAL" as Role }])] },
    },
  });
  if (role !== "ADMIN") await db.individualProfile.create({ data: { userId: u.id } });
  return u;
}

async function main() {
  if (await db.user.findUnique({ where: { email: "admin@demo.m3x" } })) {
    console.log("Données de démonstration déjà présentes (npm run db:reset pour repartir de zéro).");
    return;
  }
  await db.adminSetting.upsert({ where: { key: "commerce" }, create: { key: "commerce", value: defaultCommerceSettings }, update: {} });

  const cat: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const row = await db.category.create({ data: { slug: c.slug, name: c.name, icon: c.icon, position: i } });
    cat[c.slug] = row.id;
  }
  await db.category.create({ data: { slug: "armes-blanches", name: "Couteaux & lames (contrôlé)", icon: "ShieldAlert", position: 99, restricted: true } });

  const dir = path.join(process.cwd(), "public", "demo");
  mkdirSync(dir, { recursive: true });
  let imgN = 0;
  const img = (title: string, slug: string) => {
    const file = `p${++imgN}.svg`;
    writeFileSync(path.join(dir, file), svg(title, categories.find((c) => c.slug === slug)!.color, imgN));
    return `/demo/${file}`;
  };

  // ── Comptes ──
  const admin = await user("admin@demo.m3x", "Administrateur M3X", "ADMIN");
  const camille = await user("camille@demo.m3x", "Camille D.", "INDIVIDUAL", { city: "Rennes", postalCode: "35000" });
  const lucas = await user("lucas@demo.m3x", "Lucas M.", "INDIVIDUAL", { city: "Paris", postalCode: "75011" });
  const ines = await user("ines@demo.m3x", "Inès B.", "INDIVIDUAL", { city: "Lyon", postalCode: "69003" });
  const sofiane = await user("sofiane@demo.m3x", "Sofiane K.", "PROFESSIONAL", { city: "Rennes", postalCode: "35200" });
  const julie = await user("julie@demo.m3x", "Julie R.", "PROFESSIONAL", { city: "Lyon", postalCode: "69002" });
  const noah = await user("noah@demo.m3x", "Noah L.", "PROFESSIONAL", { city: "Nantes", postalCode: "44000" });
  const techno = await user("technopro@demo.m3x", "TechnoPro Distribution", "SUPPLIER", { city: "Lille", postalCode: "59000" });
  const maison = await user("maisonco@demo.m3x", "Maison & Co", "SUPPLIER", { city: "Bordeaux", postalCode: "33000" });
  await db.user.update({ where: { id: lucas.id }, data: { referredById: camille.id } });

  await db.professionalProfile.create({ data: {
    userId: sofiane.id, refCode: "COMSOFIANE", headline: "Spécialiste high-tech & téléphonie en Bretagne",
    bio: "Ancien vendeur en magasin spécialisé, je photographie, rédige et vends vos appareils électroniques au meilleur prix. Récupération possible à Rennes et alentours.",
    serviceArea: "Rennes", serviceRadiusKm: 40, specialties: ["Smartphones", "Ordinateurs", "Consoles"], categorySlugs: ["electronique", "telephones"],
    defaultCommissionBps: 2000, offersPickup: true, siret: "00000000000000", verificationStatus: "VERIFIED", verifiedAt: new Date(),
  } });
  await db.professionalProfile.create({ data: {
    userId: julie.id, refCode: "COMJULIE", headline: "Mode seconde main & déco — Lyon",
    bio: "Styliste de formation, je valorise vos vêtements et objets déco : photos soignées, descriptions précises, négociation.",
    serviceArea: "Lyon", serviceRadiusKm: 25, specialties: ["Vêtements de marque", "Décoration"], categorySlugs: ["mode", "maison", "beaute"],
    defaultCommissionBps: 2500, offersPickup: false, verificationStatus: "VERIFIED", verifiedAt: new Date(),
  } });
  await db.professionalProfile.create({ data: {
    userId: noah.id, refCode: "COMNOAH", headline: "Sport & mobilité", bio: "Vélos, trottinettes et équipements sportifs.",
    serviceArea: "Nantes", specialties: ["Vélos"], categorySlugs: ["sport"], verificationStatus: "PENDING",
  } });
  await db.supplierProfile.create({ data: { userId: techno.id, companyName: "TechnoPro Distribution", legalForm: "SAS", siret: "00000000000001", website: "https://exemple.invalid", description: "Grossiste en matériel informatique et électroménager professionnel (entreprise fictive).", verificationStatus: "VERIFIED", verifiedAt: new Date() } });
  await db.supplierProfile.create({ data: { userId: maison.id, companyName: "Maison & Co", legalForm: "SARL", siret: "00000000000002", description: "Décoration et petit mobilier fabriqués en France (entreprise fictive).", verificationStatus: "VERIFIED", verifiedAt: new Date() } });
  for (const u of [camille, sofiane, julie, techno, maison]) {
    await db.payoutAccount.create({ data: { userId: u.id, provider: "demo", providerAccountId: `demo_acct_${u.id.slice(-8)}`, status: "VERIFIED", payoutsEnabled: true } });
  }

  const A = async (id: string) => (await loadActor(id))!;
  const [aCamille, aLucas, aInes, aSofiane, aJulie, aTechno, aMaison] = await Promise.all([camille, lucas, ines, sofiane, julie, techno, maison].map((u) => A(u.id)));

  // ── Annonces de particuliers ──
  const P = (actor: typeof aCamille, slug: string, d: { title: string; description: string; price: number; condition?: string; brand?: string; ship?: number; open?: boolean; min?: number }) =>
    createProduct(actor, {
      title: d.title, description: d.description, categoryId: cat[slug], condition: d.condition ?? "VERY_GOOD", brand: d.brand,
      priceCents: d.price * 100, minPriceCents: d.min ? d.min * 100 : null, shippingCents: (d.ship ?? 6) * 100, shippingMethods: ["mondial-relay", "colissimo"],
      handPickup: true, openToProfessionals: d.open ?? false, imageUrls: [img(d.title, slug)],
    });

  const iphone = await P(aCamille, "telephones", { title: "iPhone 13 128 Go bleu", description: "Batterie 88 %, aucune rayure, vendu avec coque et câble. Débloqué tout opérateur.", price: 420, brand: "Apple", open: true, min: 380 });
  const macbook = await P(aCamille, "electronique", { title: "MacBook Air M1 8/256", description: "Très bon état, 212 cycles de batterie, clavier AZERTY. Boîte d'origine.", price: 650, brand: "Apple", open: true, min: 600 });
  const switchC = await P(aCamille, "electronique", { title: "Nintendo Switch OLED + 2 jeux", description: "Console blanche, très peu servie, avec Mario Kart 8 et Zelda.", price: 260, brand: "Nintendo", open: true });
  await P(aCamille, "mode", { title: "Veste en jean Levi's taille M", description: "Coupe trucker, délavage clair, portée quelques fois.", price: 35, brand: "Levi's", condition: "LIKE_NEW" });
  await P(aCamille, "maison", { title: "Lampe de chevet en céramique", description: "Pied en céramique émaillée vert sauge, abat-jour lin.", price: 28, condition: "GOOD" });
  await P(aInes, "mode", { title: "Robe midi Sézane taille 38", description: "Imprimé fleuri, viscose, portée deux fois. Aucun défaut.", price: 75, brand: "Sézane", condition: "LIKE_NEW", open: true });
  await P(aInes, "mode", { title: "Baskets Veja V-10 pointure 39", description: "Cuir blanc et suède, semelle en bon état.", price: 60, brand: "Veja", condition: "GOOD" });
  await P(aInes, "beaute", { title: "Sac à main cuir camel", description: "Cuir pleine fleur, bandoulière réglable, intérieur propre.", price: 90, condition: "VERY_GOOD" });
  await P(aInes, "jouets", { title: "Lot LEGO Classic 1500 pièces", description: "Lot trié et complet, idéal à partir de 5 ans.", price: 40, brand: "LEGO", condition: "GOOD" });
  await P(aLucas, "sport", { title: "Vélo de route Triban RC 520", description: "Taille M, groupe Shimano 105, entretenu en atelier.", price: 690, brand: "Triban", condition: "VERY_GOOD", ship: 35 });
  await P(aLucas, "mobilier", { title: "Fauteuil scandinave en tissu bouclé", description: "Structure en chêne massif, assise ferme. Retrait à Paris 11e de préférence.", price: 180, condition: "VERY_GOOD", ship: 0 });
  await P(aLucas, "auto", { title: "Coffre de toit Thule 420 L", description: "Fixations universelles, deux clés.", price: 220, brand: "Thule", condition: "GOOD", ship: 0 });
  await P(aLucas, "electronique", { title: "Casque Sony WH-1000XM4", description: "Réduction de bruit, boîte, étui et câbles fournis.", price: 160, brand: "Sony" });

  // ── Catalogue fournisseurs ──
  const S = (actor: typeof aTechno, slug: string, d: { title: string; description: string; price: number; reco?: number; whole?: number; stock: number; brand?: string; commission?: { type: "PERCENT" | "FIXED"; value: number }; variants?: { name: string; stock: number }[] }) =>
    createProduct(actor, {
      title: d.title, description: d.description, categoryId: cat[slug], condition: "NEW", brand: d.brand,
      priceCents: d.price * 100, recommendedPriceCents: d.reco ? d.reco * 100 : null, wholesalePriceCents: d.whole ? d.whole * 100 : null,
      stock: d.stock, variants: d.variants ?? [], shippingCents: 590, shippingDays: 2, shippingMethods: ["colissimo", "chronopost"],
      affiliateEnabled: !!d.commission, commission: d.commission ?? null, imageUrls: [img(d.title, slug)],
    });
  const aspi = await S(aTechno, "pro", { title: "Aspirateur professionnel eau et poussière 30 L", description: "Moteur 1400 W, cuve inox, filtre HEPA. Garantie 2 ans.", price: 150, reco: 169, whole: 98, stock: 40, brand: "ProClean", commission: { type: "FIXED", value: 1500 } });
  const ecran = await S(aTechno, "electronique", { title: "Écran 27\" QHD IPS 75 Hz", description: "Dalle IPS 2560×1440, pied réglable en hauteur, HDMI/DisplayPort.", price: 229, reco: 259, whole: 160, stock: 25, brand: "Visio", commission: { type: "PERCENT", value: 800 } });
  await S(aTechno, "electronique", { title: "Clavier mécanique sans fil", description: "Switchs brown, rétroéclairage, Bluetooth et 2,4 GHz.", price: 89, reco: 99, stock: 60, brand: "Keyz", commission: { type: "PERCENT", value: 1000 } });
  await S(aTechno, "telephones", { title: "Chargeur rapide GaN 65 W", description: "3 ports USB-C/USB-A, compatible ordinateurs portables.", price: 39, stock: 200, brand: "Volt", commission: { type: "FIXED", value: 400 } });
  await S(aTechno, "pro", { title: "Nettoyeur haute pression 150 bars", description: "Pour professionnels du nettoyage, enrouleur 10 m.", price: 349, reco: 399, whole: 240, stock: 12, brand: "ProClean", commission: { type: "FIXED", value: 3500 } });
  const plaid = await S(aMaison, "maison", { title: "Plaid en laine recyclée", description: "Tissé en France, 130×170 cm, plusieurs coloris.", price: 69, reco: 79, stock: 0, brand: "Maison & Co", commission: { type: "PERCENT", value: 1200 }, variants: [{ name: "Terracotta", stock: 30 }, { name: "Sauge", stock: 25 }, { name: "Écru", stock: 0 }] });
  await S(aMaison, "mobilier", { title: "Table basse en chêne massif", description: "Fabrication artisanale, finition huilée, 100×60 cm.", price: 390, reco: 420, stock: 8, brand: "Maison & Co", commission: { type: "PERCENT", value: 1000 } });
  await S(aMaison, "maison", { title: "Bougie parfumée cire de soja", description: "Figue et bois de cèdre, 50 h de combustion.", price: 24, stock: 150, brand: "Maison & Co" });

  // ── Délégation : demande, proposition, contrat ──
  await createDelegationRequest(aInes, { title: "Garde-robe à vendre — une trentaine de pièces", description: "Vêtements de marque (Sézane, Maje, Isabel Marant), tailles 36-38. Je n'ai pas le temps de faire les photos et les envois.", city: "Lyon", postalCode: "69003", categorySlugs: ["mode", "beaute"], estimatedItems: 30, estimatedValueCents: 120000, mode: "SALES_ONLY", maxCommissionBps: 3000 });
  await createDelegationRequest(aLucas, { title: "Matériel informatique de bureau", description: "Deux écrans, une imprimante laser, un dock, des claviers. Récupération souhaitée à domicile.", city: "Paris", postalCode: "75011", categorySlugs: ["electronique"], estimatedItems: 8, mode: "FULL_SERVICE" });
  const reqCamille = await createDelegationRequest(aCamille, { title: "Appareils high-tech à confier", description: "iPhone, MacBook et console : je souhaite un professionnel pour les photos, les annonces et la négociation.", city: "Rennes", postalCode: "35000", categorySlugs: ["electronique", "telephones"], estimatedItems: 3, mode: "SALES_ONLY", maxCommissionBps: 2500 });
  const offer = await proposeToOwner(aSofiane, camille.id, { commissionBps: 2000, mode: "SALES_ONLY", handlesShipping: false, durationDays: 90, message: "Bonjour Camille, je vends des appareils Apple et Nintendo depuis 6 ans à Rennes. Je m'occupe des photos, de l'annonce et des négociations ; vous gardez la main sur les prix." }, reqCamille.id);
  const contract = await respondToOffer(aCamille, offer.id, true);
  await entrustProducts(aCamille, contract!.id, [iphone.id, macbook.id, switchC.id], { [iphone.id]: 38000, [macbook.id]: 60000 });
  await proposeToOwner(aJulie, ines.id, { commissionBps: 2500, mode: "SALES_ONLY", handlesShipping: false, durationDays: 120, message: "Bonjour Inès, je suis spécialisée dans la mode de créateurs à Lyon. Je peux prendre en charge vos 30 pièces." });

  // ── Catalogue : sélections & liens commerciaux ──
  await selectSupplierProduct(aSofiane, aspi.id);
  await selectSupplierProduct(aSofiane, ecran.id);
  await selectSupplierProduct(aJulie, plaid.id);

  // ── Commandes de démonstration (paiements bac à sable) ──
  const address = { shippingName: "Lucas M.", shippingLine1: "12 rue de la Roquette", shippingPostal: "75011", shippingCity: "Paris", carrier: "colissimo", acceptTerms: true as const };
  const buy = async (buyer: typeof aLucas, productId: string, opts: { ref?: string; variantId?: string; qty?: number } = {}) => {
    let attributionIds: string[] = [];
    if (opts.ref) {
      const att = await recordAffiliateVisit({ refCode: opts.ref, productId, consented: true, visitorKey: `seed-${buyer.id}`, userId: buyer.id });
      if (att) attributionIds = [att.id];
    }
    await addToCart(buyer, { productId, variantId: opts.variantId, quantity: opts.qty, attributionIds });
    const { paymentId } = await checkout(buyer, { ...address, shippingName: buyer.displayName }, "http://localhost:3000");
    await confirmPayment(paymentId, null);
    return db.order.findFirstOrThrow({ where: { paymentId }, orderBy: { createdAt: "desc" } });
  };
  for (let k = 0; k < 6; k++) await recordAffiliateVisit({ refCode: "COMSOFIANE", productId: aspi.id, consented: false });

  // 1) Vente déléguée complète (iPhone) → commission validée
  const o1 = await buy(aLucas, iphone.id);
  await markShipped(aCamille, o1.id, { carrier: "colissimo", trackingNumber: "6A00000000001" });
  await markDelivered(aCamille, o1.id);
  await confirmReceipt(aLucas, o1.id);
  // 2) Vente fournisseur via lien de Sofiane (aspirateur ×2) → livrée et confirmée
  const o2 = await buy(aLucas, aspi.id, { ref: "COMSOFIANE", qty: 2 });
  await markShipped(aTechno, o2.id, { carrier: "chronopost", trackingNumber: "XY000000002FR" });
  await markDelivered(aTechno, o2.id);
  await confirmReceipt(aLucas, o2.id);
  // 3) Vente fournisseur via lien de Sofiane (écran), payée, à expédier
  await buy(aInes, ecran.id, { ref: "COMSOFIANE" });
  // 4) Vente fournisseur via Julie (plaid variante), expédiée
  const plaidVariant = await db.productVariant.findFirstOrThrow({ where: { productId: plaid.id, name: "Terracotta" } });
  const o4 = await buy(aLucas, plaid.id, { ref: "COMJULIE", variantId: plaidVariant.id });
  await markShipped(aMaison, o4.id, { carrier: "colissimo", trackingNumber: "6A00000000004" });
  // 5) Vente entre particuliers (veste) terminée
  const veste = await db.product.findFirstOrThrow({ where: { title: { startsWith: "Veste en jean" } } });
  const o5 = await buy(aInes, veste.id);
  await markShipped(aCamille, o5.id, { carrier: "mondial-relay", trackingNumber: "MR0000005" });
  await markDelivered(aCamille, o5.id);
  await confirmReceipt(aInes, o5.id);

  // Vieillissement : les deux premières ventes datent de plus de 15 jours → commissions disponibles
  const past = new Date(Date.now() - 20 * 86400e3);
  for (const o of [o1, o5]) {
    await db.order.update({ where: { id: o.id }, data: { paidAt: past, createdAt: past } });
    const items = await db.orderItem.findMany({ where: { orderId: o.id }, select: { id: true } });
    await db.commissionTransaction.updateMany({ where: { orderItemId: { in: items.map((i) => i.id) } }, data: { availableAt: new Date(Date.now() - 86400e3) } });
  }
  await runFinanceJobs();

  // Avis, code promo, signalement, alerte
  await db.review.create({ data: { orderId: o1.id, authorId: lucas.id, targetId: sofiane.id, targetRole: "PROFESSIONAL", rating: 5, comment: "Annonce très claire, échanges rapides. Téléphone conforme." } });
  await db.review.create({ data: { orderId: o1.id, authorId: lucas.id, targetId: camille.id, targetRole: "INDIVIDUAL", rating: 5, comment: "Envoi soigné." } });
  await db.review.create({ data: { orderId: o2.id, authorId: lucas.id, targetId: techno.id, targetRole: "SUPPLIER", rating: 4, comment: "Livraison rapide, produit robuste." } });
  await db.promoCode.create({ data: { code: "BIENVENUE10", type: "PERCENT", value: 1000, minOrderCents: 3000, maxUses: 1000 } });
  await db.savedSearch.create({ data: { userId: lucas.id, label: "Vélo électrique", query: "vélo", filters: { q: "vélo" } } });
  await db.product.updateMany({ where: { isDemo: false }, data: { isDemo: true } });
  await db.auditLog.create({ data: { actorId: admin.id, action: "seed.demo", entityType: "System", metadata: { note: "Données de démonstration fictives" } } });

  console.log("✔ Données de démonstration créées. Mot de passe commun :", PASSWORD);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
