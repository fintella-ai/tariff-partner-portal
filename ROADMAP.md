# Fintella Partner Portal — Master Roadmap

> Historical note: this portal was originally developed under the "Tariff Refund & Litigation Network (TRLN)" brand and was rebranded to Fintella (Financial Intelligence Network) in April 2026 before launch. Older sections of this roadmap may reference TRLN as historical context — CLAUDE.md is the current source of truth for active work.

## Project Overview
Partner portal for **Fintella — Financial Intelligence Network** (legal DBA: Financial Intelligence Network DBA (Fintella), parent: Annexation PR LLC).
Dark theme, mobile-first, device-aware responsive design.
Stack: Next.js 14, Tailwind CSS, Prisma/PostgreSQL (Neon), NextAuth, TypeScript.

---

## COMPLETED PHASES

### Phase 1 — Project Foundation ✅
- [x] Next.js 14 app with TypeScript
- [x] Tailwind CSS with dark theme (brand-gold #c4a050)
- [x] Prisma ORM + SQLite database (13 tables)
- [x] Global constants (FIRM_NAME, FIRM_SHORT, FIRM_SLOGAN, FIRM_PHONE)
- [x] Font setup (Playfair Display + Inter)
- [x] Base CSS (card class, btn-gold, gold-gradient, animations)

### Phase 2 — Authentication ✅
- [x] NextAuth with partner-login + admin-login providers
- [x] Login page with Partner/Admin tabs
- [x] Full company name on login page
- [x] Demo mode (any email/code works)
- [x] Route protection middleware
- [x] Session persistence

### Phase 3 — Partner Dashboard Layout + Overview ✅
- [x] Sidebar navigation (desktop + mobile hamburger)
- [x] Device detection hook (useDevice — screen size, OS, brand, touch)
- [x] Overview page with stats cards
- [x] Recent Direct Deals table (Deal Name, Stage, Est. Refund, Firm Fee, Commission, Status)
- [x] Recent Downline Activity table
- [x] Projected Earnings section (L1, L2, L3, Total)
- [x] Commission summary (L1 Total, L2 Total, Total Earned with Paid/Pending)
- [x] Mobile card layouts for all tables

### Phase 4 — Partner Pages ✅
- [x] Submit Lead form (validation, success state, agreement gate)
- [x] Referral Links page (Client + Partner recruitment links, copy to clipboard)
- [x] My Deals page (6-column grid, mobile cards)
- [x] Downline page (Your Partners + Downline Deals sections)

### Phase 5 — Documents & Agreement ✅
- [x] Documents page (Partnership Agreement status, required docs, upload area)
- [x] Agreement signing gate on Submit Lead
- [x] W-9, Tax ID tracking with status badges

### Phase 6 — Admin Portal ✅
- [x] Admin layout with sidebar navigation
- [x] Partner Management (search, stats, table, View/Block, HubSpot links)
- [x] Commission Management (default rates, partner overrides, L1/L2/L3)
- [x] Support Ticket Queue (filters, priority badges, status tracking)
- [x] Document Tracking (needs attention filter, W9 requests, bulk actions)
- [x] Payout Management (due/pending/paid tabs, approve batch, export CSV)
- [x] Reports placeholder
- [x] Settings placeholder

### Phase 7 — Admin Enhancements ✅
- [x] Partner Detail page (/admin/partners/[id])
  - [x] Admin Notes (pinned notes, add note form, newest-first)
  - [x] Commission overrides per partner
  - [x] Partner's deals with HubSpot deep links
  - [x] Partner's downline list
  - [x] Document/agreement status
- [x] Communications Hub (/admin/communications)
  - [x] Email Inbox (unread/replied filters, reply/view actions)
  - [x] Compose Email (to, subject, body, CC/BCC, attachments, SMS checkbox)
  - [x] Email Templates (4 templates, create form, categories)
  - [x] Automations (4 rules with enable/disable toggles)
  - [x] SMS Notifications (opt-in stats, partner list, compose, bulk send)

---

## OUTSTANDING PHASES

### Phase 8 — Home / Partner Updates Page ✅
- [x] New "Home" tab as first nav item
- [x] Announcements section (company news, program updates, color-coded badges)
- [x] Leaderboard (anonymized — Partner #XXX, no real names, top 3 highlighted)
- [x] Upcoming Events section (Join Call, Register, RSVP buttons)
- [x] Promotions / Additional Referral Opportunities (3 opportunity cards)
- [x] "Your Rank" callout

### Phase 9 — Navigation & UX Restructuring ✅
- [x] Reorder sidebar: Home > Overview > Partner Training > ...
- [x] Rename "Conference" to "Live Weekly"
- [x] Persistent referral links in header (Client + Partner)
  - [x] Click opens landing page inside portal (iframe/embedded)
  - [x] Auto-copies link to clipboard on click
  - [x] Mobile: both links near top of every page
- [x] Live Chat button for AI support bot (placeholder for future AI bot)
- [x] Support button styling (2x font, bold)
- [x] Support moved below user info, above Sign Out

### Phase 10 — Mobile-First Device Optimization ✅
- [x] Enhanced useDevice hook: detect OS (iOS/Android/Windows/Mac)
- [x] Brand detection (Samsung, Apple, Google, etc.) for color/margin tuning
- [x] Dynamic spacing/padding based on device brand conventions
- [x] Touch target sizing (48px minimum for all interactive elements)
- [x] All pages have desktop table / mobile card dual layouts
- [x] Pull-to-refresh on data pages (overview, deals, downline)
- [x] Bottom sheet modal component for mobile
- [x] Mobile-optimized signing modal (full-height, stacked buttons)

### Phase 11 — Partner Training Page ✅
- [x] Training modules / video embeds (VideoModal component, YouTube/Vimeo embed support)
- [x] Progress tracking (persistent via API + Prisma TrainingProgress table)
- [x] Resource downloads (5 downloadable resources with grid layout)
- [x] FAQ section (10 FAQs with Accordion component, category filtering)
- [x] Admin training management (CRUD for modules, resources, FAQs + progress analytics)
- [x] Database seeding (8 modules, 5 resources, 10 FAQs)

### Phase 12 — Live Weekly (Conference) Page ✅
- [x] Weekly meeting schedule display (from DB via ConferenceSchedule model)
- [x] Zoom/Google Meet link integration (Join Call button, Add to Calendar .ics)
- [x] Past recordings archive (inline VideoModal + external link fallback)
- [x] Meeting notes / summaries (expandable notes per recording)
- [x] Admin conference management (CRUD for schedule entries, recordings, notes)
- [x] Database seeding (1 active + 7 past recordings with notes)

### Phase 13 — SignWell Integration ✅
- [x] Partnership Agreement e-signing via SignWell API (with demo mode fallback)
- [x] Document status sync (not_sent → pending → signed, with viewed tracking)
- [x] Webhook handling for signature completion, expiry, and viewing
- [x] Auto-update partner status after signing (via webhook → DB update + notification)
- [x] Partner documents page wired to real agreement status from DB
- [x] Submit Lead agreement gate checks DB instead of hardcoded demo
- [x] Admin agreement management API (send, resend, manual status update)
- [x] SignWell API client with demo mode (src/lib/signwell.ts)

### Phase 14 — HubSpot API Integration ❌ DESCOPED
Fintella does not run its own HubSpot instance. Frost Law owns the CRM and
pushes deal data to Fintella via `POST /api/webhook/referral` (with PATCH
support for lifecycle updates — see `src/app/docs/webhook-guide/page.tsx`).
Outbound HubSpot sync is not needed and was removed from the plan.

### Phase 15 — Email, SMS & VOIP Integration ✅
All three sub-phases shipped. See CLAUDE.md "Remaining Phases" for
line-level detail; summary here:
- [x] **15a** — SendGrid v3 REST via raw `fetch()` in `src/lib/sendgrid.ts`.
      Demo-mode fallback when `SENDGRID_API_KEY` unset (still writes
      `EmailLog` rows). Four transactional templates wired: welcome,
      agreement_ready, agreement_signed, signup_notification. New
      `EmailLog` Prisma model; admin Communication Log → Email tab
      reads from it.
- [x] **15b** — Twilio Programmable Messaging via raw `fetch()` in
      `src/lib/twilio.ts`. Demo-mode fallback. **TCPA gate**: every send
      checks `Partner.smsOptIn` before the network call; suppressed sends
      log with `status="skipped_optout"` for audit. Same four templates
      as 15a. New `SmsLog` Prisma model.
- [x] **15c** — Twilio Voice (bridged click-to-call) in
      `src/lib/twilio-voice.ts`. Admin-only `POST /api/twilio/call` dials
      `TWILIO_ADMIN_PHONE` first, then bridges the partner. Status
      callbacks update `CallLog` rows. Recording deliberately not
      enabled (state-by-state consent laws — deferred to 15c-followup).

### Phase 16 — Payments & Payouts 🔲
- [ ] Stripe Connect for partner payouts
- [ ] Commission calculation engine
- [ ] Payout batch processing
- [ ] Payment history & receipts
- [ ] 1099 reporting support

### Phase 17 — AI Support Bot ✅
- [x] Claude Sonnet 4.6 powered "Fintella PartnerOS" assistant (dedicated
      page, prompt caching, mock fallback when `ANTHROPIC_API_KEY` unset,
      per-partner daily rate limit + per-deploy daily budget cap)
- [x] Chat history persistence (`AiConversation` + `AiMessage` models)
- [x] Admin-side cost tracking (`AiUsageDay` model)
- [ ] **17b** — split single assistant into dual personalities: **Finn**
      (direct, data-driven) + **Stella** (warm, relationship-focused).
      Narrative foundation for the Fintella portmanteau. Future work.

### Phase 18 — Deployment & Production
- [x] Vercel deployment configuration (vercel.json, .env.example)
- [x] Build command: prisma generate && next build
- [x] **PostgreSQL migration (Neon)** — done; `prisma/schema.prisma`
      pinned to `provider = "postgresql"` with `DATABASE_URL` +
      `DIRECT_URL` (pooled + unpooled)
- [x] Custom domain setup (fintella.partners primary; trln.partners
      still resolves and will eventually redirect)
- [x] **18a monitoring** — Sentry (error tracking) + Vercel Analytics +
      Speed Insights, all with graceful fallbacks
- [x] Security hardening — main branch protection ruleset, Dependabot,
      private vulnerability reporting, secret scanning, CodeQL
- [ ] **18b — Next.js 14.2.35 → 16 upgrade**. Deferred deliberately:
      5 remaining CVEs on Next are all DoS-only (no RCE / auth bypass /
      data exfil), pre-launch impact is zero, and no safe intermediate
      version exists (Next 15.x is still within vulnerable range for 2
      of 5). Must go straight 14 → 16; requires React 18 → 19,
      `middleware.ts` → `proxy.ts` rename, App Router caching opt-in,
      Turbopack-as-default, dedicated testing session. See CLAUDE.md
      for audit notes and deferral rationale.

---

## TECH DEBT & POLISH
- [ ] Replace all demo/hardcoded data with real API calls
- [x] Add loading skeletons to data pages (overview, deals, downline)
- [x] Error boundaries and fallback UI (partner + admin error.tsx)
- [ ] Form validation library (zod + react-hook-form)
- [ ] Unit tests for critical flows
- [ ] E2E tests (Playwright)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] SEO meta tags
- [ ] PWA support (offline, install prompt)

---

*Last updated: April 13, 2026 — sync pass. CLAUDE.md remains the source
of truth for active work; this roadmap is a high-level phase map.*
