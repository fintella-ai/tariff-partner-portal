# Partner-to-Downline Direct Messaging — Design

**Date:** 2026-04-20
**Status:** Approved for implementation
**Surface:** `/dashboard/messages` (partner) + `/admin/partner-dm-flags` (admin review) + new API tree under `/api/partner-dm/*` and `/api/admin/partner-dm-flags/*`

## Goal

Let partners privately message their direct parent-child counterparties inside the portal. L1 ↔ their direct L2s. L2 ↔ their direct L3s. No skip-level (L1↔L3 blocked). No siblings. No arbitrary pairs. Abuse is governed by a partner-filed flag that notifies admins, auto-throttles the sender, and is resolved by admin review (dismiss or confirm → suspend).

## Non-goals (v1)

- Group chats (>2 participants)
- Attachments, images, files
- Threaded replies within a message
- Reactions, emoji, typing indicators
- Read receipts visible to the other party (we store per-participant read state for unread badges, but we don't expose "read by X at Y" to the other partner)
- Message search across threads
- Cross-language auto-translate
- Admin-initiated access to non-flagged threads

## Architecture

Five new Prisma models. SSE lives on the same `admin_chat_events` Postgres channel already used by Team Chat and announcement channels — this stays one bus. All permission gates (relationship validation + throttle/suspend ladder) run server-side on every message POST.

## Schema (all new tables)

```prisma
model PartnerDmThread {
  id             String   @id @default(cuid())
  participantA   String   // partnerCode, lex-sorted so (A, B) is canonical (A < B)
  participantB   String
  lastMessageAt  DateTime @default(now())
  createdAt      DateTime @default(now())

  messages   PartnerDmMessage[]
  readStates PartnerDmReadState[]

  @@unique([participantA, participantB])
  @@index([participantA])
  @@index([participantB])
  @@index([lastMessageAt])
}

model PartnerDmMessage {
  id                String    @id @default(cuid())
  threadId          String
  senderPartnerCode String
  content           String
  editedAt          DateTime?
  deletedAt         DateTime?
  createdAt         DateTime  @default(now())

  thread PartnerDmThread  @relation(fields: [threadId], references: [id], onDelete: Cascade)
  flags  PartnerDmFlag[]

  @@index([threadId, createdAt])
  @@index([senderPartnerCode])
}

model PartnerDmFlag {
  id                   String    @id @default(cuid())
  messageId            String
  flaggerPartnerCode   String
  reason               String?
  reviewedAt           DateTime?
  reviewedByAdminEmail String?
  verdict              String?   // "dismissed" | "confirmed"
  createdAt            DateTime  @default(now())

  message PartnerDmMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([reviewedAt])
  @@index([flaggerPartnerCode])
  @@index([messageId])
}

model PartnerDmThrottle {
  id            String    @id @default(cuid())
  partnerCode   String    @unique      // one active throttle record per sender
  state         String    // "throttled" | "suspended"
  reasonFlagId  String?                // which flag triggered this state
  startedAt     DateTime  @default(now())
  liftedAt      DateTime?              // null = active
}

model PartnerDmReadState {
  id          String   @id @default(cuid())
  threadId    String
  partnerCode String
  lastReadAt  DateTime @default(now())

  thread PartnerDmThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@unique([threadId, partnerCode])
}
```

## Relationship validation (load-bearing security)

New pure helper `src/lib/partnerDmGate.ts` exports:

```ts
canPartnersDm(
  a: { partnerCode: string; tier: string; referredByPartnerCode: string | null },
  b: { partnerCode: string; tier: string; referredByPartnerCode: string | null }
): boolean
```

Returns true iff ONE of the following four patterns holds:

- `a.tier === "l1"` and `b.tier === "l2"` and `b.referredByPartnerCode === a.partnerCode`
- `b.tier === "l1"` and `a.tier === "l2"` and `a.referredByPartnerCode === b.partnerCode`
- `a.tier === "l2"` and `b.tier === "l3"` and `b.referredByPartnerCode === a.partnerCode`
- `b.tier === "l2"` and `a.tier === "l3"` and `a.referredByPartnerCode === b.partnerCode`

Returns false otherwise. No skip-level. No siblings. No arbitrary pairs. Pure function, fully unit-testable, 6+ test cases.

Enforced at:
1. Thread create (`POST /api/partner-dm/threads`)
2. Message post (`POST /api/partner-dm/threads/[id]/messages`) — double-check even on existing threads in case a tier change invalidates the pair mid-flight

## Canonical thread key

On thread create, lex-sort the two partnerCodes → store as `(participantA, participantB)` with `participantA < participantB`. Prevents duplicate threads in either direction. Helper `canonicalizePair(a, b): [string, string]` in the same gate lib.

## API

All partner endpoints require a partner session (`partnerCode` in session). All admin endpoints require `super_admin | admin | partner_support` role (the three with flag-review permissions; accounting gets no access).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/partner-dm/threads` | List my threads sorted by `lastMessageAt` desc, with per-thread unread count |
| `POST` | `/api/partner-dm/threads` | `{counterpartyCode}` — gate validates, upserts canonical thread |
| `GET` | `/api/partner-dm/threads/[id]` | Messages, participant-only |
| `POST` | `/api/partner-dm/threads/[id]/messages` | Send (rate + throttle + suspend ladder) |
| `POST` | `/api/partner-dm/threads/[id]/read` | Upsert `PartnerDmReadState.lastReadAt = now` |
| `PATCH` | `/api/partner-dm/messages/[id]` | Edit (sender only, ≤24h) |
| `DELETE` | `/api/partner-dm/messages/[id]` | Soft delete (sender only, ≤24h) |
| `POST` | `/api/partner-dm/messages/[id]/flag` | `{reason?}` — creates flag, throttles sender, notifies review admins |
| `GET` | `/api/partner-dm/stream?threadId=X` | SSE live push (participant-only) |
| `GET` | `/api/admin/partner-dm-flags` | Admin inbox: all pending flags + recently-reviewed (paginated, reviewer ∈ {super_admin, admin, partner_support}) |
| `GET` | `/api/admin/partner-dm-flags/[id]` | Flag detail + the flagged message + last 20 messages of surrounding thread context |
| `POST` | `/api/admin/partner-dm-flags/[id]/review` | `{verdict: "dismissed" \| "confirmed"}` — dismiss lifts throttle; confirm promotes to suspend |
| `POST` | `/api/admin/partner-dm-flags/suspensions/[partnerCode]/lift` | Super_admin only — manually lift a `suspended` throttle after time served |

## Rate-limit + throttle + suspend ladder

Every POST `/api/partner-dm/threads/[id]/messages`:

1. Look up `PartnerDmThrottle` for the sender.
   - `state === "suspended"` → 403 `{error: "DM privileges suspended pending review"}`
   - `state === "throttled"` → sliding window: max 1 message in the last 60 min across ALL sender's threads (per-sender, not per-thread). Hit = 429 with `Retry-After`.
   - no row → baseline: 60 messages / hour / sender (per-sender, in-memory sliding window).
2. If allowed, write message in transaction: insert `PartnerDmMessage`, bump `PartnerDmThread.lastMessageAt`.
3. Publish SSE event `partner_dm.message.created` on `admin_chat_events`.
4. Create `Notification` for recipient (`type: "partner_dm_message"`, icon 💬).

## Flag pipeline

`POST /api/partner-dm/messages/[id]/flag`:

1. Partner must be a participant of the thread the message belongs to, and must not be the sender (can't flag your own message).
2. Insert `PartnerDmFlag` row.
3. Upsert `PartnerDmThrottle` for the SENDER with `state="throttled"`, `reasonFlagId=<flag.id>`. If already throttled, do nothing (existing throttle stays active).
4. Create `Notification` for every admin whose role is in `{super_admin, admin, partner_support}`, `type: "partner_dm_flag"`, icon 🚩, link `/admin/partner-dm-flags/<flag.id>`.
5. Publish SSE event `partner_dm.flag.created` on `admin_chat_events`.

`POST /api/admin/partner-dm-flags/[id]/review`:

- `verdict: "dismissed"` → set `PartnerDmFlag.verdict`, `reviewedAt`, `reviewedByAdminEmail`. Lift `PartnerDmThrottle` (`liftedAt=now`). Notify flagger (`type: "partner_dm_flag_outcome"`, title "Flag dismissed: no violation found") and sender ("Messaging restored").
- `verdict: "confirmed"` → set flag fields. Upgrade throttle: set `state="suspended"`, `reasonFlagId=<flag.id>`. Notify sender ("DM privileges suspended. Contact support to appeal.").

Manual lift (`POST /api/admin/partner-dm-flags/suspensions/[partnerCode]/lift`):
- Super_admin only. Sets `liftedAt`. Notifies sender.

## UI surfaces

### Partner — `/dashboard/messages`
- New sidebar entry "Messages" with unread badge. Added to `/dashboard/layout.tsx` partner nav list.
- Left rail: thread list (counterparty name + last-message preview + unread count + timestamp).
- Right pane: conversation view. Each incoming message has a hover-revealed "Flag" button opening a small prompt for an optional reason.
- Compose input at the bottom. Plain text. Enter to send, Shift+Enter for newline.
- Starting a new DM: on `/dashboard/downline`, a "Message" button appears next to each eligible counterparty (the partner's direct parent or any of their direct children, depending on tier). Click → creates thread via POST + redirects to the conversation.

### Admin — `/admin/partner-dm-flags`
- Sidebar entry "DM Flags" (visible to super_admin, admin, partner_support — hidden for accounting). Unread-count badge.
- List table: flag time, flagger (with partner link), sender (with partner link), message preview (first 80 chars), verdict badge (none / dismissed / confirmed), reviewer name.
- Filter pills: "Pending" (default) / "Reviewed" / "All".
- Click a row → flag detail page: the flagged message (highlighted) + 20 surrounding messages from the same thread (plain reading, non-editable). Dismiss + Confirm buttons. Both prompt for a one-line note captured in the same review POST as an audit trail.
- Accounting role: sidebar entry hidden, API rejects any request from an accounting session with 403.

## Real-time (SSE via shared `admin_chat_events` bus)

New event types on the existing channel:

- `partner_dm.message.created` — pushed to both thread participants. Stream filters by `threadId` in the URL.
- `partner_dm.message.updated`
- `partner_dm.message.deleted`
- `partner_dm.flag.created` — pushed to admin flag-inbox streams. Handled by a new admin-facing stream endpoint at `/api/admin/partner-dm-flags/stream`.

`PortalChatEvent` union in `src/lib/portalChatEvents.ts` grows to accept these five additional event-name literals. Existing Team Chat + announcement-channel events remain unaffected.

## Notifications (bell icons + types)

Add to `TYPE_ICONS` in `NotificationBell.tsx`:
- `partner_dm_message`: `"💬"`
- `partner_dm_flag`: `"🚩"`
- `partner_dm_flag_outcome`: `"✅"` (outcome is shown textually — "Flag dismissed" or "Flag confirmed")

## Permissions matrix

| Role | Read own threads | Send in own threads | Flag a message | View flag inbox | Dismiss/Confirm flags | Manual lift suspension |
|---|---|---|---|---|---|---|
| **partner** | ✓ | ✓ (subject to rate/throttle/suspend) | ✓ | ✗ | ✗ | ✗ |
| **super_admin** | ✗ (browse) / ✓ (surrounding context on a flagged message) | ✗ | — | ✓ | ✓ | ✓ |
| **admin** | ✗ / ✓ same context window on flagged messages | ✗ | — | ✓ | ✓ | ✗ |
| **partner_support** | ✗ / ✓ same context window on flagged messages | ✗ | — | ✓ | ✓ | ✗ |
| **accounting** | ✗ | ✗ | — | ✗ | ✗ | ✗ |

**Privacy posture:** admins NEVER browse partner-to-partner threads freely. They only see a 20-message context window surrounding a message that a participant has explicitly flagged. Non-flagged threads are invisible to all non-participants.

Enforced server-side on:
- `GET /api/partner-dm/threads/[id]` → reject if caller isn't `participantA` or `participantB`.
- `GET /api/admin/partner-dm-flags/[id]` → server returns the flagged message + only the last 20 messages of that thread. No arbitrary thread browsing.

## Rate limits

- Baseline send: 60 messages / hour / sender, sliding window, in-memory per serverless instance.
- Throttled send: 1 message / hour / sender (per-sender across all threads).
- Suspended send: 0 (reject 403).
- Thread create: 5 / day / partner (prevents thread-spam).
- Flag create: 10 / day / flagger (prevents weaponized flagging).
- Message body ≤ 10KB.
- Flag reason ≤ 1KB.

## Error handling

- Gate fails at thread create → 403 `"Partners are not in a direct parent-child relationship"`.
- Gate fails at message post (tier changed mid-flight) → 403, log for auditing.
- Flag on non-existent or already-deleted message → 404.
- Review on non-pending flag → 409 `"Flag already reviewed"` (idempotency).
- Double-flag from the same flagger on the same message → 409 (unique on `messageId + flaggerPartnerCode` inside the handler, not schema).
- SSE disconnect → client EventSource auto-reconnects; fall back to 5s polling after three failures.

## Testing

Unit tests (Node `assert` via `npx ts-node`):
- `src/lib/__tests__/partnerDmGate.test.ts` — all 4 allowed patterns + 6 disallowed patterns (sibling, skip-level, non-direct child, arbitrary pairs, swapped tiers, self-DM).
- `src/lib/__tests__/partnerDmCanonical.test.ts` — `canonicalizePair` alphabetic ordering, idempotency, identical-code rejection.

Integration (manual, post-deploy):
- L1 → their direct L2 → works.
- L1 → an L3 → 403.
- L2A → L2B (sibling under same L1) → 403.
- Flag fires notification to admin + partner_support + super_admin (not accounting).
- Throttle enforces 1/hr after flag.
- Dismiss lifts throttle. Confirm upgrades to suspend.

## Files touched

**New:**
- `src/lib/partnerDmGate.ts` — `canPartnersDm`, `canonicalizePair`
- `src/lib/__tests__/partnerDmGate.test.ts`
- `src/lib/__tests__/partnerDmCanonical.test.ts`
- `src/app/api/partner-dm/threads/route.ts` (GET + POST)
- `src/app/api/partner-dm/threads/[id]/route.ts` (GET)
- `src/app/api/partner-dm/threads/[id]/messages/route.ts` (POST)
- `src/app/api/partner-dm/threads/[id]/read/route.ts` (POST)
- `src/app/api/partner-dm/messages/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/partner-dm/messages/[id]/flag/route.ts` (POST)
- `src/app/api/partner-dm/stream/route.ts` (SSE)
- `src/app/api/admin/partner-dm-flags/route.ts` (GET list)
- `src/app/api/admin/partner-dm-flags/[id]/route.ts` (GET detail)
- `src/app/api/admin/partner-dm-flags/[id]/review/route.ts` (POST)
- `src/app/api/admin/partner-dm-flags/suspensions/[partnerCode]/lift/route.ts` (POST, super_admin only)
- `src/app/api/admin/partner-dm-flags/stream/route.ts` (SSE)
- `src/app/(partner)/dashboard/messages/page.tsx` — partner UI
- `src/app/(partner)/dashboard/messages/[threadId]/page.tsx` — conversation view
- `src/app/(admin)/admin/partner-dm-flags/page.tsx` — admin inbox
- `src/app/(admin)/admin/partner-dm-flags/[id]/page.tsx` — flag detail
- `src/components/ui/FlagButton.tsx` — the hover-revealed flag button + reason prompt

**Modified:**
- `prisma/schema.prisma` — 5 new models
- `src/lib/portalChatEvents.ts` — extend union with the 4 new `partner_dm.*` event literals
- `src/lib/permissions.ts` — add `"messages"` (partner nav) and `"partnerDmFlags"` (admin nav) to appropriate `ROLE_VISIBLE_NAV` entries
- `src/app/(admin)/admin/layout.tsx` — sidebar entry "DM Flags"
- `src/app/(partner)/dashboard/layout.tsx` — sidebar entry "Messages"
- `src/app/(partner)/dashboard/downline/page.tsx` — "Message" button next to eligible counterparties (strictly additive render; no backend change)
- `src/components/ui/NotificationBell.tsx` — three new `TYPE_ICONS` entries

**Explicitly NOT touched:**
- `src/app/api/webhook/referral/route.ts` (partner testing)
- Existing `ChatSession` / `ChatMessage` (partner-support chat)
- Existing `AdminChatThread*` models (Team Chat)
- Existing `AnnouncementChannel*` models

## Implementation phasing (suggested, revisable at plan time)

1. Schema + Prisma generate
2. `partnerDmGate` pure lib + unit tests
3. Thread + message CRUD API (gate-checked)
4. Rate-limit + throttle + suspend helpers
5. Flag POST + review POST + manual lift
6. Partner UI (`/dashboard/messages` + conversation view + `FlagButton` component)
7. Admin UI (`/admin/partner-dm-flags` + detail page)
8. SSE transport (two new endpoints) + event-union extension
9. Sidebar entries + `Downline` "Message" button + notification icons
10. Final sweep + PR
