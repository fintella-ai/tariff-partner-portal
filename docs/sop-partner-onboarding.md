# Standard Operating Procedure: Referral Partner Onboarding

**Document Owner:** Fintella Operations
**Last Updated:** April 24, 2026
**Applies To:** All partner tiers (L1, L2, L3)

---

## Overview

This SOP covers the end-to-end process of onboarding a new referral partner into the Fintella Partner Portal — from initial invitation through full activation and first referral submission. It applies to all three partner tiers and covers both admin-initiated (L1) and partner-initiated (L2/L3) invitations.

---

## Roles & Responsibilities

| Role | Responsibilities |
|---|---|
| **Super Admin** | Creates L1 partner invites, configures commission rates, manages agreement templates, oversees all onboarding |
| **Admin** | Creates L1 partner invites, monitors onboarding progress, reviews agreement uploads |
| **L1 Partner** | Recruits L2/L3 downline partners, uploads agreements (if payoutDownlineEnabled is off), mentors recruits |
| **New Partner** | Completes registration, signs agreement, sets up profile/payout, completes training, submits referrals |

---

## Phase 1: Partner Invitation

### L1 Partners (Admin-Initiated)

1. Admin navigates to **Admin Panel → Partners**
2. Clicks **Invite New Partner**
3. Fills in:
   - Partner's name and email
   - Commission rate (10%, 15%, 20%, or 25%)
   - Target tier: **L1**
4. System creates a `RecruitmentInvite` record with a unique token
5. System sends invitation email with signup link: `https://fintella.partners/signup?token=XXXXX`
6. If Twilio is configured, an SMS notification is also sent
7. Admin can resend or bulk-resend invitations from the Partners page

### L2/L3 Partners (Upline-Initiated)

1. Existing partner (L1 or L2) navigates to **Referral Links** in their dashboard
2. Selects a commission rate for the recruit (must be lower than their own rate)
3. Clicks **Create Invite Link**
4. System generates a unique signup URL
5. Partner copies and shares the link with their recruit via email, text, or in person
6. The invite is tracked — partner can see status (active, used, expired) on the Referral Links page

### Important Notes

- Commission rates are locked at invitation time and reflected in the partnership agreement
- L2 rates must be strictly below the inviting L1's rate
- L3 rates must be strictly below the inviting L2's rate
- Maximum commission rate across any chain is capped at 25%

---

## Phase 2: Partner Registration

### What the New Partner Does

1. Partner clicks the invite link → lands on `fintella.partners/signup?token=XXXXX`
2. Page displays:
   - Inviter's name and company
   - The partner's commission rate
   - Their tier (L1, L2, or L3)
3. Partner fills out the registration form:
   - **Required:** First name, last name, email, password (minimum 8 characters), phone or mobile
   - **Optional:** Company name
4. Partner checks **both** consent boxes (required to proceed):
   - Email opt-in: "I agree to receive email communications about my account activity, deal status updates, commission statements, and important program announcements."
   - SMS opt-in: "I agree to receive SMS notifications about my account activity, deal status updates, and commission payment alerts."
5. Partner clicks **Sign Up**

### What the System Does

1. Creates a `Partner` record with status: **pending**
2. Creates a `PartnerProfile` record (initially empty — address and payout info filled later)
3. Generates a unique partner code (format: `PTN` + 6 random alphanumeric characters, e.g., `PTNS4XDMN`)
4. Marks the `RecruitmentInvite` as **used** and links it to the new partner
5. Sends welcome email to the partner (if SendGrid configured)
6. Sends welcome SMS to the partner (if Twilio configured and SMS opted in)
7. Sends notification to the inviting partner: "New Partner Signed Up!"
8. Re-evaluates announcement segment rules for the new partner

### Success State

Partner sees a confirmation page with:
- Their partner code in a copyable box
- A note: "Your upline partner will submit your signed partnership agreement. Once reviewed and approved by our team, your account will be activated and you can begin submitting client referrals."
- A "Log In to Your Portal" button

---

## Phase 3: Partnership Agreement

### How the Agreement Gets Sent

The path depends on the partner's tier and the L1's `payoutDownlineEnabled` setting:

| Scenario | Agreement Path |
|---|---|
| **L1 partner** | Admin sends SignWell agreement from Admin Panel |
| **L2/L3 with payoutDownlineEnabled = true** | System auto-sends SignWell agreement at signup |
| **L2/L3 with payoutDownlineEnabled = false** (default) | Upline L1 uploads a signed PDF agreement |

### SignWell E-Signature Flow

1. Agreement is generated from a SignWell template matched to the partner's commission rate
2. Template includes placeholders auto-filled with partner details (name, email, company, TIN, address)
3. Two recipients are added:
   - **Partner** (signs first)
   - **Fintella cosigner** (configured in Admin → Settings → Agreements — signs second)
