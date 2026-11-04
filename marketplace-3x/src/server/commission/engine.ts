/**
 * MOTEUR DE COMMISSIONS — fonctions pures, sans accès base de données.
 * Toute répartition financière passe par `computeItemSplit`. Invariant garanti :
 * la somme des lignes est exactement égale au montant brut de l'article.
 */
import type { CommissionType, SaleType } from "@prisma/client";
import { applyBps } from "@/lib/money";
import type { CommerceSettings } from "./settings-schema";

export type SplitBeneficiary = "SELLER" | "PROFESSIONAL" | "SUPPLIER" | "PLATFORM";
export type SplitKind = "SELLER_PROCEEDS" | "PRO_COMMISSION" | "PLATFORM_FEE";

export interface SplitLine {
  beneficiary: SplitBeneficiary;
  kind: SplitKind;
  amountCents: number;
}

export interface SplitInput {
  saleType: SaleType;
  unitPriceCents: number;
  quantity: number;
  /** DELEGATED : taux figé du contrat de collaboration. */
  contractCommissionBps?: number | null;
  /** SUPPLIER_AFFILIATE : règle de commission du produit. */
  supplierRule?: { type: CommissionType; value: number } | null;
}

export type FeeSettings = Pick<
  CommerceSettings,
  "p2pFeeBps" | "p2pFeeFixedCents" | "supplierDirectFeeBps" | "commissionPlatformFeeBps" | "commissionPlatformFeeMinCents"
>;

export class CommissionError extends Error {}

function assertCents(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) throw new CommissionError(`${label} doit être un entier positif (centimes)`);
}

/** Frais plateforme sur une commission : max(taux, minimum), plafonné à la commission. */
export function platformFeeOnCommission(commissionCents: number, s: FeeSettings): number {
  if (commissionCents <= 0) return 0;
  const fee = Math.max(applyBps(commissionCents, s.commissionPlatformFeeBps), s.commissionPlatformFeeMinCents);
  return Math.min(fee, commissionCents);
}

/** Commission brute versée par le fournisseur pour un article. */
export function supplierCommission(rule: { type: CommissionType; value: number }, unitPriceCents: number, quantity: number): number {
  const gross = unitPriceCents * quantity;
  const c = rule.type === "PERCENT" ? applyBps(gross, rule.value) : rule.value * quantity;
  return Math.min(c, gross);
}

export function computeItemSplit(input: SplitInput, s: FeeSettings): SplitLine[] {
  assertCents(input.unitPriceCents, "Le prix");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new CommissionError("Quantité invalide");
  const gross = input.unitPriceCents * input.quantity;
  const lines: SplitLine[] = [];

  switch (input.saleType) {
    case "P2P": {
      const fee = gross === 0 ? 0 : Math.min(gross, applyBps(gross, s.p2pFeeBps) + s.p2pFeeFixedCents);
      lines.push({ beneficiary: "SELLER", kind: "SELLER_PROCEEDS", amountCents: gross - fee });
      lines.push({ beneficiary: "PLATFORM", kind: "PLATFORM_FEE", amountCents: fee });
      break;
    }
    case "DELEGATED": {
      const bps = input.contractCommissionBps;
      if (bps == null || bps < 0 || bps > 10000) throw new CommissionError("Taux de commission du contrat manquant");
      const commission = applyBps(gross, bps);
      const fee = platformFeeOnCommission(commission, s);
      lines.push({ beneficiary: "SELLER", kind: "SELLER_PROCEEDS", amountCents: gross - commission });
      lines.push({ beneficiary: "PROFESSIONAL", kind: "PRO_COMMISSION", amountCents: commission - fee });
      lines.push({ beneficiary: "PLATFORM", kind: "PLATFORM_FEE", amountCents: fee });
      break;
    }
    case "SUPPLIER_AFFILIATE": {
      if (!input.supplierRule) throw new CommissionError("Règle de commission fournisseur manquante");
      assertCents(input.supplierRule.value, "La commission");
      const commission = supplierCommission(input.supplierRule, input.unitPriceCents, input.quantity);
      const fee = platformFeeOnCommission(commission, s);
      lines.push({ beneficiary: "SUPPLIER", kind: "SELLER_PROCEEDS", amountCents: gross - commission });
      lines.push({ beneficiary: "PROFESSIONAL", kind: "PRO_COMMISSION", amountCents: commission - fee });
      lines.push({ beneficiary: "PLATFORM", kind: "PLATFORM_FEE", amountCents: fee });
      break;
    }
    case "SUPPLIER_DIRECT": {
      const fee = applyBps(gross, s.supplierDirectFeeBps);
      lines.push({ beneficiary: "SUPPLIER", kind: "SELLER_PROCEEDS", amountCents: gross - fee });
      lines.push({ beneficiary: "PLATFORM", kind: "PLATFORM_FEE", amountCents: fee });
      break;
    }
  }

  const sum = lines.reduce((a, l) => a + l.amountCents, 0);
  if (sum !== gross || lines.some((l) => l.amountCents < 0)) {
    throw new CommissionError("Répartition incohérente");
  }
  return lines;
}

/** Remise d'un code promo (financée par la plateforme). */
export function promoDiscount(promo: { type: CommissionType; value: number; minOrderCents: number }, subtotalCents: number): number {
  if (subtotalCents < promo.minOrderCents) return 0;
  const d = promo.type === "PERCENT" ? applyBps(subtotalCents, promo.value) : promo.value;
  return Math.max(0, Math.min(d, subtotalCents));
}

/** Contrôle des bornes administrées. */
export function isWithinBounds(bps: number, min: number, max: number) {
  return Number.isInteger(bps) && bps >= min && bps <= max;
}

/** Commission effective (en bps du prix) d'une règle fournisseur, pour vérifier les bornes. */
export function effectiveSupplierBps(rule: { type: CommissionType; value: number }, priceCents: number): number {
  if (rule.type === "PERCENT") return rule.value;
  if (priceCents <= 0) return 10000;
  return Math.round((rule.value * 10000) / priceCents);
}

/** Prévisualisation pour l'interface (le calcul de référence reste côté serveur à la commande). */
export function previewNet(input: SplitInput, s: FeeSettings) {
  const lines = computeItemSplit(input, s);
  const get = (b: SplitBeneficiary) => lines.filter((l) => l.beneficiary === b).reduce((a, l) => a + l.amountCents, 0);
  return { seller: get("SELLER") + get("SUPPLIER"), professional: get("PROFESSIONAL"), platform: get("PLATFORM"), lines };
}
