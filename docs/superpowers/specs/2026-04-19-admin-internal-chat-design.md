# Admin Internal Chat — Design

**Date:** 2026-04-19
**Status:** Approved for implementation
**Surface:** New `/admin/team-chat` route + new API under `/api/admin/team-chat/*`

## Goal

A real-time, admin-only collaboration surface inside the Fintella admin panel. Two ways in: a single global room for cross-org chatter, and a per-deal thread auto-attached to every `Deal` for deal-specific discussion. `@mention` routes to specific admins via Notifications. Messages posted in a deal-scoped thread (or a global-room message that tags a deal) also write a `DealNote` so the existing deal expansion at `/admin/deals` surfaces the chatter.

## Non-goals (explicitly out of v1, deferred to follow-on specs)

- Threaded replies within a message (schema is ready via `parentMessageId`; no UI in v1)
- Emoji reactions, file attachments, message pinning
- Search across threads (only in-thread filter in v1)
- Admin-to-admin 1:1 DMs (separate feature, separate spec)
- Slash commands

## Architecture

### Schema (new tables + one new `Deal` pointer column)

```prisma
model AdminChatThread {
  id            String   @id @default(cuid())
  type          String   // "global" | "deal"
  dealId        String?  @unique  // non-null when type="deal"; unique so exactly one thread per deal
  lastMessageAt DateTime @default(now())
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  messages   AdminChatMessage[]
  readStates AdminChatReadState[]

  @@index([type])
  @@index([lastMessageAt])
}

model AdminChatMessage {
  id              String    @id @default(cuid())
  threadId        String
  senderEmail     String    // admin email (from session)
  senderName      String
  content         String    // raw content with @[Name](email) + [deal:ID] tokens
  parentMessageId String?   // reserved for v1.1 threaded replies; always null in v1
  editedAt        DateTime?
  deletedAt       DateTime? // soft delete; UI renders placeholder
  createdAt       DateTime  @default(now())

  thread   AdminChatThread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  mentions AdminChatMention[]

  @@index([threadId, createdAt])
  @@index([parentMessageId])
}

model AdminChatMention {
  id                  String    @id @default(cuid())
  messageId           String
  mentionedAdminEmail String
  notifiedAt          DateTime? // set when the Notification row is created
  acknowledgedAt      DateTime? // set when mentioned admin first opens the message
  createdAt           DateTime  @default(now())

  message AdminChatMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([mentionedAdminEmail])
  @@index([messageId])
}

model AdminChatReadState {
  id                String   @id @default(cuid())
  threadId          String
  adminEmail        String
  lastReadMessageId String?
  lastReadAt        DateTime @default(now())

  thread AdminChatThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@unique([threadId, adminEmail])
  @@index([adminEmail])
}
```

**Additive column on existing models:**

```prisma
model DealNote {
  // ... existing fields unchanged ...
  sourceChatMessageId String?  // when DealNote was mirrored from an AdminChatMessage
  @@index([sourceChatMessageId])
}
```

No changes to existing Deal or ChatSession / ChatMessage (those stay reserved for partner-support chat).

### Content token format

Messages store the canonical raw form in `AdminChatMessage.content`:

- Mention: `@[John Orlando](john@fintellaconsulting.com)` — name is the display text at insertion time, email is the unambiguous identifier.
- Deal chip: `[deal:<cuid>]` — resolved at render time to a clickable chip showing `dealName`.

A pure renderer `src/lib/renderAdminChatContent.ts` (mirrors `linkifyDeals.ts`) takes the raw content plus a deal lookup map and returns React-ready segments: `{type:"text"} | {type:"mention",email,name} | {type:"deal",dealId,dealName}`.

### Real-time transport (SSE)

**New endpoint:** `GET /api/admin/team-chat/stream?threadId=<id>`

