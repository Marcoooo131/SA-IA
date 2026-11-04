import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { randomToken, sha256 } from "./password";
import { loadActor } from "../services/auth";
import type { Actor } from "./actor";

const COOKIE = "m3x_session";
const MAX_AGE_DAYS = 30;

export async function createSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  await db.session.create({
    data: {
      userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + MAX_AGE_DAYS * 86400e3),
      userAgent: h.get("user-agent")?.slice(0, 200), ip: h.get("x-forwarded-for")?.split(",")[0] ?? null,
    },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

/** Utilisateur connecté (mis en cache pour la durée d'une requête). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  const actor = await loadActor(session.userId);
  if (!actor || actor.status !== "ACTIVE") return null;
  return actor;
});

export async function requireActor(next?: string): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect(`/connexion${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return a;
}

export async function requireRole(role: Role, next?: string): Promise<Actor> {
  const a = await requireActor(next);
  if (!a.roles.includes(role)) redirect("/acces-refuse");
  return a;
}