4. Partner receives signing link via email
5. Partner opens the link in a new browser tab and signs digitally
6. Fintella cosigner is notified and signs
7. SignWell fires a `document_completed` webhook to `/api/signwell/webhook`

### What Happens on document_completed

1. System finds the matching `PartnershipAgreement` record
2. Flips `PartnershipAgreement.status` to **signed**
3. Flips `Partner.status` from **pending** to **active**
4. The partner's portal is now fully unlocked:
   - Submit Client form becomes accessible
   - Referral Links become accessible
   - Getting Started checklist progresses

### PDF Upload Flow (when payoutDownlineEnabled = false)

1. Upline L1 navigates to **Downline** in their dashboard
2. Finds the pending partner in their list
3. Clicks the upload button
4. Uploads a signed PDF/image of the partnership agreement
5. Document is created with `status: pending`
6. Admin reviews and approves → agreement status flips to **approved**
7. Partner status flips to **active**

---

## Phase 4: Profile Setup & Getting Started

### Portal Login

1. Partner logs in at `fintella.partners/login` with their email and password
2. Alternative login methods available: Google OAuth, Passkey (WebAuthn)
3. Partner lands on **Home** dashboard

### Getting Started Checklist (9 Steps)

The partner sees a progress-tracked checklist on their home page and at `/dashboard/getting-started`. Steps unlock sequentially after the agreement is signed:

| Step | Action | How It's Tracked |
|---|---|---|
| 1. Sign Partnership Agreement | E-sign via SignWell or PDF upload | `Partner.status === "active"` |
| 2. Complete Partner Profile | Fill in mailing address (Settings → Address) | `PartnerProfile` has street, city, state, zip |
| 3. Set Up Payout Method | Add banking/PayPal info (Settings → Payout) | Stripe connected OR payout fields filled |
| 4. Watch Welcome Video | View the embedded video on Home page | `onboardingState.watchedWelcomeVideoAt` set |
| 5. Join a Live Weekly Call | Attend one weekly call via Conference page | `onboardingState.firstCallJoinedAt` set |
| 6. Complete a Training Module | Finish any module in Partner Training | `onboardingState.firstTrainingCompletedAt` set |
| 7. Share Referral Link | Copy the link from Referral Links page | `onboardingState.referralLinkSharedAt` set |
| 8. Submit First Client | Submit via Submit Client form | `Deal.count > 0` |
| 9. Recruit First Downline | Create an invite link and share it | `Partner.count (downline) > 0` or `RecruitmentInvite.count > 0` |

### Profile Completion Details

**Address (Required for tax documents):**
- Street, City, State, Zip, Country
- Used for 1099 generation at year-end

**Payout Information (Required to receive commissions):**
- Method: Bank Transfer (ACH), Wire, Check, or PayPal
- For ACH/Wire: Bank name, routing number, account number, beneficiary name, bank address
- For PayPal: PayPal email address
- Alternative: Connect via Stripe (if configured)

**Personal Information:**
- TIN (Tax Identification Number) — encrypted at rest
- Company name (optional)
- Name changes require re-signing the partnership agreement

---

## Phase 5: Training & Activation

### Required Training

Partners should complete these modules before submitting their first referral:

| Module | Category | Duration | Priority |
|---|---|---|---|
| Welcome to Your Partner Portal | Onboarding | 5 min | Start here |
| Understanding IEEPA Tariff Recovery | Product | 15 min | Required |
| How to Submit a Client Referral | Onboarding | 6 min | Required |
| Qualifying Prospects — Discovery Questions | Sales | 12 min | Required |
| How Commissions Work | Onboarding | 8 min | Recommended |
| Starting the Conversation | Sales | 12 min | Recommended |

### Recommended Training (Complete Within First 30 Days)

| Module | Category | Duration |
|---|---|---|
| Building Your Downline Network | Sales | 10 min |
| Navigating Your Reporting Dashboard | Tools | 7 min |
| What Happens After You Refer | Product | 10 min |
| Key Terms Every Partner Should Know | Product | 8 min |
| Using Urgency in Client Conversations | Sales | 6 min |

### Downloadable Resources

Partners have access to PDF playbook materials in the Training → Resources tab:
- Referral Partner Quick Reference
- Qualifying Questions guide
- Best Fit Industries
- Targeting the Right Audience
- Qualifying the Opportunity
- Starting the Conversation
- Our Value Add in the Client Journey
- Client Process overview
- Key Terms glossary
- Urgency Sales Guide

### Live Weekly Calls

- Partners should attend at least one call per month
- Schedule and join link available at **Conference** in the dashboard
- Past recordings available for catch-up
- Covers product updates, partner strategies, live Q&A

---

## Phase 6: First Referral Submission

### Pre-Submission Requirements

Before a partner can submit their first referral, they must:
1. Have `Partner.status === "active"` (agreement signed)
2. Have a signed/approved partnership agreement on file

