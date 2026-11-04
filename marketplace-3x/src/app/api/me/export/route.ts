import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { exportUserData } from "@/server/services/admin";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = await exportUserData(actor);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="mes-donnees-marketplace3x.json"` },
  });
}
