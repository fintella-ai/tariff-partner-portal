# Referral Landing Page + Application Intake + In-Portal Booker

**Date:** 2026-04-24
**Branch:** `claude/referral-landing-page-v1`
**Status:** Implemented — ready for review

## Goal

Replace the root redirect (`/` → `/login`) with a promotional landing page that markets the Fintella referral partner program, captures leads from prospective partners, and routes them through a qualification-call booking step — without auto-creating Partner rows or granting portal access before John approves them.

## Non-goals

- Not replacing the existing `/signup` or `/getstarted` invite-only signup flow. Those remain the canonical partner-creation paths.
- Not building a CMS for the landing page copy. Copy is hardcoded in `src/app/page.tsx`; marketing iteration happens via PRs.
- Not touching the SignWell send flow (locked per memory). Approved applicants are handed off to the existing invite flow, which triggers the existing SignWell pipeline.

## Architectural decisions

### Lead-first, admin-approves (not auto-create)

The public landing page creates `PartnerApplication` rows — leads with no portal access. An admin reviews the application (optionally after a qualification call), then clicks **Approve & Send Invite**, which fires the existing `RecruitmentInvite` flow under John's code (PTNS4XDMN), tier=L2, commissionRate=0.20, 14-day expiry.

This preserves the memory rule *"Partners are invite-only — no public self-serve signup"* while opening a public marketing funnel.

### In-portal booker (not Calendly)

Applicants pick a qualification-call slot inside the same page using existing Google Calendar OAuth (super-admin connects admin@fintella.partners or support@ once via `/admin/settings` → Google Calendar; the demo-gate handles unconnected state gracefully). Each slot has a capacity of 1–5 seats — one 30-minute group call can screen up to 5 applicants at once. All attendees on the same slot share one Google Calendar event and one Jitsi room.

### `/` becomes the landing page; `/apply` is the squeeze-page variant

- **`/`** — full landing page with hero, opportunity, cross-product stacking, how-it-works, downline, transparency, law-firm credibility, FAQ, final CTA. For organic and direct traffic.
- **`/apply`** — stripped-down squeeze-page variant for paid ad traffic (Google/Meta/LinkedIn). UTM params captured by the intake API.

Session-aware routing is handled by existing middleware: logged-in admins redirect to `/admin`, logged-in partners to `/dashboard/home`.

## Data model

Three new Prisma models (purely additive — safe to `db push` on production):

### `PartnerApplication`

A lead from the public form. No partner access, no automated comms.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `firstName`, `lastName`, `email` | String | required |
| `phone`, `companyName`, `website` | String? | optional |
| `audienceContext` | String? | free-text pitch |
| `referralSource` | String? | "how'd you hear about us" |
| `status` | String | `new` → `contacted` → `qualified` → `approved` → `rejected` |
| `uplineCode` | String | default `"PTNS4XDMN"` (John) |
| `adminNotes` | String? | internal |
| `approvedAt`, `approvedByAdminId` | nullable | filled on approval |
| `rejectedAt`, `rejectionReason` | nullable | filled on rejection |
| `inviteId` | String? | `RecruitmentInvite.id` once approved |
| `utmSource/Medium/Campaign/Content` | String? | marketing attribution |
| `ipAddress`, `userAgent` | String? | light forensics |

Indexes on `status`, `email`, `createdAt`.

### `BookingSlot`

Admin-defined windows when qualification calls run.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `startsAt`, `endsAt` | DateTime | |
| `capacity` | Int | 1–5 seats |
| `location` | String | `jitsi` \| `zoom` \| `phone` \| `other` |
| `title`, `notes` | String | user-facing |
| `status` | String | `open` \| `closed` \| `canceled` |
| `googleEventId` | String? | created lazily on first booking |
| `jitsiRoom` | String? | derived from slot id, shared across seats |

### `Booking`

One applicant's reservation of one seat.

| Field | Type | Notes |
|---|---|---|
| `id` | cuid PK | |
| `slotId`, `applicationId` | FK | cascades |
| `name`, `email`, `phone` | denormalized | snapshot at book time |
| `status` | String | `confirmed` \| `canceled` \| `no_show` \| `completed` |
| `canceledAt`, `cancellationReason` | nullable | |

## API surface

### Public

- `POST /api/apply` — create `PartnerApplication`. IP-rate-limited (5/10min). Dedupe: if a non-rejected application exists for the email, returns its id (idempotent). If a Partner with that email already exists, returns `alreadyPartner: true` and the UI redirects to login.
- `GET /api/booking/slots` — list future open slots with seats remaining.
- `POST /api/booking/reserve` — reserve one seat. Transactional capacity check. On first booking in a slot, creates the Google Calendar event + Jitsi room; subsequent bookings add attendees to the same event.

### Admin

- `GET /api/admin/applications?status=new` — list applications
- `GET /api/admin/applications/[id]` — fetch one with bookings
- `PATCH /api/admin/applications/[id]` — update status, notes, uplineCode
- `POST /api/admin/applications/[id]/approve` — create `RecruitmentInvite`, email activation link, flip application to approved
- `POST /api/admin/applications/[id]/reject` — mark rejected with optional reason
- `DELETE /api/admin/applications/[id]` — hard delete (super_admin / admin only)
- `GET /api/admin/booking-slots` — list all slots with bookings
- `POST /api/admin/booking-slots` — create
- `PATCH /api/admin/booking-slots/[id]` — update (status, times, capacity, etc.)
- `DELETE /api/admin/booking-slots/[id]` — delete (also cascades to bookings, deletes Google Calendar event)

## UI

### Landing page (`/`)

Sections, in order:

