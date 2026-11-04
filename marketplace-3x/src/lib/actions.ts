import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";

export type ActionState = { error?: string; ok?: string } | null;

/** Message affichable à partir d'une erreur (jamais de détail technique côté utilisateur). */
export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(" · ");
  console.error(e);
  return "Une erreur inattendue est survenue. Réessayez.";
}

/** Enveloppe d'action serveur : renvoie l'erreur au formulaire, laisse passer les redirections. */
export function safeAction(fn: (fd: FormData) => Promise<ActionState | void>) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    try {
      return (await fn(fd)) ?? { ok: "Enregistré" };
    } catch (e) {
      unstable_rethrow(e);
      return { error: errorMessage(e) };
    }
  };
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const files = (fd: FormData, k: string) => fd.getAll(k).filter((f): f is File => typeof f === "object" && f !== null && "size" in f && (f as File).size > 0);
