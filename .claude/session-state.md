# Session State

🕒 Last updated: 2026-04-22 (end of day) — 13 PRs shipped. Payout Downline Partners feature end-to-end, full commission-system sync overhaul, Revenue tab + Payouts tab context columns, Enterprise Partner override redesign, deal-delete cascade, webhook automations expanded, and two big architectural queues for tomorrow.

## 🌿 Git state
- **main HEAD:** `dedff72` — fix(deals/payouts): cascade-delete ledger on Deal delete + hide orphans (#378)
- **origin/main HEAD:** same, in sync
- **Open non-dependabot PRs:** 0 (#357 still DRAFT, don't merge; #367 closed as superseded by #368; #379 closed — skipping in favor of email-workflow migration)
- **Working tree:** clean
- **Active branch:** main

## ✅ This session (2026-04-22) — 13 PRs shipped

**Late-session commission + admin UX surgery (from #370 onwards, all tied to exercising PDP on prod):**
- **#378** fix(deals/payouts): cascade-delete ledger on Deal delete + hide orphans — kills stale Pending rows after deal deletion, refuses delete if any ledger is already paid.
- **#377** feat(enterprise-partner): flat override rate replaces total-cap model — EP earns `firmFee × overrideRate` flat, not `max(0, totalRate - l1Rate)`. 2% override now sensibly totals 22/27/30% across L1s at 20/25/28%.
- **#376** feat(admin/payouts): add Refund/Fee %/Firm Fee/Comm % columns to payout table — each ledger row shows its tier's true rate (L2 at 25%, L1 override at 5%).
- **#375** feat(workflows): Deal Created full payload variables + webhook.post body template — 7 → 23 variables, headers editor, JSON body template with {token} substitution.
- **#374** feat(admin/deals): undo Mark Payment Received from the Paid badge — split pill with clickable Undo, all 4 admin roles, refuses on already-paid rows.
- **#373** fix(admin/deals): sync form status state after Mark Payment Received + L3 parity — fixes stale-form-state bug where status dropdowns clobbered server-side flip.
- **#372** fix(admin/revenue): per-deal commission rates + l3 in sums + stage-aware refunds — drops static 25% assumption, adds L3 to all sums, table now shows per-deal Comm %.
- **#371** fix(deals): stage-aware refund + resolver-driven firm fee across API + UI — actual refund overrides estimated when closed_won; webhook persists derived firmFeeAmount.
- **#370** feat(commission): Deal.l3CommissionAmount snapshot + waterfall-based writes — Deal snapshots now mirror true waterfall in both modes, not just ledger entries.

**Earlier in the day:**
- **#369** chore(session): checkpoint 2026-04-22 — PDP shipped (#368)
- **#368** feat: Payout Downline Partners — per-L1 lock-at-invite toggle. 14 plan tasks executed via 7 bundled subagents. All 4 existing L1s grandfathered to Disabled.
- **#366** chore(session): checkpoint for DealNote star-admin parity
- **#365** feat(admin/deals): ⭐ star super admin can edit/delete deal notes

## 🚫 Closed without merging (context for future)
- **#367** docs: PDP spec + plan — superseded by #368 which bundled both
- **#379** fix(cron/newsletter): three-gate hard-disable — skipped, SendGrid queue flush not a code bug; email-workflow migration supersedes

## 🎯 Queued for tomorrow (top of stack)

1. **Email templates → workflow actions** (see `project_fintella_email_workflow_migration` memory). John wants email sends to flow through workflow triggers the same way SMS sends do (#358/#360). Start with brainstorming skill. Keep `password_reset` hardcoded (security). 7 other sends to migrate.

2. **Contabo VPS / MinIO bootstrap** (see `project_fintella_minio_vps_plan` memory). Still queued from earlier. Unblocks PR #357.

3. **Remaining flagged items:**
   - Live Weekly column formatting + resizable columns
   - Notification bell mentions rollup (verify #293 plumbing first)
   - HTTP method selector on webhook.post for PATCH updates
   - PR #357 multi-file note attachments (blocked on MinIO bootstrap)

## ⚠️ Post-deploy watchlist from today

- **Commission flow is round-trippable end-to-end** — Mark Payment Received ↔ Undo, statuses sync across Deal form + Payouts tab, every tier accounted for in snapshots and ledger.
- **EP override model flipped** — admins creating enterprise partners after this deploy enter "Override Rate" (e.g. 2), not a total cap. Zero existing EPs in prod so no migration.
- **Deal deletion now cascades** — ledger + notes + chat threads go with the deal. Refuses on any paid ledger row.
- **Monthly newsletter is Disabled in admin UI** AND the code path honors that correctly. John got 7 emails today from SendGrid queue-flush, not our code. Decision: rearchitect email sends via workflows instead of hardening the cron (#379 closed).

## ✅ Previous session (2026-04-22 earlier) — 4 PRs shipped
- **#368** feat: Payout Downline Partners — per-L1 lock-at-invite toggle that switches Fintella between two commission-payout models. Enabled = Fintella sends SignWell to L2/L3 at signup + pays them directly (waterfall). Disabled (default) = Fintella pays L1 full rate, L1 pays downline privately. Additive schema, new `buildLedgerEntries` pure helper with 8/8 unit tests, SignWell auto-dispatch in signup flow mirroring admin/agreement route, admin invite/add-directly checkboxes role-gated to super_admin/admin/partner_support, admin profile read-only state row, partner Reporting surfaces (Enabled badge, Disabled Downline Accounting subsection, L2/L3 paid-by-upline note). 14 plan tasks executed via 7 bundled subagent dispatches. All 4 existing L1s grandfathered to Disabled.
- **#367** docs: Payout Downline Partners spec + plan. **CLOSED** — superseded by #368 which included both docs and code.
- **#366** chore(session): checkpoint for DealNote star-admin parity
- **#365** feat(admin/deals): ⭐ star super admin can edit/delete deal notes. Backend PATCH for content edits (star-gated), new DELETE (star-gated, cascades to NoteAttachment). Frontend Edit/Delete buttons mirroring AdminNote pattern from #361.

## ⚠️ Post-deploy watchlist for PR #368

Vercel auto-deployed #368 to prod. Three things to watch as real deals flow through:

1. **Commission-behavior flip for existing L1s.** All 4 are grandfathered Disabled. Any L2/L3 deal closing won AFTER deploy writes 1 ledger row (L1 at full rate) instead of the previous 2-3 waterfall rows. Deals already at closed_won with ledger rows written are untouched. Worth confirming no active downline is in-flight with unexpected payouts.
2. **Cent rounding applied to all new ledger rows.** New rows have clean `$500.00` values; pre-deploy historical rows may have IEEE-754 artifacts (`499.9999…`). Display formatters use `.toFixed(2)` so human-visible totals unchanged, but any exact-sum aggregation comparing old vs new rows may drift sub-cent.
3. **L3 Downline Accounting is incomplete.** `Deal` schema has only `l1CommissionAmount` + `l2CommissionAmount` (no l3). For L3 deals under a Disabled L1, the Reporting "you owe downline" view shows partial numbers (missing L3's share). L3 deals are rare today since L3 is an opt-in per-L1 flag. Follow-up PR candidate: add `Deal.l3CommissionAmount` or recompute waterfall on-the-fly.

## ✅ Previous session (2026-04-21) — 8 PRs shipped
- **#363** fix(admin/communications): Email Inbox preview modal opacity — bleed-through audit complete, no remaining offenders
- **#362** fix(admin/users): Edit Admin User modal opacity — `.card` was 4% alpha in dark mode
- **#361** feat: ⭐ Star Super Admin tier — email-gated on `admin@fintella.partners`, new `src/lib/starSuperAdmin.ts`. Exclusive: edit any admin user (name/email/role/password) + edit/delete admin notes. Password UX is reset-and-reveal-on-save (bcrypt stays one-way, NO plaintext retrieval).
- **#360** feat(sms): SMS Log sub-tab at end of SMS tab order + All/Unread/Replied drill-down. `sms.sent`/`sms.received`/`sms.opt_in`/`sms.opt_out` triggers + `sms.send` action wired into workflow engine.
- **#359** ui(admin): Automations moved from Communications Hub to Development page
- **#358** feat(sms): Communications → SMS restructured into Inbox/Compose/Templates sub-tabs mirroring Email. New `SmsTemplate` model (5 rows seeded `enabled: false` pending A2P). Opted-in / not-opted-in / opted-out rosters + bulk opt-in request.
- **#357** DRAFT (don't merge) — NoteAttachment polymorphic child table for multi-file note attachments on both AdminNote + DealNote; storage-provider decision still open
- **#356** feat(admin/partners): Admin Notes gets its own tab + optional single-file attachments

## 🎯 What's next (pick up when you're back)
- **Top pick:** Exercise PR #368 E2E on production now that it's deployed — Disabled flow (invite L1 UN-checked → signs → recruits L2 → confirm no auto SignWell → admin uploads → L2 signs → deal → confirm 1 ledger row) AND Enabled flow (checkbox CHECKED → same chain → confirm Fintella auto-sends SignWell at L2 signup → 2 ledger rows on deal close). Also verify admin profile state row + partner Reporting badges on real partner accounts.
- Also verify #365 live on prod (Edit/Delete buttons on deal notes for star admin, absent for other admins)
- Follow-up PR candidate: add `Deal.l3CommissionAmount` schema + populate during waterfall write, fixes the L3 Downline Accounting gap flagged in #368 body
- Live Weekly table: column formatting + resizable columns using existing `ResizableTable` primitive at `/admin/conference`
- Notification bell mentions rollup — verify #293 plumbing end-to-end first
- PR #357 multi-file note attachments — flagged; decision landed (MinIO on Contabo VPS per `project_fintella_minio_vps_plan.md`) but John deferred implementation
- Contabo VPS / MinIO bootstrap — flagged by John, see `project_fintella_minio_vps_plan.md` and plan file at `~/.claude/plans/can-a-vps-contabo-humble-moon.md`
- A2P 10DLC approval watch — flip `SmsTemplate.enabled=true` per-row once TCR clears
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