- Admin-session-gated.
- Returns `text/event-stream` with Node runtime (`export const runtime = "nodejs"`).
- Writes events from a Postgres `LISTEN`/`NOTIFY` channel OR an in-process `EventEmitter` (see "Event bus" below).
- Events:
  - `message.created` — `{ message, mentions }`
  - `message.updated` — `{ messageId, content, editedAt }`
  - `message.deleted` — `{ messageId }`
- Client uses `EventSource`. On disconnect, browser auto-reconnects. If the environment blocks SSE (some corporate proxies), fall back to 5s polling on the same thread API — feature-detect via an `X-Event-Stream-Supported` probe.

**Event bus trade-off:**

- **Chosen for v1:** Postgres `LISTEN`/`NOTIFY` on channel `admin_chat_events`. Works across multiple serverless instances without external infra. Neon supports it natively.
- Considered: Redis pub/sub — would need a separate managed instance, adds ops. Rejected for v1.
- Considered: in-memory `EventEmitter` — doesn't work across Vercel serverless instances; rejected.

The POST/PATCH/DELETE handlers for messages call `prisma.$executeRaw`\`SELECT pg_notify('admin_chat_events', <json>)\` after their DB writes. The SSE handler runs a persistent `LISTEN` via `pg` directly (bypassing Prisma's connection pool — Prisma doesn't expose LISTEN).

### API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/team-chat/threads` | List threads (global pinned + deal threads with activity in last 30d by default), with per-thread unread count for the current admin |
| `GET` | `/api/admin/team-chat/threads/[id]` | Get a single thread's messages (paginated, newest-first, 50 per page) + mentions, resolved deal lookups |
| `POST` | `/api/admin/team-chat/threads/[id]/messages` | Post a new message; parses mentions from content tokens, creates `AdminChatMention` rows + `Notification` rows + mirrors to `DealNote` when applicable |
| `PATCH` | `/api/admin/team-chat/messages/[id]` | Edit content (sender-only within 24h, or super_admin anytime). Updates `editedAt`. Also updates mirrored `DealNote`. |
| `DELETE` | `/api/admin/team-chat/messages/[id]` | Soft-delete (same gate). Sets `deletedAt`. Cascades to mirrored `DealNote` via `sourceChatMessageId`. |
| `POST` | `/api/admin/team-chat/threads/[id]/read` | Upsert `AdminChatReadState` with `lastReadMessageId` = current newest, `lastReadAt` = now. |
| `GET` | `/api/admin/team-chat/admins` | List active admins (for mention autocomplete): `{email, name, role}[]`. Queries `prisma.user.findMany` directly, returning all rows (no disabled flag exists on User today). |
| `GET` | `/api/admin/team-chat/stream` | SSE endpoint (see above) |

All endpoints are session-gated to `isAnyAdmin(role)`. No finer role-based restriction in v1 — all four admin roles (super_admin, admin, accounting, partner_support) have equal read + post access. Only super_admin overrides the 24h edit/delete window.

### Deal-thread lifecycle

- **Eager creation** via a helper `getOrCreateDealThread(prisma, dealId)` that upserts an `AdminChatThread` row with `type="deal"`, `dealId=<id>`. Called from:
  - `src/app/api/webhook/referral/route.ts` POST handler (inbound-created deals) — in the SAME transaction as the `Deal.create` so the thread exists before the response returns. **Strictly additive** — no existing POST/PATCH behavior changes; thread creation is appended to the transaction.
  - Admin-manual deal-creation paths (if any exist — audit at plan time).
- Global thread is created by a singleton upsert on first app load via a one-shot migration script `scripts/ensure-global-admin-chat-thread.ts` invoked from the existing build pipeline.

### Mention pipeline

On `POST /api/admin/team-chat/threads/[id]/messages`:

