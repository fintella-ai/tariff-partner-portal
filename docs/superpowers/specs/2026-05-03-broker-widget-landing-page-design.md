# Broker Widget Landing Page — Full Redesign Spec

**Date**: 2026-05-03
**Goal**: Rebuild `/partners/brokers` as a widget-first Google Ads landing page targeting 14,454 customs brokers. The TMS widget is the differentiator — no competitor has it. Convert cold traffic into partner signups.

---

## Page URL

`/partners/brokers` (existing page, full rewrite)

## Conversion Flow

1. Visitor lands from Google Ads
2. Watches HeyGen Finn video (60-90s) showing calculator → widget → audit-ready PDF → commission
3. Reads 4 condensed legal risk cards (why brokers need legal counsel backing)
4. Fills inline signup form
5. Partner created as L2 under PTNS4XDMN at split-test commission rate
6. SignWell agreement sent automatically
7. One free trial referral allowed before agreement must be signed
8. "Book a call" option for brokers who want to talk first

---

## Commission Split Test (A/B/C)

Random assignment on page load. Three variants:

| Variant | Displayed Rate | Actual L2 Rate | SignWell Template |
|---------|---------------|----------------|-------------------|
| A | 10% | 0.10 | Per rate template |
| B | 15% | 0.15 | Per rate template |
| C | 20% | 0.20 | Per rate template |

- Variant stored in `PartnerApplication.utmTerm` (or new `splitVariant` field) for analytics
- Headline on page dynamically shows "Earn X% commission" based on assigned variant
- Cookie persists variant so refreshes don't re-randomize
- Admin dashboard shows conversion rate per variant

---

## Page Structure (top to bottom)

### Section 1 — Nav Bar
- Fintella logo (left) → links to `/`
- "Partner Login" link → `/login`
- "Become a Partner" button → anchor scrolls to form

### Section 2 — Hero
- **Badge**: "INDUSTRY FIRST — NO COMPETITOR HAS THIS"
- **Headline**: "The Only Tariff Refund Tool That Runs Inside Your TMS"
- **Subhead**: "Embed our widget in CargoWise or Magaya. Spot refund-eligible clients. Refer in one click. Earn {splitRate}% on every recovery."
- **HeyGen Finn video**: 60-90 seconds, hosted on Vercel Blob or embedded
  - Scene 1: Calculator crunching real numbers from a CF 7501
  - Scene 2: Widget embedded inside a TMS interface
  - Scene 3: Audit-ready PDF being generated and emailed to client
  - Scene 4: Commission amount appearing in partner dashboard
  - Finn narrates the value prop throughout
- **"Works with" badges**: CargoWise icon + Magaya icon + "Any Browser-Based TMS"
- **Stats bar** (4 glass cards):
  - $166B IEEPA Duties Collected
  - 83% Importers Haven't Filed
  - 80 Days Average Deadline
  - 5-Minute Widget Setup

### Section 3 — "Why Your Clients Need Legal Counsel" (4 condensed cards)

Above the form. No walls of text — punchy risk → solution cards.

**Card 1 — CAPE Doesn't Protect Them**
- 15% of declarations rejected (CBS News)
- No amendments once accepted
- No audit defense, no offset protection
- CAPE is a filing tool, not a legal strategy

**Card 2 — 180-Day Deadlines Expiring Now**
- Under 19 U.S.C. § 1514, each entry has its own protest clock
- Miss it = permanently barred, non-extendable
- Entries from early 2025 hitting this cliff today

**Card 3 — 37% of Entries Need Litigation**
- Excluded from CAPE Phase 1 (finally liquidated, AD/CVD, reconciliation, drawback)
- Only CIT attorneys can represent businesses in federal trade court
- CIT attorney rates: $800-$1,650/hr if hired reactively

**Card 4 — You Refer. They Handle Everything.**
- Zero liability — law firm is counsel of record
- Full attorney-client privilege protects your client
- Contingency-based — $0 upfront for anyone
- You earn {splitRate}% on every successful recovery

### Section 4 — Inline Partner Signup Form

Glass card form, no separate page:

**Fields:**
1. Are you a licensed customs broker? (Yes / No toggle)
   - Yes → `partnerType: "broker"`
   - No → `partnerType: "referral"`
2. First Name (required)
3. Last Name (required)
4. Email (required)
5. Phone (required)
6. Company Name (required)
7. How many import clients do you have? (dropdown: 0-10 / 10-25 / 25-50 / 50+)

**Submit button**: "Become a Partner"
**Below button**: "Free to join. Start referring today."
**Secondary CTA**: "Have questions? Book a call" → links to calendar booking

