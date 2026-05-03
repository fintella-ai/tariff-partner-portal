# Broker Widget Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/partners/brokers` as a widget-first Google Ads conversion page with inline broker signup, A/B/C commission split test, and 1-free-trial gate.

**Architecture:** Server component landing page with a client-side form component. Split test variant assigned via cookie on first load. Form submits to a new API that creates a PartnerApplication with broker-specific fields. Trial gate modifies the existing agreement check in submit-client to allow one free referral.

**Tech Stack:** Next.js 14 App Router, Prisma, existing dark glass theme (`var(--app-*)`), HeyGen video embed, Google Ads gtag conversion tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-broker-widget-landing-page-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `partnerType`, `clientCount`, `splitVariant` to PartnerApplication |
| `src/app/api/partners/broker-signup/route.ts` | Create | Inline form submission API (creates PartnerApplication + fires invite flow) |
| `src/app/partners/brokers/page.tsx` | Rewrite | Full landing page (server component with metadata) |
| `src/app/partners/brokers/BrokerSignupForm.tsx` | Create | Client component for the inline form + split test cookie |
| `src/app/(partner)/dashboard/submit-client/page.tsx` | Modify | Trial gate: allow 1 referral before agreement required |
| `src/app/api/agreement/route.ts` | Modify | Return deal count for trial gate logic |

---

### Task 1: Schema — Add broker fields to PartnerApplication

**Files:**
- Modify: `prisma/schema.prisma` (PartnerApplication model, ~line 1712)

- [ ] **Step 1: Add fields to PartnerApplication**

Add these 3 fields after `utmContent` (~line 1741):

```prisma
  // Broker landing page fields
  partnerType   String?   // "broker" (licensed customs broker) or "referral" (normal partner)
  clientCount   String?   // "0-10", "10-25", "25-50", "50+"
  splitVariant  String?   // "A" (10%), "B" (15%), "C" (20%) — commission split test
```

- [ ] **Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add partnerType, clientCount, splitVariant to PartnerApplication"
```

---

### Task 2: Broker Signup API

**Files:**
- Create: `src/app/api/partners/broker-signup/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/format";

