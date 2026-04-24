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
    const { conversationId, message } = body as { conversationId?: string; message?: string };

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

    // Call Anthropic (or mock)
    const result = await generateResponse(userContext, history, personaId);

    // Persist assistant reply. We now record cache reads and cache writes
    // as two separate token counts so daily-usage cost math can price them
    // at their distinct rates (~$0.30/MTok vs ~$3.75/MTok on Sonnet 4.6).
    // `cachedTokens` is kept in sync with `cacheReadTokens` for back-compat
    // with any historical admin views that still read the old column.
    const assistantMessage = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedTokens: result.cacheReadTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheCreationTokens: result.cacheCreationTokens,
        speakerPersona: personaId,
      },
    });

    // Bump conversation timestamp
    await prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Record usage (rate limit + budget tracking)
    if (!result.mocked) {
      await recordUsage(
        userId,
        result.inputTokens,
        result.outputTokens,
        result.cacheReadTokens,
        result.cacheCreationTokens
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
      },
      mocked: result.mocked,
      persona: personaId,
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
