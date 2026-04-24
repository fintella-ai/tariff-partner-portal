import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOnlineAdmins } from "@/lib/admin-online";

/**
 * GET /api/admin/ai-activity
 *
 * Aggregates observability data for Ollie's live behavior — tool calls,
 * escalations, inbox routing, admin presence. Feeds /admin/ai-activity
 * so John can see what the AI is doing without tailing logs.
 *
 * Read-only across the board. All 4 admin roles can view (visibility
 * helps accounting / partner_support understand what Ollie has routed
 * their way).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin", "accounting", "partner_support"].includes(role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      escalationsByRung,
      escalationsByInbox,
      escalationsByPriority,
      recentEscalations,
      messagesWithToolCalls,
      onlineAdmins,
      inboxes,
    ] = await Promise.all([
      // Escalation counts by rung — last 7d
      prisma.aiEscalation.groupBy({
        by: ["rung"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      // Escalation counts by inbox — last 7d
      prisma.aiEscalation.groupBy({
        by: ["targetInboxId"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      // Escalation counts by priority — last 7d
      prisma.aiEscalation.groupBy({
        by: ["priority"],
        where: { createdAt: { gte: sevenDaysAgo } },
        _count: { _all: true },
      }),
      // 25 most-recent escalations
      prisma.aiEscalation.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          conversationId: true,
          rung: true,
          status: true,
          targetInboxId: true,
          partnerCode: true,
          category: true,
          priority: true,
          reason: true,
          payload: true,
          createdAt: true,
        },
      }),
      // Recent AiMessages carrying toolCalls. Pull the raw rows; we'll
      // aggregate tool-call counts client-free (below) so the wire shape is
      // small + fixed.
      prisma.aiMessage.findMany({
        where: {
          toolCalls: { not: undefined },
          createdAt: { gte: sevenDaysAgo },
          role: "assistant",
        },
        select: {
          id: true,
          speakerPersona: true,
          toolCalls: true,
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheCreationTokens: true,
          createdAt: true,
        },
        take: 500,
      }),
      getOnlineAdmins(now),
      prisma.adminInbox.findMany({
        select: {
          id: true,
          role: true,
          displayName: true,
          emailAddress: true,
          assignedAdminIds: true,
        },
      }),
    ]);

    // Aggregate tool-call totals from the AiMessage.toolCalls blob.
    // Each row's `toolCalls` is an array of { name, input, output, isError }.
    const toolCallTotals: Record<string, { count: number; errors: number }> = {};
    let totalToolCalls = 0;
    let messagesWithTools = 0;
    // Prompt-cache metrics — aggregated over the same message set.
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    for (const m of messagesWithToolCalls) {
      const calls = Array.isArray(m.toolCalls)
        ? (m.toolCalls as Array<{ name?: string; isError?: boolean }>)
        : [];
      if (calls.length > 0) messagesWithTools += 1;
      for (const c of calls) {
        totalToolCalls += 1;
        const name = typeof c?.name === "string" ? c.name : "unknown";
        if (!toolCallTotals[name]) toolCallTotals[name] = { count: 0, errors: 0 };
        toolCallTotals[name].count += 1;
        if (c?.isError) toolCallTotals[name].errors += 1;
      }
      totalInputTokens += m.inputTokens ?? 0;
      totalOutputTokens += m.outputTokens ?? 0;
      totalCacheReadTokens += m.cacheReadTokens ?? 0;
      totalCacheCreationTokens += m.cacheCreationTokens ?? 0;
    }
    const avgToolsPerMessage =
      messagesWithTools > 0
        ? Number((totalToolCalls / messagesWithTools).toFixed(2))
        : 0;

    // Cache hit rate = cacheReadTokens / (cacheReadTokens + cacheCreationTokens)
    // High hit rate = cache is warm (cheap). Low = we're burning cache writes.
    const cacheTokenTotal = totalCacheReadTokens + totalCacheCreationTokens;
    const cacheHitRate =
      cacheTokenTotal > 0
        ? +(totalCacheReadTokens / cacheTokenTotal).toFixed(3)
        : 0;
    // Approximate USD cost at Sonnet 4.6 pricing (input $3/MTok, output
    // $15/MTok, cache read $0.30/MTok, cache write $3.75/MTok).
    const costUsd = +(
      (totalInputTokens * 3 +
        totalOutputTokens * 15 +
        totalCacheReadTokens * 0.3 +
        totalCacheCreationTokens * 3.75) /
      1_000_000
    ).toFixed(2);

    // Resolve inbox display names for the by-inbox stats + recents.
    const inboxById = new Map(inboxes.map((i) => [i.id, i]));

    return NextResponse.json({
      windowDays: 7,
      generatedAt: now.toISOString(),
      stats: {
        escalations: {
          byRung: escalationsByRung.map((r) => ({
            rung: r.rung,
            count: r._count._all,
          })),
          byInbox: escalationsByInbox.map((r) => ({
            inboxId: r.targetInboxId,
            inboxRole: r.targetInboxId
              ? inboxById.get(r.targetInboxId)?.role ?? "unknown"
              : "unrouted",
            inboxDisplayName: r.targetInboxId
              ? inboxById.get(r.targetInboxId)?.displayName ?? "Unknown"
              : "(unrouted)",
            count: r._count._all,
          })),
          byPriority: escalationsByPriority.map((r) => ({
            priority: r.priority,
            count: r._count._all,
          })),
        },
        cache: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          hitRate: cacheHitRate,
          costUsd,
        },
        toolCalls: {
          total: totalToolCalls,
          messagesWithTools,
          avgPerMessage: avgToolsPerMessage,
          byName: Object.entries(toolCallTotals)
            .map(([name, v]) => ({
              name,
              count: v.count,
              errors: v.errors,
              errorRate: v.count > 0 ? +(v.errors / v.count).toFixed(3) : 0,
            }))
            .sort((a, b) => b.count - a.count),
        },
      },
      onlineAdmins: onlineAdmins.map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        role: a.role,
        lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
        availableForLiveChat: a.availableForLiveChat,
        availableForLiveCall: a.availableForLiveCall,
      })),
      inboxes: inboxes.map((i) => ({
        id: i.id,
        role: i.role,
        displayName: i.displayName,
        emailAddress: i.emailAddress,
        assignedCount: i.assignedAdminIds.length,
      })),
      recentEscalations: recentEscalations.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        rung: e.rung,
        status: e.status,
        partnerCode: e.partnerCode,
        category: e.category,
        priority: e.priority,
        reason: e.reason,
        inboxRole: e.targetInboxId
          ? inboxById.get(e.targetInboxId)?.role ?? null
          : null,
        inboxDisplayName: e.targetInboxId
          ? inboxById.get(e.targetInboxId)?.displayName ?? null
          : null,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    console.error("[api/admin/ai-activity]", err?.message || err);
    return NextResponse.json(
      { error: "Failed to aggregate AI activity" },
      { status: 500 }
    );
  }
}
