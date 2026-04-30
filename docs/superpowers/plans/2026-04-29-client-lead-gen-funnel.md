# Client Lead Generation Funnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full marketing-to-conversion funnel that drives direct client leads through `/recover`, pre-qualifies them before sending to Frost Law, tracks attribution by source/campaign, and surfaces conversion KPIs in the Client Leads dashboard.

**Architecture:** The `/recover` landing page is the funnel entry point. UTM parameters from ads (Google, Meta, LinkedIn, etc.) are captured and stored on each `ClientSubmission`. A pre-qualification gate after the calculator screens out non-eligible clients (too low value, no imports, etc.) before they reach the Frost Law form. The Client Leads dashboard breaks down conversions by source, campaign, ad group, and qualification status. Google Ads conversion tracking fires on form submission via `gtag` events.

**Tech Stack:** Next.js 14 (App Router), Prisma, Google Ads gtag.js, UTM parameter tracking, Tailwind CSS

---

## File Structure

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Add UTM + qualification fields to ClientSubmission |
| `src/app/recover/page.tsx` | Pass all UTM params to RecoverForm |
| `src/components/landing/RecoverForm.tsx` | Pre-qualification gate + pass UTMs to API |
| `src/app/api/recover/route.ts` | Store UTM + qualification data |
| `src/app/(admin)/admin/internal-leads/ClientSubmissionsTab.tsx` | Source/campaign breakdown dashboard |
| `src/app/api/admin/client-submissions/route.ts` | Return source analytics |
| `src/app/layout.tsx` | Google Ads gtag snippet (conversion pixel) |
| `src/app/(admin)/admin/settings/page.tsx` | Google Ads Conversion ID config field |

---

### Task 1: Add UTM + Qualification Fields to ClientSubmission Schema

**Files:**
- Modify: `prisma/schema.prisma` (ClientSubmission model, ~line 1636)

- [ ] **Step 1: Add fields to schema**

Add these fields to the `ClientSubmission` model after the `source` field:

```prisma
  // UTM attribution — captured from /recover URL params
  utmSource        String?   // google, meta, linkedin, email, direct
  utmMedium        String?   // cpc, social, email, organic
  utmCampaign      String?   // campaign name (e.g. "ieepa-tariff-refund-q2")
  utmTerm          String?   // keyword (Google Ads search term)
  utmAdGroup       String?   // ad group name
  // Pre-qualification
  qualified        Boolean   @default(true) // false = screened out before Frost
  disqualifyReason String?   // "low_value", "no_imports", "no_ior", "non_us"
```

- [ ] **Step 2: Regenerate Prisma client**

Run: `npx prisma generate`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add UTM attribution + qualification fields to ClientSubmission"
```

---

### Task 2: Capture UTM Parameters Through the Full Flow

**Files:**
- Modify: `src/app/recover/page.tsx` (~line 20-26)
- Modify: `src/components/landing/RecoverForm.tsx` (Props interface + submit)
- Modify: `src/app/api/recover/route.ts` (store UTM fields)

- [ ] **Step 1: Pass UTM params from page to form**

In `src/app/recover/page.tsx`, update the component to pass all UTM params:

```tsx
// After line 25 (const partnerCode = ...)
const utmParams = {
  utm_source: searchParams.utm_source || null,
  utm_medium: searchParams.utm_medium || null,
  utm_campaign: searchParams.utm_campaign || null,
  utm_content: searchParams.utm_content || null,
  utm_term: (searchParams as any).utm_term || null,
  utm_adgroup: (searchParams as any).utm_adgroup || null,
};
```

Pass to RecoverForm: `<RecoverForm partnerCode={partnerCode} utmParams={utmParams} />`

- [ ] **Step 2: Update RecoverForm props + submit payload**

In `src/components/landing/RecoverForm.tsx`, update the Props interface:

```tsx
interface Props {
  partnerCode: string | null;
  utmParams?: {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
    utm_adgroup: string | null;
  };
}
```

In the `submit()` function body, add UTM fields to the POST payload:

```tsx
body: JSON.stringify({
  ...form,
  // existing fields...
  partnerCode,
  utmSource: utmParams?.utm_source || null,
  utmMedium: utmParams?.utm_medium || null,
  utmCampaign: utmParams?.utm_campaign || null,
  utmTerm: utmParams?.utm_term || null,
  utmAdGroup: utmParams?.utm_adgroup || null,
}),
```

- [ ] **Step 3: Store UTM fields in /api/recover**

In `src/app/api/recover/route.ts`, destructure and save the new fields:

```tsx
const { utmSource, utmMedium, utmCampaign, utmTerm, utmAdGroup } = body;

