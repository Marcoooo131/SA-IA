import type { Role } from "@prisma/client";
import type { Actor } from "./actor";
import { ForbiddenError } from "../errors";

export function hasRole(actor: Actor | null | undefined, role: Role): boolean {
  return !!actor && actor.status === "ACTIVE" && actor.roles.includes(role);
}
export function assertActive(actor: Actor) {
  if (actor.status !== "ACTIVE") throw new ForbiddenError("Compte suspendu");
}
export function assertRole(actor: Actor, ...roles: Role[]) {
  assertActive(actor);
  if (!roles.some((r) => actor.roles.includes(r))) throw new ForbiddenError("Votre profil ne permet pas cette action");
}
export function assertAdmin(actor: Actor) {
  assertRole(actor, "ADMIN");
}
/** Le propriétaire de la ressource ou un administrateur. */
export function assertSelfOrAdmin(actor: Actor, ownerId: string) {
  assertActive(actor);
  if (actor.id !== ownerId && !actor.roles.includes("ADMIN")) throw new ForbiddenError();
}
