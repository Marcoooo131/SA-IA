import { db, type Tx } from "./db";
import type { Prisma } from "@prisma/client";

/** Journalisation des opérations sensibles (lecture : /admin/audit). */
export async function audit(
  actorId: string | null, action: string, entityType: string, entityId?: string | null,
  metadata?: Prisma.InputJsonValue, tx: Tx = db,
) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId: entityId ?? null, metadata } });
}
