/** Erreur dont le message peut être affiché à l'utilisateur. */
export class AppError extends Error {
  constructor(message: string, public code = "APP_ERROR") { super(message); }
}
export class ForbiddenError extends AppError {
  constructor(message = "Action non autorisée") { super(message, "FORBIDDEN"); }
}
export class NotFoundError extends AppError {
  constructor(message = "Élément introuvable") { super(message, "NOT_FOUND"); }
}
export function invariant(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AppError(message);
}
