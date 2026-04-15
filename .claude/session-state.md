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

`2026-04-15T22:00:00Z` — by session (Invited tab + status filter tabs; GitHub branch cleanup)

## 🌿 Git state at last checkpoint

- **Branch**: `main`
- **HEAD**: `7d77445` — PR #129 `feat(partners): Invited stat card + status filter tabs`
- **Working tree**: clean (uncommitted Playwright scaffolding — package.json, playwright.config.ts, tests/, .github/workflows/playwright.yml — intentionally left uncommitted pending CI wiring)
- **Build**: 107/107 static pages ✓
- **Open PRs**: 0
- **Remote branches**: clean — all merged branches deleted
- **Vercel**: auto-deploying from #129 merge

## ✅ What's done this session (in merge order)

| # | PR | What shipped |
|---|---|---|
| 1 | **#129** | `feat(partners)`: Invited stat card + status filter tabs on partner management page |

### PR #129 detail

**`/admin/partners` page**:
- Added `Invited` stat card between Pending and Blocked — counts `RecruitmentInvite` records with `status = "active"`. Blue (`text-blue-400`). Stats grid → 5 cols.
- Filter tabs (All / Active / Pending / Invited / Blocked) above the search box
  - Active/Pending/Blocked tabs filter the partner table client-side
  - **Invited tab** swaps in an invites table: name, email, rate, status badge (active=blue/used=green/expired=gray), sent date, expires date
  - Tab reads "All"; stat card retains "Total Partners"
- Invite list fetched from `/api/admin/invites`; refreshed after each new invite sent
- Search on Invited tab filters by name/email client-side
- Added `inviteStatusBadge` record; `invited` added to `statusBadge` (blue)

### Phase 15c research (from prior session — NOT implemented)
- `ALL_PARTY_CONSENT_STATES` needed in `src/lib/constants.ts`
- Voice webhook needs `<Say>` consent + `record` attr on `<Dial>` when `TWILIO_RECORDING_ENABLED=true`
- New `/api/twilio/recording-webhook/route.ts` needed to update `CallLog.recordingUrl`
- See prior session-state for full plan

## 🔄 What's in flight

Nothing. Working tree clean. All branches merged.

## 🎯 What's next (queued, prioritized)

### 🅰 External blockers still in motion
1. **Twilio A2P 10DLC** — approval window ~2026-04-28 to 2026-05-05
2. **SendGrid domain authentication** — DNS propagating; check Verify button
3. **Frost Law IT** — send `FROST_LAW_API_KEY` + point to `https://fintella.partners/docs/webhook-guide`
4. **Smoke-test production** — create test partner via invite flow, sign agreement, verify status flip

### 🅱 Code work (no external dependencies)
1. **Playwright CI wiring** — scaffolding uncommitted; needs DATABASE_URL + NEXTAUTH_SECRET + admin creds in GitHub Secrets before committing the workflow. Dedicated session.
2. **Phase 15c** — voice recording with state-by-state consent. Multi-hour, fresh session.
3. **Phase 16 — Stripe Connect** — partner payout system. Multi-hour, fresh session.
4. **Phase 18b — Next.js 14→16 migration** — deferred, dedicated session.
5. **HMAC enforcement on `/api/webhook/referral`** — flip from log-only once Frost Law implements signing.

### 🅲 Operational (John does in UI)
1. Delete legacy `admin@trln.com` super_admin row via `/admin/users` (orphan from pre-rebrand)
2. Smoke-test: `/admin/partners` → Invited tab → verify invite count and table

## 🧠 Context that matters for resuming

- **Partner management page (post-#129)**: Invited tab shows `RecruitmentInvite` records from `/api/admin/invites` (L1 admin invites only). Tab filter is client-side on API-search-filtered partner list.
- **Commission system (post-#126)**: L1's assigned rate is the total payout ceiling — NOT always 25%. `getAllowedDownlineRates(inviterRate)` returns valid L2 rate options.
- **Invite flow**: `/getstarted` is token-gated (admin L1 only). `/signup` for L2/L3 partner-to-partner.
- **Pre-launch**: no real customers. Smoke-test against `fintella.partners`.
- **Branch protection on `main`**: all changes via PR, squash merge, Vercel auto-deploys.
- **No HubSpot** — Phase 14 descoped permanently.
- **Demo-gate pattern**: every integration is a no-op if env var unset, writes audit row `status="demo"`.
- **TCPA gate**: every SMS send checks `Partner.smsOptIn` BEFORE network call. Never remove.
- **Playwright scaffolding**: uncommitted local files. CI workflow needs env vars before merging.

## 📂 Relevant files for the next task

If next session starts with **Phase 15c (voice recording)**:
- `src/lib/twilio-voice.ts` — add `partnerState` to `InitiateCallInput` + voice webhook URL
- `src/app/api/twilio/call/route.ts` — fetch `PartnerProfile.state`, pass to `initiateBridgedCall`
- `src/app/api/twilio/voice-webhook/route.ts` — add consent `<Say>` + `record` attr to `<Dial>`
- New: `src/app/api/twilio/recording-webhook/route.ts` — update CallLog when recording ready
- `src/lib/constants.ts` — add `ALL_PARTY_CONSENT_STATES`

If next session starts with **Playwright CI wiring**:
- `playwright.config.ts`, `tests/auth.setup.ts`, `tests/example.spec.ts`, `.github/workflows/playwright.yml`
- Needs: DATABASE_URL + NEXTAUTH_SECRET + PLAYWRIGHT_ADMIN_EMAIL/PASSWORD in GitHub Secrets

If next session starts with **Phase 16 (Stripe Connect)**:
- New `src/lib/stripe.ts` (raw fetch, follow house pattern)
- New `StripeAccount` Prisma model linked to `Partner`
- New API routes for Connect onboarding flow
