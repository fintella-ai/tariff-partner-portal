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
2. Recruit opens `trln.partners/signup?token=XXX`
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
NEXTAUTH_URL              — https://trln.partners
SIGNWELL_API_KEY          — Optional: e-signature integration
SIGNWELL_WEBHOOK_SECRET   — Optional: SignWell webhook verification
HUBSPOT_PRIVATE_TOKEN     — Optional: CRM integration
HUBSPOT_PORTAL_ID         — Optional: CRM portal ID
REFERRAL_WEBHOOK_SECRET   — Optional: Frost Law webhook security token
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
- **Frost Law Referral**: `POST /api/webhook/referral` — receives form submissions, creates Deal records, attributes to partner via `utm_content`. Public docs at `https://trln.partners/docs/webhook-guide`

## Completed Work (This Session)
- Submit Client page with Frost Law iframe embed (replacing Submit Lead)
- Partnership agreement gate on Submit Client + Referral Links
- Account Settings page for partners (name, company, TIN, email, phone, mobile with country code dropdown, address)
- Agreement trigger: changing name/company invalidates signed agreement
- Admin partner detail sync (company, TIN, mobile, address, documents, W9 status, send agreement/W9 buttons)
- Admin document upload (upload agreement → auto-activates partner, upload W9 → auto-approved)
- Country code dropdown component (30 countries with flags)
- Downline tree view (L1/L2/L3 visual hierarchy) for partner and admin
- Portal rebrand: TRRLN → TRLN, full name updated
- Client referral URL updated to referral.frostlawaz.com/l/ANNEXATIONPR/
- Partner tracking switched to utm_content for HubSpot compatibility
- Referral webhook endpoint built with flexible field mapping + external deal stage
- Webhook integration guide (public page at /docs/webhook-guide, auto light/dark)
- Custom domain setup: trln.partners
- Logo/favicon upload in admin settings with auto-compression
- Collapsible sidebar (desktop: icon-only mode, mobile: overlay with close button)
- Full light/dark theme support across all 32 files (870+ color values replaced with CSS variables)
- Mobile optimization passes (touch targets, overflow, responsive padding)
- Commission structure redesign: waterfall model (25% max, L1/L2/L3 tiers)
- RecruitmentInvite system with token-based signup links
- Public partner signup page with embedded agreement signing
- Rate-specific agreement templates (admin configures SignWell template IDs)
- Admin impersonation ("View as Partner" button with sudo banner)
- Commission tab redesign: fixed 25% display with waterfall examples
- W9 status column on admin partners list
- Required email/SMS opt-in checkboxes on partner signup (CAN-SPAM/TCPA compliant)
- Admin document upload (upload agreement → auto-activates partner, upload W9 → auto-approved)
- Admin impersonation tokens stored in DB (ImpersonationToken model, 15-min expiry)
- Double confirmation on partner code reset
- PostgreSQL migration (Neon via Vercel Storage) — persistent data, no more cold start data loss
- Company logo displayed in both admin and partner sidebar top-left
- Admin Account Settings page (name, email, password change)
- Partner password authentication (email + password login, replaces partner code)
- Admin can set/reset partner passwords from partner detail page
- Admin name syncs across layout from account API (not just session)
- Company Revenue reporting page (/admin/revenue) — TRLN 40% share, partner 25%, net 15%, deal-by-deal breakdown
- Sortable table headers on Revenue and Reports pages (A-Z, dollar amount sorting)
- Advanced filters on Revenue page (search, partner code, stage, min/max amount)
- Deal amount column added to Revenue table with totals
- "All Data" option on Reports page (not just monthly)
- Document void capability with audit trail (agreement void → partner pending, W9 void → stays active)
- View/Download links for uploaded documents (base64 stored in DB)
- Column headers on Documents section (Document Name, Type, Status, Actions)
- Immutable admin notes audit log (AdminNote model — timestamped, author-tracked, cannot be deleted)
- Removed Commissions page from admin panel (L1 dictates L2 rates via recruitment links)
- PATCH /api/webhook/referral endpoint for deal updates (stage, amounts, closed lost reason)
- Webhook guide redesigned with navigation menu, anchored sections, overview at top
- DealId displayed in Client Submission Details (static, immutable, searchable)
- Deal notes audit log with pin feature (DealNote model)
- Pin/unpin feature on both partner and deal admin notes
- Partner code generation restricted to super_admin only ("Generate New Code")
- Partner code history preserved (PartnerCodeHistory model — old codes kept for audit)
- L2/L3 signup redesign: no SignWell agreements sent, simple success page with login link
- L1 responsible for uploading signed agreements for downline partners
- L1 downline page: "Upload Agreement" button for pending partners
- Admin approve flow: L1-uploaded agreements go to "under_review" → admin approves → partner active
- Agreement gates accept both "signed" (L1/SignWell) and "approved" (L2/L3/admin review)
- Commissions: 25% total paid to L1 only, L1 pays downline using portal reporting
- Real database queries: Admin Reports page (pipeline stats, monthly trends, top partners from Deal/Partner/CommissionLedger)
- Real database queries: Admin Payouts page (commission ledger entries, batch creation, single approve, status tracking)
- Real database queries: Admin Support page (ticket list, detail view with conversation thread, admin reply, status management)
- Real database queries: Partner Support page (ticket creation via POST /api/tickets, conversation view with replies)
- Notification system: NotificationBell component with polling (30s), unread badge, mark-read, click-to-navigate
- 7 new API routes: /api/admin/reports, /api/admin/payouts (GET+POST), /api/admin/support (GET), /api/admin/support/[id] (GET+PATCH), /api/tickets (GET+POST), /api/tickets/[id]/messages (GET+POST), /api/notifications (GET+PATCH)
- Mobile optimization pass: reports grids → hidden md:block + mobile cards, NotificationBell 44px touch target + responsive width, revenue mobile label sizes
- Agreement status sync: "approved" and "under_review" statuses properly displayed across admin partner detail, partner documents page, agreement gates, and void logic
- Agreement auto-reconcile: if PartnershipAgreement is "under_review" but an approved Document exists, auto-fixes on page load (both admin and partner APIs)
- Clickable partner name links: all partner names across admin pages (deals, documents, support, payouts, reports, communications, revenue) link to partner profile via PartnerLink component
- Communication log in partner profile: support tickets + system notifications displayed in partner detail page with status badges and timestamps
- PartnerLink reusable component: `src/components/ui/PartnerLink.tsx` — stopPropagation-aware, gold hover underline, graceful null fallback
- Enterprise Partner system: EnterprisePartner + EnterpriseOverride Prisma models, /api/admin/enterprise API (super_admin only)
- Revenue page tabs: Revenue, Custom Commissions, Enterprise Reporting
- Custom Commissions tab: create enterprise partners with custom total rate, add/remove L1 partners by code, expandable detail cards
- Enterprise Reporting tab: deal-level breakdown per enterprise partner showing TRLN 40%, L1 commission, enterprise override, and net profit
- Enterprise "Apply to All" toggle: global override on all portal deals without adding individual partner codes
- Enterprise Partner display in admin partner profile: shows tier badge, total rate, override rate, coverage (confidential — admin-only)
- Enterprise agreement template: SignWell template ID field in admin Settings > Agreements for enterprise partner agreements
- Enterprise data confidentiality: EP info only visible in admin panel, never exposed to partner portal or non-EP partners
- Deal pipeline stages updated: New Lead → No Consultation Booked → Consultation Booked → Client No Show → Client Engaged → In Process → Closed Won → Closed Lost
- Consultation date/time fields: consultBookedDate + consultBookedTime on Deal model, webhook POST creates + PATCH updates (for rescheduling)
- Webhook guide: consultation fields documented in POST + PATCH sections, deal example screenshot section added
- Clickable deal name links: all deal names across admin pages (revenue, payouts, enterprise reporting) link to deals page via DealLink component with auto-expand and scroll-to
- DealLink reusable component: `src/components/ui/DealLink.tsx` — navigates to `/admin/deals?deal={id}`, auto-expands and scrolls to target deal
- Enterprise Remove/Terminate: "Terminate" keeps historical data but stops tracking; "Remove" permanently deletes all EP data. Double confirmation on remove.
- Enterprise payouts wired into standard Payouts page: EP overrides appear as "EP" tier entries alongside L1/L2/L3 commissions with due/pending/paid status
- Communication log filters: partner profile now has filter tabs for All, Support Tickets, Email, SMS, Live Chat, Phone Calls (SMS/Email/Chat/Phone show phase placeholders)
- Admin role-based permissions: 4 roles (super_admin, admin, accounting, partner_support) with per-role nav visibility, feature restrictions, settings tab access
- Admin user management page (/admin/users): super_admin can create admins, assign roles, reset passwords, delete users
- Permission checks: void documents (admin+ only), reset partner code (super_admin only), settings tabs filtered by role, nav items filtered by role
- Permissions config: `src/lib/permissions.ts` — centralized role definitions, nav visibility, feature flags
- Live chat system: ChatSession + ChatMessage Prisma models, partner widget (real-time), admin agent panel (/admin/chat) with conversation list + reply
- Live chat on/off toggle: admin Settings > Home Page tab, controls `liveChatEnabled` in PortalSettings
- Partner chat widget: only visible when live chat is enabled, creates sessions, sends/receives messages with 4s polling
- Admin chat page: split panel (session list left, conversation right), 5s polling, unread badges, close session, partner profile links
- PWA "Add to Home Screen": manifest API (/api/manifest), icon API (/api/icon), service worker, apple-web-app meta tags
- PWA install prompt overlay: full-screen onboarding on first dashboard visit, platform-specific instructions (iOS Share→Add, Android native install), reappears every 7 days if not installed, hidden in standalone mode
- PWA hook: `src/lib/useInstallPrompt.ts` — beforeinstallprompt capture, standalone detection, localStorage dismiss with 7-day reappearance
- Payout banking fields: PartnerProfile schema updated with accountType, beneficiaryName, bankAddress fields
- Partner account settings: full payout information section (method, bank name, account type, routing, account number, beneficiary, bank address)
- Admin partner profile: matching payout information section with all banking fields, editable by admin
- Bank letter/voided check: new document type "bank_letter" for both partner and admin document uploads
- Partner deal drill-down: expandable read-only deal detail with deal ID, client info, tariff info, financials
- Partner deal status tracker: visual pipeline progress bar showing all 8 stages with current stage highlighted
- Partner deal notes & activity: timeline showing creation, consultation scheduled, referral notes, close events
- Deal Support button: opens live chat (if enabled) pre-filled with deal context, or opens support ticket with deal ID auto-populated
- Partner downline tree: commission percentages shown for L2/L3 downline only (upline % hidden from downline view)
- Admin Development page (/admin/dev, super_admin only): live GitHub commits feed via GITHUB_TOKEN, deployment info (Vercel env vars), quick-links to Claude Code + GitHub repo, static fallback when token absent
- Feature Request System: FeatureRequest Prisma model, partner + admin submission endpoints (/api/feature-requests), super_admin management endpoint (/api/admin/feature-requests) with stats + filter, partner UI (/dashboard/feature-request) for submitting ideas/bugs/UX improvements, admin UI (/admin/features) with status triage (submitted → in_review → in_progress → completed/rejected), priority, admin response notes visible to requester
- Security hardening (branch-protected `main`): switched default branch from `master` → `main` (deleted stale master), created GitHub Ruleset on `main` (restrict deletions, require PR before merging, block force pushes, dismiss stale approvals), enabled Dependabot + private vulnerability reporting + secret scanning, Next.js 14.2.15 → 14.2.35 upgrade fixing 9 CVEs including critical CVSS 9.1 middleware auth bypass (GHSA-f82v-jwr5-mffw)
- TRLN PartnerOS AI Assistant (Phase 17): Claude Sonnet 4.6 powered support bot with partner data context (recent deals, commission totals, downline count, agreement status), conversation persistence (AiConversation + AiMessage + AiUsageDay Prisma models), prompt caching on static knowledge base (commission structure, deal stages, FAQ), rate limiting (50 msgs/partner/day, $5/day budget cap via AI_DAILY_BUDGET_USD env var), graceful mock fallback when ANTHROPIC_API_KEY not set, dedicated page at /dashboard/ai-assistant with conversation history sidebar + suggested prompts empty state, 3 API routes (/api/ai/chat, /api/ai/conversations, /api/ai/conversations/[id]), nav item with 🤖 icon. Uses @anthropic-ai/sdk 0.88.0.
- Phase 18a — Monitoring & Observability: Sentry error tracking (@sentry/nextjs ^10, client + server + edge configs with PII scrubbing, ignored-errors list for noise reduction), Vercel Analytics (@vercel/analytics) + Speed Insights (@vercel/speed-insights) wired into root layout, branded global-error.tsx boundary with friendly fallback UI (error ID, Try Again + Go Home buttons) that auto-reports to Sentry, src/lib/monitoring.ts helper with captureError/captureMessage + automatic secret redaction, next.config.js conditionally wrapped with withSentryConfig for build-time source map upload (only when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT are all set). Admin /admin/dev page extended with "Recent Errors (Last 24h)" panel that fetches unresolved issues from Sentry API via new /api/admin/dev/errors route (super_admin only). ALL graceful — no env vars required for build to succeed; mock/empty states everywhere.
- Rebrand (April 2026): **TRLN → Fintella** — full rename from "Tariff Refund & Litigation Network (TRLN)" to "Fintella — Financial Intelligence Network". Portal had not yet launched, so no customer impact. Scope: FIRM_NAME/FIRM_SHORT constants, root layout metadata + PWA manifest, AI knowledge base + system prompts, InstallPrompt component + localStorage key (fintella_pwa_install_dismissed), /docs/webhook-guide (title + header + URL examples + footer), admin revenue page (labels "Fintella 40%", "Fintella Net Revenue", internal variable renames trlnGross → fintellaGross, TRLN_FEE_RATE → FINTELLA_FEE_RATE, etc.), admin enterprise API (internal vars + comment), admin/partner training seed data + FAQ content, conference pages (host name "Fintella Leadership Team", ICS filename fintella-weekly-call.ics), admin communications email templates, admin settings support email placeholder (support@fintella.partners), partner dashboard layout (mobile header, partnerRefUrl, __fintellaChatOpened DOM key), URL fallbacks in /api/invites and /api/admin/impersonate (https://fintella.partners), legal DBA consent text on /signup + /getstarted ("Financial Intelligence Network DBA (Fintella)"), package.json name (fintella-partner-portal), seed-training.ts + seed-conference.ts scripts, Accordion doc comment example. Historical session artifacts in docs/superpowers/* intentionally NOT touched. New domain fintella.partners added in Vercel alongside legacy trln.partners; NEXTAUTH_URL needs to be updated to https://fintella.partners post-merge. Vercel project name unchanged (still "tariff-partner-portal-iwki") to avoid deployment URL churn.

## Session Signoff Style (user preference)
When ending a task with "John, I am Done Now", ALWAYS use this EXACT format
(large H1 heading + 14-circle rainbow borders — sized for mobile iOS app):

```
# 🔴🟠🟡🟢🔵🟣🔴🟠🟡🟢🔵🟣🔴🟠
# 🎉 JOHN, I AM DONE NOW 🎉
# 🟣🔵🟢🟡🟠🔴🟣🔵🟢🟡🟠🔴🟣🔵
```

Rules:
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

This is a hard requirement. Do not skip it, shrink it, widen it, or
substitute a different format.

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
  - **Email**: SendGrid — transactional emails, partner notifications, commission alerts, logged in partner communication log
  - **SMS**: Twilio Programmable Messaging — opt-in partner SMS notifications, logged in partner communication log
  - **VOIP**: Twilio Voice — admin click-to-call dialer from portal, call recording, call logs in partner communication log. Twilio recommended because: single provider for SMS + VOIP (unified billing, shared phone numbers), excellent API for call tracking/recording, built-in webhooks for call status events, programmable IVR, and React/Next.js SDKs available. Alternative considered: Vonage (similar features but less developer ecosystem).
  - **Integration plan**: Twilio account → provision phone numbers → build `/api/twilio/call` endpoint for outbound calls → `/api/twilio/sms` for sending → `/api/twilio/webhook` for status callbacks → CallLog + SmsLog Prisma models → display in partner communication log
- **Phase 16**: Payments & Payouts (Stripe Connect)
- ~~**Phase 17**: AI Support Bot~~ ✅ **COMPLETE** — TRLN PartnerOS shipped (Sonnet 4.6, Option B dedicated page, mock fallback, rate limiting, budget cap)
- **Phase 18**: Deployment Hardening (monitoring, analytics, error tracking) — also includes a planned Next.js 14.2.35 → 15/16 upgrade to fix 5 remaining DoS-only CVEs (GHSA-h25m-26qc-wcjf, GHSA-9g9p-9gw9-jx7f, GHSA-ggv3-7p47-pfv8, GHSA-3x4c-7xq6-9pq8, GHSA-q4gf-8mx6-v5v3). Major migration — requires React 19, App Router/caching/middleware changes, dedicated testing session.
- **Tech Debt**: Form validation (zod), tests, accessibility audit, close stale PR #33 and delete `claude/tariff-partner-portal-Pmu1K` branch (88 commits behind main, dead work from earlier session)
