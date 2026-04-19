// scripts/ensure-global-admin-chat-thread.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.adminChatThread.findFirst({
    where: { type: "global" },
  });
  if (existing) {
    console.log(`[ensure-global-admin-chat-thread] already exists: ${existing.id}`);
    return;
  }
  const t = await prisma.adminChatThread.create({
    data: { type: "global" },
  });
  console.log(`[ensure-global-admin-chat-thread] created: ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
