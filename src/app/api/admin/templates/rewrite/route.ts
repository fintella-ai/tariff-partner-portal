import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rewriteWithStyle } from "@/lib/ai/templateGenerator";
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["super_admin", "admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { templateId, type, styleId } = await req.json();
  if (!templateId || !type || !styleId) return NextResponse.json({ error: "templateId, type, styleId required" }, { status: 400 });
  const orig: any = type === "email" ? await prisma.emailTemplate.findUnique({ where: { id: templateId } }) : await prisma.smsTemplate.findUnique({ where: { id: templateId } });
  if (!orig) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const content = type === "email" ? orig.bodyHtml : orig.body;
  const result = await rewriteWithStyle({ content, type, styleId, preserveVariables: true });
  const v = (orig.version || 1) + 1;
  let saved: any;
  if (type === "email") saved = await prisma.emailTemplate.create({ data: { key: `${orig.key}_v${v}`, name: orig.name, subject: orig.subject, heading: orig.heading, bodyHtml: result.rewritten, bodyText: orig.bodyText, category: orig.category, status: "draft", styleId, variableKeys: orig.variableKeys || [], workflowTags: orig.workflowTags || [], version: v, parentId: orig.id, aiGenerated: true, generationPrompt: `Rewrite v${v}` } });
  else saved = await prisma.smsTemplate.create({ data: { key: `${orig.key}_v${v}`, name: orig.name, body: result.rewritten, category: orig.category, status: "draft", characterCount: result.rewritten.length, segmentCount: result.rewritten.length <= 160 ? 1 : Math.ceil(result.rewritten.length / 153), styleId, variableKeys: orig.variableKeys || [], workflowTags: orig.workflowTags || [], aiGenerated: true, generationPrompt: `Rewrite v${v}` } });
  return NextResponse.json({ id: saved.id, original: content, rewritten: result.rewritten, changesSummary: result.changesSummary, originalVersion: orig.version || 1, newVersion: v });
}