1. Parse `content` for `@[name](email)` tokens. Extract unique emails.
2. Validate: each email must belong to an active admin. Invalid emails become plain text (token stripped in storage to prevent dangling mentions).
3. Validate: each `[deal:<id>]` token refers to a real deal. Invalid tokens become plain text.
4. Insert `AdminChatMessage` row.
5. Bulk-insert `AdminChatMention` rows (one per mentioned admin).
6. For each mention, create a `Notification` row: `recipientType: "admin"`, `recipientId: <mentionedAdminEmail>`, `type: "admin_mention"`, `title: "<Sender> mentioned you"`, `message: <first 100 chars of content with tokens rendered>`, `link: "/admin/team-chat?threadId=<id>#msg-<msgId>"`. Set `AdminChatMention.notifiedAt = now()`.
7. If thread is `type="deal"` OR content contains a `[deal:<id>]` token: mirror to `DealNote` with `sourceChatMessageId = <msgId>`. For global-room messages tagging multiple deals, one `DealNote` per tag.
8. `pg_notify('admin_chat_events', ...)` with the `message.created` event.

### Per-user read state

- Sidebar unread counts per thread: `messages where createdAt > lastReadAt AND senderEmail != me AND deletedAt IS NULL`.
- Global badge on nav = sum across all threads the admin has visible.
- `POST /api/admin/team-chat/threads/[id]/read` called on thread-open and on every new message arrival while the thread is focused.

### UI

**Route:** `/admin/team-chat`
**Sidebar entry:** "Team Chat" with chat-bubble icon + unread badge. Added to `ADMIN_NAV_IDS_DEFAULT` in `src/app/(admin)/admin/layout.tsx` between `chat` and `settings`.

**Desktop layout (3 panes):**
- **Left rail (240px):** search input (stretch), "Global Room" (pinned top) + "Recent Deal Threads" list sorted by `lastMessageAt` desc, last 30 days by default. Per-item: deal name (or "Global"), last-message snippet, unread count badge.
- **Center (flex):** active thread. Header with type/deal link/member list. Message stream with date dividers. Hover actions per message: Edit (pencil), Delete (trash), Copy link, Add reaction (disabled in v1, shown greyed). Auto-scroll to bottom on new messages UNLESS user has scrolled up.
- **Right panel (320px, collapsible):** thread info — type, linked deal (if deal thread) with quick stats, pinned messages (v1.1), active-admin roster.

**Mobile:** single-pane, back-button nav between rail and thread. Right panel becomes a "Details" sheet.

**Mention input:**
- New component `src/components/ui/MentionInput.tsx`.
- `@` triggers admin autocomplete popover (fetches from `/api/admin/team-chat/admins`, 5-minute client cache).
- `#` (or `[deal:` keyboard accel) triggers deal autocomplete (fetches deals owned or assigned to any partner the admin touches — server-side filter scope at plan time).
- Keyboard: Arrow keys navigate, Enter selects, Escape closes.
- Tokens render as pills in the input via contenteditable-free logic (mirrors the Twitter-compose pattern): input is a plain `<textarea>` storing raw tokens; a positioned overlay renders the pill preview. Submit sends the raw token string.

**Rate limits:** 20 messages / 60s / admin_email, enforced server-side. Content max 10KB.

### Notifications integration

- New notification `type: "admin_mention"`. TypeIcons map in `NotificationBell` gets `"admin_mention": "👋"`.
- Clicking a mention notification opens `/admin/team-chat?threadId=<id>#msg-<id>`, which triggers the thread open + a hash-anchor scroll to the message + fades a highlight for 2s.
- `AdminChatMention.acknowledgedAt` is set when the mentioned admin renders that message id on screen (intersection observer).

### Permissions

| Role | Read all threads | Post | Edit own msg (<24h) | Delete own msg (<24h) | Delete any msg | See deal thread for deal they can't access |
|---|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| accounting | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| partner_support | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |

All four admin roles have equal access in v1. Admin-panel role gate (`isAnyAdmin`) is the only check.

## Error handling

