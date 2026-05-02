import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateEmailTemplate } from "@/lib/ai/templateGenerator";
const rl = new Map<string, { count: number; resetAt: number }>();
function chk(uid: string, max: number) { const n = Date.now(); const e = rl.get(uid); if (!e || n > e.resetAt) { rl.set(uid, { count: 1, resetAt: n + 3600000 }); return { ok: true }; } e.count++; if (e.count > max) return { ok: false }; return { ok: true }; }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!chk(session.user.id!, 10).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  const body = await req.json();
  if (!body.prompt?.trim()) return NextResponse.json({ error: "Please describe the email you want to create" }, { status: 400 });
  const vars = await prisma.templateVariable.findMany();
  let existing: string | undefined;
  if (body.existingTemplateId) { const ex = await prisma.emailTemplate.findUnique({ where: { id: body.existingTemplateId } }); if (ex) existing = ex.bodyHtml; }
  const result = await generateEmailTemplate({ userPrompt: body.prompt, styleId: body.styleId || "", availableVariables: vars, workflowContext: body.workflowContext, existingTemplate: existing });
  const saved = await prisma.emailTemplate.create({ data: { key: `ai_${Date.now()}`, name: result.name, subject: result.subject, heading: result.name, bodyHtml: result.bodyHtml, bodyText: result.bodyText, category: "AI Generated", status: "draft", styleId: body.styleId || null, generationPrompt: body.prompt, variableKeys: result.detectedVariables, workflowTags: result.suggestedWorkflowTags, aiGenerated: true } });
  return NextResponse.json({ ...result, id: saved.id });
}
