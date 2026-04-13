# Fintella Partner Portal

## Development Status (IMPORTANT)
**Pre-launch / pure build-out mode.** The portal is NOT live to real customers yet. There are no real partners, deals, commissions, or customer data in any environment — every row in every database (local, preview, production) is test data Claude or John seeded. Implications for Claude sessions:
- Safe to freely test, seed, reset, or wipe any environment without concern for data loss
- Safe to run `prisma db push --accept-data-loss` style migrations without hesitation
- Smoke-testing can go directly against production (fintella.partners) instead of fussing with Vercel preview deployment protection
- Do NOT add "heads-up, this writes to the real DB" style warnings for routine test actions
- Destructive schema changes, seed resets, and test deal creation via `/admin/dev/webhook-test` are all zero-stakes
- When this status changes (real customers sign up), update this section

## Project Overview
- **Brand**: Fintella — Financial Intelligence Network
- **Legal DBA**: "Financial Intelligence Network DBA (Fintella)" (parent: Annexation PR LLC)
- **Historical brand**: Previously "Tariff Refund & Litigation Network (TRLN)" — rebranded April 2026. Portal had not yet launched, so no customer impact.
- **Domain**: https://fintella.partners (primary, live on Vercel)
- **Legacy domain**: https://trln.partners (still resolves, will eventually redirect to fintella.partners)
- **Framework**: Next.js 14.2.35 (App Router) + React 18 + TypeScript 5.4
- **Styling**: Tailwind CSS 3.4 — auto light/dark theme via `prefers-color-scheme` CSS variables, gold accents (#c4a050, #f0d070), fonts: Playfair Display + DM Sans
- **Database**: Prisma 5.20 ORM — PostgreSQL (Neon, production)
- **Auth**: NextAuth.js 5.0-beta.22 — JWT sessions, dual providers (Partner: email+partnerCode, Admin: email+password)
- **Deployment**: Vercel (project: `tariff-partner-portal-iwki` — Vercel project name still uses the old repo slug; not renaming to avoid deployment URL churn), region `iad1`
- **Integrations**: SignWell (e-signatures), HubSpot (CRM), Sentry (error tracking), Vercel Analytics + Speed Insights, Anthropic Claude (AI assistant) — all optional with demo/mock fallbacks
- **AI narrative**: "Fintella" is a portmanteau of the two planned AI assistant personalities — **Finn** (direct, data-driven) and **Stella** (warm, relationship-focused). Current single "Fintella PartnerOS" assistant is a placeholder; Phase 17b will split it into the dual-personality product.

## Project Structure
```
src/app/(admin)/admin/       — Admin routes (partners, deals, commissions, payouts, settings, etc.)
src/app/(partner)/dashboard/ — Partner routes (home, overview, deals, commissions, downline, submit-client, training, etc.)
src/app/(auth)/login/        — Public login page (light/dark adaptive)
src/app/signup/              — Public partner signup page (invite-based, with embedded agreement signing)
src/app/impersonate/         — Admin sudo: auto-signs in as a partner
src/app/api/                 — API routes (RESTful, session-checked via auth())
src/app/api/webhook/referral — Frost Law referral form webhook (public, creates Deals)
src/app/api/invites/         — Recruitment invite management (create/list invite links)
src/app/api/signup/          — Public partner signup (validates invite, creates partner, sends agreement)
src/app/api/admin/impersonate — Admin impersonation token generation
src/app/api/admin/documents  — Admin document upload (agreements, W9s)
src/app/api/favicon          — Dynamic favicon served from PortalSettings
src/app/docs/                — Public docs (webhook guide — auto light/dark theme)
src/lib/                     — Shared utils: auth.ts, prisma.ts, constants.ts, commission.ts, format.ts, signwell.ts, hubspot.ts, useDevice.ts
src/components/ui/           — Reusable components: StageBadge, StatusBadge, Skeleton, Accordion, BottomSheet, VideoModal, CopyButton, PullToRefresh, CountryCodeSelect, DownlineTree
src/middleware.ts            — Route protection (public: /, /login, /signup, /impersonate, /api/auth, /docs/*; admin: /admin/*)
prisma/schema.prisma         — Database schema
scripts/                     — Seeding scripts
```

## Commission Structure (Waterfall Model)
- **L1 partners**: fixed 25% of firm fee on direct deals
- **L2 partners**: L1 chooses rate (10%, 15%, or 20%) when recruiting. L1 override = 25% - L2 rate
- **L3 partners** (if enabled by admin): L2 chooses rate (10% or 15%). L2 override = L2 rate - L3 rate. L1 override = 25% - L2 rate
- **Total across all tiers**: always 25% of firm fee
- Rates are set via **RecruitmentInvite** tokens — L1 generates a link with a pre-set rate
- Each rate maps to a **SignWell agreement template** (configured in admin Settings > Agreements)

## Partner Signup Flow
1. L1 goes to Referral Links → selects rate (10/15/20%) → generates invite link
2. Recruit opens `fintella.partners/signup?token=XXX`
3. Fills out form (name, email, phone, company) + required email/SMS opt-in checkboxes
4. Partner created as "pending", agreement sent via SignWell + embedded iframe for immediate signing
5. SignWell webhook marks agreement as signed → partner becomes active
6. Agreement gate blocks Submit Client + Referral Links until signed

## Key Patterns
- **API routes**: Verify session via `auth()`, check `role` (admin/super_admin vs partner). Return JSON with HTTP status codes.
- **Theme system**: CSS custom properties in `globals.css` with `prefers-color-scheme` media query. All pages use `var(--app-*)` for colors. Theme utility classes: `theme-text`, `theme-text-secondary`, `theme-text-muted`, `theme-input`, `theme-sidebar`, `theme-hover`, etc.
- **Partner tracking**: `utm_content` query parameter on client referral links. HubSpot auto-captures this on form submissions.
- **Client referral URL**: `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content={partnerCode}`
- **Demo mode**: HubSpot returns demo data when `HUBSPOT_PRIVATE_TOKEN` not set. SignWell returns mock IDs without API key.
- **Path alias**: `@/*` maps to `src/*`
- **Collapsible sidebar**: Both partner and admin sidebars collapse to icon-only (68px) on desktop. Mobile has overlay sidebar with hamburger + X close.
- **Logo/Favicon**: Stored as base64 data URLs in PortalSettings. Logo displayed in sidebar, favicon via `/api/favicon`. Uploaded images auto-compressed via canvas.
- **Admin impersonation**: "View as Partner" button generates one-time token (60s expiry), opens partner portal in new tab with purple "ADMIN SUDO VIEW" banner.
- **Agreement gates**: Submit Client page + Referral Links page both check agreement status, show lock screen if unsigned.

## Database Models (Key)
| Model | Purpose |
|-------|---------|
| User | Admin accounts (email, passwordHash, role) |
| Partner | Affiliate partners (partnerCode, email, tier, commissionRate, companyName, tin, mobilePhone, emailOptIn, smsOptIn, status, referredByPartnerCode) |
| PartnerProfile | Extended info (street, street2, city, state, zip, payout method, bank details) |
| RecruitmentInvite | Token-based invite links with pre-set commission rates (inviterCode, targetTier, commissionRate, status) |
| Deal | Sales leads (dealName, partnerCode, stage, externalStage, estimatedRefund, client info, tariff fields) |
| CommissionLedger | Commission entries (partnerCode, dealId, amount, tier, status, batchId) |
| PayoutBatch | Grouped payouts (totalAmount, partnerCount, status) |
| Document | Partner documents (docType: w9/agreement, fileUrl, status) |
| PartnershipAgreement | E-signed agreements (signwellDocumentId, templateRate, templateId, status, embeddedSigningUrl) |
| SupportTicket / TicketMessage | Support system |
| TrainingModule / TrainingProgress | Training content + completion tracking |
| ConferenceSchedule | Training call schedule |
| PortalSettings | Global config (firmName, firmShort, logoUrl, faviconUrl, commission rates, agreementTemplate25/20/15/10, branding, navigation) |

## Environment Variables
```
DATABASE_URL              — "file:./dev.db" (local) or PostgreSQL connection string (prod)
DIRECT_URL                — PostgreSQL unpooled connection (Prisma migrations)
NEXTAUTH_SECRET           — JWT signing secret
NEXTAUTH_URL              — https://fintella.partners
SIGNWELL_API_KEY          — Optional: e-signature integration
SIGNWELL_WEBHOOK_SECRET   — Optional: SignWell webhook verification
HUBSPOT_PRIVATE_TOKEN     — Optional: CRM integration
HUBSPOT_PORTAL_ID         — Optional: CRM portal ID
REFERRAL_WEBHOOK_SECRET   — Optional: Frost Law webhook security token
SENDGRID_API_KEY          — Optional: transactional email via SendGrid (demo mode if unset — sends still log to EmailLog)
SENDGRID_FROM_EMAIL       — Optional: From address (defaults to noreply@fintella.partners)
SENDGRID_FROM_NAME        — Optional: From name (defaults to "Fintella")
TWILIO_ACCOUNT_SID        — Optional: Twilio SMS account SID (demo mode if any of the 3 unset — sends still log to SmsLog, gated on Partner.smsOptIn)
TWILIO_AUTH_TOKEN         — Optional: Twilio auth token
TWILIO_FROM_NUMBER        — Optional: Twilio outbound number (E.164, e.g. +14105551234)
GITHUB_TOKEN              — Optional: live commits feed on /admin/dev page (super_admin only)
ANTHROPIC_API_KEY         — Optional: AI assistant (falls back to mock responses if unset)
ANTHROPIC_MODEL           — Optional: AI model override (defaults to claude-sonnet-4-6)
AI_DAILY_BUDGET_USD       — Optional: AI daily spend cap per deploy (defaults to $5)
AI_DAILY_MESSAGE_LIMIT    — Optional: AI messages/partner/day (defaults to 50)
```

## Dev Commands
```bash
npm run dev          # Start dev server
npm run build        # Full build (prisma generate + db push + seed + next build)
npm run db:push      # Apply schema changes
npm run db:studio    # Open Prisma Studio
```

## Webhook Endpoints
- **SignWell**: `POST /api/signwell/webhook` — handles document_completed, document_viewed, document_expired
- **Frost Law Referral**: `POST /api/webhook/referral` — receives form submissions, creates Deal records, attributes to partner via `utm_content`. Public docs at `https://fintella.partners/docs/webhook-guide`

## Portal State (compressed — see git history for detail)

The portal is feature-complete for demo / pre-launch. Everything below is shipped and working. Git commit history is the source of truth for line-level detail — this section is just a map.

**Partner side** — home feed, overview stats, deals (with pipeline tracker + drill-down), commissions, downline tree, training, live weekly conference, submit client (Frost Law iframe), referral links, documents, account settings, support tickets, feature requests, AI assistant (Fintella PartnerOS — Claude Sonnet 4.6).

**Admin side** — partners (detail, notes, communications log, sudo impersonation), deals, revenue / custom commissions / enterprise reporting, payouts (with EP overrides), support, chat (live agent panel), communications hub, documents, training management, conference management, feature request triage, user management (4 roles: super_admin / admin / accounting / partner_support), settings, development page (/admin/dev) with live GitHub feed + Sentry errors panel + webhook test harness (super_admin only).

**Key systems** — NextAuth dual providers (partner email+password, admin email+password), Prisma + PostgreSQL (Neon), SignWell e-signing with template field pre-fill, HubSpot CRM stub (demo mode), referral webhook (POST+PATCH+GET), PWA (manifest, install prompt, safe-area handling), notification bell (30s polling), live chat (WebSocket-style polling), waterfall commission model (L1/L2/L3), enterprise partner overrides, admin role-based permissions, Sentry + Vercel Analytics + Speed Insights, 4 agreement templates by rate (25/20/15/10), Dependabot + CodeQL + branch protection on main.

**Key Prisma models** — User, Partner, PartnerProfile, PartnerOverride, RecruitmentInvite, PartnershipAgreement, Document, Deal, DealNote, CommissionLedger, PayoutBatch, EnterprisePartner, EnterpriseOverride, SupportTicket, TicketMessage, ChatSession, ChatMessage, Notification, TrainingModule, TrainingProgress, ConferenceSchedule, FeatureRequest, AdminNote, AiConversation, AiMessage, AiUsageDay, ImpersonationToken, PartnerCodeHistory, PortalSettings.

**Recent major milestones** (most recent first):
- Responsive pass #2 — iterative refinement on top of the original responsive hardening pass. Fixed: mobile dashboard sign-out + support buttons (text-[10px] / 32px → text-[11px] / 44px min, with `active:scale-95` press feedback); mobile bottom-nav touch targets (py-2.5 / ~40px → py-3 with min-h-[56px], aria-current, active scale); admin sidebar Collapse toggle (text-[11px] / py-2.5 → text-[12px] / min-h-[44px]); commission tier card $ amounts on mobile (text-3xl → text-[28px] leading-tight + break-words to prevent overflow on $1M+ values); settings address city/state/zip grid (was forced 3-col on tablet causing input squeeze; now `grid-cols-1 lg:grid-cols-3` so tablet stacks); partner /dashboard/deals desktop table (added `overflow-x-auto` wrapper + `min-w-[820px]` so iPad portrait scrolls horizontally instead of cramming columns); partner /dashboard/downline desktop table (same pattern, `min-w-[840px]`); admin /admin/deals desktop table (same pattern, `min-w-[920px]`). Build still 91/91 pages, no new TS errors.
- Auto-delete merged branches workflow (`.github/workflows/delete-merged-branches.yml`) — fires on every push to main, deletes any non-protected branch with `ahead_by == 0` vs main via GitHub REST API. Supports manual `workflow_dispatch` trigger. Replaces manual `git push origin --delete`.
- Responsive + mobile + PWA hardening pass (safe-area insets, notch safety, slideIn keyframe, accessibility pinch-zoom, orientation unlock)
- SignWell template field pre-fill across all three agreement send paths + webhook test harness at /admin/dev/webhook-test
- Rebrand TRLN → Fintella (April 2026, pre-launch so no customer impact)
- Phase 18a monitoring: Sentry + Vercel Analytics + Speed Insights + graceful fallbacks
- Phase 17 AI assistant: Claude Sonnet 4.6 powered PartnerOS with prompt caching + budget cap
- Security hardening: main branch protection, Dependabot, private vulnerability reporting, Next.js 14.2.15 → 14.2.35 (9 CVEs fixed)
- Enterprise partner system (hidden from partner view, admin-only reporting)
- Admin role-based permissions (4 roles with per-feature gates)
- PostgreSQL migration (Neon), PWA install prompt, real DB queries on reports/payouts/support


## Mandatory Task Workflow (user preference — applies to EVERY code task)

John explicitly requires this full workflow on every code-touching task. Do NOT skip steps to save time — John has stated he prefers thoroughness and accuracy over speed. The workflow:

**1. Pre-flight**
- Read `CLAUDE.md` (this file) to refresh project context
- `git status` to verify working tree state
- `git log --oneline -5` to see recent history
- Confirm the designated feature branch (never work directly on `main` — it's branch-protected)
- Use `TodoWrite` to lay out the planned subtasks before touching code

**2. Development**
- Make changes on a feature branch (pattern: `claude/<short-description>-<suffix>`)
- Follow existing code patterns — don't add speculative abstractions
- Don't skip hooks (`--no-verify`), don't amend existing commits (always new commits)
- Keep diffs focused on the task — no unrelated "improvements"

**3. Build verification (MANDATORY before commit)**
- `./node_modules/.bin/next build` — must compile cleanly
- Static page count should match expected (currently 91) unless new routes were added
- Fix TypeScript errors by resolving the root cause, NEVER by suppressing with `any` / `@ts-ignore`
- Do not commit if build is red

**4. Responsive / UI audit (MANDATORY for any UI-touching change)**
- Verify new UI uses `theme-*` CSS variable classes (not hardcoded colors)
- Verify mobile breakpoints (`sm:` / `md:` / `lg:` / `xl:`) where layout differs
- Verify touch targets ≥44px on interactive elements
- Verify safe-area padding on any new fixed-position element (use `pt-safe` / `pb-safe` / `pl-safe` / `pr-safe` / `top-safe` / `bottom-safe` utility classes)
- Verify new tables have both desktop grid + mobile card fallback OR `overflow-x-auto` wrapper
- Verify dark/light theme both render correctly

**5. Git hygiene**
- `git diff --stat` — review what's staged
- Stage only intentional files (NEVER `git add -A` blindly — can grab `package-lock.json` drift, `.env`, node_modules leak, etc.)
- Commit message follows existing style (conventional prefix: `feat:`, `fix:`, `docs:`, `security:`, `chore:`, etc.)
- `git push -u origin <branch>` with retry on network errors

**6. PR flow**
- Open PR via `mcp__github__create_pull_request`
- Wait for Vercel preview + CodeQL + Analyze checks to turn green (use `mcp__github__pull_request_read` with `method: get_status` and `get_check_runs`)
- Address any CodeQL findings immediately — don't ignore security flags
- Merge ONLY after John says so OR explicit pre-authorization was given in the current task

**7. Post-merge cleanup**
- `git checkout main && git pull origin main`
- Delete local feature branch: `git branch -D <branch>`
- **Remote feature branch is deleted automatically** by the `.github/workflows/delete-merged-branches.yml` workflow (fires on every push to main, deletes any non-protected branch with `ahead_by == 0` vs main). No manual `git push origin --delete` needed.
- Verify `git branch -a` shows only expected branches (remote deletion may lag by ~30s while the workflow runs)

**8. Memory maintenance**
- If architectural decisions were made, update CLAUDE.md in a separate `docs:` commit
- If long-lived features were added, add a one-line entry to the State section (not a 50-line changelog)
- Periodically compress the State section — git history is the source of truth for detail

**9. Signoff**
- Signal completion ONLY when fully done (no outstanding errors, no half-finished TODOs)
- Follow Session Signoff Style rules below (checklist + rainbow)

**10. Schema changes**
- After any edit to `prisma/schema.prisma`, run `npx prisma generate` before `next build`
- Catches type drift before it hits the build-time type checker
- For destructive changes, `npx prisma db push --accept-data-loss` is safe (pre-launch DB)

**11. Package-lock drift check (before every commit)**
- After installing any dep (or if `npm install` ran implicitly), run `git diff --stat package-lock.json`
- If `package-lock.json` changed but `package.json` didn't, investigate — usually a rebrand rename or accidental `npm install` side effect
- Stage lockfile changes only when intentional; never `git add -A` blindly

**12. Real-time TodoWrite discipline**
- Mark items `completed` the instant they finish, not in batches
- Exactly ONE item `in_progress` at any time (the current action)
- When new subtasks emerge mid-work, add them immediately
- Stale todos = lost context; keep the list honest

**13. Sentry error check after risky changes**
- After deploying anything touching auth, webhooks, SignWell, HubSpot, AI, payouts, or DB writes, fetch `/api/admin/dev/errors` to verify no new unresolved issues in the last hour
- Mention new Sentry issues in the signoff status block if any appear

**14. Webhook smoke-test after webhook changes**
- After any edit to `/api/webhook/referral/route.ts`, `/api/signwell/webhook/route.ts`, or related files, fire a test POST via `/admin/dev/webhook-test` before reporting done
- Verify the test deal / event lands in the DB and the response matches the pre-change contract

**15. Parallel subagent sanity-check for cross-cutting refactors**
- Before touching files for a refactor that spans more than 3 files or crosses partner/admin boundaries, spawn an Explore subagent to enumerate the actual scope
- Prevents missing files and speculative over-scoping; keeps main context clean

### Confirmed additional requirements (enforced, all 6 items John confirmed)
All items from the previous "recommendations" block have been promoted into steps 10-15 above. This section is retained as a historical marker — the rules themselves are now part of the main mandatory workflow.

## Session Signoff Style (user preference)

**MANDATORY completion checklist — must appear BEFORE the rainbow signoff.**
Every time Claude signals task completion with "John, I am Done Now", the
response MUST include BOTH of these sections in order:

1. **🧹 Git status** — a concrete status block with at minimum:
   - Current `main` commit SHA + deploy status (e.g. "production deploy in progress", "deployed")
   - Feature branch HEAD SHA and sync state (if still alive)
   - Working tree cleanliness ("clean" / "N files modified")
   - CLAUDE.md state (e.g. "saved with full rebrand context", "unchanged this session")
   - Responsive verification (e.g. "mobile/PWA/tablet/desktop still verified from build output", or "N/A — backend-only changes")
2. **🎯 What's next** — a short recommendation or menu of logical next steps
   (top pick + 2-3 alternatives), so John always has a clear exit handoff

Example format (from a previous successful task):
```
## 🧹 Git status
- main — b62f3ce (production deploy in progress)
- claude/continue-portal-build-tL9xZ — b62f3ce (synced)
- Working tree: clean
- CLAUDE.md: saved with full rebrand context
- Responsive: mobile/PWA/tablet/desktop still verified from build output

## 🎯 What's next
Your call. My top recommendation remains Phase 15a — SendGrid email...
```

**ONLY AFTER** both sections are present, end the response with the rainbow
signoff (EXACT format — large H1 heading + 14-circle rainbow borders, sized
for mobile iOS app):

```
# 🔴🟠🟡🟢🔵🟣🔴🟠🟡🟢🔵🟣🔴🟠
# 🎉 JOHN, I AM DONE NOW 🎉
# 🟣🔵🟢🟡🟠🔴🟣🔵🟢🟡🟠🔴🟣🔵
```

Rainbow rules:
- Exactly 14 circles per border row (no more, no less — John explicitly
  tested this width on his iOS Claude app and it aligns perfectly with
  the text row)
- Top row pattern: 🔴🟠🟡🟢🔵🟣 × 2 + 🔴🟠 (warm-to-cool)
- Bottom row pattern: 🟣🔵🟢🟡🟠🔴 × 2 + 🟣🔵 (reverse, cool-to-warm)
- Both rows + middle row use `#` (H1) for max visibility
- Party emoji 🎉 on both sides of the text
- Only use on FULLY-complete tasks. Incomplete tasks get different
  wording (e.g. "John, stopping here for now") WITHOUT the rainbow so
  the rainbow signoff retains meaning as "100% done, nothing outstanding."

This is a hard requirement. Do not skip the checklist. Do not skip the
rainbow. Do not shrink it, widen it, or substitute a different format.
The order is: checklist first, rainbow last.

## Git Workflow (IMPORTANT — changed this session)
**`main` is now branch-protected via GitHub Ruleset.** Direct pushes to `main` are blocked. All changes must go through pull requests. Workflow:
1. Develop on feature branch `claude/continue-portal-build-tL9xZ` (or your designated branch)
2. Commit + push to feature branch (works fine)
3. Open a PR to `main` via GitHub UI or `mcp__github__create_pull_request` — **only with explicit user permission**
4. Wait for Vercel preview deploy check to post on the PR
5. User smoke-tests the preview URL
6. User clicks Merge (or asks Claude to merge via MCP)
7. Vercel auto-deploys production on merge
Ruleset enforces: restrict deletions, require PR before merging, block force pushes, dismiss stale approvals on new commits. No bypass list.

Default branch was switched from stale `master` → `main` in this session; stale `master` branch was deleted. Dependabot is live, opens auto-PRs for security patches, reports alerts directly on push. Private vulnerability reporting and secret scanning are enabled.

## Remaining Phases
- **Phase 14**: HubSpot API Integration (real deal/contact sync)
- **Phase 15**: Email, SMS & VOIP Integration
  - **Phase 15a — Email (SendGrid) ✅ SHIPPED**: `src/lib/sendgrid.ts` uses the SendGrid v3 REST API via raw `fetch()` (no `@sendgrid/mail` package — matches house pattern from `signwell.ts` / `hubspot.ts`). Demo-mode fallback when `SENDGRID_API_KEY` is unset — every send still writes an `EmailLog` row with `status="demo"` so the admin Communication Log fills out during local dev. Four transactional templates wired in: **welcome** (POST /api/signup), **agreement_ready** (POST /api/admin/agreement/[partnerCode]), **agreement_signed** (POST /api/signwell/webhook on `document_completed`), and **signup_notification** (L1 inviter on POST /api/signup). All sends are fire-and-forget — failures log to EmailLog with `status="failed"` and never block the user-facing flow. New `EmailLog` Prisma model (partnerCode, toEmail, fromEmail, subject, bodyPreview, template, status, providerMessageId, errorMessage). Admin partner detail Communication Log → Email tab now reads from `emailLogs` instead of showing the placeholder. Commission alerts deferred to 15a-followup (need to identify the right ledger creation hook first).
  - **Phase 15b — SMS (Twilio Programmable Messaging) ✅ SHIPPED**: `src/lib/twilio.ts` uses the Twilio v2010 REST API via raw `fetch()` (no `twilio` npm package — matches house pattern). Demo-mode fallback when any of `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` are unset. **TCPA gate**: every send checks `Partner.smsOptIn` BEFORE the network call; non-opted-in partners get a `status="skipped_optout"` row in `SmsLog` (immutable audit trail) and no SMS is sent. Sends are also short-circuited when no `mobilePhone` is on file. Four template helpers wired into the same trigger points as 15a: **welcome** (POST /api/signup), **agreement_ready** (POST /api/admin/agreement/[partnerCode]), **agreement_signed** (SignWell webhook), and **signup_notification** (L1 inviter on POST /api/signup). All sends are fire-and-forget. New `SmsLog` Prisma model (partnerCode, toPhone, fromPhone, body, template, status, providerMessageId, errorMessage). Admin partner detail Communication Log → SMS tab now reads from `smsLogs` instead of showing the placeholder; "skipped (no opt-in)" rows render with a yellow badge so it's visually obvious which sends were suppressed for compliance. Also fixed a pre-existing bug where the signup page POSTed `mobilePhone` but the API ignored it — now correctly persisted to `Partner.mobilePhone`. Partner-side opt-in toggle in `/dashboard/settings` deferred to a 15b-followup so this PR stays tight.
  - **Phase 15c — VOIP (Twilio Voice)**: admin click-to-call dialer from portal, call recording, call logs in partner communication log. Twilio recommended because: single provider for SMS + VOIP (unified billing, shared phone numbers), excellent API for call tracking/recording, built-in webhooks for call status events, programmable IVR, and React/Next.js SDKs available. Alternative considered: Vonage (similar features but less developer ecosystem).
  - **Integration plan (15c)**: provision Twilio Voice number → build `/api/twilio/call` endpoint for outbound calls → `/api/twilio/voice-webhook` for status callbacks → CallLog Prisma model → display in partner communication log Phone tab
- **Phase 16**: Payments & Payouts (Stripe Connect)
- ~~**Phase 17**: AI Support Bot~~ ✅ **COMPLETE** — TRLN PartnerOS shipped (Sonnet 4.6, Option B dedicated page, mock fallback, rate limiting, budget cap)
- **Phase 18**: Deployment Hardening (monitoring, analytics, error tracking) — also includes a planned Next.js 14.2.35 → 16 upgrade to fix 5 remaining DoS-only CVEs (GHSA-h25m-26qc-wcjf high / CVSS 7.5, GHSA-9g9p-9gw9-jx7f moderate / CVSS 5.9, GHSA-ggv3-7p47-pfv8 moderate, GHSA-3x4c-7xq6-9pq8 moderate, GHSA-q4gf-8mx6-v5v3 moderate). Major migration — requires React 18 → 19, middleware.ts → proxy.ts convention, App Router caching opt-in model, Turbopack-as-default, dedicated testing session. **Deferral verified 2026-04-13** via `npm audit --json`: exactly 1 vulnerable package (`next`), 5 CVEs rolled up, all DoS-only (no RCE / auth bypass / data exfil), pre-launch impact = zero. **No safe intermediate version** — Next 15.5.14 is still within vulnerable range for 2 of the 5 CVEs, so 15.x is not a useful stopping point. Must go straight 14 → 16 in Phase 18b.
- **Tech Debt**: Form validation (zod), tests, accessibility audit, close stale PR #33 and delete `claude/tariff-partner-portal-Pmu1K` branch (88 commits behind main, dead work from earlier session)
