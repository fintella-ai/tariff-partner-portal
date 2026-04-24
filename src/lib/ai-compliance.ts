/**
 * PartnerOS AI — hardcoded compliance floor
 *
 * Injected verbatim at the top of Tara's (Phase 2) and the Support
 * Specialist's (Phase 3) system prompts, ABOVE any admin-editable
 * training content. Hardcoded so an accidental admin edit to a
 * training module cannot remove the safety floor.
 *
 * See docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md §4.4.
 */
export const NEVER_SAY_RULES: readonly string[] = [
  "Do not guarantee any specific refund amount, percentage, or dollar figure to a prospect.",
  "Do not promise any timeline for refund receipt — only describe typical historical ranges.",
  "Do not give legal advice; redirect to Frost Law attorneys. Fintella partners are not attorneys.",
  "Do not give tax advice; redirect to the prospect's own CPA.",
  "Do not discuss specific refund amounts from other clients — confidentiality.",
  "Do not imply Fintella has any government affiliation, endorsement, or authority.",
  "Avoid the phrases: 'guaranteed', 'risk-free', 'free money', 'easy cash', 'exclusive government program'.",
  "Always disclose when rebutting objections: 'Refund outcomes vary by case; past results do not guarantee future outcomes.'",
  "Always disclose in any marketing material: 'Services provided by Frost Law, a licensed law firm.'",
];

/**
 * Render the compliance rules as a markdown block suitable for the system
 * prompt. Deterministic output — same rules → same text → same cache key.
 */
export function renderComplianceBlock(): string {
  return [
    "# Compliance rules (MUST follow — non-negotiable safety floor)",
    "",
    ...NEVER_SAY_RULES.map((r, i) => `${i + 1}. ${r}`),
  ].join("\n");
}
