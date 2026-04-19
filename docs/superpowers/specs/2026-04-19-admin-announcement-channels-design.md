# Admin Announcement Channels — Design

**Date:** 2026-04-19
**Status:** Approved for implementation
**Surface:** `/admin/channels` (admin) + `/dashboard/announcements` (partner) + new API under `/api/admin/channels/*` and `/api/announcements/*`

## Goal

A broadcast-style communication channel where admins curate specific partners, post announcements (text + live-call links), and partners can reply — but replies are PRIVATE per-partner threads visible only to admins, not to other channel members. Complements (does not replace) the admin-internal Team Chat at `/admin/team-chat` and the future partner-to-downline DM feature.

## Non-goals (v1)

- Embedded video/audio calls — call-link announcements point to external URLs (Zoom/Meet/Twilio rooms/etc.) only.
- Email / SMS announcement fan-out — in-portal notifications only.
- Rich media attachments (images, files) in either the broadcast feed or reply threads.
- Scheduled / future-dated announcements.
- Reactions, threaded replies within the main feed, search, engagement analytics.

## Architecture

Four new Prisma models + one new notification type. SSE transport reuses the Postgres `LISTEN`/`NOTIFY` bus the admin Team Chat spec (2026-04-19) introduces — same channel name (`portal_chat_events`), different event types.

## Schema

