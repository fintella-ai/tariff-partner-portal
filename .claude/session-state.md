# Session State — Fintella Partner Portal

> **This file is the single source of truth for session-to-session continuity.**
> It is kept up to date by the active Claude Code session and read at the start
> of every new session so work resumes without context loss.
>
> **Owner**: the active Claude Code session (this file is mechanically edited,
> not by hand).
>
> **Protocol**: see `CLAUDE.md → Session Continuity Protocol` for the full
> rules on when and how this file gets updated.

---

## 🕒 Last updated

`2026-04-15T21:00:00Z` — by session (L1 invite flow + variable commission rates)

## 🌿 Git state at last checkpoint

- **Branch**: `main`
- **HEAD**: `b79ce66` — PR #126 `feat(partners): admin-controlled L1 invite flow + variable commission rates`
- **Working tree**: clean
- **Build**: 107/107 static pages ✓ (was 106/106 — getstarted gained a new API route)
- **Open PRs**: 0
- **Vercel**: auto-deployed from #126 merge — `prisma db push` ran on deploy (inviterCode nullable, invitedEmail/invitedName added to RecruitmentInvite)

## ✅ What's done this session (in merge order)

| # | PR | What shipped |
|---|---|---|
| 1 | **#126** | `feat(partners)`: Admin-controlled L1 invite flow + variable commission rates. Full rework of the partner onboarding path and commission waterfall. |

### PR #126 detail

**Schema** (`RecruitmentInvite`):
- `inviterCode` → nullable (`String?`) — null for admin-generated L1 invites
- New `invitedEmail String?` and `invitedName String?` for admin invites
- `targetTier` now supports `"l1"` in addition to `"l2"/"l3"`

**Commission waterfall** (`src/lib/commission.ts`):
- L1 direct deal earns their *assigned* rate (10–25%), not always 25%
- L1 override on L2 deals = `L1.rate − L2.rate` (was `MAX_COMMISSION_RATE − L2.rate`)
- Total payout per deal always = L1's assigned rate

**New `/api/admin/invites`**:
- `GET`: list admin-generated L1 invites
- `POST`: create L1 invite at chosen rate (10/15/20/25%), send invite email via SendGrid

**`/api/getstarted`**:
- New `GET`: validate invite token before showing form
- `POST`: requires token, marks invite used on signup

**`/getstarted` page**:
- Token-gated — shows "Invalid Invite" error if no/expired token
- Pre-fills email and name from invite, shows commission rate

**`/api/invites`** (partner → downline):
- Rate validation now dynamic: `[5%…inviterRate−5%]` in 5% steps
- L3 eligibility: L2 must have rate ≥ 10%

**`referral-links` page**:
- Available recruit rates come from API (`allowedDownlineRates` per partner)
- Override display uses partner's actual rate, not hardcoded 25%

**`commissions` page**:
- `directRate = commissionRate` (was `tier === "l1" ? MAX_COMMISSION_RATE : commissionRate`)

**Admin partners page**:
- "Invite Partner" button opens modal with email + rate selector
- Rate preview shows downline range for chosen rate
- Mobile: `flex-wrap` on header buttons, `min-h-[44px]` on all action buttons

**Constants** (`src/lib/constants.ts`):
- New `ALLOWED_L1_RATES = [0.10, 0.15, 0.20, 0.25]`
- New `RATE_INCREMENT = 0.05`, `MIN_KEEP_FOR_SELF = 0.05`
- New `getAllowedDownlineRates(inviterRate): number[]` helper

## 🔄 What's in flight

Nothing. Working tree is clean, all branches merged.

## 🎯 What's next (queued, prioritized)

### 🅰 External blockers still in motion
1. **Twilio A2P 10DLC** — approval window ~2026-04-28 to 2026-05-05
2. **SendGrid domain authentication** — DNS propagating; check Verify button
3. **Frost Law IT** — send `FROST_LAW_API_KEY` + point to `https://fintella.partners/docs/webhook-guide`
4. **Smoke-test production** — create test partner via new invite flow, sign agreement, verify status flip

### 🅱 Code work (no external dependencies)
1. **`prisma db push` already ran on #126 Vercel deploy** — inviterCode nullable, invitedEmail/invitedName added. No manual action needed.
2. **Existing partners**: all have `commissionRate = 0.25` which is a valid `ALLOWED_L1_RATE` — no data migration needed.
3. **Phase 15c** — voice recording with state-by-state consent disclosure. Multi-hour, fresh session.
4. **Phase 16 — Stripe Connect** — partner payout system. Multi-hour, fresh session.
5. **Phase 18b — Next.js 14→16 migration** — deferred, dedicated session.
6. **HMAC enforcement on `/api/webhook/referral`** — flip from log-only to hard-reject once Frost Law implements signing.

### 🅲 Operational (John does in UI)
1. Delete legacy `admin@trln.com` super_admin row via `/admin/users` (orphan from pre-rebrand)
2. Smoke-test new invite flow: go to `/admin/partners` → Invite Partner → pick rate → verify email logged → open link → complete signup

## 🧠 Context that matters for resuming

- **Commission system (post-#126)**: L1's assigned rate is the total payout ceiling — NOT always 25%. Admin picks rate per invite. `getAllowedDownlineRates(inviterRate)` returns the valid L2 rate options.
- **Invite flow**: `/getstarted` is now token-gated (admin invite only). `/signup` remains for L2/L3 partner-to-partner invites.
- **Partner.commissionRate** is authoritative for all rates. The waterfall uses it directly.
- **Pre-launch status**: no real customers. Smoke-test against `fintella.partners`.
- **Branch protection on `main`**: all changes via PR, squash merge, Vercel auto-deploys.
- **No HubSpot** — Phase 14 descoped. Frost Law webhook is the only external deal data source.
- **Demo-gate pattern**: every integration is a no-op if env var unset, writes audit row with `status="demo"`.
- **TCPA gate**: every SMS send checks `Partner.smsOptIn` BEFORE network call. Never remove.

## 📂 Relevant files for the next task

If next session starts with **smoke-testing the invite flow**:
- `/admin/partners` → "Invite Partner" button
- `/api/admin/invites/route.ts` — invite creation + email send
- `/getstarted?token=XXX` — partner signup with pre-filled invite data

If next session starts with **Phase 15c (voice recording)**:
- `src/lib/twilio-voice.ts` — voice call lib
- `src/app/api/twilio/voice-webhook/route.ts` — Twilio status callbacks
- `src/app/(admin)/admin/communications/page.tsx` — Phone tab

If next session starts with **Phase 16 (Stripe Connect)**:
- New `src/lib/stripe.ts` (raw fetch, follow house pattern)
- New `StripeAccount` Prisma model linked to `Partner`
- New API routes for Connect onboarding flow
