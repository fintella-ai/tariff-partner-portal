import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildUserContext,
  checkRateLimit,
  generateResponse,
  recordUsage,
  deriveConversationTitle,
  AI_CONFIG,
  type ChatMessage,
} from "@/lib/ai";

/**
 * POST /api/ai/chat
 * Body: { conversationId?: string, message: string }
 * Creates a new conversation if conversationId not provided.
 * Appends user message, generates assistant reply, persists both.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const partnerCode = (session.user as any).partnerCode as string | undefined;
  const role = (session.user as any).role as string | undefined;
  const userId = partnerCode || session.user.email || "";
  const userType: "partner" | "admin" = partnerCode ? "partner" : "admin";

  if (!userId) {
    return NextResponse.json({ error: "Could not identify user" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { conversationId, message, pinnedSpecialist } = body as {
      conversationId?: string;
      message?: string;
      pinnedSpecialist?: "tara" | "ollie";
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Message too long (max 4000 characters)" }, { status: 400 });
    }

    // Rate limit + budget check
    const rateCheck = await checkRateLimit(userId);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    // Load or create conversation
    let conversation = conversationId
      ? await prisma.aiConversation.findFirst({
          where: { id: conversationId, userId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : null;

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: {
          userId,
          userType,
          title: deriveConversationTitle(message),
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    // Save user message
    const userMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message.trim(),
      },
    });

    // Build history for the model (last 20 messages to keep context bounded)
    const priorMessages = conversation.messages.slice(-20);
    const history: ChatMessage[] = [
      ...priorMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: message.trim() },
    ];

    // Build per-user dynamic context (not cached, changes frequently)
    const userContext = await buildUserContext(userId, userType);

    // Resolve the caller's preferred generalist persona. Partners store it
    // on Partner.preferredGeneralist; admin users on User.preferredGeneralist
    // (admin UI for this lands later — for now admins always get the default).
    let personaId: "finn" | "stella" = "finn";
    if (userType === "partner") {
      const partnerPref = await prisma.partner.findUnique({
        where: { partnerCode: userId },
        select: { preferredGeneralist: true },
      });
      if (partnerPref?.preferredGeneralist === "stella") {
        personaId = "stella";
      }
    } else if (session.user.email) {
      const userPref = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { preferredGeneralist: true },
      });
      if (userPref?.preferredGeneralist === "stella") {
        personaId = "stella";
      }
    }

    // If the UI force-pinned a specialist (e.g. "Talk to Tara" / "Talk to Ollie"
    // button), use that as the initial persona instead of the generalist.
    const initialPersona: "finn" | "stella" | "tara" | "ollie" =
      pinnedSpecialist === "tara"
        ? "tara"
        : pinnedSpecialist === "ollie"
          ? "ollie"
          : personaId;

    // Call Anthropic (or mock) as the initial persona. Pass userId+userType
    // so Ollie's DB tools can scope lookups + conversationId so write tools
    // (create_support_ticket) can link the AiEscalation audit row back to
    // the conversation.
    const result = await generateResponse(userContext, history, initialPersona, {
      userId,
      userType,
      conversationId: conversation.id,
    });

    // If the generalist called hand_off, re-invoke with the target specialist.
    // The specialist sees the hand-off summary prepended as a user turn so the
    // partner doesn't have to re-explain.
    let finalResult = result;
    let finalPersonaId: "finn" | "stella" | "tara" | "ollie" = initialPersona;
    let handoffMeta:
      | {
          from: string;
          to: string;
          reason: string;
          summary: string;
          triggeredBy: "llm_tool" | "user_button";
        }
      | null = null;

    if (
      result.handOff &&
      (result.handOff.to === "tara" || result.handOff.to === "ollie")
    ) {
      finalPersonaId = result.handOff.to;
      handoffMeta = {
        from: initialPersona,
        to: result.handOff.to,
        reason: result.handOff.reason,
        summary: result.handOff.summary,
        triggeredBy: "llm_tool",
      };
      const specialistHistory: ChatMessage[] = [
        ...history,
        {
          role: "user",
          content: `[context from ${initialPersona}]: ${result.handOff.summary}`,
        },
      ];
      finalResult = await generateResponse(
        userContext,
        specialistHistory,
        finalPersonaId,
        { userId, userType, conversationId: conversation.id }
      );
    }

    // If the UI pin forced a specialist, record it as a user_button-triggered
    // handoff for telemetry even though no tool call happened server-side.
    // (personaId is always a generalist here — "finn" | "stella" — so any
    // specialist pin is by definition a handoff, no need to compare.)
    if (
      !handoffMeta &&
      (pinnedSpecialist === "tara" || pinnedSpecialist === "ollie")
    ) {
      handoffMeta = {
        from: personaId,
        to: pinnedSpecialist,
        reason: `user clicked Talk to ${pinnedSpecialist === "tara" ? "Tara" : "Ollie"}`,
        summary: "",
        triggeredBy: "user_button",
      };
    }

    // Persist assistant reply. Token counts sum across initial + specialist
    // calls if a handoff fired.
    const totalInput = result.inputTokens + (finalResult === result ? 0 : finalResult.inputTokens);
    const totalOutput = result.outputTokens + (finalResult === result ? 0 : finalResult.outputTokens);
    const totalCacheRead = result.cacheReadTokens + (finalResult === result ? 0 : finalResult.cacheReadTokens);
    const totalCacheCreate = result.cacheCreationTokens + (finalResult === result ? 0 : finalResult.cacheCreationTokens);

    // Merge tool-call traces across initial + specialist calls. When the
    // generalist hands off to Ollie and Ollie then runs lookups, we want the
    // full chain on the persisted message so the UI can render chips for
    // every tool that fired.
    const mergedToolCalls = [
      ...(result.toolCalls ?? []),
      ...(finalResult !== result ? finalResult.toolCalls ?? [] : []),
    ];

    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: finalResult.content,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cachedTokens: totalCacheRead,
        cacheReadTokens: totalCacheRead,
        cacheCreationTokens: totalCacheCreate,
        speakerPersona: finalPersonaId,
        handoffMetadata: handoffMeta ?? undefined,
        // Prisma Json columns require a plain JSON-serializable input; our
        // TS interface has optional fields that don't satisfy InputJsonObject
        // structurally. Cast — runtime shape is already JSON-safe.
        toolCalls: mergedToolCalls.length > 0
          ? (mergedToolCalls as unknown as object[])
          : undefined,
      },
    });

    // Bump conversation timestamp
    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Record usage (rate limit + budget tracking) — uses summed totals
    // so hand-off turns correctly count both the initial and specialist LLM calls.
    if (!finalResult.mocked) {
      await recordUsage(
        userId,
        totalInput,
        totalOutput,
        totalCacheRead,
        totalCacheCreate
      );
    }

    return NextResponse.json({
      conversationId: conversation.id,
      userMessage: {
        id: userMessage.id,
        role: "user",
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
        speakerPersona: assistantMessage.speakerPersona,
        handoffMetadata: assistantMessage.handoffMetadata,
        toolCalls: assistantMessage.toolCalls,
      },
      mocked: finalResult.mocked,
      persona: finalPersonaId,
    });
  } catch (err: any) {
    console.error("[api/ai/chat] error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate response" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/chat
 * Returns AI config status (for UI to know if it's live or mocked)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    enabled: AI_CONFIG.enabled,
    model: AI_CONFIG.model,
    dailyMessageLimit: AI_CONFIG.dailyMessageLimit,
  });
}
