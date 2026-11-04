import { describe, expect, it } from "vitest";
import {
  computeItemSplit, platformFeeOnCommission, promoDiscount, previewNet, effectiveSupplierBps, CommissionError,
} from "@/server/commission/engine";
import { defaultCommerceSettings as s } from "@/server/commission/settings-schema";
import { canTransition } from "@/server/commission/status-machine";

const sum = (l: { amountCents: number }[]) => l.reduce((a, x) => a + x.amountCents, 0);

describe("Cas 1 — vente entre particuliers", () => {
  it("prélève les frais de service configurés sur le vendeur", () => {
    const lines = computeItemSplit({ saleType: "P2P", unitPriceCents: 10000, quantity: 1 }, s);
    // 5 % de 100 € + 0,70 € = 5,70 €
    expect(lines).toEqual([
      { beneficiary: "SELLER", kind: "SELLER_PROCEEDS", amountCents: 9430 },
      { beneficiary: "PLATFORM", kind: "PLATFORM_FEE", amountCents: 570 },
    ]);
  });
  it("ne prélève jamais plus que le prix", () => {
    const lines = computeItemSplit({ saleType: "P2P", unitPriceCents: 50, quantity: 1 }, s);
    expect(lines[0].amountCents).toBe(0);
    expect(lines[1].amountCents).toBe(50);
  });
  it("suit le barème administré", () => {
    const lines = computeItemSplit({ saleType: "P2P", unitPriceCents: 10000, quantity: 1 }, { ...s, p2pFeeBps: 0, p2pFeeFixedCents: 0 });
    expect(lines[1].amountCents).toBe(0);
  });
});

describe("Cas 2 — vente déléguée à un indépendant", () => {
  it("100 € à 20 % : propriétaire 80 €, indépendant 18 €, plateforme 2 €", () => {
    const p = previewNet({ saleType: "DELEGATED", unitPriceCents: 10000, quantity: 1, contractCommissionBps: 2000 }, s);
    expect(p.seller).toBe(8000);
    expect(p.professional).toBe(1800);
    expect(p.platform).toBe(200);
  });
  it("exige le taux du contrat", () => {
    expect(() => computeItemSplit({ saleType: "DELEGATED", unitPriceCents: 1000, quantity: 1 }, s)).toThrow(CommissionError);
  });
});

describe("Cas 3 — vente fournisseur avec indépendant", () => {
  it("150 € avec 15 € de commission et 2 € de frais : 135 / 13 / 2", () => {
    const p = previewNet({
      saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 15000, quantity: 1, supplierRule: { type: "FIXED", value: 1500 },
    }, s);
    expect(p.seller).toBe(13500);
    expect(p.professional).toBe(1300);
    expect(p.platform).toBe(200);
  });
  it("commission fixe multipliée par la quantité", () => {
    const p = previewNet({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 15000, quantity: 3, supplierRule: { type: "FIXED", value: 1500 } }, s);
    expect(p.seller).toBe(45000 - 4500);
    expect(p.professional + p.platform).toBe(4500);
  });
  it("commission en pourcentage", () => {
    const p = previewNet({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 20000, quantity: 1, supplierRule: { type: "PERCENT", value: 1000 } }, s);
    expect(p.seller).toBe(18000);
    expect(p.platform).toBe(200);
    expect(p.professional).toBe(1800);
  });
  it("une commission fixe supérieure au prix est plafonnée", () => {
    const lines = computeItemSplit({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: 1000, quantity: 1, supplierRule: { type: "FIXED", value: 5000 } }, s);
    expect(sum(lines)).toBe(1000);
    expect(lines.every((l) => l.amountCents >= 0)).toBe(true);
  });
});

describe("Cas 4 — vente fournisseur directe", () => {
  it("prélève le taux fournisseur", () => {
    const p = previewNet({ saleType: "SUPPLIER_DIRECT", unitPriceCents: 10000, quantity: 2 }, s);
    expect(p.platform).toBe(1600);
    expect(p.seller).toBe(18400);
  });
});

describe("Invariants", () => {
  it("la somme des lignes est toujours égale au brut (balayage)", () => {
    for (let price = 0; price < 30000; price += 137) {
      for (const bps of [0, 1, 999, 2000, 3333, 10000]) {
        expect(sum(computeItemSplit({ saleType: "DELEGATED", unitPriceCents: price, quantity: 1, contractCommissionBps: bps }, s))).toBe(price);
        expect(sum(computeItemSplit({ saleType: "SUPPLIER_AFFILIATE", unitPriceCents: price, quantity: 2, supplierRule: { type: "PERCENT", value: bps } }, s))).toBe(price * 2);
      }
      expect(sum(computeItemSplit({ saleType: "P2P", unitPriceCents: price, quantity: 1 }, s))).toBe(price);
    }
  });
  it("refuse les montants non entiers ou négatifs", () => {
    expect(() => computeItemSplit({ saleType: "P2P", unitPriceCents: 10.5, quantity: 1 }, s)).toThrow();
    expect(() => computeItemSplit({ saleType: "P2P", unitPriceCents: -1, quantity: 1 }, s)).toThrow();
    expect(() => computeItemSplit({ saleType: "P2P", unitPriceCents: 100, quantity: 0 }, s)).toThrow();
  });
  it("frais sur commission : minimum appliqué et plafonné", () => {
    expect(platformFeeOnCommission(1500, s)).toBe(200);
    expect(platformFeeOnCommission(5000, s)).toBe(500);
    expect(platformFeeOnCommission(100, s)).toBe(100);
    expect(platformFeeOnCommission(0, s)).toBe(0);
  });
  it("commission effective en bps", () => {
    expect(effectiveSupplierBps({ type: "FIXED", value: 1500 }, 15000)).toBe(1000);
    expect(effectiveSupplierBps({ type: "PERCENT", value: 750 }, 15000)).toBe(750);
  });
});

describe("Codes promotionnels", () => {
  it("pourcentage, fixe, minimum de commande et plafond", () => {
    expect(promoDiscount({ type: "PERCENT", value: 1000, minOrderCents: 0 }, 5000)).toBe(500);
    expect(promoDiscount({ type: "FIXED", value: 1000, minOrderCents: 3000 }, 2000)).toBe(0);
    expect(promoDiscount({ type: "FIXED", value: 9000, minOrderCents: 0 }, 2000)).toBe(2000);
  });
});

describe("Machine à états des commissions", () => {
  it("n'autorise que les transitions prévues", () => {
    expect(canTransition("PENDING", "VALIDATING")).toBe(true);
    expect(canTransition("PENDING", "AVAILABLE")).toBe(false);
    expect(canTransition("VALIDATING", "PAID")).toBe(false);
    expect(canTransition("AVAILABLE", "PAID")).toBe(true);
    expect(canTransition("PAID", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "AVAILABLE")).toBe(false);
  });
});
