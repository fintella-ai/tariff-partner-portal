import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const VARS = [
  { key: "partner_name", label: "Partner Full Name", category: "partner", description: "Partner first + last name", example: "John Orlando" },
  { key: "partner_email", label: "Partner Email", category: "partner", description: "Partner email address", example: "john@example.com" },
  { key: "partner_phone", label: "Partner Phone", category: "partner", description: "E.164 phone", example: "+15551234567" },
  { key: "referral_link", label: "Referral Link", category: "referral", description: "Partner referral URL", example: "https://fintella.partners/r/PTNS4XDMN" },
  { key: "referral_code", label: "Referral Code", category: "referral", description: "Partner referral code", example: "PTNS4XDMN" },
  { key: "commission_amount", label: "Commission Amount", category: "financial", description: "Dollar amount", example: "$2,500.00" },
  { key: "commission_date", label: "Commission Date", category: "financial", description: "Date issued", example: "May 1, 2026" },
  { key: "commission_status", label: "Commission Status", category: "financial", description: "pending/due/paid", example: "due" },
  { key: "client_name", label: "Client Name", category: "referral", description: "Referred client name", example: "Jane Smith" },
  { key: "client_company", label: "Client Company", category: "referral", description: "Client company", example: "Acme Imports LLC" },
  { key: "tariff_refund_amount", label: "Tariff Refund Amount", category: "financial", description: "Estimated refund", example: "$15,000.00" },
  { key: "tariff_case_status", label: "Tariff Case Status", category: "financial", description: "Case status", example: "In Review" },
  { key: "portal_login_url", label: "Portal Login URL", category: "system", description: "Login page link", example: "https://fintella.partners/login" },
  { key: "support_email", label: "Support Email", category: "system", description: "Support address", example: "support@fintella.partners" },
  { key: "current_date", label: "Current Date", category: "system", description: "Today's date", example: "May 1, 2026" },
  { key: "expiry_date", label: "Expiry Date", category: "system", description: "Expiration date", example: "June 1, 2026" },
];
const STYLES = [
  { name: "Professional", description: "Formal business tone", systemPrompt: "Write professionally. Use proper titles, complete sentences, no slang. Convey trust and authority." },
  { name: "Conversational", description: "Friendly, approachable tone", systemPrompt: "Write warmly like a colleague. Use contractions, personal touches. Approachable but professional." },
  { name: "Urgent/Action-Required", description: "Time-sensitive, direct", systemPrompt: "Write urgently. Lead with key info. Short sentences. Include deadlines and consequences." },
  { name: "Empathetic", description: "Supportive for sensitive topics", systemPrompt: "Write with empathy. Acknowledge situations. Supportive language. Clear next steps without pressure." },
  { name: "Sales-Forward", description: "Benefit-focused, engaging", systemPrompt: "Write enthusiastically. Lead with value. Action-oriented. Include numbers and outcomes." },
];
const ACTIONS = [
  { name: "Welcome Email", tag: "welcome", templateType: "both", description: "New partner signup", requiredVariables: ["partner_name", "portal_login_url"] },
  { name: "Agreement Ready", tag: "agreement_ready", templateType: "both", description: "Agreement ready for signing", requiredVariables: ["partner_name"] },
  { name: "Agreement Signed", tag: "agreement_signed", templateType: "both", description: "After partner signs", requiredVariables: ["partner_name"] },
  { name: "Referral Submitted", tag: "referral_submitted", templateType: "email", description: "Client referral confirmed", requiredVariables: ["partner_name", "client_name"] },
  { name: "Deal Stage Update", tag: "deal_stage_update", templateType: "email", description: "Deal moved stages", requiredVariables: ["partner_name", "client_name", "tariff_case_status"] },
  { name: "Commission Earned", tag: "commission_earned", templateType: "both", description: "Commission credited", requiredVariables: ["partner_name", "commission_amount"] },
  { name: "Payout Processed", tag: "payout_processed", templateType: "email", description: "Payout sent", requiredVariables: ["partner_name", "commission_amount", "commission_date"] },
  { name: "Monthly Newsletter", tag: "monthly_newsletter", templateType: "email", description: "Monthly updates", requiredVariables: ["partner_name"] },
  { name: "Recruitment Invite", tag: "recruitment_invite", templateType: "both", description: "L2/L3 invitation", requiredVariables: ["referral_link", "referral_code"] },
  { name: "Stale Partner Nudge", tag: "stale_partner_nudge", templateType: "email", description: "Re-engage inactive", requiredVariables: ["partner_name", "referral_link"] },
];
export async function seedTemplateVariables() {
  for (const v of VARS) await prisma.templateVariable.upsert({ where: { key: v.key }, update: v, create: v });
  for (const s of STYLES) { const ex = await prisma.communicationStyle.findFirst({ where: { name: s.name } }); if (!ex) await prisma.communicationStyle.create({ data: s }); else await prisma.communicationStyle.update({ where: { id: ex.id }, data: s }); }
  for (const a of ACTIONS) await prisma.workflowAction.upsert({ where: { tag: a.tag }, update: a, create: a });
  console.log("Template variables, styles, and workflow actions seeded");
}
if (require.main === module) seedTemplateVariables().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
