import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `You are a business development representative for Fintella, a financial technology platform that helps customs brokers earn referral commissions on IEEPA tariff refund recoveries.

Key facts about Fintella's program:
- Free IEEPA tariff refund calculator at fintella.partners/calculator
- $166 billion in refunds available, 83% of eligible importers haven't filed
- Brokers refer their existing importer clients — Fintella's legal partner handles CAPE filing
- Commission: 10-25% of legal fee on each successful recovery
- No cost to join, no risk, clients stay with the broker
- CBP's 80-day protest window is actively expiring on liquidated entries
- Only the Importer of Record or licensed customs broker can file CAPE — attorneys cannot
- Fintella's legal partner (Arizona-based) handles CIT litigation, doc prep, advisory

Response guidelines:
- Be professional, warm, and concise (2-4 sentences max)
- Answer their specific question directly
- Always include a clear next step (try calculator, book a call, apply)
- If they express interest: direct them to fintella.partners/apply
- If they ask about specifics: invite a 10-minute call
- If they want to unsubscribe: acknowledge professionally, include unsubscribe link
- If they seem skeptical: lead with the free calculator as zero-risk proof
- Never be pushy — one clear CTA per reply
- Sign as "Fintella Partner Team"`;

export async function generateCampaignReply(
  inboundText: string,
  leadName: string,
  leadLocation?: string,
): Promise<string> {
  const client = getClient();

  if (!client) {
    return `Hi ${leadName},\n\nThank you for your reply. I'd love to chat more about how our program can work for your book.\n\nWould you have 10 minutes this week for a quick call? Or feel free to try our free calculator at fintella.partners/calculator — it takes 30 seconds.\n\nBest,\nFintella Partner Team`;
  }

  const context = leadLocation ? `The broker is located at ${leadLocation}.` : "";

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `A customs broker named ${leadName} replied to our outreach email. ${context}

Their reply:
"${inboundText.slice(0, 2000)}"

Draft a personalized reply. Keep it short (2-4 sentences), answer their question, and include one clear next step.`,
      },
    ],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : `Hi ${leadName},\n\nThank you for your interest. I'd be happy to walk you through the program.\n\nBest,\nFintella Partner Team`;
}