### The Submission Process

1. Partner pre-qualifies the prospect using discovery questions:
   - Do they import goods into the U.S.?
   - Are they the Importer of Record?
   - Approximate annual import volume ($3M+ most countries, $1.5M+ from China)?
   - Any sense of IEEPA duties paid since February 2025?
2. Partner navigates to **Submit Client** in the dashboard
3. Fills out the referral form with client business information
4. **Critical:** Partner must include their name in the affiliate notes field
5. Submits the form
6. **Critical:** Partner must book the consultation call when prompted — submit and book together (unbooked submissions don't move forward)
7. Deal enters the pipeline as **Lead Submitted**

### Deal Stage Progression

| Stage | Meaning |
|---|---|
| Lead Submitted | Referral received, in queue for review |
| Meeting Booked | Consultation scheduled with the recovery team |
| Meeting Missed | Client no-show (team will reschedule) |
| Qualified | Client reviewed and confirmed eligible |
| Client Engaged | Client signed retainer, recovery process begun |
| Disqualified | Client reviewed but doesn't qualify |

### Partner Tracking

- Partner monitors deal progress from **Reporting** tab
- Commission amounts calculated and displayed as deals progress
- Commission lifecycle: **Pending** → **Due** → **Paid**

---

## Phase 7: Ongoing Operations

### Commission Payouts

1. Client's tariff refund is recovered
2. Recovery provider collects professional fee
3. Admin clicks "Mark Payment Received" on the deal
4. Commission ledger entries flip from **pending** to **due**
5. Admin creates a payout batch from all **due** entries
6. Batch is processed → entries flip to **paid**
7. Partner receives payment via their configured payout method

### Onboarding Stall Nudges

- If a partner's Getting Started checklist is < 100% complete after 7 days, the system sends an automated nudge email
- Email includes the next incomplete step with a direct link
- Nudges are throttled (one per cadence window, configurable)
- Managed via the `partner.onboarding_stalled` workflow in Admin → Automations

### Downline Management

- Partners track their recruits from the **Reporting → Downline** tab
- Tree view shows full hierarchy
- Override commissions are calculated automatically
- Partners can message their downline directly via portal DMs

---

## Admin Monitoring

### Onboarding Visibility

Admins can monitor onboarding progress from:

1. **Admin → Partners → [Partner Detail]** — Getting Started card shows:
   - Progress percentage
   - Completed/total step count
   - Days since signup
   - Stall indicator (yellow badge if > 7 days and < 100%)
2. **Admin → Getting Started Editor** — Configure step content, add custom steps, edit expectations

### Key Metrics to Watch

- Time from invite to signup
- Time from signup to agreement signed
- Time from agreement to first deal submission
- Getting Started completion rate
- Training module completion rate
- Stalled partner count (> 7 days, < 100% checklist)

---

## Appendix A: The Five Non-Negotiables

Every partner must understand these rules from day one:

1. **Qualify before you submit.** Cold leads waste attorney time and slow down real deals.
2. **Put your name in the affiliate notes.** Every submission. No exceptions. This is how you get credit.
3. **Submit and book the call together.** Unbooked submissions don't move forward.
4. **You are not giving legal advice.** You're identifying opportunities and making introductions. The recovery team handles everything from there.
5. **Contingency-based for the client.** No upfront cost. Nothing to pay unless the refund is recovered.

---

## Appendix B: Minimum Qualification Thresholds

| Source | Annual Imports | Reasoning |
|---|---|---|
| Most countries | $3M+ | Floor IEEPA rate was 10%, so $3M = ~$300K in refundable duties |
| From China | $1.5M+ | China rates ranged 20–145%, lower volume clears the threshold |
| Any country | Under $1.5M | Likely below the $300K minimum — don't pursue |
| Direct threshold | $300K+ in IEEPA duties paid | Close to the line? Still worth a conversation |

---

## Appendix C: System Touchpoints

| Event | System Action |
|---|---|
| Invite created | `RecruitmentInvite` row created, email/SMS sent |
| Partner signs up | `Partner` + `PartnerProfile` created, welcome email/SMS, inviter notified |
| Agreement signed | `Partner.status` → active, portal unlocks |
| Step completed | `onboardingState` updated, progress recalculated |
| 100% checklist | `onboardingState.completedAt` stamped, checklist auto-hides on home |
| 7+ days stalled | `partner.onboarding_stalled` workflow fires nudge email |
| First deal submitted | `Deal` created, commission calculation begins |
| Deal closes | `CommissionLedger` entries created with status "pending" |
| Payment received | Ledger entries flip to "due", ready for batch payout |
| Batch processed | Entries flip to "paid", partner receives funds |

---

*This SOP is maintained alongside the Fintella Partner Portal codebase. For technical implementation details, see the portal's CLAUDE.md and session-state.md files.*
