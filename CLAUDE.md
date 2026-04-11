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
src/app/api/                 — API routes (RESTful, session-checked via auth())
src/app/api/webhook/referral — Frost Law referral form webhook (public, creates Deals)
src/app/api/favicon          — Dynamic favicon served from PortalSettings
src/app/docs/                — Public docs (webhook guide — auto light/dark theme)
src/lib/                     — Shared utils: auth.ts, prisma.ts, constants.ts, commission.ts, format.ts, signwell.ts, hubspot.ts, useDevice.ts
src/components/ui/           — Reusable components: StageBadge, StatusBadge, Skeleton, Accordion, BottomSheet, VideoModal, CopyButton, PullToRefresh, CountryCodeSelect, DownlineTree
src/middleware.ts            — Route protection (public: /, /login, /api/auth, /docs/*; admin: /admin/*)
prisma/schema.prisma         — Database schema
scripts/                     — Seeding scripts
```

## Key Patterns
- **API routes**: Verify session via `auth()`, check `role` (admin/super_admin vs partner). Return JSON with HTTP status codes.
- **Commission tiers**: L1 (20%), L2 (5%), L3 (0% default). Per-partner overrides via PartnerOverride model.
- **Theme system**: CSS custom properties in `globals.css` with `prefers-color-scheme` media query. All pages use `var(--app-*)` for colors. Theme utility classes: `theme-text`, `theme-text-secondary`, `theme-text-muted`, `theme-input`, `theme-sidebar`, `theme-hover`, etc.
- **Partner tracking**: `utm_content` query parameter on referral links. HubSpot auto-captures this on form submissions.
- **Client referral URL**: `https://referral.frostlawaz.com/l/ANNEXATIONPR/?utm_content={partnerCode}`
- **Demo mode**: HubSpot returns demo data when `HUBSPOT_PRIVATE_TOKEN` not set. SignWell returns mock IDs without API key.
- **Path alias**: `@/*` maps to `src/*`
- **Collapsible sidebar**: Both partner and admin sidebars collapse to icon-only (68px) on desktop. Mobile has overlay sidebar with hamburger + X close.
- **Logo/Favicon**: Stored as base64 data URLs in PortalSettings. Logo displayed in sidebar, favicon via `/api/favicon`. Uploaded images auto-compressed via canvas.

## Database Models (Key)
| Model | Purpose |
|-------|---------|
| User | Admin accounts (email, passwordHash, role) |
| Partner | Affiliate partners (partnerCode, email, companyName, tin, mobilePhone, status, rate overrides, referredByPartnerCode) |
| PartnerProfile | Extended info (street, street2, city, state, zip, payout method, bank details) |
| Deal | Sales leads (dealName, partnerCode, stage, externalStage, estimatedRefund, client info, tariff fields) |
| CommissionLedger | Commission entries (partnerCode, dealId, amount, status, batchId) |
| PayoutBatch | Grouped payouts (totalAmount, partnerCount, status) |
| Document | Partner documents (docType: w9/agreement, fileUrl, status) |
| PartnershipAgreement | E-signed agreements (signwellDocumentId, status, embeddedSigningUrl) |
| SupportTicket / TicketMessage | Support system |
| TrainingModule / TrainingProgress | Training content + completion tracking |
| ConferenceSchedule | Training call schedule |
| PortalSettings | Global config (firmName, firmShort, logoUrl, faviconUrl, commission rates, branding, navigation) |

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
- Partnership agreement gate on Submit Client
- Account Settings page for partners (name, company, TIN, email, phone, mobile with country code dropdown, address)
- Agreement trigger: changing name/company invalidates signed agreement
- Admin partner detail sync (company, TIN, mobile, address, documents, W9 status, send agreement/W9 buttons)
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

## Remaining Phases
- **Phase 14**: HubSpot API Integration (real deal/contact sync)
- **Phase 15**: Email & SMS Integration (SendGrid/Twilio)
- **Phase 16**: Payments & Payouts (Stripe Connect)
- **Phase 17**: AI Support Bot (Claude/OpenAI)
- **Phase 18**: Deployment Hardening (PostgreSQL, monitoring, analytics)
- **Tech Debt**: Replace demo data, form validation (zod), tests, accessibility audit, PWA