```prisma
model AnnouncementChannel {
  id             String   @id @default(cuid())
  name           String
  description    String?
  createdByEmail String
  segmentRule    String?  // JSON: { filters: [{field, op, value}, ...] }
  archivedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  memberships ChannelMembership[]
  messages    ChannelMessage[]
  threads     ChannelReplyThread[]

  @@index([createdByEmail])
  @@index([archivedAt])
}

model ChannelMembership {
  id           String    @id @default(cuid())
  channelId    String
  partnerCode  String
  source       String    // "manual" | "segment"
  addedByEmail String
  removedAt    DateTime? // soft remove; sticky across segment re-eval
  createdAt    DateTime  @default(now())

  channel AnnouncementChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([channelId, partnerCode])
  @@index([partnerCode])
  @@index([channelId, removedAt])
}

model ChannelMessage {
  id          String    @id @default(cuid())
  channelId   String
  authorEmail String
  authorName  String
  content     String
  messageType String    // "text" | "call_link"
  callMeta    String?   // JSON: {url, title, startsAt?, durationMins?, provider?}
  editedAt    DateTime?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())

  channel AnnouncementChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  @@index([channelId, createdAt])
}

model ChannelReplyThread {
  id            String   @id @default(cuid())
  channelId     String
  partnerCode   String
  lastMessageAt DateTime @default(now())
  createdAt     DateTime @default(now())

  channel  AnnouncementChannel   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  messages ChannelReplyMessage[]

  @@unique([channelId, partnerCode])
  @@index([lastMessageAt])
}

model ChannelReplyMessage {
  id            String    @id @default(cuid())
  threadId      String
  senderType    String    // "admin" | "partner"
  senderEmail   String?   // admin email when senderType="admin"
  senderName    String
  content       String
  editedAt      DateTime?
  deletedAt     DateTime?
  readByAdmin   Boolean   @default(false)
  readByPartner Boolean   @default(false)
  createdAt     DateTime  @default(now())

  thread ChannelReplyThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

No changes to existing models. Notification type surface adds two new values — `channel_announcement` and `channel_reply`.

## Segment rule DSL

```json
{
  "filters": [
    { "field": "tier", "op": "in", "value": ["l1"] },
    { "field": "status", "op": "eq", "value": "active" },
    { "field": "state", "op": "eq", "value": "TX" }
  ]
}
```

**v1 fields:** `tier | status | state | signedAgreement | l3Enabled` (booleans serialize as `eq true` / `eq false`).
**v1 ops:** `eq | in | neq`.
**Combination:** AND across all filters (no OR in v1).
**State field:** reads from `PartnerProfile.state` via join (partner has zero or one profile).
**signedAgreement:** true when the partner has any `PartnershipAgreement` with `status IN ('signed', 'approved')`.

**Re-evaluation triggers:**
- Channel create: seed memberships with `source="segment"` from every currently-matching Partner.
- Channel edit (segment rule changes): additive only — new matches get `source="segment"` rows; existing rows don't change.
- On Partner signup: re-evaluate every non-archived channel's rule; add new matching rows.
- Admin-clicked "Resync" button: full re-run; adds missing segment rows, does NOT touch manual rows or removed rows.

**Manual overrides:**
- Admin can add a partner who doesn't match the rule → row with `source="manual"`, full access.
- Admin can remove a partner who does match → `removedAt` set. Subsequent segment re-runs will NOT re-add them (check `removedAt IS NULL OR source="manual"`).
- Admin can "restore" a manually-removed partner by null-ing `removedAt`.

Pure helper `src/lib/channelSegments.ts` exports `evaluateSegmentRule(rule, partner, profile, agreementStatus)` returning boolean + `expandSegmentMatches(prisma, rule)` returning `partnerCode[]`. Unit tests via `npx ts-node`.

## API

All admin endpoints session-gated to `isAnyAdmin(role)`. Partner endpoints require a partner session + active membership (`ChannelMembership` with `removedAt IS NULL`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/channels` | List all non-archived channels with member count + unread-reply count per admin |
| `POST` | `/api/admin/channels` | Create channel (name, description, segmentRule, initial manual members) |
| `GET` | `/api/admin/channels/[id]` | Channel detail + recent feed + reply-thread summary |
| `PATCH` | `/api/admin/channels/[id]` | Edit name / description / segmentRule |
| `DELETE` | `/api/admin/channels/[id]` | Archive (soft — sets `archivedAt`; messages preserved, partner UI hides it) |
| `POST` | `/api/admin/channels/[id]/members` | Add partners (manual) — array of partnerCodes |
| `DELETE` | `/api/admin/channels/[id]/members/[partnerCode]` | Sticky-remove |
| `POST` | `/api/admin/channels/[id]/resync` | Re-run segment rule; adds missing segment rows |
| `GET` / `POST` | `/api/admin/channels/[id]/messages` | List / author announcement (text or call_link) |
| `PATCH` / `DELETE` | `/api/admin/channels/messages/[id]` | Edit (24h sender window) / soft-delete |
| `GET` | `/api/admin/channels/[id]/reply-threads` | Admin inbox of partner-reply threads per channel + unread counts |
| `GET` / `POST` | `/api/admin/channels/reply-threads/[id]/messages` | View / post in a specific partner's private reply thread |
| `GET` | `/api/admin/channels/stream?channelId=X` | SSE push for admins |
| `GET` | `/api/announcements` | Partner: list of channels they belong to + last-N messages per channel |
| `GET` / `POST` | `/api/announcements/[channelId]/reply-thread` | Partner: their own reply thread + post new reply |
| `GET` | `/api/announcements/stream?channelId=X` | SSE push for partners |

### Message-post pipeline for announcements

1. Validate content length (≤10KB). Validate `callMeta.url` is https-only if `messageType="call_link"`.
2. Rate limit: 60 announcements / hour / (channel × authorEmail).
3. Insert `ChannelMessage` row.
4. Fire one `Notification` per channel member with `type: "channel_announcement"`, `link: "/dashboard/announcements?channelId=<id>#msg-<msgId>"`. Titles for `call_link` type get a 📞 prefix.
5. `pg_notify('portal_chat_events', ...)` so SSE subscribers push live.

### Reply-post pipeline (partner → admin)

