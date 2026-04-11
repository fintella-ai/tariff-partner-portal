# Tariff Partner Portal

## Project Overview
- **Framework**: Next.js 14.2.15 (App Router) + React 18 + TypeScript 5.4
- **Styling**: Tailwind CSS 3.4 — dark theme with gold accents (#c4a050, #f0d070), fonts: Playfair Display + DM Sans
- **Database**: Prisma 5.20 ORM — SQLite (dev: `prisma/dev.db`), PostgreSQL (prod)
- **Auth**: NextAuth.js 5.0-beta.22 — JWT sessions, dual providers (Partner: email+partnerCode, Admin: email+password)
- **Deployment**: Vercel, region `iad1`. SQLite copied to `/tmp/dev.db` on Vercel for write access
- **Integrations**: SignWell (e-signatures), HubSpot (CRM) — both optional with demo-mode fallbacks

## Project Structure
```
src/app/(admin)/admin/       — Admin routes (partners, deals, commissions, payouts, settings, etc.)
src/app/(partner)/dashboard/ — Partner routes (overview, deals, commissions, downline, submit-lead, training, etc.)
src/app/(auth)/login/        — Public login page
src/app/api/                 — API routes (RESTful, session-checked via auth())
src/lib/                     — Shared utils: auth.ts, prisma.ts, constants.ts, commission.ts, format.ts, signwell.ts, hubspot.ts, useDevice.ts
src/components/ui/           — Reusable components: StageBadge, StatusBadge, Skeleton, Accordion, BottomSheet, VideoModal, CopyButton, PullToRefresh
src/middleware.ts            — Route protection (public: /, /login, /api/auth; admin: /admin/*)
prisma/schema.prisma         — Database schema
scripts/                     — Seeding scripts (seed-all, seed-admin, seed-partners, seed-deals, seed-training, seed-conference)
```

## Key Patterns
- **API routes**: Verify session via `auth()`, check `role` (admin/super_admin vs partner). Return JSON with HTTP status codes.
- **Commission tiers**: L1 (20%), L2 (5%), L3 (0% default). Per-partner overrides via PartnerOverride model. Rate hierarchy: deal-specific > partner override > global defaults (PortalSettings).
- **Demo mode**: HubSpot returns demo data when `HUBSPOT_PRIVATE_TOKEN` not set. SignWell returns mock IDs without API key. Auth accepts any credentials in demo mode.
- **Path alias**: `@/*` maps to `src/*`
- **Data fetching**: Client-side with `useEffect` + `fetch`. Parallel queries in API routes.

## Database Models (Key)
| Model | Purpose |
|-------|---------|
| User | Admin accounts (email, passwordHash, role) |
| Partner | Affiliate partners (partnerCode, email, status, rate overrides, referredByPartnerCode for downline) |
| PartnerProfile | Extended info (address, payout method, bank details) |
| Deal | Sales leads (dealName, partnerCode, stage, estimatedRefund, client info, tariff fields) |
| CommissionLedger | Commission entries (partnerCode, dealId, amount, status, batchId) |
| PayoutBatch | Grouped payouts (totalAmount, partnerCount, status: draft/approved/processed) |
| Document | Partner documents (docType: w9/agreement, fileUrl, status) |
| PartnershipAgreement | E-signed agreements (signwellDocumentId, status, embeddedSigningUrl) |
| SupportTicket / TicketMessage | Support system |
| TrainingModule / TrainingProgress | Training content + completion tracking |
| ConferenceSchedule | Training call schedule |
| PortalSettings | Global config (firmName, commission rates, branding, navigation) |

## Environment Variables
```
DATABASE_URL          — "file:./dev.db" (local) or PostgreSQL connection string (prod)
NEXTAUTH_SECRET       — JWT signing secret
NEXTAUTH_URL          — App URL
SIGNWELL_API_KEY      — Optional: e-signature integration
SIGNWELL_WEBHOOK_SECRET — Optional: SignWell webhook verification
HUBSPOT_PRIVATE_TOKEN — Optional: CRM integration
HUBSPOT_PORTAL_ID     — Optional: CRM portal ID
```

## Dev Commands
```bash
npm run dev          # Start dev server
npm run build        # Full build (prisma generate + db push + seed + next build)
npm run db:push      # Apply schema changes
npm run db:studio    # Open Prisma Studio
```

## Existing Webhook Pattern
See `src/app/api/signwell/webhook/route.ts` for the established webhook handler pattern.

---

## Pending Work: Frost Law Referral Form Webhook Integration

### Context
The partner portal embeds a Frost Law referral form via iframe. Since we don't own the form, we can't read submitted data from the iframe (same-origin policy). Frost Law needs to configure their form system to send a webhook to our portal. This plan creates the webhook receiver endpoint.

### Plan

**1. Create Webhook Receiver Endpoint** — `src/app/api/webhook/referral/route.ts`
- Public POST endpoint (no auth — external service calls it)
- Optional secret token verification via `REFERRAL_WEBHOOK_SECRET` env var
- Field mapping from form fields to Deal model:
  - `first_name`/`last_name` → `clientFirstName`/`clientLastName`
  - `email` → `clientEmail`, `phone` → `clientPhone`
  - `business_title` → `clientTitle`, `service_of_interest` → `serviceOfInterest`
  - `affiliate_notes` → `affiliateNotes`, `legal_entity_name` → `legalEntityName`
  - `city`/`state` → `businessCity`/`businessState`
  - `imports_goods` → `importsGoods`, `import_countries` → `importCountries`
  - `annual_import_value` → `annualImportValue`, `importer_of_record` → `importerOfRecord`
  - `utm_content` → `partnerCode` (tracks submitting partner)
- Creates Deal with `stage: "new_lead"`, `dealName` from `legal_entity_name` or client name
- Flexible field mapping (accepts snake_case, camelCase, or form field names)
- Returns `{ received: true, dealId }` on success

**2. Add Webhook Documentation to Admin** — modify `src/app/(admin)/admin/settings/page.tsx`
- Add "Webhooks" / "Integrations" info section showing URL, expected payload format, setup instructions for Frost Law

**3. Env Variable** — add `REFERRAL_WEBHOOK_SECRET` to `.env.example`

### Key Reference Files
- `src/app/api/signwell/webhook/route.ts` — existing webhook pattern to follow
- `src/app/api/deals/route.ts` — existing deal creation logic to reuse
- `prisma/schema.prisma` — Deal model (already has all needed fields)