1. **Sticky nav** — Fintella logo, "Apply" anchor, "Log In" button.
2. **Hero** — gradient headline ("Earn 20% on every deal"), subheadline, two CTAs, trust badges. **Apply form embedded on the right** — scroll-free conversion.
3. **Law-firm trust strip** — "In partnership with Frost Law · Furdock & Foglia Law LLP · ERC Tax Law".
4. **Opportunity** — stat cards (20% / +5–10% override / $0 cost).
5. **Cross-product stacking** — Tariff / ERC / R&D / Litigation quad-tile.
6. **How It Works** — 3-step flow (Apply → Activate → Refer & Earn).
7. **Downline** — commission tree SVG + bullet list, side-by-side.
8. **Transparency** — 6-tile feature grid (deal tracking, ledger, payouts, downline, notifications, PWA).
9. **Support + credibility** — law-firm cards + support/security tiles.
10. **FAQ** — 8 collapsible objection-killers.
11. **Final CTA** — "Apply Now" + "Partner login".
12. **Footer** — copyright, privacy/terms/login.

### Squeeze page (`/apply`)

Nav + hero-form + trust strip + footer. Same `ApplyFlow` component, `variant="full"`.

### Admin

- `/admin/applications` — status tab bar, expandable application rows, inline edit status/notes, one-click Approve & Send Invite (with confirmation), Reject with reason, Delete.
- `/admin/booking-slots` — create form at top (start/end/capacity/location/title/notes), upcoming + past slot lists with per-slot booked-seat visibility, open/close/cancel/delete actions.

Both pages are registered in `ALL_ADMIN_NAV_ITEMS`, `ADMIN_NAV_IDS_DEFAULT`, `ADMIN_NAV_ITEMS_MAP`, and `ROLE_VISIBLE_NAV` for super_admin, admin, partner_support.

## Conversion-optimization decisions (from research + product judgment)

- **Form-in-hero** eliminates a scroll before the CTA — highest-converting pattern for B2B referral pitches.
- **Specific numbers in hero** ("20%", "$80B+") rather than vague ("high commission").
- **Progressive disclosure** — required fields first (name, email), optional fields below.
- **Trust signals early and often** — law-firm partnership strip immediately below hero, dedicated credibility section near the end.
- **Multi-step internal flow** — after application submit, the form transforms into a slot picker in place (no page reload, no lost context).
- **UTM capture** — every application row stores the source campaign so ad spend is attributable end-to-end.
- **Dark theme with gold accent** — matches the existing portal language so partners who convert land in a visually consistent environment.
- **Animations are decorative and reduced-motion-safe** — `prefers-reduced-motion` kills all keyframe animation.
- **Sitemap + robots.txt** — `/` and `/apply` are indexable; everything authenticated is disallowed.
- **Structured data** — Organization schema.org JSON-LD in the landing-page head.

## Deferred / explicitly out of scope

- **Hero video embed**. PortalSettings has `homeEmbedVideoUrl` for the authenticated home; a corresponding `landingVideoUrl` field can be added in a follow-up PR once John has video assets.
- **Automated workflow triggers** for `application.submitted` / `application.approved`. The events are logged; wiring them to the workflow engine is a 2-hour follow-up.
- **Captcha / bot protection** on the public form. IP-rate-limit is in place; if abuse becomes a problem, add Cloudflare Turnstile or hCaptcha.
- **Automatic calendar reminders** for booked applicants. Google Calendar sends its own invite; portal-side SMS/email reminders can land in a follow-up.
- **A/B testing infrastructure** for landing-page variants. Can be added later via feature flags or Vercel's built-in.

## Risks

- **Google Calendar demo-gate** — until John connects admin@fintella.partners (or similar) via `/admin/settings` → Google Calendar, bookings will succeed but no actual calendar event is created. The portal still tracks the booking; John sees it in `/admin/applications`. Resolution: connect the account before driving ad traffic.
- **Email activation template copy is plain** — the approval email is constructed inline in `approve/route.ts`, not via an `EmailTemplate` row. If admins want to customize it, a small follow-up should migrate it to the template system.
- **No hard rate limit on the public landing** beyond IP dedupe. If this gets scraped/spammed aggressively, add a Cloudflare rule or Turnstile challenge.

## Files touched

New:
- `prisma/schema.prisma` — 3 new models
- `src/app/api/apply/route.ts`
- `src/app/api/booking/slots/route.ts`
- `src/app/api/booking/reserve/route.ts`
- `src/app/api/admin/applications/route.ts`
- `src/app/api/admin/applications/[id]/route.ts`
- `src/app/api/admin/applications/[id]/approve/route.ts`
- `src/app/api/admin/applications/[id]/reject/route.ts`
- `src/app/api/admin/booking-slots/route.ts`
- `src/app/api/admin/booking-slots/[id]/route.ts`
- `src/app/(admin)/admin/applications/page.tsx`
- `src/app/(admin)/admin/booking-slots/page.tsx`
- `src/app/apply/page.tsx`
- `src/app/landing.css`
- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `src/components/landing/ApplyFlow.tsx`

Modified:
- `src/app/page.tsx` — full landing page (replaced login redirect)
- `src/app/(admin)/admin/layout.tsx` — `applications` nav entry
- `src/app/(admin)/admin/settings/page.tsx` — `applications` in registry
- `src/lib/permissions.ts` — `applications` added to visible-nav for 3 roles
- `src/lib/sendgrid.ts` — `emailShell` export promoted (was file-local)
- `src/middleware.ts` — `/apply` added to public allowlist

## Build verification

`./node_modules/.bin/next build` passes — 171 static pages generated, existing pre-build warnings preserved (`global-error.tsx` Sentry deprecation, `monthly_newsletter` DB lookup from build-time prerender — both unrelated to this PR).
