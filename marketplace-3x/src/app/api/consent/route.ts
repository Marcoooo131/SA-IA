import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { CONSENT_COOKIE, REF_COOKIE } from "@/server/consent";
import { randomToken } from "@/server/auth/password";
import { getActor } from "@/server/auth/session";

/** Enregistre le choix de consentement (preuve conservée en base) — durée 6 mois (recommandation CNIL). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const analytics = body.analytics === true;
  const affiliate = body.affiliate === true;
  const key = randomToken(12);
  const actor = await getActor();
  await db.consentRecord.create({ data: { visitorKey: key, userId: actor?.id, analytics, affiliate } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONSENT_COOKIE, JSON.stringify({ v: 1, analytics, affiliate, key }), { path: "/", maxAge: 182 * 86400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  if (!affiliate) res.cookies.delete(REF_COOKIE);
  return res;
}
