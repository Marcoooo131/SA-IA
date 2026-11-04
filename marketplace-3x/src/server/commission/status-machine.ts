import type { CommissionStatus } from "@prisma/client";

/** Transitions autorisées des statuts de commission. Toute autre transition est refusée. */
export const commissionTransitions: Record<CommissionStatus, CommissionStatus[]> = {
  PENDING: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["VALIDATED", "CANCELLED", "DISPUTED"],
  VALIDATED: ["AVAILABLE", "CANCELLED", "DISPUTED"],
  AVAILABLE: ["PAID", "DISPUTED", "CANCELLED"],
  DISPUTED: ["VALIDATING", "VALIDATED", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};

export function canTransition(from: CommissionStatus, to: CommissionStatus) {
  return commissionTransitions[from].includes(to);
}
