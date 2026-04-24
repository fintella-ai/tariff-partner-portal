/**
 * IT emergency call chain for PartnerOS (spec §5.9).
 *
 * Fires when Ollie classifies a portal symptom as a confirmed bug
 * (coming in Phase 3d). Also reachable via the `/api/admin/emergency-test`
 * route so super admin can dry-run the chain.
 *
 * What fires (in order, fire-and-forget):
 *   1. Twilio outbound call to every `isITEmergencyContact=true` admin's
 *      `personalCellPhone` — NOT WIRED in v1 (payload documents the intent
 *      so we can swap in the actual POST to Twilio later).
 *   2. SendGrid email from `support@` to `admin@fintella.partners` with
 *      the full triage payload + partner context.
 *   3. In-portal Notification rows to every IT-emergency contact.
 *   4. AdminChatThread post to the global internal thread so the whole
 *      admin team sees the alert in real time.
 *
 * All steps are independent — a single-step failure doesn't block the
 * others. Returns a summary of what fired so the caller (Ollie or the
 * test route) can surface the status.
 */
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendgrid";
import { FIRM_SHORT } from "@/lib/constants";
import { outboundEmergencyDial } from "@/lib/twilio-voice";

export interface EmergencyTrigger {
  /** Short human-readable reason — "Portal Submit Client button 500s" */
  reason: string;
  /** Longer body — Ollie's interview summary, error messages, classification */
  details: string;
  /** Partner who reported the symptom */
  partnerCode: string;
  /** Optional conversation linking for AiEscalation audit */
  conversationId?: string;
  /** Marks this as a dry run so the UI can distinguish real from test */
  isTest?: boolean;
}

export interface EmergencyFanOutResult {
  contactCount: number;
  contacts: { email: string; name: string | null; hasPhone: boolean }[];
  emailStatus: "sent" | "demo" | "failed" | "skipped";
  notificationsCreated: number;
  workspacePosted: boolean;
  /** Summary of the outbound Twilio dial leg — one entry per paged contact
   *  that had a personalCellPhone. Empty when no contacts had phones. */
  twilioDials: {
    email: string;
    status: "initiated" | "demo" | "failed";
    callSid: string | null;
    error?: string;
  }[];
  escalationId: string | null;
}

const SUPPORT_FROM_EMAIL =
  process.env.SUPPORT_FROM_EMAIL || "support@fintella.partners";
const ADMIN_INBOX_EMAIL = "admin@fintella.partners";

