import { NextResponse } from "next/server";
import { runFinanceJobs } from "@/server/services/finance";

/** Tâche planifiée (Vercel Cron, toutes les heures) : validations, disponibilités, paiements expirés. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runFinanceJobs());
}
