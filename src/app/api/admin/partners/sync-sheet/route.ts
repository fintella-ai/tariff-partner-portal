import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncAllPartners } from "@/lib/google-sheets";

export async function POST() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!["super_admin", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const count = await syncAllPartners();
  return NextResponse.json({ ok: true, count });
}
