import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSmsTemplate } from "@/lib/ai/templateGenerator";
const rl = new Map<string, { count: number; resetAt: number }>();
function chk(uid: string, max: number) { const n = Date.now(); const e = rl.get(uid); if (!e || n > e.resetAt) { rl.set(uid, { count: 1, resetAt: n + 3600000 }); return { ok: true }; } e.count++; if (e.count > max) return { ok: false }; return { ok: true }; }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!chk(session.user.id!, 20).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const body = await req.json();
  if (!body.prompt?.trim()) return NextResponse.json({ error: "Please describe the SMS you want to create" }, { status: 400 });
  const vars = await prisma.templateVariable.findMany();
  const result = await generateSmsTemplate({ userPrompt: body.prompt, styleId: body.styleId || "", availableVariables: vars, enforceCharLimit: body.enforceCharLimit !== false, maxChars: body.maxChars || 160 });
  const saved = await prisma.smsTemplate.create({ data: { key: `ai_sms_${Date.now()}`, name: result.name, body: result.body, category: "AI Generated", status: "draft", characterCount: result.characterCount, segmentCount: result.segmentCount, styleId: body.styleId || null, generationPrompt: body.prompt, variableKeys: result.detectedVariables, workflowTags: result.suggestedWorkflowTags, aiGenerated: true } });
  return NextResponse.json({ ...result, id: saved.id });
}