// In prisma.clientSubmission.create data:
utmSource: utmSource || null,
utmMedium: utmMedium || null,
utmCampaign: utmCampaign || null,
utmTerm: utmTerm || null,
utmAdGroup: utmAdGroup || null,
```

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Compiles successfully

- [ ] **Step 5: Commit**

```bash
git add src/app/recover/page.tsx src/components/landing/RecoverForm.tsx src/app/api/recover/route.ts
git commit -m "feat: capture UTM params (source/medium/campaign/term/adgroup) on client submissions"
```

---

### Task 3: Pre-Qualification Gate in RecoverForm

**Files:**
- Modify: `src/components/landing/RecoverForm.tsx` (add qualification logic between result + contact steps)
- Modify: `src/app/api/recover/route.ts` (store qualified/disqualifyReason)

The pre-qualification screens out leads that won't qualify for Frost Law's tariff refund service. Disqualified leads are still stored (for marketing analytics) but are NOT sent to the Frost Law iframe.

**Disqualification criteria:**
- Annual import value under $1,500,000 → `low_value`
- "No - goods are imported on our behalf" AND "Not sure" on importer of record → `no_ior`
- Estimated duties under $10,000 (from calculator step) → `low_duties`

- [ ] **Step 1: Add qualification check function**

In `RecoverForm.tsx`, add before the `submit()` function:

```tsx
function checkQualification(): { qualified: boolean; reason: string | null } {
  // Low duty amount from calculator
  if (dutiesAmount > 0 && dutiesAmount < 10000) {
    return { qualified: false, reason: "low_duties" };
  }
  return { qualified: true, reason: null };
}
```

- [ ] **Step 2: Add post-contact qualification check before iframe**

After the contact form submit succeeds, check qualification. If not qualified, show a "not eligible" message instead of the Frost Law iframe. Add `qualified` state:

```tsx
const [qualificationResult, setQualificationResult] = useState<{ qualified: boolean; reason: string | null } | null>(null);
```

In the `submit()` function, after the API call succeeds:

```tsx
const qual = checkQualification();
setQualificationResult(qual);
if (!qual.qualified) {
  setStep("not_qualified");
  return;
}
setStep("done");
```

- [ ] **Step 3: Add "not_qualified" step UI**

Add a new step rendering in the form between "contact" and "done":

```tsx
{step === "not_qualified" && (
  <div className="text-center py-8">
    <div className="text-4xl mb-4">📋</div>
    <h2 className="font-display text-xl mb-2" style={{ color: "#c4a050" }}>Thank You for Your Interest</h2>
    <p className="text-sm text-white/60 mb-4">
      Based on your import profile, you may not meet the minimum threshold for the IEEPA tariff refund program at this time.
    </p>
    <p className="text-sm text-white/50 mb-6">
      We've saved your information and will reach out if eligibility criteria change. You can also contact us directly for a manual review.
    </p>
    <a href="mailto:support@fintella.partners" className="inline-block px-6 py-3 rounded-xl font-semibold text-sm text-black" style={{ background: "#c4a050" }}>
      Contact Us for Manual Review
    </a>
  </div>
)}
```

- [ ] **Step 4: Pass qualification to API**

In the `submit()` POST body, add:

```tsx
qualified: qual.qualified,
disqualifyReason: qual.reason,
```

In `src/app/api/recover/route.ts`, destructure and store:

```tsx
const { qualified, disqualifyReason } = body;