**On submit:**
- Creates partner via existing recruitment invite flow:
  - `referredByCode: "PTNS4XDMN"` (John's partner code)
  - `tier: "l2"`
  - `commissionRate`: variant rate (0.10 / 0.15 / 0.20)
  - `partnerType`: "broker" or "referral" based on toggle
  - `clientCount`: selected range
  - `splitVariant`: "A" / "B" / "C"
  - `source`: "broker_landing"
- SignWell agreement sent at the assigned commission rate
- Redirect to success page / getting-started flow
- Google Ads conversion event fired (`gtag_report_conversion`)

**Trial gate (1 free referral):**
- Before agreement is signed, partner can use widget/submit-client ONCE
- After first referral submission, agreement gate activates
- UI shows: "Sign your agreement to continue referring clients"

### Section 5 — "Refer. Don't File." Comparison
Keep existing side-by-side:
- "If You Handle It Yourself" (7 risk items with X marks)
- "If You Refer Through Fintella" (8 benefit items with checkmarks)

### Section 6 — Earnings Math
Keep existing "What's Your Book Worth?" section:
- 20 importers × $50K avg refund × 25% firm fee × {splitRate}% commission
- Show annual projection at different book sizes

### Section 7 — Deep Legal Section
Full detailed content for readers who want depth:
- 6 risk cards with legal citations (existing content)
- Penalty stats + attorney cost comparison
- Firm capabilities + 12 services
- "Why Arizona?" — ER 5.4 with citation

### Section 8 — FAQ
Existing 8 FAQs plus new one:
- **"What is the TMS widget?"** — "A tool that embeds directly inside CargoWise, Magaya, or any browser-based TMS. You generate an API key, follow 6 setup steps, and it's live. No IT tickets. You can submit referrals, run the calculator, and track commissions without leaving your shipping software."

### Section 9 — Final CTA
- "Stop Leaving Money on the Table"
- Anchor link back to Section 4 form
- "Become a Partner" button

---

## Schema Changes

### PartnerApplication model (or Partner model)
Add fields:
- `partnerType String @default("referral")` — "broker" or "referral"
- `clientCount String?` — "0-10", "10-25", "25-50", "50+"
- `splitVariant String?` — "A", "B", or "C" (commission split test variant)
- `source String?` — "broker_landing", "apply_page", "invite", etc.

### Trial Gate Logic
- In agreement gate middleware (`/dashboard/submit-client`, `/dashboard/referral-links`, widget):
  - If `agreement.status NOT IN (signed, approved)` AND partner has < 1 deal submitted → allow access (trial)
  - If `agreement.status NOT IN (signed, approved)` AND partner has >= 1 deal submitted → block with "Sign your agreement to continue"

---

## HeyGen Video Script (Finn Avatar)

**Duration**: 60-90 seconds
**Tone**: Direct, confident, numbers-first (Finn's voice)

Script outline:
1. "You already know which clients pay IEEPA duties. Now you can monetize that knowledge — without leaving CargoWise."
2. Show calculator: "Drop a CF 7501. Our engine calculates the refund in 30 seconds."
3. Show widget in TMS: "This widget runs inside your shipping software. One click to refer."
4. Show audit PDF: "Your client gets an audit-ready refund report. The legal team handles everything."
5. Show commission: "You earn {rate}% on every recovery. No cost, no risk, no legal work."
6. "Apply in 60 seconds. Widget installs in 5 minutes. No competitor has this."

---

## Google Ads Integration

- Fire `gtag_report_conversion` on successful form submit
- UTM params: `utm_source=google&utm_medium=cpc&utm_campaign=broker-widget&utm_content=PTNS4XDMN`
- Conversion action: "Broker Partner Signup" (needs to be created in Google Ads)
- Landing page URL for campaign: `fintella.partners/partners/brokers?utm_source=google&utm_medium=cpc&utm_campaign=broker-widget`

---

## SEO Metadata

```
Title: "The Only Tariff Refund Widget for CargoWise & Magaya | Fintella"
Description: "Embed our IEEPA refund calculator inside your TMS. Refer clients in one click. Earn 10-20% commission. Free to join. 5-minute setup."
OG Title: "TMS Widget — Turn Every Shipment Into Revenue | Fintella"
```

---

## Files to Create/Modify

1. `src/app/partners/brokers/page.tsx` — full rewrite (888 lines → ~1,200 lines)
2. `src/app/api/partners/broker-signup/route.ts` — new API for inline form submission
3. `prisma/schema.prisma` — add partnerType, clientCount, splitVariant, source fields
4. `src/app/(partner)/dashboard/submit-client/page.tsx` — trial gate logic (1 free referral)
5. `src/components/widget/WidgetReferralForm.tsx` — trial gate logic
6. HeyGen video generation (separate step, script above)

---

## Success Metrics

- **Primary**: Form submission rate (target: 5-10% of page visitors)
- **Secondary**: Agreement signing rate (target: 50%+ of form submitters)
- **Tertiary**: First referral rate (target: 30%+ of signed partners)
- **Split test winner**: Variant with highest form-submit-to-first-referral rate (not just form submits — we want the rate that drives actual referrals)
