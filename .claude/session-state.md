# Session State

🕒 Last updated: 2026-04-21 — SMS structure overhaul, ⭐ Star Super Admin tier, modal opacity audit. John heading home, resuming later/tomorrow.

## 🌿 Git state
- **main HEAD:** `c38ec97` — fix(admin/communications): make Email Inbox preview modal opaque (#363)
- **origin/main HEAD:** same, in sync
- **Open non-dependabot PRs:** 0
- **Working tree:** clean
- **Active branch:** main

## ✅ This session (2026-04-21) — 8 PRs shipped
- **#363** fix(admin/communications): Email Inbox preview modal opacity — bleed-through audit complete, no remaining offenders
- **#362** fix(admin/users): Edit Admin User modal opacity — `.card` was 4% alpha in dark mode
- **#361** feat: ⭐ Star Super Admin tier — email-gated on `admin@fintella.partners`, new `src/lib/starSuperAdmin.ts`. Exclusive: edit any admin user (name/email/role/password) + edit/delete admin notes. Password UX is reset-and-reveal-on-save (bcrypt stays one-way, NO plaintext retrieval).
- **#360** feat(sms): SMS Log sub-tab at end of SMS tab order + All/Unread/Replied drill-down. `sms.sent`/`sms.received`/`sms.opt_in`/`sms.opt_out` triggers + `sms.send` action wired into workflow engine.
- **#359** ui(admin): Automations moved from Communications Hub to Development page
- **#358** feat(sms): Communications → SMS restructured into Inbox/Compose/Templates sub-tabs mirroring Email. New `SmsTemplate` model (5 rows seeded `enabled: false` pending A2P). Opted-in / not-opted-in / opted-out rosters + bulk opt-in request.
- **#357** DRAFT (don't merge) — NoteAttachment polymorphic child table for multi-file note attachments on both AdminNote + DealNote; storage-provider decision still open
- **#356** feat(admin/partners): Admin Notes gets its own tab + optional single-file attachments

## 🎯 What's next (pick up when you're back)
- **Top pick:** Verify live on production — open Admin Users → Edit modal (should be opaque, ⭐ badge visible) and Communications → Email → Inbox preview (should be opaque)
- Extend ⭐ star admin edit/delete to DealNotes for parity with AdminNotes
- PR #357 multi-file note attachments — revisit storage provider (S3 vs R2 vs keep base64) when ready
- A2P 10DLC approval watch — flip `SmsTemplate.enabled=true` per-row once TCR clears (feedback memory flags the gate)
- Other items in `project_fintella_next_tasks` memory

## 🔑 Important context preserved
- ⭐ Star Super Admin tier (feedback_star_super_admin_tier.md) — never add password retrieval; bcrypt stays one-way
- Modal opacity rule (feedback_modal_opaque_bg.md) — use `var(--app-bg-secondary)` + `bg-black/80 backdrop-blur-sm` for new modals, never `.card`
- SMS templates pending A2P (feedback_sms_templates_disabled_pending_a2p.md) — don't auto-enable
- PR #357 flagged DRAFT (project_fintella_pr357_note_attachments.md) — don't merge

## ✅ Previous session (2026-04-20)
- **#307** feat(admin): Internal Chats group — Team Chat, Channels, DM Flags moved from Communications/Partner Support into their own `/admin/internal-chats` tabbed host. 6 files, +76/-25 lines. 12 top-level nav entries.
- **#306** feat(admin): nav consolidation — extracted 6 panel components (TeamChat, Channels, Workflows, LiveChat, SupportTickets, DmFlags), created Communications + Partner Support tabbed hosts, `reconcileNavOrder` helper with 5/5 unit tests, role matrix updated. 23 files, +4,251/-3,954 lines.
- **#305** docs: Internal Chats spec + plan
- **#303** feat: partner-to-downline DM with flag→throttle→review flow (5 Prisma models, 11 API routes, `partnerDmGate` with 10/10 tests)
- **#302** docs: admin nav consolidation spec + plan
- **#301** docs: partner-DM spec + plan
- **#300** chore(session): announcement channels checkpoint
- **#299** feat(admin): admin announcement channels + partner replies + SSE
- **#297** feat(webhook): Deal.rawPayload event log (POST + PATCH append)
- **#296** feat(admin): two-line date/time in /admin/deals

## 🗺️ Final admin nav (12 top-level entries)
```
Partners
Deals
Reporting ▾ (Reports / Revenue / Custom Commissions / Payouts — unchanged group)
Communications ▾ (Email / SMS / Phone / Automations)
Internal Chats ▾ (Team Chat / Channels / DM Flags)
Partner Support ▾ (Support Tickets / Live Chat Support)
Training
Live Weekly
Documents
Settings
Admin Users
Feature Requests
Development (super_admin)
```

All 7 of the extracted / tabbed routes continue to work:
- `/admin/team-chat`, `/admin/channels`, `/admin/workflows`, `/admin/chat`, `/admin/support`, `/admin/partner-dm-flags` (thin-wrapper pages rendering extracted panels)
- `/admin/internal-chats`, `/admin/communications`, `/admin/support` (tabbed hosts)

## ✅ Communications Hub fully split (as of #309)
The 1702-line legacy `EmailTemplatesTab.tsx` bundle was split into 6 focused section components:
`EmailInboxTabImpl.tsx`, `EmailComposeTabImpl.tsx`, `EmailTemplatesTabImpl.tsx`, `SmsTabImpl.tsx`, `PhoneTabImpl.tsx`, plus `_shared.ts` for types/constants. The `Automations` pill wires to `WorkflowsPanel` (legacy `renderAutomations()` was discovered to be a 4-row hardcoded demo — dropped). No more duplicate tab bar. No more duplicate "Communications Hub" h2. All sections render cleanly within the host's pill + sub-tab navigation. "Use template" button in Templates prefills Compose via sessionStorage + router.push.

## 🗺️ Current sidebar (flat leaves for three formerly-grouped entries)
- Communications, Internal Chats, Partner Support are each a single clickable leaf pointing to their respective tabbed hub page (same pattern as Reporting).
- `ROLE_VISIBLE_NAV` simplified — namespaced child IDs no longer needed.

## 🔌 Shared infrastructure
- **Postgres LISTEN/NOTIFY:** `admin_chat_events` channel (all surfaces)
- **`portalChatEvents.ts` union:** admin_chat events + channel events + partner_dm message events + partner_dm flag events
- **`pg` npm package:** required for LISTEN outside Prisma (installed in #293)
- **`reconcileNavOrder`:** silent migration of saved navigation-order values with stale IDs; gracefully appends new IDs

## 🎯 What's next — launch sequence (per docs/launch-status.md on main)

**Phase 0 (pre-launch prep, zero customer impact — do anytime):**
- Vercel env var audit (confirm `SIGNWELL_API_KEY` / `FROST_LAW_API_KEY` / `WEBHOOK_SKIP_HMAC` / `NEXT_PUBLIC_SENTRY_DSN` all set; confirm `WEBHOOK_AUTH_BYPASS` removed)
- SendGrid domain auth → click Verify
- Confirm Neon 7-day PITR backups active
- Verify Sentry alert rules → real inbox

**Phase 1 (launch day, strict order):**
1. DB cleanup — wipe test partners/deals/notifications/logs; keep admin/templates/settings/workflows
2. Set `FINTELLA_LIVE_MODE=true` on Vercel Production
3. Set `SENDGRID_API_KEY` on Vercel Production
4. Set `ANTHROPIC_API_KEY` on Vercel Production
5. Trigger redeploy, verify build log shows seed skipping test data
6. Update CLAUDE.md header to "Live — real partner data"
7. Run E2E smoke test (signup → agreement → deal → payment → payout → email → AI)
8. Announce

**Phase 2 (post-launch, non-blocking):**
- Twilio SMS when A2P 10DLC approved (env vars only, no code change)
- Twilio Voice same pattern
- HMAC enforcement when Frost Law adds signing
- Outbound network adapter sub-spec 1 (plan ready at `docs/superpowers/plans/2026-04-18-outbound-network-adapter.md`)
- Admin presence directory (needs spec+plan)
- Notification bell mentions rollup
- Live Weekly table formatting + resizable columns
- Phase 18b Next.js 14→16 migration

## 🧠 Context that matters for resuming
- Admin nav consolidation is DONE — no further structural work needed on the sidebar; future additions go into existing groups (Communications / Internal Chats / Partner Support) or become new top-level entries.
- `ROLE_VISIBLE_NAV` uses namespaced child IDs (e.g. `"internalChats:team-chat"`) not just parent IDs. When adding new children, use the namespaced pattern and add them to each role's visible list.
- The nav-order customizer registry in `src/app/(admin)/admin/settings/page.tsx` (`ALL_ADMIN_NAV_ITEMS`) only tracks top-level group IDs, not children. Children render in hardcoded order from `ADMIN_NAV_ITEMS_MAP`.

## 📂 Relevant files for the next task
- Communications stub split: `src/app/(admin)/admin/communications/EmailTemplatesTab.tsx` (1702 lines, contains all legacy bundled functionality — source material for the split)
- Admin presence: `prisma/schema.prisma` (new `UserPresence` table), `src/app/(admin)/admin/team-chat/TeamChatPanel.tsx`
- Live Weekly: locate `ResizableTable` primitive + apply to `/admin/conference` page

## 📌 Dependabot status (5 open, do NOT auto-merge per CLAUDE.md)
#287 postcss patch · #288 next-auth beta · #289 typescript 6.0 MAJOR · #290 @anthropic-ai/sdk 0.x breaking · #291 @sentry/nextjs minor
