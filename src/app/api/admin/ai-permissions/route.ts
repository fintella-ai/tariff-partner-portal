import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit-log";
import { NextResponse } from "next/server";

const VALID_PERSONAS = ["finn", "stella", "tara", "ollie"] as const;
const ALL_TOOLS = [
  "lookupDeal",
  "lookupCommissions",
  "lookupAgreement",
  "lookupDownline",
  "create_support_ticket",
  "start_live_chat",
  "offer_schedule_slots",
  "book_slot",
  "investigate_bug",
  "initiate_live_transfer",
  "hand_off",
] as const;

const DEFAULTS: Record<string, { tools: string[]; maxMsg: number; maxSpend: number }> = {
  finn: { tools: ["lookupDeal", "lookupCommissions", "lookupAgreement", "lookupDownline", "create_support_ticket", "start_live_chat", "offer_schedule_slots", "book_slot", "hand_off"], maxMsg: 50, maxSpend: 5.0 },
  stella: { tools: ["lookupDeal", "lookupCommissions", "lookupAgreement", "lookupDownline", "create_support_ticket", "start_live_chat", "offer_schedule_slots", "book_slot", "hand_off"], maxMsg: 50, maxSpend: 5.0 },
  tara: { tools: ["lookupDeal", "lookupCommissions", "lookupAgreement", "lookupDownline", "create_support_ticket", "start_live_chat", "offer_schedule_slots", "book_slot"], maxMsg: 50, maxSpend: 5.0 },
  ollie: { tools: ["lookupDeal", "lookupCommissions", "lookupAgreement", "lookupDownline", "create_support_ticket", "start_live_chat", "offer_schedule_slots", "book_slot", "investigate_bug", "initiate_live_transfer"], maxMsg: 50, maxSpend: 5.0 },
};

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configs = await prisma.aiPersonaConfig.findMany({ orderBy: { personaId: "asc" } });

  const result = VALID_PERSONAS.map((pid) => {
    const existing = configs.find((c) => c.personaId === pid);
    if (existing) return existing;
    const d = DEFAULTS[pid];
    return {
      id: null,
      personaId: pid,
      enabledTools: d.tools,
      maxDailyMessages: d.maxMsg,
      maxDailySpend: d.maxSpend,
      systemPromptOverride: null,
      isActive: true,
      updatedAt: null,
      updatedBy: null,
    };
  });

  return NextResponse.json({ configs: result, allTools: ALL_TOOLS });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Only super_admin can modify AI permissions" }, { status: 403 });
  }

  const body = await req.json();
  const { personaId, enabledTools, maxDailyMessages, maxDailySpend, systemPromptOverride, isActive } = body;

  if (!VALID_PERSONAS.includes(personaId)) {
    return NextResponse.json({ error: "Invalid persona" }, { status: 400 });
  }

  const validTools = (enabledTools as string[]).filter((t) => (ALL_TOOLS as readonly string[]).includes(t));

  // Snapshot current config before update (for diff)
  const before = await prisma.aiPersonaConfig.findUnique({ where: { personaId } });

  const config = await prisma.aiPersonaConfig.upsert({
    where: { personaId },
    create: {
      personaId,
      enabledTools: validTools,
      maxDailyMessages: maxDailyMessages ?? 50,
      maxDailySpend: maxDailySpend ?? 5.0,
      systemPromptOverride: systemPromptOverride || null,
      isActive: isActive ?? true,
      updatedBy: (session.user as any).id ?? session.user.email ?? null,
    },
    update: {
      enabledTools: validTools,
      maxDailyMessages: maxDailyMessages ?? 50,
      maxDailySpend: maxDailySpend ?? 5.0,
      systemPromptOverride: systemPromptOverride || null,
      isActive: isActive ?? true,
      updatedBy: (session.user as any).id ?? session.user.email ?? null,
    },
  });

  // Compute diff and audit log
  const beforeSnapshot = before
    ? {
        enabledTools: (before.enabledTools as string[]).sort().join(","),
        maxDailyMessages: before.maxDailyMessages,
        maxDailySpend: before.maxDailySpend,
        systemPromptOverride: before.systemPromptOverride ?? null,
        isActive: before.isActive,
      }
    : { enabledTools: "", maxDailyMessages: null, maxDailySpend: null, systemPromptOverride: null, isActive: null };

  const afterSnapshot = {
    enabledTools: validTools.sort().join(","),
    maxDailyMessages: config.maxDailyMessages,
    maxDailySpend: config.maxDailySpend,
    systemPromptOverride: config.systemPromptOverride ?? null,
    isActive: config.isActive,
  };

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(afterSnapshot) as (keyof typeof afterSnapshot)[]) {
    const oldVal = beforeSnapshot[key];
    const newVal = afterSnapshot[key];
    if (String(oldVal) !== String(newVal)) {
      // For enabledTools show the arrays, not the joined strings
      if (key === "enabledTools") {
        changes[key] = {
          old: before ? (before.enabledTools as string[]) : [],
          new: validTools,
        };
      } else {
        changes[key] = { old: oldVal, new: newVal };
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    logAudit({
      action: "ai_permissions.update",
      actorEmail: session.user.email ?? "unknown",
      actorRole: role,
      actorId: (session.user as any).id ?? undefined,
      targetType: "AiPersonaConfig",
      targetId: personaId,
      details: { changes, personaId, isNew: !before },
    });
  }

  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "super_admin") {
    return NextResponse.json({ error: "Only super_admin can reset AI permissions" }, { status: 403 });
  }

  const body = await req.json();
  if (body.action === "reset") {
    // Snapshot current configs before deletion for audit
    const beforeConfigs = await prisma.aiPersonaConfig.findMany();
    await prisma.aiPersonaConfig.deleteMany({});

    logAudit({
      action: "ai_permissions.reset",
      actorEmail: session.user.email ?? "unknown",
      actorRole: role,
      actorId: (session.user as any).id ?? undefined,
      targetType: "AiPersonaConfig",
      targetId: "all",
      details: {
        resetAll: true,
        deletedCount: beforeConfigs.length,
        deletedPersonas: beforeConfigs.map((c) => c.personaId),
      },
    });

    return NextResponse.json({ message: "All persona configs reset to defaults" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