1. Partner-session-gated. Partner must have an active membership.
2. Upsert `ChannelReplyThread` keyed by `(channelId, partnerCode)`.
3. Insert `ChannelReplyMessage` with `senderType="partner"`, `readByAdmin=false`.
4. Update `ChannelReplyThread.lastMessageAt`.
5. One `Notification` per admin with channel access: `type: "channel_reply"`, `link: "/admin/channels/<id>?threadId=<threadId>"`.
6. `pg_notify('portal_chat_events', ...)`.

### Reply-post pipeline (admin → partner)

Same as partner → admin but with `senderType="admin"`, `readByPartner=false`, and a Notification to the partner (`type: "channel_reply"`).

## UI

### Admin: `/admin/channels`
- Sidebar entry "Channels" with 📣 icon + unread-partner-reply badge (sum across channels the admin can see).
- List layout: each channel card shows name, description snippet, member count, last announcement preview, unread-reply count.
- "+ New Channel" button opens a modal (name, description, segment-rule builder, manual seed members).

### Admin: `/admin/channels/[id]`
Three-pane desktop:
- **Left (240px):** other channels rail, collapsed thumbnails.
- **Center (flex):** announcement feed — message bubbles, admin avatars, `(edited)` / `(deleted)` states. Compose area at the bottom with text + "📞 Add Call Link" button that opens an inline form (URL, title, optional start time + duration + provider).
- **Right (360px, collapsible):** "Partner Replies" tab and "Members" tab.
  - **Partner Replies:** list of reply threads sorted by `lastMessageAt` desc, unread indicator per thread. Click a thread → opens the admin-vs-partner private conversation. Standard text compose at bottom.
  - **Members:** list view with `source` badge (Manual / Segment), add/remove controls.

Mobile: single-pane nav via back button. Right panel becomes a "Replies" sheet accessible from header.

### Partner: `/dashboard/announcements`
- Sidebar entry "Announcements" with unread badge.
- Stack of channel cards. Each card:
  - Channel name + description
  - Most recent 2-3 announcements inline (expandable for full feed)
  - Partner's own reply thread below the feed with a compose input
- Partners see only their own reply thread (`(channelId, me)`) — never other partners' replies.
- Call-link announcements render as a prominent card with the title, provider, start-time if provided, and a big "Join Call" button that opens in a new tab.

## Notifications

New `Notification.type` values:

- `channel_announcement` — icon `📣`, fired on new announcement to every active member.
- `channel_reply` — icon `💬`, fired on reply-thread activity (admin → partner or partner → any admin with channel access).

`TYPE_ICONS` in `src/components/ui/NotificationBell.tsx` gets the two new entries.

## Permissions

| Role | Create channel | Post announcement | Edit own <24h | Delete any msg | View reply threads | Send in reply thread |
|---|---|---|---|---|---|---|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| accounting | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| partner_support | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |

Partners: can view only channels they belong to. Can read announcements. Can post in their own reply thread only. Cannot see any other partner's replies or membership list.

## Rate limits

- Admin announcement: 60 / hour / (channel × author).
- Partner reply: 10 / hour / channel.
- Admin reply: 60 / hour / admin (across all threads they interact with).
- Content body ≤ 10KB.
- `callMeta.url` must be `https://`, parse successfully, and not contain credentials.

## Error handling

- Attempt to post into an archived channel → 410 Gone.
- Partner hitting a channel they're not a member of → 403.
- Invalid segment rule JSON on create/edit → 400 with field-by-field validation message.
- Segment re-eval partial failure (one filter bogus) → the rule fails closed; the channel becomes manual-only until fixed. Logged.
- SSE disconnect → EventSource auto-reconnect; fallback to 5s polling on third failure.

## Testing

Unit tests (Node `assert` via `npx ts-node`):
- `src/lib/__tests__/channelSegments.test.ts` — rule evaluation, combinator semantics, missing-field fallback, boolean coercion.
- `src/lib/__tests__/validateCallMeta.test.ts` — URL validation, https-only, no-credential guard.

