import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const fs = require("fs");
    const path = require("path");

    const checks = {
      cwd: process.cwd(),
      vercel: !!process.env.VERCEL,
      tmpDbExists: fs.existsSync("/tmp/dev.db"),
      cwdDbExists: fs.existsSync(path.join(process.cwd(), "prisma", "dev.db")),
      varTaskDbExists: fs.existsSync("/var/task/prisma/dev.db"),
      tmpDbSize: fs.existsSync("/tmp/dev.db") ? fs.statSync("/tmp/dev.db").size : 0,
      cwdDbSize: fs.existsSync(path.join(process.cwd(), "prisma", "dev.db")) ? fs.statSync(path.join(process.cwd(), "prisma", "dev.db")).size : 0,
    };

    let partnerCount = 0;
    let dealCount = 0;
    try {
      partnerCount = await prisma.partner.count();
      dealCount = await prisma.deal.count();
    } catch (e: any) {
      return NextResponse.json({ ...checks, dbError: e.message });
    }

    return NextResponse.json({ ...checks, partnerCount, dealCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
