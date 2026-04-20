# Session State

🕒 Last updated: 2026-04-20 — Deal rawPayload is now a chronological event log; admin Team Chat live; announcement channels impl pending

## 🌿 Git state
- **main HEAD:** `fcbe186` — feat(webhook): append every POST + PATCH body to Deal.rawPayload event log (#297)
- **origin/main HEAD:** same, in sync
- **Open non-dependabot PRs:** 0
- **Open dependabot PRs:** 5 (#287–#291) — see below; do NOT auto-merge
- **Working tree:** clean

## ✅ This session (2026-04-20)
- **#297** feat(webhook): Deal.rawPayload is now a JSON array of every inbound POST + PATCH body. Capped at 20 entries / 50KB total / 10KB per body (FIFO-drop oldest on overflow). Legacy single-body rows wrap cleanly as a synthetic "POST @ unknown time" first event. Admin `/admin/deals` expansion renders each event as its own card with POST/PATCH badge + timestamp + pretty-printed JSON.
- **#296** feat(admin): two-line date/time format in `/admin/deals` DATE column. Added `fmtTime()` helper to `src/lib/format.ts`.

## ✅ Recent prior sessions
- **2026-04-19:** admin Team Chat shipped (#292 spec, #293 impl with 4 Prisma models + SSE + MentionInput); announcement channels spec+plan merged as #294; live chat deal mentions (#285); Full Reporting sort arrows (#286); partner-name-above-code + "Unknown" fallback (#282, #283).
- **2026-04-18:** HubSpot → Deal inbound mapping verified end-to-end via live curl. `WEBHOOK_SKIP_HMAC=true` active. `FROST_LAW_API_KEY` set to Frost's real key. Hozier test deal (`cmo4qvk720000z8e7ltlvnbzv`) created through the full flow.

## 🧪 Verified in production
- HubSpot stage IDs → internal stages — live in `HUBSPOT_STAGE_MAP` at `src/app/api/webhook/referral/route.ts`:
  - `3468521172` → `consultation_booked` (Meeting Booked)
  - `3467318997` → `client_no_show` (Meeting Missed)
  - `3468521174` → `client_qualified` (Qualified)
  - `3468521175` → `closedlost` + `closedLostReason: "disqualified"` (Disqualified)
  - Active on both POST (deal creation) and PATCH (stage updates).

## 🎯 What's next
1. **Implement announcement channels** — 16-task plan at `docs/superpowers/plans/2026-04-19-admin-announcement-channels.md`. Dispatch subagent for a PR like we did for #293.
2. **Brainstorm partner-to-downline DM** — sibling feature from 2026-04-19 brainstorm. Permission decided: tier B (parent↔direct-child bidirectional, L1↔L2 + L2↔L3, no skip-level). Privacy decided: tier D (flag-to-super_admin abuse reporting).
3. **Admin presence directory** (green/red lights in Team Chat) — needs spec+plan. Heartbeat via `UserPresence` or session-ping table.
4. **Notification bell mentions rollup** — verify existing `admin_mention` plumbing; add a "Mentions" filter tab in the bell dropdown.
5. **Live Weekly table formatting + resizable columns** — apply existing ResizableTable primitive; center-align Host→Actions headers; bump Host padding; drag dividers with double-click fit-to-size.
6. **Outbound network adapter sub-spec 1 implementation** — plan at `docs/superpowers/plans/2026-04-18-outbound-network-adapter.md`.
7. **Phase 18b** — Next.js 14→16 migration (dedicated session).

## 🧠 Context that matters for resuming
- `/api/webhook/referral` is no longer hands-off for payload-log work — #297 touched it additively (append to rawPayload inside the existing `tx.deal.update` call). Other changes to that file still need explicit John approval because partners are actively testing POST/PATCH.
- SSE bus shared: `portal_chat_events` channel via Postgres LISTEN/NOTIFY. Admin Team Chat uses it now; announcement channels will share it.
- `pg` npm package is installed (added in #293) — required for SSE handlers that `LISTEN` outside Prisma.
- All DB data is test/seed — safe to wipe and retest.

## 📂 Relevant files for the next task
- Announcement channels impl: `docs/superpowers/plans/2026-04-19-admin-announcement-channels.md` — 16 tasks with complete code blocks, ready for subagent dispatch
- Partner DM brainstorm: `src/app/(admin)/admin/chat/page.tsx` (existing partner-support chat pattern to clone), `prisma/schema.prisma` (Partner.referredByPartnerCode chain)
- Admin presence: `prisma/schema.prisma` (new `UserPresence` table), `src/app/(admin)/admin/team-chat/page.tsx` (add directory pane)
- Live Weekly table: locate `ResizableTable` primitive (shipped per earlier session)

## 📌 Dependabot status (open, do NOT auto-merge per CLAUDE.md)
- **#287** postcss 8.5.9 → 8.5.10 (patch) — safe-ish
- **#288** next-auth 5.0-beta.30 → 5.0-beta.31 — beta, risky
- **#289** typescript 5.9.3 → **6.0.3 (MAJOR)** — blocked per dedicated-session rule
- **#290** @anthropic-ai/sdk 0.88 → 0.90 — 0.x minor = breaking per semver convention
- **#291** @sentry/nextjs 10.48 → 10.49 — likely safe
Leave for a dedicated triage session.
