import { PrismaClient } from "@prisma/client";

// On Vercel, the filesystem is read-only except /tmp.
// Copy the DB to /tmp on first access so SQLite can write to it.
function initVercelDb() {
  if (typeof process !== "undefined" && process.env.VERCEL && typeof require !== "undefined") {
    try {
      const fs = require("fs");
      const path = require("path");
      const tmpDb = "/tmp/dev.db";
      if (!fs.existsSync(tmpDb)) {
        const src = path.join(process.cwd(), "prisma", "dev.db");
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, tmpDb);
        }
      }
    } catch {
      // Edge Runtime — fs not available, skip
    }
  }
}

initVercelDb();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources:
      typeof process !== "undefined" && process.env.VERCEL
        ? { db: { url: "file:/tmp/dev.db" } }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
