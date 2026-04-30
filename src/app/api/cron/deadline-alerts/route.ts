import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/sendgrid";

export const dynamic = "force-dynamic";

const PORTAL_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "https://fintella.partners";
const CALCULATOR_URL = `${PORTAL_URL}/dashboard/calculator`;

/**
 * GET /api/cron/deadline-alerts
 *
 * Vercel Cron target — runs daily at 8 AM ET (12:00 UTC).
 * Scans TariffDossier entries for CAPE filing deadlines within 14 days
 * and emails each affected partner a consolidated alert.
 *
 * Dedup: skips partners who already received a "deadline_alert" email
 * within the current calendar week (Mon-Sun, UTC).
 */
export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Find dossiers with urgent entries (0 < deadlineDays <= 14) ────────
  const dossiers = await prisma.tariffDossier.findMany({
    where: {
      partnerId: { not: null },
      entries: {
        some: {
          deadlineDays: { gt: 0, lte: 14 },
        },
      },
    },
    include: {
      partner: {
        select: {
          id: true,
          partnerCode: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      entries: {
        where: {
          deadlineDays: { gt: 0, lte: 14 },
        },
        select: {
          id: true,
          deadlineDays: true,
          isUrgent: true,
          entryNumber: true,
        },
      },
    },
  });

  if (dossiers.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      message: "No entries within 14-day deadline window",
    });
  }

  // ── Group by partner ──────────────────────────────────────────────────
  interface ClientEntry {
    clientCompany: string;
    entryCount: number;
    nearestDeadlineDays: number;
  }

  interface PartnerAlert {
    partnerCode: string;
    email: string;
    firstName: string;
    lastName: string;
    clients: ClientEntry[];
    totalEntries: number;
    nearestDeadlineDays: number;
  }

  const alertMap = new Map<string, PartnerAlert>();

  for (const d of dossiers) {
    if (!d.partner || !d.partner.email) continue;
    const code = d.partner.partnerCode;
    let alert = alertMap.get(code);
    if (!alert) {
      alert = {
        partnerCode: code,
        email: d.partner.email,
        firstName: d.partner.firstName,
        lastName: d.partner.lastName,
        clients: [],
        totalEntries: 0,
        nearestDeadlineDays: Infinity,
      };
      alertMap.set(code, alert);
    }

    const urgentEntries = d.entries;
    const nearestInDossier = Math.min(
      ...urgentEntries.map((e) => e.deadlineDays ?? Infinity)
    );

    alert.clients.push({
      clientCompany: d.clientCompany,
      entryCount: urgentEntries.length,
      nearestDeadlineDays: nearestInDossier,
    });
    alert.totalEntries += urgentEntries.length;
    if (nearestInDossier < alert.nearestDeadlineDays) {
      alert.nearestDeadlineDays = nearestInDossier;
    }
  }

  // ── Dedup: skip partners who already got a deadline_alert this week ───
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const recentAlerts = await prisma.emailLog.findMany({
    where: {
      template: "deadline_alert",
      createdAt: { gte: weekStart },
      status: { in: ["sent", "demo"] },
    },
    select: { partnerCode: true },
  });

  const alreadyAlerted = new Set(
    recentAlerts.map((r) => r.partnerCode).filter(Boolean)
  );

  // ── Send alerts ───────────────────────────────────────────────────────
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const alerts = Array.from(alertMap.values());
  for (const alert of alerts) {
    if (alreadyAlerted.has(alert.partnerCode)) {
      skipped++;
      continue;
    }

    // Sort clients by nearest deadline (most urgent first)
    alert.clients.sort((a, b) => a.nearestDeadlineDays - b.nearestDeadlineDays);

    const subject = `IEEPA Deadline Alert — ${alert.totalEntries} ${
      alert.totalEntries === 1 ? "entry" : "entries"
    } expiring within ${alert.nearestDeadlineDays} days`;

    const clientRows = alert.clients
      .map(
        (c) =>
          `• ${c.clientCompany}: ${c.entryCount} ${
            c.entryCount === 1 ? "entry" : "entries"
          }, nearest deadline in ${c.nearestDeadlineDays} days`
      )
      .join("\n");

    const clientRowsHtml = alert.clients
      .map(
        (c) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;">${escapeHtml(c.clientCompany)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${c.entryCount}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:14px;text-align:center;${
              c.nearestDeadlineDays <= 7
                ? "color:#dc2626;font-weight:600;"
                : "color:#d97706;"
            }">${c.nearestDeadlineDays} days</td>
          </tr>`
      )
      .join("\n");

    const bodyHtml = `
      <p>Hi ${escapeHtml(alert.firstName)},</p>
      <p>You have <strong>${alert.totalEntries}</strong> customs ${
        alert.totalEntries === 1 ? "entry" : "entries"
      } with IEEPA protest filing deadlines approaching. The nearest deadline is in <strong style="color:#dc2626;">${
        alert.nearestDeadlineDays
      } days</strong>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:6px;margin:16px 0;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e5e5;">Client</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e5e5;">Entries</th>
            <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e5e5;">Nearest Deadline</th>
          </tr>
        </thead>
        <tbody>
          ${clientRowsHtml}
        </tbody>
      </table>
      <p style="font-size:13px;color:#6b7280;">Entries that miss the 80-day protest window cannot be recovered. Review these entries in the Tariff Calculator now to take action before the deadline passes.</p>`;

    const bodyText = `Hi ${alert.firstName},

You have ${alert.totalEntries} customs ${
      alert.totalEntries === 1 ? "entry" : "entries"
    } with IEEPA protest filing deadlines approaching. The nearest deadline is in ${alert.nearestDeadlineDays} days.

${clientRows}

Entries that miss the 80-day protest window cannot be recovered. Review these entries in the Tariff Calculator now.

View in Calculator: ${CALCULATOR_URL}`;

    const { html, text } = emailShell({
      preheader: `${alert.totalEntries} ${
        alert.totalEntries === 1 ? "entry" : "entries"
      } expiring within ${alert.nearestDeadlineDays} days — action required`,
      heading: "IEEPA Filing Deadline Alert",
      bodyHtml,
      bodyText,
      ctaLabel: "View in Calculator",
      ctaUrl: CALCULATOR_URL,
    });

    try {
      const result = await sendEmail({
        to: alert.email,
        toName: `${alert.firstName} ${alert.lastName}`,
        subject,
        html,
        text,
        template: "deadline_alert",
        partnerCode: alert.partnerCode,
      });

      if (result.status === "sent" || result.status === "demo") {
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    failed,
    totalPartnersWithUrgentEntries: alertMap.size,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
