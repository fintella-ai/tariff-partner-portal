# TRLN Partner Portal — Master Roadmap

## Project Overview
Partner portal for Tariff Refund & Litigation Network (TRLN).
Dark theme, mobile-first, device-aware responsive design.
Stack: Next.js 14, Tailwind CSS, Prisma/SQLite, NextAuth, TypeScript.

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

### Phase 14 — HubSpot API Integration 🔲
- [ ] Real deal/contact sync (create, read, update)
- [ ] Lead submission → HubSpot contact/deal creation
- [ ] Deal stage change webhooks
- [ ] Partner activity logging in HubSpot
- [ ] Commission calculation from deal data

### Phase 15 — Email & SMS Integration 🔲
- [ ] Email provider integration (SendGrid/Resend/Gmail API)
- [ ] Real email sending from Communications Hub
- [ ] SMS provider integration (Twilio)
- [ ] Template variable interpolation ({partner_name}, {deal_name}, etc.)
- [ ] Automation trigger engine (event-driven sends)
- [ ] Opt-in/opt-out compliance (CAN-SPAM, TCPA)

### Phase 16 — Payments & Payouts 🔲
- [ ] Stripe Connect for partner payouts
- [ ] Commission calculation engine
- [ ] Payout batch processing
- [ ] Payment history & receipts
- [ ] 1099 reporting support

### Phase 17 — AI Support Bot 🔲
- [ ] Live chat widget (partner-facing)
- [ ] AI bot powered by Claude/OpenAI
- [ ] Knowledge base from training materials
- [ ] Escalation to human support
- [ ] Chat history persistence

### Phase 18 — Deployment & Production ✅ (initial) / 🔲 (hardening)
- [x] Vercel deployment configuration (vercel.json, .env.example)
- [x] Build command: prisma generate && next build
- [ ] PostgreSQL migration (from SQLite)
- [ ] Custom domain setup
- [ ] SSL/security hardening
- [ ] Performance optimization (caching, lazy loading)
- [ ] Error monitoring (Sentry)
- [ ] Analytics (PostHog/Mixpanel)

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

*Last updated: March 27, 2026*