const VARIANT_RATES: Record<string, number> = { A: 0.10, B: 0.15, C: 0.20 };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneRaw = String(body.phone ?? "").trim();
    const companyName = String(body.companyName ?? "").trim() || null;
    const isBroker = body.isBroker === true;
    const clientCount = String(body.clientCount ?? "").trim() || null;
    const splitVariant = String(body.splitVariant ?? "").trim() || null;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 });
    }
    if (!email.includes("@") || email.length > 254 || email.length < 5) {
      return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
    }
    if (!phoneRaw) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const phone = normalizePhone(phoneRaw);

    // Duplicate check
    const existing = await prisma.partnerApplication.findFirst({
      where: { email, status: { not: "rejected" } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return NextResponse.json({ success: true, applicationId: existing.id, alreadyApplied: true });
    }

    const existingPartner = await prisma.partner.findFirst({ where: { email } });
    if (existingPartner) {
      return NextResponse.json({ success: true, applicationId: null, alreadyPartner: true });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = req.headers.get("user-agent") ?? null;

    // Rate limit: 5 per IP per 10 min
    if (ip) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const count = await prisma.partnerApplication.count({
        where: { ipAddress: ip, createdAt: { gte: tenMinAgo } },
      });
      if (count >= 5) {
        return NextResponse.json({ error: "Too many applications — try again later" }, { status: 429 });
      }
    }

    const commissionRate = splitVariant && VARIANT_RATES[splitVariant]
      ? VARIANT_RATES[splitVariant]
      : 0.15;

    const application = await prisma.partnerApplication.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        companyName,
        partnerType: isBroker ? "broker" : "referral",
        clientCount,
        splitVariant,
        audienceContext: isBroker
          ? `Licensed customs broker with ${clientCount || "unknown"} import clients. Commission variant ${splitVariant} (${Math.round(commissionRate * 100)}%).`
          : `Referral partner. ${clientCount || "unknown"} clients. Variant ${splitVariant}.`,
        referralSource: "broker_landing",
        utmSource: String(body.utmSource ?? "").trim() || null,
        utmMedium: String(body.utmMedium ?? "").trim() || null,
        utmCampaign: String(body.utmCampaign ?? "").trim() || null,
        utmContent: "PTNS4XDMN",
        ipAddress: ip,
        userAgent,
      },
    });

    // Auto-approve + create invite (same as admin "Approve & Send Invite")
    // This creates the partner as L2 under PTNS4XDMN at the split test rate
    try {
      const { default: crypto } = await import("crypto");
      const token = crypto.randomBytes(16).toString("hex");
      const invite = await prisma.recruitmentInvite.create({
        data: {
          inviterPartnerCode: "PTNS4XDMN",
          tier: "l2",
          commissionRate,
          token,
          email,
          firstName,
          lastName,
          companyName,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.partnerApplication.update({
        where: { id: application.id },
        data: {
          status: "approved",
          approvedAt: new Date(),
          inviteId: invite.id,
        },
      });

      // Send invite email (fire-and-forget)
      import("@/lib/sendgrid").then(({ sendDownlineInviteEmail }) =>
        sendDownlineInviteEmail({
          to: email,
          firstName,
          inviterName: "Fintella",
          commissionRate,
          signupUrl: `https://fintella.partners/getstarted?token=${token}`,
          partnerCode: "PTNS4XDMN",
        })
      ).catch(() => {});
    } catch (err) {
      console.error("[broker-signup] auto-invite failed:", err);
    }

    return NextResponse.json({ success: true, applicationId: application.id }, { status: 201 });
  } catch (err) {
    console.error("[broker-signup] error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx next build 2>&1 | grep -E "Type error|Failed to compile|Compiled"`
Expected: `✓ Compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/partners/broker-signup/route.ts
git commit -m "feat: broker signup API — auto-approve + invite as L2 under PTNS4XDMN"
```

---

### Task 3: Broker Signup Form Component (client-side)

**Files:**
- Create: `src/app/partners/brokers/BrokerSignupForm.tsx`

- [ ] **Step 1: Create the client component**

This is the inline form with:
- Split test variant read from cookie (set by page server component or on mount)
- "Licensed customs broker?" Yes/No toggle
- Standard fields: first name, last name, email, phone, company
- Client count dropdown
- Submit → POST `/api/partners/broker-signup`
- On success → redirect to `/getstarted?token=...` or show success message
- Google Ads conversion tracking on submit
- "Book a call" secondary CTA link

The form uses the existing dark glass theme:
- `var(--app-bg)`, `var(--app-text)`, `var(--app-border)`, `var(--brand-gold)`
- Glass card: `background: rgba(255,255,255,0.03)`, `border: 1px solid var(--app-border)`, `backdrop-filter: blur(12px)`
- Gold button: `background: var(--brand-gold)`, `color: var(--app-button-gold-text)`
- Input styling matches the existing `/apply` page

The `splitVariant` and `commissionRate` are passed as props from the server component.

Full component code: ~200 lines (form state, validation, submission, success state, loading state, gtag conversion fire).

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | grep -E "Type error|Failed to compile|Compiled"`

- [ ] **Step 3: Commit**

```bash
git add src/app/partners/brokers/BrokerSignupForm.tsx
git commit -m "feat: BrokerSignupForm client component — inline signup with split test"
```

---

### Task 4: Landing Page Full Rewrite

**Files:**
- Rewrite: `src/app/partners/brokers/page.tsx` (888 lines → ~1,100 lines)

- [ ] **Step 1: Rewrite the page**

Server component. Structure (top to bottom):

1. **Metadata** — new title/description/OG per spec
2. **Split test assignment** — read `broker_variant` cookie; if absent, assign random A/B/C via `cookies()` API. Pass variant + rate to client form component.
3. **Nav bar** — Fintella logo + Partner Login + "Become a Partner" anchor
4. **Hero section** — "INDUSTRY FIRST" badge, headline ("The Only Tariff Refund Tool That Runs Inside Your TMS"), subhead with `{splitRate}%`, HeyGen video embed (placeholder `<video>` tag with poster image — video URL from PortalSettings or env var), "Works with" badges, stats bar
5. **Legal counsel cards** — 4 glass cards (CAPE, 180-day, 37% litigation, You Refer)
6. **Inline form** — `<BrokerSignupForm variant={variant} rate={rate} />` component
7. **Refer Don't File comparison** — keep existing content
8. **Earnings math** — keep existing, replace hardcoded rate with `{splitRate}%`
9. **Deep legal section** — keep existing 6 risk cards + penalty stats + firm capabilities + Arizona law
10. **FAQ** — existing 8 + new TMS widget FAQ
11. **Final CTA** — anchor to form section

Key: The commission rate shown throughout the page matches the split test variant assigned to this visitor.

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | grep -E "Type error|Failed to compile|Compiled"`

- [ ] **Step 3: Commit**

```bash
git add src/app/partners/brokers/page.tsx
git commit -m "feat: broker landing page rewrite — widget-first hero, split test, inline form"
```

---

### Task 5: Trial Gate — 1 Free Referral Before Agreement

**Files:**
- Modify: `src/app/api/agreement/route.ts`
- Modify: `src/app/(partner)/dashboard/submit-client/page.tsx`

- [ ] **Step 1: Modify agreement API to return deal count**

In `src/app/api/agreement/route.ts`, add a `dealCount` field to the response. Query `prisma.deal.count({ where: { partnerCode } })` and return it alongside the existing agreement/partner data.

- [ ] **Step 2: Modify submit-client agreement gate**

In `src/app/(partner)/dashboard/submit-client/page.tsx`, update the agreement check logic (~line 36-41):

Current:
```typescript
const agreementOk = data.agreement?.status === "signed" || data.agreement?.status === "approved";
const partnerOk = data.partnerStatus === "active";
setAgreementSigned(agreementOk && partnerOk);
```

New:
```typescript
const agreementOk = data.agreement?.status === "signed" || data.agreement?.status === "approved";
const partnerOk = data.partnerStatus === "active";
const trialOk = (data.dealCount ?? 0) < 1;
setAgreementSigned((agreementOk && partnerOk) || trialOk);
setIsTrialMode(!agreementOk && trialOk);
```

Add `isTrialMode` state. When `isTrialMode` is true, show a banner above the form: "You have 1 free trial referral. Sign your agreement to continue referring clients after this submission."

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | grep -E "Type error|Failed to compile|Compiled"`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/agreement/route.ts src/app/(partner)/dashboard/submit-client/page.tsx
git commit -m "feat: trial gate — 1 free referral before agreement required"
```

---

### Task 6: HeyGen Video Generation

**Files:**
- No code files — uses HeyGen API or admin UI

- [ ] **Step 1: Generate the Finn avatar video**

Use the HeyGen API (already integrated) or the HeyGen web UI to create the video with this script:

```
You already know which clients pay IEEPA duties. Now you can monetize that knowledge — without leaving CargoWise.

Drop a CF 7501. Our engine calculates the refund in 30 seconds.

This widget runs inside your shipping software. One click to refer a client.

Your client gets an audit-ready refund report. The legal team handles everything from there.

You earn [rate]% on every recovery. No cost, no risk, no legal work on your end.

Apply in 60 seconds. The widget installs in 5 minutes. No other company in this industry has this.
```

Use the Finn avatar ID and voice ID from memory (`project_fintella_session_handoff_2026-04-27.md`).

- [ ] **Step 2: Upload video to Vercel Blob**

Upload the generated MP4 to Vercel Blob storage. Get the public URL.

- [ ] **Step 3: Set the video URL in the landing page**

Update `src/app/partners/brokers/page.tsx` hero section `<video>` src to use the Blob URL (or set via `BROKER_VIDEO_URL` env var on Vercel for easy swapping).

- [ ] **Step 4: Commit**

```bash
git add src/app/partners/brokers/page.tsx
git commit -m "feat: add HeyGen Finn video to broker landing hero"
```

---

### Task 7: Build Verify + PR

- [ ] **Step 1: Full build**

Run: `npx next build`
Expected: Compiles successfully. New page at `/partners/brokers`.

- [ ] **Step 2: Create PR**

```bash
git push -u origin claude/broker-widget-landing
gh pr create --title "feat: broker widget landing page — widget-first hero, split test, inline signup" --body "..."
```

- [ ] **Step 3: Merge when CI green**

```bash
gh pr merge --squash --delete-branch
```