Manual integration checklist (after deploy):
- Super_admin creates channel with segment `tier=l1 AND status=active` → verify expected L1s auto-seeded with `source="segment"`.
- Add manual partner not matching segment → joins channel with `source="manual"`.
- Remove matching partner → `removedAt` set; hit Resync → verify they're NOT re-added.
- Admin posts text announcement → every member gets a notification; SSE pushes to any connected member client in <1s.
- Admin posts call-link announcement → prominent card renders; partner clicks → new tab opens.
- Partner replies → admin inbox shows thread with unread badge; admin responds → partner sees it.
- Archive channel → hidden from partner UI; admin can still see archived list.

## Files touched

**New:**
- `src/lib/channelSegments.ts` — rule evaluator + match expander
- `src/lib/validateCallMeta.ts` — URL + metadata validator
- `src/lib/__tests__/channelSegments.test.ts`
- `src/lib/__tests__/validateCallMeta.test.ts`
- `src/app/api/admin/channels/route.ts` — GET + POST
- `src/app/api/admin/channels/[id]/route.ts` — GET + PATCH + DELETE
- `src/app/api/admin/channels/[id]/members/route.ts` — POST
- `src/app/api/admin/channels/[id]/members/[partnerCode]/route.ts` — DELETE
- `src/app/api/admin/channels/[id]/resync/route.ts` — POST
- `src/app/api/admin/channels/[id]/messages/route.ts` — GET + POST
- `src/app/api/admin/channels/messages/[id]/route.ts` — PATCH + DELETE
- `src/app/api/admin/channels/[id]/reply-threads/route.ts` — GET
- `src/app/api/admin/channels/reply-threads/[id]/messages/route.ts` — GET + POST
- `src/app/api/admin/channels/stream/route.ts` — SSE
- `src/app/api/announcements/route.ts` — GET (partner side)
- `src/app/api/announcements/[channelId]/reply-thread/route.ts` — GET + POST
- `src/app/api/announcements/stream/route.ts` — SSE (partner side)
- `src/app/(admin)/admin/channels/page.tsx` — admin landing
- `src/app/(admin)/admin/channels/[id]/page.tsx` — admin detail
- `src/app/(partner)/dashboard/announcements/page.tsx` — partner landing
- `src/components/ui/SegmentRuleBuilder.tsx` — create-channel form
- `src/components/ui/CallLinkComposer.tsx` — admin compose form
- `src/components/ui/AnnouncementCard.tsx` — call-link renderer

**Modified:**
- `prisma/schema.prisma` — 4 new models
- `src/app/(admin)/admin/layout.tsx` — sidebar entry "Channels"
- `src/app/(partner)/dashboard/layout.tsx` — sidebar entry "Announcements"
- `src/components/ui/NotificationBell.tsx` — two new `TYPE_ICONS`
- `src/lib/permissions.ts` — add `"channels"` nav id per-role
- `src/app/api/signup/route.ts` — on partner signup, re-eval all channel segment rules (strictly additive; no existing behavior changes)

**Explicitly NOT touched:**
- `src/app/api/webhook/referral/route.ts` (partner testing)
- Existing `ChatSession` / `ChatMessage` (partner-support chat)
- Existing `AdminChatThread*` models (admin team-chat, landing in a separate PR)

## Shared infrastructure with admin Team Chat (2026-04-19)

Both features:
- Use Postgres `LISTEN/NOTIFY` on channel `portal_chat_events`.
- Share a `<MentionInput>`-style component pattern (announcement channels don't need `@mention` per se, but the compose-with-autocomplete pattern is shared).
- Share the `isAnyAdmin()` gate and `ROLE_VISIBLE_NAV` extension pattern.
- Share the SSE stream route pattern (connection per thread/channel).

If admin Team Chat lands first (expected), the SSE bus helper at `src/lib/adminChatEvents.ts` should be generalized to a `portalChatEvents.ts` lib that both features import. This generalization is NOT in this spec — it's a refactor that should happen before this feature starts implementation.
