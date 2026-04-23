import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/admin/conference/[id]
 * Update a conference schedule entry.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.embedUrl !== undefined) data.embedUrl = body.embedUrl || null;
    if (body.joinUrl !== undefined) data.joinUrl = body.joinUrl || null;
    if (body.recordingUrl !== undefined) data.recordingUrl = body.recordingUrl || null;
    if (body.schedule !== undefined) data.schedule = body.schedule || null;
    if (body.nextCall !== undefined) data.nextCall = body.nextCall ? new Date(body.nextCall) : null;
    if (body.hostName !== undefined) data.hostName = body.hostName || null;
    if (body.duration !== undefined) data.duration = body.duration || null;
    if (body.weekNumber !== undefined) data.weekNumber = body.weekNumber ? parseInt(body.weekNumber, 10) : null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const entry = await prisma.conferenceSchedule.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ entry });
  } catch {
    return NextResponse.json(
      { error: "Failed to update conference entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/conference/[id]
 * Delete a conference schedule entry.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.conferenceSchedule.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // Surface the real Prisma error so the admin gets actionable feedback
    // instead of a silent reappearance of the row. Logged to stderr too.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[conference DELETE]", params.id, message);
    return NextResponse.json(
      { error: `Failed to delete conference entry: ${message}` },
      { status: 500 }
    );
  }
}
