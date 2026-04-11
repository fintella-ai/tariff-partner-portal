# Tariff Partner Portal (TRLN)

## Project Overview
- **Name**: Tariff Refund & Litigation Network (TRLN)
- **Domain**: https://trln.partners (Vercel, custom domain)
- **Framework**: Next.js 14.2.15 (App Router) + React 18 + TypeScript 5.4
- **Styling**: Tailwind CSS 3.4 — auto light/dark theme via `prefers-color-scheme` CSS variables, gold accents (#c4a050, #f0d070), fonts: Playfair Display + DM Sans
- **Database**: Prisma 5.20 ORM — SQLite (dev: `prisma/dev.db`), PostgreSQL (prod)
- **Auth**: NextAuth.js 5.0-beta.22 — JWT sessions, dual providers (Partner: email+partnerCode, Admin: email+password)
- **Deployment**: Vercel (project: `tariff-partner-portal-iwki`), region `iad1`
- **Integrations**: SignWell (e-signatures), HubSpot (CRM) — both optional with demo-mode fallbacks

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
NEXTAUTH_SECRET           — JWT signing secret
NEXTAUTH_URL              — https://trln.partners
SIGNWELL_API_KEY          — Optional: e-signature integration
SIGNWELL_WEBHOOK_SECRET   — Optional: SignWell webhook verification
HUBSPOT_PRIVATE_TOKEN     — Optional: CRM integration
HUBSPOT_PORTAL_ID         — Optional: CRM portal ID
REFERRAL_WEBHOOK_SECRET   — Optional: Frost Law webhook security token
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

## Remaining Phases
- **Phase 14**: HubSpot API Integration (real deal/contact sync)
- **Phase 15**: Email & SMS Integration (SendGrid/Twilio)
- **Phase 16**: Payments & Payouts (Stripe Connect)
- **Phase 17**: AI Support Bot (Claude/OpenAI)
- **Phase 18**: Deployment Hardening (monitoring, analytics, error tracking)
- **Tech Debt**: Replace demo data, form validation (zod), tests, accessibility audit, PWA
