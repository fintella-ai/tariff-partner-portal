import OpenAI from "openai";
const MODEL = process.env.OPENAI_TEMPLATE_MODEL || "gpt-4o";
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI { if (!_openai) { if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set"); _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); } return _openai; }
interface TV { key: string; label: string; description: string | null; category: string; example: string | null; }
function bvc(vs: TV[]): string { const g: Record<string, TV[]> = {}; for (const v of vs) { if (!g[v.category]) g[v.category] = []; g[v.category].push(v); } let c = "VARIABLES:\n"; for (const [k, a] of Object.entries(g)) { c += `[${k}]\n`; for (const v of a) c += `  {{${v.key}}} ${v.label}\n`; } return c; }
const BP = "You are a B2B comms specialist for Fintella (IEEPA tariff refunds). Use ONLY approved {{variables}}. Return valid JSON. Never use partner firm names.";
async function call(sp: string, up: string): Promise<string> { const r = await getOpenAI().chat.completions.create({ model: MODEL, messages: [{ role: "system", content: sp }, { role: "user", content: up }], temperature: 0.7, response_format: { type: "json_object" } }); return r.choices[0]?.message?.content || "{}"; }
export async function generateEmailTemplate(p: { userPrompt: string; styleId: string; availableVariables: TV[]; workflowContext?: string; existingTemplate?: string }) {
  const { prisma } = await import("@/lib/prisma");
  const st = p.styleId ? await prisma.communicationStyle.findUnique({ where: { id: p.styleId } }).catch(() => null) : null;
  const sp = `${BP}${st ? `\nStyle: ${st.name}\n${st.systemPrompt}` : ""}\n${bvc(p.availableVariables)}\nReturn: { "name": string, "subject": string, "bodyHtml": string, "bodyText": string, "detectedVariables": string[], "suggestedWorkflowTags": string[], "grammarNotes": string[], "confidenceScore": number }`;
  let m = `Generate email:\n${p.userPrompt}`; if (p.workflowContext) m += `\nContext: ${p.workflowContext}`; if (p.existingTemplate) m += `\nExisting:\n${p.existingTemplate}`;
  const r = JSON.parse(await call(sp, m)); const ak = new Set(p.availableVariables.map(v => v.key)); r.detectedVariables = (r.detectedVariables || []).filter((k: string) => ak.has(k)); return r;
}
export async function generateSmsTemplate(p: { userPrompt: string; styleId: string; availableVariables: TV[]; enforceCharLimit: boolean; maxChars?: number }) {
  const mx = p.maxChars || 160; const { prisma } = await import("@/lib/prisma");
  const st = p.styleId ? await prisma.communicationStyle.findUnique({ where: { id: p.styleId } }).catch(() => null) : null;
  const sp = `${BP}${st ? `\nStyle: ${st.name}\n${st.systemPrompt}` : ""}\n${bvc(p.availableVariables)}\n${p.enforceCharLimit ? `Max ${mx} chars.` : `Target ${mx}.`}\nReturn: { "name": string, "body": string, "characterCount": number, "segmentCount": number, "detectedVariables": string[], "suggestedWorkflowTags": string[], "warnings": string[] }`;
  const r = JSON.parse(await call(sp, `Generate SMS:\n${p.userPrompt}`)); r.characterCount = r.body.length; r.segmentCount = r.characterCount <= 160 ? 1 : Math.ceil(r.characterCount / 153);
  if (r.characterCount > mx && p.enforceCharLimit) r.warnings = [...(r.warnings || []), `Over: ${r.characterCount} chars`];
  const ak = new Set(p.availableVariables.map(v => v.key)); r.detectedVariables = (r.detectedVariables || []).filter((k: string) => ak.has(k)); return r;
}
export async function rewriteWithStyle(p: { content: string; type: "email" | "sms"; styleId: string; preserveVariables: boolean }) {
  const { prisma } = await import("@/lib/prisma"); const st = await prisma.communicationStyle.findUnique({ where: { id: p.styleId } }); if (!st) throw new Error("Style not found");
  const sp = `${BP}\nRewrite in "${st.name}" style.\n${st.systemPrompt}${p.preserveVariables ? "\nPreserve all {{variables}}." : ""}\nReturn: { "rewritten": string, "changesSummary": string[] }`;
  return JSON.parse(await call(sp, `Rewrite ${p.type}:\n${p.content}`));
}
export async function detectAndSuggestVariables(raw: string, vs: TV[]) {
  const sp = `Analyze for variables.\n${bvc(vs)}\nReturn: { "detected": string[], "suggested": string[], "missingDefinitions": string[] }`;
  return JSON.parse(await call(sp, `Analyze:\n${raw}`));
}
