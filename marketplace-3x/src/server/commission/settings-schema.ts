import { z } from "zod";

/**
 * Paramètres commerciaux administrables (table AdminSetting, clé "commerce").
 * Aucun taux n'est codé en dur dans les interfaces : tout passe par ce schéma.
 * Taux en bps (10000 = 100 %), montants en centimes.
 */
export const commerceSettingsSchema = z.object({
  // Cas 1 — vente entre particuliers : frais de service prélevés sur le vendeur
  p2pFeeBps: z.number().int().min(0).max(5000),
  p2pFeeFixedCents: z.number().int().min(0).max(10000),
  // Cas 4 — vente fournisseur sans indépendant
  supplierDirectFeeBps: z.number().int().min(0).max(5000),
  // Cas 2 & 3 — frais de plateforme prélevés sur la commission de l'indépendant
  commissionPlatformFeeBps: z.number().int().min(0).max(10000),
  commissionPlatformFeeMinCents: z.number().int().min(0).max(10000),
  // Bornes des commissions
  delegationCommissionMinBps: z.number().int().min(0).max(10000),
  delegationCommissionMaxBps: z.number().int().min(0).max(10000),
  supplierCommissionMinBps: z.number().int().min(0).max(10000),
  supplierCommissionMaxBps: z.number().int().min(0).max(10000),
  // Attribution des ventes issues des liens commerciaux
  attributionWindowDays: z.number().int().min(0).max(365),
  attributionModel: z.enum(["LAST_CLICK", "FIRST_CLICK"]),
  // Validation des commissions
  autoConfirmReceiptDays: z.number().int().min(1).max(60),
  holdDaysP2P: z.number().int().min(0).max(90),
  holdDaysProfessional: z.number().int().min(0).max(90),
  minPayoutCents: z.number().int().min(0),
  // Collaboration
  collaborationMaxDurationDays: z.number().int().min(7).max(730),
  requireVerifiedProfessional: z.boolean(),
  requireVerifiedSupplier: z.boolean(),
  // Modération
  requireModeration: z.boolean(),
  prohibitedKeywords: z.array(z.string().min(2)).max(500),
  // Parrainage
  referralEnabled: z.boolean(),
  referralRewardCents: z.number().int().min(0).max(100000),
  referralMinOrderCents: z.number().int().min(0),
}).refine((s) => s.delegationCommissionMinBps <= s.delegationCommissionMaxBps, {
  message: "La commission de délégation minimale dépasse la maximale",
}).refine((s) => s.supplierCommissionMinBps <= s.supplierCommissionMaxBps, {
  message: "La commission fournisseur minimale dépasse la maximale",
});

export type CommerceSettings = z.infer<typeof commerceSettingsSchema>;

/** Valeurs initiales proposées (à valider commercialement). */
export const defaultCommerceSettings: CommerceSettings = {
  p2pFeeBps: 500,
  p2pFeeFixedCents: 70,
  supplierDirectFeeBps: 800,
  commissionPlatformFeeBps: 1000,
  commissionPlatformFeeMinCents: 200,
  delegationCommissionMinBps: 500,
  delegationCommissionMaxBps: 4000,
  supplierCommissionMinBps: 100,
  supplierCommissionMaxBps: 4000,
  attributionWindowDays: 30,
  attributionModel: "LAST_CLICK",
  autoConfirmReceiptDays: 3,
  holdDaysP2P: 2,
  holdDaysProfessional: 14,
  minPayoutCents: 1000,
  collaborationMaxDurationDays: 365,
  requireVerifiedProfessional: true,
  requireVerifiedSupplier: true,
  requireModeration: false,
  prohibitedKeywords: ["arme à feu", "munitions", "contrefaçon", "stupéfiant", "médicament sur ordonnance", "ivoire"],
  referralEnabled: true,
  referralRewardCents: 500,
  referralMinOrderCents: 2000,
};