// In create data:
qualified: qualified !== false,
disqualifyReason: disqualifyReason || null,
```

- [ ] **Step 5: Update step type**

Update the step type to include `"not_qualified"`:

```tsx
const [step, setStep] = useState<"product" | "duties" | "timing" | "result" | "contact" | "not_qualified" | "done">("product");
```

Update the progress bar to handle 6 steps.

- [ ] **Step 6: Build and verify**

Run: `npx next build`

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/RecoverForm.tsx src/app/api/recover/route.ts
git commit -m "feat: pre-qualification gate — screens low-value leads before Frost Law"
```

---

### Task 4: Source Attribution Dashboard in Client Leads

**Files:**
- Modify: `src/app/api/admin/client-submissions/route.ts` (add source breakdown stats)
- Modify: `src/app/(admin)/admin/internal-leads/ClientSubmissionsTab.tsx` (add source analytics cards)

- [ ] **Step 1: Add source analytics to API**

In `src/app/api/admin/client-submissions/route.ts`, add to the stats computation:

```tsx
// By UTM source
const byUtmSource: Record<string, number> = {};
const byUtmCampaign: Record<string, number> = {};
const byQualification: { qualified: number; disqualified: number } = { qualified: 0, disqualified: 0 };

for (const s of submissions) {
  const src = (s as any).utmSource || "direct";
  byUtmSource[src] = (byUtmSource[src] || 0) + 1;
  const camp = (s as any).utmCampaign || "(none)";
  byUtmCampaign[camp] = (byUtmCampaign[camp] || 0) + 1;
  if ((s as any).qualified === false) byQualification.disqualified++;
  else byQualification.qualified++;
}
```

Return in stats: `byUtmSource, byUtmCampaign, byQualification`

- [ ] **Step 2: Add Source + Campaign breakdown cards to ClientSubmissionsTab**

After the conversion funnel section, add:

```tsx
{/* Source Attribution */}
{stats && (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    {/* By Source */}
    <div className="card p-4">
      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">By Source</div>
      <div className="space-y-2">
        {Object.entries(stats.byUtmSource || {}).sort(([,a],[,b]) => b - a).map(([source, count]) => (
          <div key={source} className="flex items-center justify-between">
            <span className="font-body text-[12px] text-[var(--app-text-secondary)]">{source}</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full bg-[var(--app-input-bg)] overflow-hidden">
                <div className="h-full rounded-full bg-brand-gold/60" style={{ width: `${(count / stats.total) * 100}%` }} />
              </div>
              <span className="font-body text-[12px] text-[var(--app-text-secondary)] w-8 text-right">{count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
    {/* By Campaign */}
    <div className="card p-4">
      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">By Campaign</div>
      {/* Same pattern as Source */}
    </div>
    {/* Qualification */}
    <div className="card p-4">
      <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3">Qualification</div>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="font-display text-xl text-green-400">{stats.byQualification?.qualified || 0}</div>
          <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">Qualified</div>
        </div>
        <div>
          <div className="font-display text-xl text-red-400">{stats.byQualification?.disqualified || 0}</div>
          <div className="font-body text-[9px] text-[var(--app-text-muted)] uppercase">Screened Out</div>
        </div>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add Source column to submissions table**

Add a "Source" column header and cell showing `utmSource || "direct"` with campaign as a subtitle.

- [ ] **Step 4: Add source filter dropdown**

Add a source filter dropdown next to the search bar:

```tsx
<select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
  className="bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 text-sm">
  <option value="all">All Sources</option>
  <option value="google">Google Ads</option>
  <option value="meta">Meta Ads</option>
  <option value="linkedin">LinkedIn</option>
  <option value="email">Email</option>
  <option value="direct">Direct</option>
</select>
```

- [ ] **Step 5: Build and verify**

Run: `npx next build`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/client-submissions/route.ts src/app/(admin)/admin/internal-leads/ClientSubmissionsTab.tsx
git commit -m "feat: source attribution dashboard — UTM source/campaign/qualification breakdown"
```

---

### Task 5: Google Ads Conversion Tracking

