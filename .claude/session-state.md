# Session State

🕒 Last updated: 2026-04-20 evening — Phase 1 launch executing; DB wiped + seed guard live + auth hardening + install-prompt polish shipped; E2E smoke test + announce pending. Mobile/PWA audit DEFERRED to tonight when John is home from the office.

## 🌿 Git state
- **main HEAD:** `76da68f` — ui(install-prompt): white text + larger typography + https URL (#320) [may advance further this session]
- **origin/main HEAD:** same
- **Open non-dependabot PRs:** #321 install-prompt width + centered card headers (awaiting merge)
- **Open dependabot PRs:** 5 (#287–#291)
- **Working tree:** clean

## 🚦 Launch sequence status (2026-04-20)
- ✅ Step 1: `pre-launch-wipe` Neon snapshot taken
- ✅ Step 2: `FINTELLA_LIVE_MODE=true` set on Vercel Production
- ✅ Step 3: DB wipe executed — 10 partners / 9 deals / 52 notifications / 24 AI msgs cleared; 47 webhook logs + 1311 email logs + 8 conference entries + 7 templates + 3 admin users + 1 portal settings row + 1 global team-chat thread preserved
- ✅ Step 4: `clean-slate-launch` Neon snapshot taken (Launch tier)
- ✅ Step 5: Vercel redeploy — build log confirmed `[seed] FINTELLA_LIVE_MODE=true — skipping test-data seed`
- ✅ Step 6: PR #316 merged — CLAUDE.md header flipped to "LIVE — real partner data"
- ✅ Step 6b (unplanned but critical): PR #317 merged — `security(auth): remove demo fallbacks + add password reset flow`. Prior code let any email+password combo log in as admin, any email+partner-code as partner. New: bcrypt-only auth, /forgot-password + /reset-password flow via SendGrid, PasswordResetToken Prisma model (additive)
- ✅ Step 6c: PRs #318 + #319 + #320 + (#321 pending) — install-prompt polish: 3x logo, immediate visible Continue link, solid black bg, pure white typography, bigger sizes, iPhone+Android instruction cards, `https://fintella.partners` highlighted URL, widened container + centered card headers
- ⏸️ **Step 7: E2E smoke test** — PENDING. Needs to be run on prod by John after current Vercel deploy finishes.
- ⏸️ **Step 8: Announce to real partners** — PENDING. Blocked on Step 7.

## 📋 Deferred (pick back up when John is home tonight)
- **Mobile + PWA optimization audit** — John flagged he wants a comprehensive sweep: walk the 10 highest-traffic routes (`/login`, `/signup`, `/dashboard/home`, `/dashboard/deals`, `/dashboard/commissions`, `/dashboard/submit-client`, `/dashboard/downline`, `/dashboard/reporting`, InstallPrompt, `/forgot-password`/`/reset-password`) + the PWA setup (manifest.json, service worker, safe-area handling, offline fallback, theme color, splash screens). Flag: cramped layouts <640px, touch targets <44px, horizontal overflow, hardcoded colors that break dark mode, missing pt-safe/pb-safe on fixed elements, PWA manifest gaps. Deliver a numbered severity-ranked punch list, then John picks which to fix pre-launch vs post-launch.

## ✅ This session (2026-04-20)
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
