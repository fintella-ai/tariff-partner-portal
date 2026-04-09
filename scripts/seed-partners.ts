import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const partners = [
    { id: "p-john", partnerCode: "PTNJRO001", email: "john@orlando.com", firstName: "John", lastName: "Orlando", phone: "(410) 555-0101", status: "active", referredByPartnerCode: null, notes: "Founding partner. High performer." },
    { id: "p-sarah", partnerCode: "PTNSC8K2F", email: "s.chen@cpagroup.com", firstName: "Sarah", lastName: "Chen", phone: "(212) 555-0202", status: "active", referredByPartnerCode: "PTNJRO001" },
    { id: "p-mike", partnerCode: "PTNMT3X7Q", email: "m.torres@advisors.com", firstName: "Mike", lastName: "Torres", phone: "(305) 555-0303", status: "active", referredByPartnerCode: "PTNJRO001" },
    { id: "p-lisa", partnerCode: "PTNLP9W4R", email: "l.park@tradelaw.com", firstName: "Lisa", lastName: "Park", phone: "(415) 555-0404", status: "pending", referredByPartnerCode: "PTNJRO001" },
    { id: "p-david", partnerCode: "PTNDK5M8J", email: "d.kim@imports.co", firstName: "David", lastName: "Kim", phone: "(713) 555-0505", status: "active", referredByPartnerCode: "PTNSC8K2F" },
    { id: "p-rachel", partnerCode: "PTNRW2N6T", email: "r.wong@consulting.com", firstName: "Rachel", lastName: "Wong", phone: "(206) 555-0606", status: "active", referredByPartnerCode: "PTNSC8K2F", l1Rate: 0.25 },
    { id: "p-james", partnerCode: "PTNJH7P3V", email: "j.harris@law.com", firstName: "James", lastName: "Harris", phone: null, status: "inactive", referredByPartnerCode: "PTNMT3X7Q", notes: "Paused activity — personal leave." },
  ];

  for (const p of partners) {
    const result = await prisma.partner.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        partnerCode: p.partnerCode,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone || null,
        status: p.status,
        referredByPartnerCode: p.referredByPartnerCode || null,
        l1Rate: (p as any).l1Rate || null,
        notes: p.notes || null,
      },
    });
    console.log(`Upserted: ${result.partnerCode} — ${result.firstName} ${result.lastName}`);
  }

  console.log(`\nSeed complete: ${partners.length} partners.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
