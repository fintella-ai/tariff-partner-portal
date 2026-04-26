# FinnStellaOS Chat Widget + Audit/Engagement Wiring

**Date:** 2026-04-26
**Status:** Draft
**Scope:** Partner-facing AI chat bubble, persona tool sharing, human handoff, audit log wiring, engagement scoring wiring, engagement UI

---

## 1. Overview

Add a persistent floating chat bubble to the partner portal that opens an inline AI chat panel powered by FinnStellaOS. The partner's preferred persona (Finn or Stella) is the default first responder. All personas gain access to shared tools (deal lookup, support tickets, live chat). A "Talk to a person" escape hatch routes to live admin chat or support tickets. Separately, wire the existing `logAudit()` and `recordActivity()` helpers into all remaining mutation routes and add engagement tier display to the admin partners table.

## 2. Component Architecture

### 2.1 New Files

| File | Purpose |
|------|---------|
| `src/components/partner/PartnerChatBubble.tsx` | Bubble + panel + mobile overlay — the only new UI component |
| `src/components/partner/ChatPanel.tsx` | Extracted panel body (message list + input + footer) for reuse |
| `src/components/partner/PersonaSwitcherRow.tsx` | Horizontal avatar row — tap to switch persona mid-conversation |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `src/app/(partner)/dashboard/layout.tsx` | Mount `<PartnerChatBubble />` alongside existing layout |
| `src/lib/ai.ts` | Accept `tools` param from caller (instead of hardcoding Ollie-only tools) |
| `src/lib/ai-ollie-tools.ts` | Export `SHARED_TOOLS` and `OLLIE_EXCLUSIVE_TOOLS` separately |
| `src/lib/ai-personas.ts` | Add `hasTools: boolean` per persona (all true now) |
| `src/app/api/ai/chat/route.ts` | Attach `SHARED_TOOLS` for any persona; attach `OLLIE_EXCLUSIVE_TOOLS` only when persona is `ollie` |

### 2.3 No New API Routes

The widget is a pure UI layer over existing endpoints:
- `POST /api/ai/chat` — send message, get AI response
- `GET /api/ai/conversations` — list conversations
- `GET /api/ai/conversations/[id]` — load messages
- `POST /api/ai/upload` — screenshot attachment

## 3. Widget States

### 3.1 Collapsed (Bubble)

- Fixed position: `bottom-6 right-6` desktop, `bottom-4 right-4` mobile
- `z-40` (above page content, below modals which use `z-50`)
- 56px circle with partner's preferred persona avatar
- Falls back to FinnStellaOS logo SVG if no preference set
- Red unread badge (count) when AI has responded and partner hasn't viewed
- First-visit pulse animation gated by `localStorage` flag `fintella.partner.chatBubbleIntro`
- Click opens panel

### 3.2 Expanded (Panel — Desktop)

**Dimensions:** 380×520px, anchored bottom-right above the bubble
**Shadow:** `shadow-2xl` with theme-aware border

**Header:**
- Active persona avatar (40px) + display name
- `PersonaSwitcherRow`: 4 small (28px) persona avatars. Active one gets accent-colored ring. Tap to switch.
- "↗" expand button — navigates to `/dashboard/ai-assistant` with `?conversationId=` param
- "×" close button — collapses to bubble

**Message area:**
- Scrollable `flex-col-reverse` for auto-bottom-scroll
- Renders markdown (same as full AI page)
- Tool call results collapsed behind "View details" expandable
- Typing indicator (three-dot animation) while AI responds
- Loads most recent `AiConversation` for this partner on open, or creates new

**Input area:**
- Auto-growing textarea (1–3 lines max)
- Send button (disabled during send, shows spinner)
- Paperclip icon for screenshot upload (reuses `/api/ai/upload`)
- Suggested prompts shown when conversation is empty (same `SUGGESTED_PROMPTS` array)

**Footer:**
- "Talk to a person" link (left-aligned)
- Visible only when `PortalSettings.liveChatEnabled` is true

### 3.3 Expanded (Panel — Mobile)

- Full-screen overlay: `fixed inset-0 z-50` with `pt-safe pb-safe`
- Background: `var(--app-bg)` (opaque, not overlay)
- Header replaces "×" with "←" back button
- Input fixed to bottom with safe-area padding
- Same persona switcher, message area, footer

