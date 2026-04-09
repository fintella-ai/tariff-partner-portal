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
        // Try multiple possible locations for the DB file
        const candidates = [
          path.join(process.cwd(), "prisma", "dev.db"),
          path.join(__dirname, "..", "..", "prisma", "dev.db"),
          path.join(__dirname, "..", "..", "..", "prisma", "dev.db"),
          "/var/task/prisma/dev.db",
          "/var/task/.next/server/prisma/dev.db",
        ];
        for (const src of candidates) {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, tmpDb);
            console.log("[prisma] Copied DB from:", src);
            break;
          }
        }
        // If no DB found, create empty one via prisma push at runtime
        if (!fs.existsSync(tmpDb)) {
          console.log("[prisma] No DB found to copy, will create fresh");
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
