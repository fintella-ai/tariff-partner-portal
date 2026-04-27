# State of PartnerOS AI — 2026-04-27

**Date:** 2026-04-27 (Monday — after the weekend)
**Author:** Claude Code (session state compiled from spec, git log, and source review)
**Covers:** All work from the Friday 2026-04-24 marathon session through today

---

## 1. Where we are

All four personas are live. Partners choose Finn (direct, data-driven) or Stella (warm, coaching) on first visit, switchable in Account Settings; either can hand off to Tara (tariff-refund product SME) or Ollie (portal ops + escalation specialist) when the question needs depth. Tara's knowledge base ingests training modules, PDFs (via pdf-parse), and audio resources (via Whisper, demo-gated on `OPENAI_API_KEY`); compliance guardrails are hardcoded in `NEVER_SAY_RULES` so training-content edits can never accidentally delete the safety floor. Ollie carries a 10-tool surface — four scoped DB lookups (`lookupDeal`, `lookupCommissions`, `lookupAgreement`, `lookupDownline` — all hard-scoped to the signed-in partner) plus a full four-rung escalation ladder: live text chat (Rung 1), live phone transfer via Twilio bridge (Rung 2), 15-minute scheduled call via per-inbox Google Calendar (Rung 3), and support ticket with inbox-based routing (Rung 4). Rungs 1–3 are availability-gated — Ollie never offers a rung that isn't live. The `AdminInbox` model seeds four role inboxes (`support@`, `legal@`, `admin@`, `accounting@`) and routes every escalation by category. Admins see a dedicated activity dashboard at `/admin/ai-activity` (turn counts, handoff rates, escalation breakdown by rung, Anthropic prompt-cache metrics). The main open gaps are: video transcription (requires ffmpeg, deferred to Phase 2c.1), outbound inbox email routing for ticket/booking notifications (bell notifications fire; external emails do not yet), and Google Calendar per-inbox OAuth (wired but unconfigured — Rung 3 stays dark until at least one inbox is connected). Twilio voice (live transfer + emergency call chain) is fully wired but demo-gated pending A2P 10DLC approval. Post-session weekend work added HeyGen photo avatars for Finn and Stella, a "FinnStellaOS" product rename (PR #613), and a crowdsourced Rebuttal knowledge pipeline that auto-feeds approved partner-submitted objections into Tara's knowledge base (PR #688).

---

## 2. What shipped this session (dated 2026-04-24)

### Phase 1 — Persona split

- **#530** `docs(ai)`: Master spec — 4-persona design, escalation ladder, inbox architecture, full schema delta, phased PR plan (`docs/superpowers/specs/2026-04-24-partneros-ai-roadmap-design.md`)
- **#532** `feat(ai)`: Finn + Stella live; persona picker modal; account-settings switch; `Partner.preferredGeneralist`; `AiMessage.speakerPersona`/`handoffMetadata`/`attachments`; avatar SVGs; `PERSONAS` registry in `src/lib/ai-personas.ts`

### Phase 2a-2c — Tara + knowledge ingestion

- **#533** `feat(ai)`: Tara product specialist — `NEVER_SAY_RULES` compliance floor hardcoded in `src/lib/ai-compliance.ts`; `buildProductSpecialistPrompt()` in `src/lib/ai-knowledge.ts` assembles modules + FAQs + glossary under a `<!-- knowledge version: N -->` cache key; `AiKnowledgeVersion` singleton; `hand_off` tool added to Finn/Stella with `"tara"` as target
- **#534** `feat(ai)`: PDF extraction via pdf-parse on upload; `TrainingResource.extractedText`/`extractedAt`; `TrainingGlossary` model with admin tab + partner-facing glossary page; knowledge-version bump on all training/FAQ mutations
- **#535** `feat(ai)`: Whisper audio transcription — `src/lib/transcription.ts`, demo-gated on `OPENAI_API_KEY`; `TrainingResource.audioTranscript`/`transcribedAt`; 25 MB hard cap; video transcription (ffmpeg) deferred to Phase 2c.1

### Phase 3a — Ollie scaffold

- **#538** `feat(ai)`: Ollie persona record + system prompt in `src/lib/ai-personas.ts`; `hand_off(to:"ollie")` wired on Finn, Stella, and Tara; Phase 3a ships Ollie as voice-only (no tools yet)

### Phase 3b — DB lookup tools

- **#541** `feat(ai)`: `lookupDeal`, `lookupCommissions`, `lookupAgreement`, `lookupDownline` in `src/lib/ai-ollie-tools.ts`; `AiMessage.toolCalls` column for in-chat tool-trace UI; all queries hard-scoped to `partnerCode`
- **#542** `feat(ai)`: `isStale: true` flag on `lookupDeal` results (14+ days in non-terminal stage); Ollie's system prompt updated with proactive stuck-deal nudge logic

### Phase 3c.1 — AdminInbox + AiEscalation schema

- **#544** `feat(ai)`: `AdminInbox` model (4 seeded rows); `AiEscalation` audit model; new `SupportTicket.category` values (`agreement_question`, `legal_question`, `enterprise_inquiry`, `ceo_escalation`, `payment_question`)

### Phase 3c.2-3c.3 — Ticket tool + notifications + admin UI

- **#545** `feat(ai)`: `create_support_ticket` tool — inbox-aware category routing; `AiEscalation` audit row; partner confirmation required before tool fires (enforced in Ollie's system prompt)
- **#547** `feat(ai)`: Internal bell notifications on Ollie ticket creation; fan-out to `AdminInbox.assignedAdminIds`, falling back to all support-eligible admins
- **#549** `feat(admin)`: Admin Inbox management UI in `/admin/settings` — per-inbox category assignment, work hours, call duration/title template, Google Calendar connect button

### Phase 3c.4 — Admin heartbeat, availability, and live escalation rungs

- **#550** `feat(ai)`: `/api/admin/heartbeat` POST (60 s client ping); `User.lastHeartbeatAt`; `isAdminOnline()` helper (2-min window); 🟢 availability quick-toggle in admin top bar
- **#551** `feat(admin)`: `/admin/ai-activity` dashboard — turn counts by persona, handoff rates, escalation rung breakdown, `AiFaqCandidate` harvest queue, `AiKnowledgeGap` list
- **#552** `feat(admin)`: "My AI Availability" settings card — `availableForLiveChat`, `availableForLiveCall`, `personalCellPhone`, `isITEmergencyContact` per user
- **#553** `feat(ai)`: `start_live_chat` tool — creates `ChatSession`, seeds with partner's opening message, notifies online inbox-assigned admins; `initiate_live_transfer` tool — Twilio-gated, records `AiEscalation` rung `live_call`, always requires explicit phone confirmation before firing
- **#555** `feat(ai)`: `offer_schedule_slots` tool — resolves category → AdminInbox → `getOfferedSlots()` in `src/lib/scheduling.ts`; `book_slot` tool — creates Google Calendar event on inbox's connected calendar, admin bell notifications, `AiEscalation` audit row

### Phase 3c.x — IT emergency chain, bug triage, inbox audit

- **#556** `feat(ai)`: `emergencyCallSuperAdmin()` in `src/lib/emergency-call.ts` — Twilio outbound to `User.personalCellPhone` where `isITEmergencyContact=true`; email to `admin@`; in-portal notification; workspace post; `/admin/dev` test-call button
- **#557** `feat(ai)`: `investigate_bug` tool — 4-question interview flow; heuristic classifier (`confirmed_bug` / `needs_admin_investigation` / `user_error`); auto-diagnostics (agreement status, partner status); always creates a `tech_error` ticket; on `confirmed_bug` fires emergency chain
- **#558** `feat(admin)`: Audit and unify `@fintella.partners` inbox email filters across notification fan-out paths; fix edge-case category routing where unmapped categories fell through

### Deferred-work sprint (still 2026-04-24)

Four items were tagged as "deferred" during the main session and closed same day:

- **#559** `feat(ai)`: Twilio voice LIVE — real bridged call via `initiateBridgedCall()` in `src/lib/twilio-voice.ts`; TwiML webhook at `/api/twilio/voice-webhook`; demo-gated on Twilio env vars; `CallLog` rows written even in demo mode
- **#560** `feat(ai)`: Google Calendar per-inbox OAuth — each `AdminInbox` stores its own encrypted refresh token; `createEventOnInboxCalendar()` in `src/lib/google-calendar.ts`; `getOfferedSlots()` queries real free/busy from Google when token is set
- **#561** `feat(ai)`: Screenshot upload via Vercel Blob — `/api/ai/upload` endpoint; `AiMessage.attachments` JSON column; `investigate_bug` v2 accepts `screenshotUrls[]` and includes them in ticket body; gated on `VERCEL_BLOB_READ_WRITE_TOKEN`
- **#563** `feat(ai)`: Phase 4 prompt caching — `cache_control: { type: "ephemeral" }` on last `OLLIE_TOOLS` entry (10 tools, ~4-5 k tokens); independent of existing `KNOWLEDGE_BASE` cache block; Anthropic cache metrics panel added to `/admin/ai-activity` (hit rate, input tokens, cache read, cache write, USD estimate)

### Weekend extras (2026-04-26 – 2026-04-27)

These landed after the session while John was kicking the tires:

- **#613** `feat`: Rename "PartnerOS" → "FinnStellaOS" in all user-facing strings (6 additions, 5 files; internal code/schema comments still say PartnerOS)
- **#668** `chore`: Finn HeyGen avatars — 3 new photorealistic looks added, SVG placeholder removed
- **#669** `chore`: Stella HeyGen avatars — 4 new looks, old removed
- **#670** `feat`: Bigger chat avatar + centered persona switcher row — UI polish
- **#673** `feat`: Finn avatar photo update from HeyGen + wire HeyGen voice IDs to persona records
- **#688** `feat`: Rebuttal system — partner-submitted objections, admin approve/reject/edit, approved rebuttals auto-ingest into Tara's knowledge base as an "Objection Rebuttals" section; `Rebuttal` Prisma model

---

## 3. What's next — top 3 picks with tradeoffs

### Pick 1 — Phase 3c.3b: Outbound inbox email routing for Ollie-created tickets and bookings

**Estimated PRs:** 1  
**Blocker:** `SENDGRID_API_KEY` must be set and domain auth DNS verified (currently unset per CLAUDE.md)  
**Why valuable:** Right now Ollie tickets and call bookings only fire in-portal bell notifications. The spec calls for emails FROM `support@fintella.partners` TO the target role inbox address so the admin team's actual email inbox receives a structured summary — especially important for `legal@` (agreement questions) and `accounting@` (commission disputes) where admins may not be watching the portal all day. This is the last gap between "notifications-only" and the full routing picture the spec describes.  
**Why not #1:** Bell notifications already cover the urgent case (live admin sees the bell immediately). Email is completeness, not a blocker to value. Held back only by SendGrid DNS, not by code complexity.

### Pick 2 — Phase 3c.4: Connect at least one inbox's Google Calendar to open Rung 3

**Estimated PRs:** 0 (zero code changes — this is an admin configuration step, not a PR)  
**Blocker:** None in code. Requires a one-time OAuth flow in `/admin/settings → Integrations → Inbox: Partner Support → Connect Google Calendar`  
**Why valuable:** Until at least one inbox connects its calendar, `offer_schedule_slots` returns an empty list for every category and Ollie silently falls back to tickets. Partners can't book a 15-minute call even though the entire scheduling stack — free/busy query, slot algorithm, Google Calendar event creation, admin notifications — is fully wired and tested. This unlocks Rung 3 with zero engineering work.  
**Why not #1:** Not a code task, but it's blocking a fully-built feature from being usable. Worth calling out explicitly so it doesn't get buried.

### Pick 3 — Phase 2c.1: Video transcription via an external API (instead of ffmpeg)

**Estimated PRs:** 2–3  
**Blocker:** ffmpeg is not available in standard Vercel Functions. The original spec assumed a Node.js ffmpeg binary for audio extraction from video files. However, services like AssemblyAI and Deepgram accept direct video URLs and handle the extraction server-side, removing the ffmpeg dependency entirely.  
**Why valuable:** Training module videos and weekly call recordings are probably the richest knowledge source Tara could have. Every weekly call is 60+ minutes of expert tariff-refund content; without transcription, Tara misses everything spoken but not written. This is the most impactful remaining gap in Tara's knowledge base.  
**Why not #1:** Requires an architectural decision about which video-transcription vendor to use (and another API key/cost line). The ffmpeg assumption in the spec should be revisited before coding starts — this may be a 10-minute conversation that saves a week of the wrong approach.

---

## 4. Risks + things to watch

- **`AiEscalation` table growth** — every Ollie tool call that results in an action (ticket, booking, chat, call) creates an `AiEscalation` row, and `investigate_bug` creates one even on `user_error` outcomes. There is no pagination, archival, or TTL strategy on this table yet. With active partners it will grow fast, and the `/admin/ai-activity` dashboard queries it without a row cap. Watch query performance at 10k+ rows and add a `createdAt` index filter before it becomes a problem.

- **Anthropic tool-use loop cost under load** — Ollie's tool array is 4–5 k tokens per call. The `cache_control` on the last tool entry (PR #563) brings cache reads to ~$0.0015/turn (vs ~$0.015 cold), but the Anthropic ephemeral cache TTL is only 5 minutes. A partner who pauses mid-conversation for 6 minutes triggers a full cache re-write. Under moderate load (say, 50 concurrent partners each doing a multi-turn Ollie session), the write traffic could be significant. The `/admin/ai-activity` cache metrics panel shows this in real time — watch the "cache write > 50% of reads" amber threshold.

- **AdminInbox seed staleness in production** — The four `AdminInbox` rows are seeded by `scripts/seed-all.js` at build time, but `FINTELLA_LIVE_MODE=true` on production gates re-seeding. If `assignedAdminIds` needs to be populated, or new categories added to an inbox, it has to go through a direct DB write or a new migration — not a re-deploy. Admins won't see any notification fan-out until at least one inbox has assigned admin IDs set.

- **Missing per-tool telemetry** — The cache dashboard (PR #563) tracks aggregate token costs but not per-tool call counts, error rates, or latency. If `lookupDeal` is timing out or `book_slot` is failing silently (it catches calendar errors and falls back), there's no signal in the admin UI until a partner complains. The 2-week AI audit agent fires 2026-05-08; if tool-level errors are accumulating between now and then, they'll surface blind.

- **Single IT emergency contact** — `isITEmergencyContact` is a boolean flag with no rotation or backup. If the designated contact is traveling, on a flight, or just has their phone on DND, `confirmed_bug` emergencies go to voicemail and fall through to email-only. v2 needs an ordered list of contacts with a retry window before moving to the next person. Low urgency today; gets urgent the first time a real production bug pages nobody.

---

## 5. Questions for John

1. **Which inbox's Google Calendar to connect first?** The OAuth flow is live in `/admin/settings → Integrations`. Until at least one inbox connects, Rung 3 (scheduled call) is a no-op for every partner. `support@` covers the highest volume; `accounting@` is probably the most urgent-feeling use case (commission disputes). Which team calendar are you most ready to expose?

2. **Video transcription vendor choice before Phase 2c.1 starts?** The spec assumed ffmpeg on the server, but Vercel Functions can't run it. Before writing Phase 2c.1 code, should we pick an external vendor (AssemblyAI, Deepgram, or just send OpenAI Whisper a publicly accessible video URL directly), or is weekly-call transcription not a priority this sprint?

3. **Phone transfer (Rung 2) before live chat (Rung 1) in production?** Twilio A2P 10DLC approval is the blocker for live phone transfer and the IT emergency call chain. If TCR approves in the coming weeks, would you want to flip both those features live immediately — or wait until live text chat has been tested end-to-end in production first? Live chat (Rung 1) requires no Twilio and can go live any time an admin sets `availableForLiveChat=true`.

4. **Should Ollie (and Tara) have a `hand_back` tool?** The spec describes a `hand_back` tool so specialists can return the conversation to the partner's chosen generalist once the specialist's work is done. It was not implemented — specialists currently stay pinned until the partner manually switches. Is the current behavior acceptable, or does it create awkward UX when a partner finishes their Ollie session and wants to get back to Stella for a warm close?

5. **Full deep rename of PartnerOS → FinnStellaOS?** PR #613 updated the six user-facing strings. Schema comments, API routes (`/api/ai/`), internal code comments, the spec doc, and the CLAUDE.md AI section still say "PartnerOS." Is FinnStellaOS the permanent product name, or is this a work-in-progress rename that should either be completed fully or rolled back to avoid the split naming in the codebase?