export async function emergencyCallSuperAdmin(
  trigger: EmergencyTrigger
): Promise<EmergencyFanOutResult> {
  // 1. Find the humans.
  const contacts = await prisma.user.findMany({
    where: { isITEmergencyContact: true },
    select: {
      id: true,
      email: true,
      name: true,
      personalCellPhone: true,
    },
  });

  const result: EmergencyFanOutResult = {
    contactCount: contacts.length,
    contacts: contacts.map((c) => ({
      email: c.email,
      name: c.name,
      hasPhone: !!c.personalCellPhone,
    })),
    emailStatus: "skipped",
    notificationsCreated: 0,
    workspacePosted: false,
    twilioDials: [],
    escalationId: null,
  };

  if (contacts.length === 0) {
    // Nobody's designated — still record the escalation so ops can see the
    // gap, but skip the fan-out steps.
    if (trigger.conversationId) {
      const esc = await prisma.aiEscalation.create({
        data: {
          conversationId: trigger.conversationId,
          rung: "support_ticket",
          status: "failed",
          partnerCode: trigger.partnerCode,
          category: "tech_error",
          priority: "urgent",
          reason: `[IT EMERGENCY skipped — no contacts] ${trigger.reason}`,
          payload: {
            reason: trigger.reason,
            details: trigger.details,
            isTest: trigger.isTest ?? false,
            fanOutSkipped: "no_isITEmergencyContact_users",
          },
          emergencyCalled: false,
        },
        select: { id: true },
      });
      result.escalationId = esc.id;
    }
    return result;
  }

  // 2. AiEscalation audit row.
  if (trigger.conversationId) {
    const esc = await prisma.aiEscalation.create({
      data: {
        conversationId: trigger.conversationId,
        rung: "support_ticket",
        status: "initiated",
        partnerCode: trigger.partnerCode,
        category: "tech_error",
        priority: "urgent",
        reason: trigger.reason,
        emergencyCalled: true,
        payload: {
          reason: trigger.reason,
          details: trigger.details,
          isTest: trigger.isTest ?? false,
          contactCount: contacts.length,
          contactsWithPhone: contacts.filter((c) => !!c.personalCellPhone).length,
        },
      },
      select: { id: true },
    });
    result.escalationId = esc.id;
  }

  // 3. Email to admin@ inbox.
  try {
    const subject = `${trigger.isTest ? "[TEST] " : ""}🚨 IT emergency from Ollie — ${trigger.reason.slice(0, 80)}`;
    const bodyText = [
      trigger.isTest
        ? `This is a TEST fire of the IT emergency chain. No actual partner is affected.`
        : `Ollie has classified a partner report as a confirmed portal bug.`,
      "",
      `Reason: ${trigger.reason}`,
      `Reporting partner: ${trigger.partnerCode}`,
      "",
      "Details:",
      trigger.details,
      "",
      `Contacts paged: ${contacts.length}`,
      contacts.map((c) => `  - ${c.name || c.email}${c.personalCellPhone ? " ☎" : ""}`).join("\n"),
    ].join("\n");
    const bodyHtml = `
      <p>${trigger.isTest ? "<strong>[TEST]</strong> " : ""}${trigger.isTest ? "This is a test fire of the IT emergency chain. No actual partner is affected." : "Ollie has classified a partner report as a confirmed portal bug."}</p>
      <p><strong>Reason:</strong> ${escapeHtml(trigger.reason)}</p>
      <p><strong>Reporting partner:</strong> ${escapeHtml(trigger.partnerCode)}</p>
      <p><strong>Details:</strong></p>
      <blockquote style="border-left:3px solid #c4a050;margin:0;padding:8px 16px;color:#444;">${escapeHtml(trigger.details).replace(/\n/g, "<br>")}</blockquote>
      <p><strong>Contacts paged (${contacts.length}):</strong></p>
      <ul>${contacts.map((c) => `<li>${escapeHtml(c.name || c.email)}${c.personalCellPhone ? " ☎" : ""}</li>`).join("")}</ul>
    `;
    const res = await sendEmail({
      to: ADMIN_INBOX_EMAIL,
      subject,
      text: bodyText,
      html: bodyHtml,
      template: "it_emergency_alert",
      fromEmail: SUPPORT_FROM_EMAIL,
      fromName: `${FIRM_SHORT} IT Emergency`,
    });
    result.emailStatus = res.status;
  } catch (e) {
    console.error("[emergency-call] email failed:", e);
    result.emailStatus = "failed";
  }

  // 4. Notifications to each IT contact.
  const notifTitle = trigger.isTest
    ? "🔴 [TEST] IT emergency from Ollie"
    : "🔴 IT EMERGENCY from Ollie";
  const notifMessage = trigger.reason.slice(0, 160);
  const created = await Promise.all(
    contacts.map((c) =>
      prisma.notification
        .create({
          data: {
            recipientType: "admin",
            recipientId: c.email,
            type: "ai_it_emergency",
            title: notifTitle,
            message: notifMessage,
            link: `/admin/support`,
          },
        })
        .then(() => 1)
        .catch(() => 0)
    )
  );
  result.notificationsCreated = created.reduce((a, b) => a + b, 0);

  // 5. AdminChatThread post (global thread, visible to all admins).
  try {
    const globalThread = await prisma.adminChatThread.findFirst({
      where: { type: "global" },
      select: { id: true },
    });
    if (globalThread) {
      await prisma.adminChatMessage.create({
        data: {
          threadId: globalThread.id,
          senderEmail: SUPPORT_FROM_EMAIL,
          senderName: `${FIRM_SHORT} Ollie`,
          content: `${trigger.isTest ? "[TEST] " : ""}🔴 IT emergency — ${trigger.reason}\n\n${trigger.details}\n\nPaged ${contacts.length} contact(s). Check admin@ inbox for the full email.`,
        },
      });
      result.workspacePosted = true;
    }
  } catch (e) {
    console.error("[emergency-call] workspace post failed:", e);
  }

  // 6. Twilio outbound voice — dial every contact with a personalCellPhone.
  //    Each leg is independent; a single-contact failure is logged + returned
  //    in the summary but doesn't block the rest of the fan-out.
  const phoneContacts = contacts.filter((c) => !!c.personalCellPhone);
  if (phoneContacts.length > 0) {
    const reasonForTTS = trigger.isTest
      ? `Test. ${trigger.reason}`
      : trigger.reason;
    const dialResults = await Promise.all(
      phoneContacts.map(async (c) => {
        try {
          const r = await outboundEmergencyDial({
            to: c.personalCellPhone!,
            reason: reasonForTTS,
            isTest: trigger.isTest ?? false,
          });
          return {
            email: c.email,
            status: r.status,
            callSid: r.callSid,
            error: r.error,
          };
        } catch (e: any) {
          return {
            email: c.email,
            status: "failed" as const,
            callSid: null,
            error: e?.message || String(e),
          };
        }
      })
    );
    result.twilioDials = dialResults;
  }

  return result;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