- SSE disconnects → client auto-reconnects via `EventSource`. On third failure within 30s, fall back to 5s polling.
- `pg_notify` failure → message still saved; SSE clients miss live push but see it on next polling tick (or next reconnect via initial `GET`).
- Invalid mention email → stripped from stored content as plain text (no dangling tokens).
- Deal-note mirror failure → logged, message creation still succeeds (DealNote mirror is best-effort; reconciliation job can backfill).
- Rate-limit hit → 429 with `Retry-After`.

## Testing

- **Unit tests** (Node `assert` via `npx ts-node`):
  - `src/lib/__tests__/renderAdminChatContent.test.ts` — token parsing, mention extraction, deal-chip resolution, fallbacks
  - `src/lib/__tests__/parseMentions.test.ts` — valid email extraction, dangling-token stripping
- **Integration** (manual, post-deploy):
  - Super_admin posts `@[John](john@fintellaconsulting.com)` in Global — sees deal expansion, gets notification
  - Deal-thread post mirrors to DealNote — appears on `/admin/deals` expansion
  - SSE connects — open two browsers as different admins, verify live message delivery in < 1s
  - Mention acknowledgement — open a mention notification, verify `acknowledgedAt` populates

## Files touched

**New:**
- `src/lib/renderAdminChatContent.ts` — pure renderer
- `src/lib/parseMentions.ts` — token extraction, validation helpers
- `src/lib/adminChatEvents.ts` — `pg_notify` + `LISTEN` bus helpers
- `src/lib/__tests__/renderAdminChatContent.test.ts`
- `src/lib/__tests__/parseMentions.test.ts`
- `src/app/api/admin/team-chat/threads/route.ts` (GET list)
- `src/app/api/admin/team-chat/threads/[id]/route.ts` (GET single)
- `src/app/api/admin/team-chat/threads/[id]/messages/route.ts` (POST)
- `src/app/api/admin/team-chat/messages/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/admin/team-chat/threads/[id]/read/route.ts` (POST)
- `src/app/api/admin/team-chat/admins/route.ts` (GET)
- `src/app/api/admin/team-chat/stream/route.ts` (GET SSE)
- `src/app/(admin)/admin/team-chat/page.tsx` — main UI
- `src/components/ui/MentionInput.tsx` — mention + deal-chip autocomplete input
- `src/components/ui/AdminChatMessage.tsx` — message bubble
- `src/components/ui/AdminChatThreadList.tsx` — rail
- `scripts/ensure-global-admin-chat-thread.ts` — idempotent ensure-global script, invoked from `scripts/seed-all.js`

**Modified:**
- `prisma/schema.prisma` — 4 new models + 1 new `DealNote` column
- `src/app/(admin)/admin/layout.tsx` — add "Team Chat" nav entry with unread badge
- `src/components/ui/NotificationBell.tsx` — add `"admin_mention": "👋"` to `TYPE_ICONS`
- `src/app/api/webhook/referral/route.ts` — **additive only**: wrap existing `Deal.create` in a transaction that also runs `getOrCreateDealThread`. Zero change to existing field extraction, auth, HMAC, response shape, or error handling. Partners currently testing this endpoint are unaffected.
- `scripts/seed-all.js` — call `ensure-global-admin-chat-thread.ts` after seed

## Implementation phasing (suggested, revisable at plan time)

1. Schema + Prisma generate + `pg_notify` helper library + global-thread ensure script
2. Pure libraries (`renderAdminChatContent`, `parseMentions`) with unit tests
3. Thread + message CRUD API (without SSE; polling-only)
4. Basic `/admin/team-chat` page with thread list, message stream, text-only compose (no mentions yet)
5. `MentionInput` component + mention pipeline + `Notification` integration
6. Deal-chip autocomplete + `DealNote` mirror
7. SSE transport + event bus
8. Read state + unread badges
9. Edit + soft-delete UI + API
10. E2E validation in production

Each phase is an independent commit. PR can land all of them or can split into multiple.
