import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: "admin@trln.com" } });
  if (existing) {
    console.log("Admin user already exists:", existing.email);
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: "admin@trln.com",
      passwordHash: hashSync("admin123", 10),
      name: "Admin User",
      role: "super_admin",
    },
  });
  console.log("Created admin user:", user.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
