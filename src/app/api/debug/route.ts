import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fs = require("fs");
    const path = require("path");
    const { PrismaClient } = require("@prisma/client");

    const cwdDb = path.join(process.cwd(), "prisma", "dev.db");

    const checks: any = {
      cwd: process.cwd(),
      vercel: !!process.env.VERCEL,
      tmpDbExists: fs.existsSync("/tmp/dev.db"),
      cwdDbExists: fs.existsSync(cwdDb),
      tmpDbSize: fs.existsSync("/tmp/dev.db") ? fs.statSync("/tmp/dev.db").size : 0,
      cwdDbSize: fs.existsSync(cwdDb) ? fs.statSync(cwdDb).size : 0,
    };

    // Check the BUILD db directly (not /tmp)
    if (fs.existsSync(cwdDb)) {
      const buildPrisma = new PrismaClient({ datasources: { db: { url: "file:" + cwdDb } } });
      try {
        checks.buildPartnerCount = await buildPrisma.partner.count();
        checks.buildDealCount = await buildPrisma.deal.count();
      } catch (e: any) {
        checks.buildDbError = e.message;
      }
      await buildPrisma.$disconnect();
    }

    // Check the /tmp db
    if (fs.existsSync("/tmp/dev.db")) {
      const tmpPrisma = new PrismaClient({ datasources: { db: { url: "file:/tmp/dev.db" } } });
      try {
        checks.tmpPartnerCount = await tmpPrisma.partner.count();
        checks.tmpDealCount = await tmpPrisma.deal.count();
      } catch (e: any) {
        checks.tmpDbError = e.message;
      }
      await tmpPrisma.$disconnect();
    }

    return NextResponse.json(checks);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