### 3.4 State Persistence

- Open/closed: `localStorage` key `fintella.partner.chatBubble.open`
- Active conversation ID: `localStorage` key `fintella.partner.chatBubble.conversationId`
- Preferred persona: already stored server-side on `Partner.preferredPersona`

## 4. Persona Tool Sharing

### 4.1 Current State

Only Ollie has tool access. Finn, Stella, and Tara are text-only generalists.

### 4.2 New State

**Shared tools (all 4 personas):**
- `lookupDeal` — search partner's deals by name
- `lookupCommissions` — partner's commission summary
- `lookupAgreement` — partner's agreement status
- `lookupDownline` — partner's downline tree (depth 1 or 2)
- `create_support_ticket` — open a ticket on the partner's behalf
- `start_live_chat` — hand off to a live admin
- `offer_schedule_slots` — show available call slots
- `book_slot` — book a scheduled call

**Ollie-exclusive tools:**
- `investigate_bug` — structured bug triage with IT escalation chain
- `initiate_live_transfer` — phone bridge to admin (requires admin availability)

### 4.3 Implementation

In `ai-ollie-tools.ts`:
- Export `SHARED_TOOLS: Anthropic.Messages.Tool[]` (the 8 shared tool definitions)
- Export `OLLIE_EXCLUSIVE_TOOLS: Anthropic.Messages.Tool[]` (the 2 exclusive ones)
- Export `ALL_OLLIE_TOOLS` as `[...SHARED_TOOLS, ...OLLIE_EXCLUSIVE_TOOLS]` for backward compat
- `executeOllieTool` already handles all 10 — no change needed to execution logic

