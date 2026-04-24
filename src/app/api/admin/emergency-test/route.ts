import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { emergencyCallSuperAdmin } from "@/lib/emergency-call";

/**
 * POST /api/admin/emergency-test
 *
 * Super-admin-only dry-run of the IT emergency call chain. Fires the same
 * fan-out as a real Ollie-classified confirmed_bug, but:
 *   - Email subject + body prefixed with [TEST]
 *   - Notifications prefixed with [TEST]
 *   - AdminChatMessage prefixed with [TEST]
 *   - AiEscalation payload carries `isTest: true`
 *
 * Lets admins verify that their `isITEmergencyContact=true` assignment +
 * `personalCellPhone` + email routing all work before a real incident.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json(
      { error: "Only super_admin can fire a test emergency." },
      { status: 403 }
    );
  }

  const result = await emergencyCallSuperAdmin({
    reason: "IT emergency chain test (admin-triggered)",
    details: `Test fired by ${session.user.email} at ${new Date().toISOString()}. Verifying IT-emergency contact fan-out, email routing, notifications, and workspace post.`,
    partnerCode: "TEST-PARTNER",
    isTest: true,
    // No conversationId — this isn't tied to an Ollie conversation.
  });

  return NextResponse.json({ result });
}
