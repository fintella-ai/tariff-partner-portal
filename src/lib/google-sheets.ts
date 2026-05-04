const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";

interface PartnerRow {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  commissionRate: string;
}

export async function appendPartnerRow(data: PartnerRow): Promise<void> {
  if (!SHEETS_WEBHOOK_URL) {
    console.log("[google-sheets] demo — GOOGLE_SHEETS_WEBHOOK_URL not set");
    return;
  }
  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [data] }),
    });
  } catch (err) {
    console.error("[google-sheets] append failed:", err);
  }
}

export async function syncAllPartners(): Promise<number> {
  if (!SHEETS_WEBHOOK_URL) {
    console.log("[google-sheets] demo — GOOGLE_SHEETS_WEBHOOK_URL not set");
    return 0;
  }
  const { prisma } = await import("@/lib/prisma");
  const partners = await prisma.partner.findMany({
    select: {
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
      commissionRate: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: PartnerRow[] = partners.map((p) => ({
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    createdAt: p.createdAt.toISOString().split("T")[0],
    commissionRate: `${Math.round((p.commissionRate ?? 0.2) * 100)}%`,
  }));

  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json().catch(() => ({}));
    return data.count || rows.length;
  } catch (err) {
    console.error("[google-sheets] sync failed:", err);
    return 0;
  }
}
