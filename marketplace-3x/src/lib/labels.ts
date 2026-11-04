import type {
  CommissionStatus, OrderStatus, ProductCondition, ProductStatus, Role, SaleType,
  ShipmentStatus, DisputeStatus, VerificationStatus, CollaborationMode, OfferStatus,
  CommissionKind, PaymentStatus,
} from "@prisma/client";

export const roleLabel: Record<Role, string> = {
  INDIVIDUAL: "Particulier", PROFESSIONAL: "Indépendant", SUPPLIER: "Fournisseur", ADMIN: "Administrateur",
};
export const conditionLabel: Record<ProductCondition, string> = {
  NEW: "Neuf", LIKE_NEW: "Comme neuf", VERY_GOOD: "Très bon état", GOOD: "Bon état", FAIR: "État correct",
};
export const productStatusLabel: Record<ProductStatus, string> = {
  DRAFT: "Brouillon", PENDING_REVIEW: "En modération", ACTIVE: "En ligne", PAUSED: "Suspendue",
  SOLD_OUT: "Vendue / épuisée", REMOVED: "Retirée",
};
export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "En attente de paiement", PAID: "Payée — à expédier", SHIPPED: "Expédiée",
  DELIVERED: "Livrée", COMPLETED: "Terminée", CANCELLED: "Annulée", REFUNDED: "Remboursée", DISPUTED: "En litige",
};
export const commissionStatusLabel: Record<CommissionStatus, string> = {
  PENDING: "En attente", VALIDATING: "En cours de validation", VALIDATED: "Validée", AVAILABLE: "Disponible",
  PAID: "Versée", CANCELLED: "Annulée", DISPUTED: "En litige",
};
export const commissionKindLabel: Record<CommissionKind, string> = {
  SELLER_PROCEEDS: "Revenu vendeur", PRO_COMMISSION: "Commission indépendant", PLATFORM_FEE: "Frais plateforme",
  SHIPPING: "Frais de port", PROMO_DISCOUNT: "Remise promotionnelle",
};
export const saleTypeLabel: Record<SaleType, string> = {
  P2P: "Entre particuliers", DELEGATED: "Vente déléguée", SUPPLIER_DIRECT: "Fournisseur direct",
  SUPPLIER_AFFILIATE: "Fournisseur via indépendant",
};
export const shipmentStatusLabel: Record<ShipmentStatus, string> = {
  PENDING: "À préparer", IN_TRANSIT: "En transit", DELIVERED: "Livré", RETURN_IN_TRANSIT: "Retour en cours",
  RETURNED: "Retourné", LOST: "Colis perdu",
};
export const disputeStatusLabel: Record<DisputeStatus, string> = {
  OPEN: "Ouvert", UNDER_REVIEW: "En examen", RESOLVED_REFUND: "Résolu — remboursé", RESOLVED_NO_REFUND: "Résolu — sans remboursement",
};
export const verificationLabel: Record<VerificationStatus, string> = {
  UNVERIFIED: "Non vérifié", PENDING: "Vérification en cours", VERIFIED: "Vérifié", REJECTED: "Refusé",
};
export const modeLabel: Record<CollaborationMode, string> = {
  SALES_ONLY: "Commercialisation seule", FULL_SERVICE: "Service complet (récupération, préparation, expédition)",
};
export const offerStatusLabel: Record<OfferStatus, string> = {
  PENDING: "En attente", ACCEPTED: "Acceptée", REFUSED: "Refusée", WITHDRAWN: "Retirée",
};
export const paymentStatusLabel: Record<PaymentStatus, string> = {
  PENDING: "En attente", SUCCEEDED: "Réussi", FAILED: "Échoué", CANCELLED: "Annulé",
  PARTIALLY_REFUNDED: "Remboursé partiellement", REFUNDED: "Remboursé",
};
export const carriers = [
  { id: "colissimo", label: "Colissimo" },
  { id: "mondial-relay", label: "Mondial Relay" },
  { id: "chronopost", label: "Chronopost" },
  { id: "relais-colis", label: "Relais Colis" },
  { id: "autre", label: "Autre transporteur" },
] as const;