In `api/ai/chat/route.ts`:
- When persona is `ollie`: pass `tools: ALL_OLLIE_TOOLS`
- When persona is `finn | stella | tara`: pass `tools: SHARED_TOOLS`
- Tool execution reuses the same `executeOllieTool` function (it doesn't check persona)

## 5. "Talk to a Person" Handoff Flow

### 5.1 User-Initiated (Button Click)

1. Partner clicks "Talk to a person" in panel footer
2. Widget sends a message to `/api/ai/chat`: `"I'd like to talk to a real person please."`
3. The active persona (any of the 4) now has `start_live_chat` tool → AI calls it
4. `start_live_chat` checks admin availability via `getOnlineAdminsForInbox()`

**If admin online:**
- Creates `ChatSession` + seeds with partner's most recent message
- Creates `AiEscalation` audit row with `rung: "live_chat"`
- Tool returns `{ success: true, chatSessionId, adminName }`
- AI responds: "I've connected you with [Admin Name]. They can see our conversation."
- Panel switches to live chat mode (see §5.3)

**If no admin online:**
- `start_live_chat` tool returns `{ success: false, reason: "no_admin_available" }`
- AI responds: "No one's available for live chat right now. Would you like me to **open a support ticket** so someone follows up, or **schedule a call** for a time that works for you?"
- Partner chooses → AI calls `create_support_ticket` or `offer_schedule_slots` accordingly
- The decision is always the partner's — never auto-create a ticket without asking

### 5.2 AI-Initiated (Tool Call)

Ollie (or any persona with shared tools) can proactively call `start_live_chat` when the conversation exceeds their capability. Same flow as above.

### 5.3 Live Chat Mode

When a `ChatSession` is created, the panel transitions:
- Header shows "Live Chat" + admin avatar/name
- Messages now POST to `/api/tickets/[chatSessionId]/messages` (reuses ticket message API)
- Typing indicators via 30s polling (no SSE for v1)
- "End chat" button → closes `ChatSession`, panel reverts to AI mode
- If admin doesn't respond within 5 minutes, show: "Still waiting — want to leave a message instead?"

## 6. Unread Badge

### 6.1 Sources

- Unread AI response in active conversation (last message is `role: assistant` and panel is closed)
- Unread support ticket reply (`TicketMessage` where `senderType=admin` and `readAt IS NULL`)
- Unread live chat message (`ChatMessage` where `senderType=admin` and `readAt IS NULL`)

### 6.2 Implementation

- New lightweight endpoint: `GET /api/ai/unread-count` — returns `{ ai: number, support: number, chat: number }`
- Widget polls every 30 seconds when collapsed
- Badge shows total count. Panel interior shows per-source tabs if multiple sources have unreads.
- Messages marked as read when scrolled into view (IntersectionObserver on last message)

## 7. Settings Gates

| Setting | Effect |
|---------|--------|
| `PortalSettings.aiAssistantEnabled` | Bubble renders / hidden |
| `ANTHROPIC_API_KEY` set | AI responds / demo message |
| `PortalSettings.liveChatEnabled` | "Talk to a person" link visible / hidden |

## 8. Audit Log Wiring

Wire `logAudit()` from `src/lib/audit-log.ts` into all admin mutation routes:

| Route | Action | Target Type |
|-------|--------|-------------|
| `POST /api/admin/deals` | `deal.create` | `deal` |
| `PATCH /api/admin/deals/[id]` | `deal.update` | `deal` |
| `DELETE /api/admin/deals/[id]` | `deal.delete` | `deal` |
| `POST /api/admin/deals/[id]/payment-received` | `deal.payment_received` | `deal` |
| `PATCH /api/admin/partners/[code]` | `partner.update` | `partner` |
| `POST /api/admin/partners/[code]/status` | `partner.status_change` | `partner` |
| `PUT /api/admin/settings` | `settings.update` | `portal_settings` |
| `POST /api/admin/payouts` (create) | `payout.batch_create` | `payout_batch` |
| `POST /api/admin/payouts` (approve) | `payout.batch_approve` | `payout_batch` |
| `POST /api/admin/payouts` (process) | `payout.batch_process` | `payout_batch` |
| `POST /api/admin/users` | `admin.create` | `admin_user` |
| `PATCH /api/admin/users/[id]` | `admin.update` | `admin_user` |
| `POST /api/signwell/send` | `agreement.send` | `agreement` |
| `POST /api/admin/announcements` | `announcement.create` | `announcement` |
| `PATCH /api/admin/announcements/[id]` | `announcement.update` | `announcement` |

Each call passes: `{ action, actorEmail, actorRole, actorId, targetType, targetId, details: { ...changedFields }, ipAddress, userAgent }`.

Use `diffFields(before, after)` utility for update actions to capture field-level deltas.

## 9. Engagement Scoring Wiring

Wire `recordActivity()` from `src/lib/engagement.ts` into event points:

| Activity Type | Trigger Point | Points |
|---------------|--------------|--------|
| `portal_login` | `src/lib/auth.ts` sign-in callback | 2 (already wired) |
| `deal_submitted` | `POST /api/deals` (partner deal submission) | 10 |
| `training_completed` | `PATCH /api/training/progress` (mark module complete) | 5 |
| `call_attended` | Conference join tracking / attendance API | 5 |
| `link_shared` | `POST /api/referral-links/track` or copy-link event | 3 |
| `downline_recruited` | `POST /api/signup` (new partner via recruitment link) | 8 |
| `email_open` | SendGrid webhook `open` event | 1 |
| `email_click` | SendGrid webhook `click` event | 3 |

### 9.1 Partner Engagement UI

Add to admin partners list (`/admin/partners`):
- `engagementScore` column (numeric, sortable)
- `engagementTier` badge: hot (red/flame), active (green), cooling (yellow), cold (gray)
- Filter dropdown: "All tiers" / "Hot" / "Active" / "Cooling" / "Cold"

Add to partner detail page (`/admin/partners/[code]`):
- Engagement card showing score, tier, last activity date
- Activity timeline (last 20 `PartnerActivity` entries)

## 10. Implementation Order

1. **Persona tool sharing** — extract shared tools, wire into chat API (prerequisite for everything)
2. **Chat widget UI** — bubble + panel + mobile overlay
3. **Unread badge** — new endpoint + polling
4. **Human handoff UX** — "Talk to a person" flow + live chat mode in panel
5. **Audit log wiring** — add `logAudit()` to ~15 routes
6. **Engagement scoring wiring** — add `recordActivity()` to ~7 event points
7. **Engagement UI** — admin partners table columns + partner detail card

Steps 5-7 are independent of 1-4 and can be parallelized.