**Files:**
- Modify: `src/app/layout.tsx` (add gtag.js snippet)
- Modify: `src/components/landing/RecoverForm.tsx` (fire conversion event on submit)
- Modify: `prisma/schema.prisma` (PortalSettings — Google Ads Conversion ID)
- Modify: `src/app/(admin)/admin/settings/page.tsx` (config field for conversion ID)

- [ ] **Step 1: Add Google Ads gtag snippet to layout**

In `src/app/layout.tsx`, add the gtag script in the `<head>`:

```tsx
{process.env.NEXT_PUBLIC_GOOGLE_ADS_ID && (
  <>
    <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`} />
    <script dangerouslySetInnerHTML={{ __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}');
    ` }} />
  </>
)}
```

- [ ] **Step 2: Fire conversion event on form submit**

In `RecoverForm.tsx`, after the API call succeeds in `submit()`:

```tsx
// Fire Google Ads conversion
if (typeof window !== "undefined" && (window as any).gtag) {
  (window as any).gtag("event", "conversion", {
    send_to: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL,
    value: totalRecovery,
    currency: "USD",
  });
}
```

- [ ] **Step 3: Add env vars documentation**

Add to `.env.example`:
```
NEXT_PUBLIC_GOOGLE_ADS_ID=AW-XXXXXXXXXX
NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=AW-XXXXXXXXXX/XXXXXXXXXXX
```

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/components/landing/RecoverForm.tsx
git commit -m "feat: Google Ads conversion tracking — gtag snippet + conversion event on submit"
```

---

### Task 6: Ad-Optimized Landing Page Variants

**Files:**
- Create: `src/app/recover/tariff/page.tsx` (Google Ads variant — direct, urgent)
- Create: `src/app/recover/assessment/page.tsx` (softer variant — LinkedIn/email)

These are lightweight wrapper pages that reuse the same `RecoverForm` component but with different hero copy optimized for different ad contexts. UTM params pass through identically.

- [ ] **Step 1: Create Google Ads landing variant**

`src/app/recover/tariff/page.tsx` — headline focused on urgency + dollar amount:
- Headline: "Claim Your IEEPA Tariff Refund — $166B Available"
- Subhead: "Free 60-second eligibility check. No obligation."
- Same RecoverForm component

- [ ] **Step 2: Create LinkedIn/email landing variant**

`src/app/recover/assessment/page.tsx` — headline focused on professional assessment:
- Headline: "Free Tariff Recovery Assessment for US Importers"
- Subhead: "Our specialists review your import history and estimate your refund."
- Same RecoverForm component

- [ ] **Step 3: Commit**

```bash
git add src/app/recover/tariff/page.tsx src/app/recover/assessment/page.tsx
git commit -m "feat: ad-optimized landing variants — /recover/tariff + /recover/assessment"
```

---

## Marketing Channel Setup (Configuration, Not Code)

After the code ships, set up these channels:

### Google Ads
- **Campaign type:** Search (high intent) + Performance Max
- **Keywords:** "ieepa tariff refund", "tariff duty recovery", "customs duty refund", "section 301 tariff refund", "import duty recovery"
- **Landing page:** `fintella.partners/recover/tariff?utm_source=google&utm_medium=cpc&utm_campaign=ieepa-tariff-q2&utm_content=PTNS4XDMN`
- **Conversion action:** Form submission event (Task 5)
- **Budget:** Start $50/day, scale based on cost-per-qualified-lead

### LinkedIn Ads
- **Campaign type:** Sponsored Content (lead gen)
- **Targeting:** Import/Export managers, Supply Chain, Logistics, Customs Brokerage
- **Landing page:** `fintella.partners/recover/assessment?utm_source=linkedin&utm_medium=social&utm_campaign=importer-outreach&utm_content=PTNS4XDMN`

### Email Outreach
- **Source:** Existing customs broker list (Partner Leads)
- **Landing page:** `fintella.partners/recover?utm_source=email&utm_medium=outreach&utm_campaign=broker-referral&utm_content=PTNS4XDMN`
- **Track:** Who opens → who clicks → who submits → who qualifies

### Organic / Content
- **SEO pages:** Blog posts targeting "how to get tariff refund", "IEEPA tariff recovery process"
- **Landing page:** `fintella.partners/recover?utm_source=organic&utm_content=PTNS4XDMN`

> **IMPORTANT:** All URLs must include `&utm_content=PTNS4XDMN` so submissions are attributed to John Orlando's partner code and deals are tracked correctly through the Frost Law webhook.

---

## Google Ads — Campaign Setup + Ad Copy

### Account Setup
1. Go to https://ads.google.com → Sign in or create account
2. Create campaign → Goal: "Leads" → Type: "Search"
3. Campaign name: `IEEPA Tariff Refund Q2 2026`
4. Networks: Search Network only (uncheck Display)
5. Budget: $50/day to start
6. Bidding: Maximize conversions
7. Final URL: `https://fintella.partners/recover/tariff?utm_source=google&utm_medium=cpc&utm_campaign=ieepa-tariff-q2&utm_content=PTNS4XDMN`

### Ad Groups + Keywords

**Ad Group 1: "Tariff Refund" (high intent)**
- ieepa tariff refund
- tariff refund recovery
- get tariff refund
- tariff duty refund claim

**Ad Group 2: "Customs Duty Recovery"**
- customs duty recovery
- import duty refund
- customs duty refund
- recover import duties

**Ad Group 3: "Section 301"**
- section 301 tariff refund
- section 301 duty recovery
- china tariff refund

### Responsive Search Ads

**Ad 1 — Urgency:**
- Headlines: `Claim Your IEEPA Tariff Refund` | `$166B Available — Act Now` | `Free 60-Second Eligibility Check` | `No Upfront Costs`
- Descriptions: `Supreme Court ruled IEEPA tariffs unlawful. Check if your business qualifies for a refund in 60 seconds. No obligation.` | `Average refund $200K-$5M per importer. Contingency-based — you only pay if we recover your duties.`

**Ad 2 — Value:**
- Headlines: `Overpaid Import Duties?` | `Get Your Tariff Refund` | `Free Assessment — No Obligation` | `83% Haven't Filed Yet`
- Descriptions: `US importers overpaid $166 billion in tariff duties. Our specialists file your CAPE claim and recover your money.` | `60-90 day processing. Full-service filing. You keep the refund — we work on contingency.`

**Ad 3 — Competitor:**
- Headlines: `IEEPA Tariff Recovery Experts` | `Faster Than Filing Alone` | `$200K-$5M Average Recovery` | `Start Your Free Assessment`
- Descriptions: `Don't leave money on the table. Our trade specialists handle the entire CAPE filing process for you.` | `From eligibility check to refund in hand. Contingency-based — zero risk to your business.`

### Conversion Tracking Setup
1. Google Ads → Tools & Settings → Conversions → + New conversion action
2. Type: Website → Name: "Form Submission" → Category: "Submit lead form"
3. Value: Use different values for each conversion (passed via gtag event)
4. Copy the **Conversion ID** (format: `AW-XXXXXXXXXX`) → set as `NEXT_PUBLIC_GOOGLE_ADS_ID` on Vercel
5. Copy the **Conversion Label** (format: `AW-XXXXXXXXXX/XXXXXXXXXXX`) → set as `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` on Vercel
6. Redeploy after setting env vars

### Negative Keywords (add to campaign level)
- tariff lawyer
- tariff attorney
- customs broker jobs
- tariff news
- tariff definition
- free trade

---

## Success Metrics (Tracked in Client Leads Dashboard)

| Metric | Where |
|--------|-------|
| Submissions by source | Source Attribution card |
| Submissions by campaign | Campaign breakdown card |
| Qualification rate | Qualification card (qualified vs screened) |
| Match rate | KPI card (matched to Frost Law deal) |
| Stage conversion | Funnel: Submitted → Qualified → Meeting Booked → Engaged → Won |
| Cost per qualified lead | Google Ads dashboard (external) + our qualified count |
| Source → Won conversion | Pipeline stages filtered by source |
