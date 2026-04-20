# Fintella Partner Portal — Launch Status & Checklist

> **Status as of 2026-04-20** — pre-launch, in demo mode. Document is the single source of truth for what's live vs. demo-gated, what needs to happen to flip to live, and the recommended order of operations. Supersedes the 2026-04-14 version.

---

## 🟥 TL;DR — what's actually blocking launch

1. **One Vercel env var to add:** `SENDGRID_API_KEY` (after domain auth verify clicks green) → turns real email on.
2. **One Vercel env var to add:** `ANTHROPIC_API_KEY` → turns real PartnerOS AI on.
3. **DB cleanup** of seed/test rows. Once-off operation.
4. **Gate the build-time seed** so it stops re-creating test partners + deals on every deploy. Small code change (this PR adds `FINTELLA_LIVE_MODE` env flag).
5. **Flip `FINTELLA_LIVE_MODE=true`** on Vercel prod.
6. **Update CLAUDE.md** to say "Live" instead of "Pre-launch / pure build-out mode."
7. **Run the smoke-test checklist** (§ Launch Day).

That's it for a go-live. Twilio SMS, HMAC enforcement, and the outbound-adapter work are **post-launch follow-ons** (§ Phase 2 — Post-launch).

---

## ✅ What's LIVE today (as of 2026-04-20)

### Partner-facing portal
- Login / signup (invite-only, email + password)
- Home feed, overview stats, deals dashboard, pipeline tracker
- Commissions view (L1/L2/L3 waterfall)
- Downline tree
- Training modules + Live Weekly conference page
- Submit Client (Frost Law iframe), agreement gate (must sign + active before submitting)
- Referral Links (tiered invite generation: L1 → L2 @ 10/15/20/25%, L2 → L3 if enabled)
- Documents upload
- Account Settings (email + SMS opt-in toggles)
- Support tickets + feature requests
- **Fintella PartnerOS AI assistant** (demo-gated — real Anthropic key not yet set)
- **Partner-to-Downline DM** (#303) — L1↔direct L2, L2↔direct L3, flag abuse flow
- **`/dashboard/announcements`** — partner view of admin-broadcast channels (#299)

### Admin portal (12 top-level sidebar entries after the #309 consolidation)
- Partners · Deals · Reporting (Reports / Revenue / Custom Commissions / Payouts)
- **Communications** (Email / SMS / Phone / Automations / Team Chat / Channels) — unified hub (#306 + #309)
- **Internal Chats** (Team Chat / Channels / DM Flags) — admin-only collaboration surfaces
- **Partner Support** (Support Tickets / Live Chat Support) — inbound support queues
- Training · Live Weekly · Documents · Settings · Admin Users · Feature Requests · Development (super_admin)

### Admin-only features shipped this sprint
- **Team Chat** (#293) — internal admin chat with `@mention` autocomplete, deal-thread auto-creation, SSE live push, soft-delete, 24h edit window, per-user read state
- **Announcement Channels** (#299) — admin broadcast with per-partner private reply threads, segment-based + manual membership, call-link message type
- **Deal rawPayload event log** (#297) — every POST + PATCH body from Frost Law's HubSpot workflow is kept on the Deal row (capped to last 20 events) for admin inspection

### Data layer
- Prisma 5.20 against Neon PostgreSQL
- Hub-and-spoke architecture: Fintella owns partners/commissions/reporting; Frost Law (HubSpot) pushes referral submissions + stage updates via webhook
- Idempotent seed pipeline on every Vercel build; admin seeding guarded (won't overwrite real super_admin)
- Auto-migrations via `prisma db push --accept-data-loss` — safe pre-launch; will continue post-launch for additive schema changes

### Integrations status
| Integration | Status | Env var required | Gate behavior |
|---|---|---|---|
| **SignWell** (e-signature) | **LIVE** on prod | `SIGNWELL_API_KEY` ✅ set | Real send/sign/cosign verified through production (Apr 2026) |
| **Frost Law inbound webhook** | **LIVE** on prod | `FROST_LAW_API_KEY` ✅ set | HubSpot POST/PATCH verified via live curl 2026-04-18 (Hozier test deal) |
| **SendGrid** (email) | **DEMO** | `SENDGRID_API_KEY` ❌ not set | Demo-stub writes `EmailLog` rows with `status="demo"`; no real send |
| **Anthropic Claude** (AI assistant) | **DEMO** | `ANTHROPIC_API_KEY` ❌ not set | Returns canned demo response; no real token spend |
| **Twilio SMS** | **DEMO** (waiting on A2P 10DLC approval) | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` ❌ | Post-launch enable — NOT a launch blocker |
| **Twilio Voice** | **DEMO** | `TWILIO_AUTH_TOKEN` + `TWILIO_ADMIN_PHONE` ❌ | Post-launch enable |
| **Sentry** | **LIVE** | `NEXT_PUBLIC_SENTRY_DSN` ✅ set | Error tracking + deploy notifications active |
| **Vercel Analytics + Speed Insights** | **LIVE** | — | Reporting |
| **PWA** (manifest, install prompt) | **LIVE** | — | |

### Compliance / legal
- ✅ Privacy policy at `/privacy` (TCR-required SMS disclosures present verbatim)
- ✅ Terms at `/terms` (Florida governing law)
- ✅ Webhook integration guide at `/docs/webhook-guide`
- ✅ TCPA enforcement in every SMS send (`Partner.smsOptIn` checked pre-network-call)

### Security posture
- Auth: NextAuth.js 5.0-beta with JWT sessions, dual provider (admin email+password, partner email+password)
- Role-based access, 4 admin roles (`super_admin`, `admin`, `accounting`, `partner_support`)
- Branch protection on `main` + CodeQL on every PR
- Webhook auth via `X-Fintella-Api-Key` header; `WEBHOOK_SKIP_HMAC=true` currently set (HubSpot doesn't sign; can be flipped when Frost Law adds HMAC signing post-launch)
- Impersonation tokens: 32-byte random, 60-second TTL, single-use

---

## 🟧 Pre-launch prep (Phase 0 — do these now, zero customer impact)

These can run in any order before the launch-day flip. None of them affect any production user.

### 0.1 Vercel env var audit
Open Vercel → Project `tariff-partner-portal-iwki` → Settings → Environment Variables → Production scope. Confirm:

| Var | Expected | Action if missing |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL | — already set |
| `DIRECT_URL` | Neon direct URL (no pooler) | — already set |
| `NEXTAUTH_SECRET` | 32-byte random | — already set |
| `NEXTAUTH_URL` | `https://fintella.partners` | — already set |
| `SIGNWELL_API_KEY` | Real SignWell production key | — confirmed set |
| `FROST_LAW_API_KEY` | `fl_live_…` (Frost's real key) | — confirmed set |
| `WEBHOOK_SKIP_HMAC` | `true` (keep until Frost signs) | — confirmed set |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN | — confirmed set |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Real admin bootstrap creds | — confirmed set (one-time for first super_admin) |
| `SENDGRID_API_KEY` | Set after domain auth goes green | **ADD when ready** |
| `ANTHROPIC_API_KEY` | Real Anthropic key | **ADD on launch day** |
| `FINTELLA_LIVE_MODE` | `true` | **ADD on launch day (gates the seed)** |
| `TWILIO_ACCOUNT_SID` + `_AUTH_TOKEN` + `_ADMIN_PHONE` | Real Twilio creds | POST-LAUNCH (wait for A2P 10DLC approval) |
| `WEBHOOK_AUTH_BYPASS` | Should be UNSET (superseded by `WEBHOOK_SKIP_HMAC`) | Remove if present |

### 0.2 SendGrid domain auth
- Go to SendGrid → Settings → Sender Authentication
- If DNS status is green → click **Verify** (final activation step)
- Single Sender Verification is the interim path for sending from `john@fintellaconsulting.com` while domain auth completes
- Status today: DNS added 2026-04-14, should be propagated

### 0.3 Neon DB backup verification
Neon gives free 7-day point-in-time restore on all tiers. Confirm in Neon dashboard:
- Project has recent automatic backups showing in the Backups tab
- PITR window covers at least last 24h

### 0.4 Sentry alert routing
- Open Sentry project → Alerts → Rules
- Confirm at least one rule fires an email to `john@fintellaconsulting.com` on any unhandled error in prod
- Test by hitting `/api/admin/dev/errors` as super_admin (already seeds a test error)

### 0.5 `/dashboard/submit-client` Frost Law iframe sanity
- Open `https://fintella.partners/dashboard/submit-client` as a test partner
- Confirm Frost Law form loads in the iframe
- Confirm `utm_content=<partnerCode>` is appended to the base URL

---

## 🟨 Launch day (Phase 1 — execute in this order)

Each step is verifiable. If step N fails, abort and don't proceed to N+1.

### 1.1 Merge this launch-prep PR
Lands `FINTELLA_LIVE_MODE` env flag + seed-script guard. Zero runtime impact until the env var is set.

### 1.2 DB cleanup (once-off)

**Keep:**
- `User` rows (admin accounts) — super_admin exists; seed script skips when it sees one
- `PortalSettings` row
- `EmailTemplate` rows (wired transactional templates: welcome, agreement_ready, agreement_signed, signup_notification)
- `Workflow` rows (admin-defined automations)
- `AdminChatThread` with `type="global"` (the one admin team-chat thread)
- `PartnershipAgreementTemplate` if any (SignWell template config in `PortalSettings.agreementTemplate*` keys)

**Wipe:**
- `Partner` — all test partners (JohnOrlando/SarahChen/MikeTorres/LisaPark/DavidKim from seed + any manually-created test partners)
- `PartnerProfile` (joined with Partner)
- `Deal` — all test deals (Acme Electronics / Pacific Textile / GE Test / Global Auto Parts / Summit Furniture / any Hozier Tantalum test rows)
- `DealNote`
- `CommissionLedger` + `PayoutBatch`
- `ChatSession` + `ChatMessage` (partner support chat history — demo conversations)
- `AdminChatMessage` (admin team chat scratch)
- `AnnouncementChannel` + `ChannelMessage` + `ChannelMembership` + `ChannelReplyThread` + `ChannelReplyMessage` (any test broadcasts)
- `PartnerDmThread` + `PartnerDmMessage` + `PartnerDmFlag` + `PartnerDmThrottle` + `PartnerDmReadState`
- `SupportTicket` + `TicketMessage`
- `Notification` rows
- `WebhookRequestLog` rows
- `EmailLog`, `SmsLog`, `CallLog` audit rows (demo-mode entries)
- `ImpersonationToken`
- `RecruitmentInvite` tokens
- `AiMessage` + `AiUsageDay` rows

**Easiest path:** connect to prod Neon via `npx prisma studio` (or `psql` with the `DATABASE_URL` from Vercel), and delete rows from the wipe-list tables in dependency order (children first). A one-shot cleanup SQL script is the cleanest — I can generate it on request.

### 1.3 Set `FINTELLA_LIVE_MODE=true` on Vercel production
Prevents the build-time seed from re-creating test partners/deals on every deploy.

### 1.4 Set `SENDGRID_API_KEY` on Vercel production
Activates real email via SendGrid. Immediate effect on next deploy.

### 1.5 Set `ANTHROPIC_API_KEY` on Vercel production
Activates real PartnerOS AI assistant.

### 1.6 Trigger a clean redeploy
Vercel → Deployments → latest → Redeploy. Wait for "Ready." Check the build log:
- `scripts/seed-all.js` should log `[seed] FINTELLA_LIVE_MODE=true — skipping test-data seed`
- Admin / template / settings / conference seeds should still run (they're idempotent and expected)

### 1.7 Update CLAUDE.md
Commit on a branch + PR the header change: "Pre-launch / pure build-out mode" → "Live — real partner data. Test against staging only." Affects future Claude sessions' assumptions so they stop treating prod DB as disposable.

### 1.8 Execute full E2E smoke test
Run ALL of the following. Every ✓ before announcing.

**Infrastructure**
- [ ] Vercel latest deploy is READY (no ERRORED deployments in the last hour)
- [ ] Neon DB connection healthy (no `prisma db push` failures in the last build log)
- [ ] Sentry shows 0 unresolved issues from the last 24h

**End-to-end flows**
- [ ] **Signup flow:** admin generates an L1 invite → open invite URL in incognito → fill signup form → real welcome email arrives in a real inbox → admin notification email arrives → new partner appears in `/admin/partners` as `pending`
- [ ] **Agreement + activation:** admin sends a partnership agreement from `/admin/partners/[id]?tab=documents` → partner signs in embedded iframe → SignWell webhook flips `Partner.status` from `pending` → `active` automatically
- [ ] **Gate behavior:** partner tries to Submit Client before signing → sees lock screen; after signing → gate clears on refresh
- [ ] **Webhook deal submission:** POST to `/api/webhook/referral` from Frost Law's HubSpot workflow (or manual curl with real API key) → returns 201 + dealId → subsequent PATCH with stage update → 200 → deal appears in `/admin/deals` with correct stage from `HUBSPOT_STAGE_MAP`
- [ ] **Payment received:** admin marks a closed-won deal's "Mark Payment Received" → `CommissionLedger` rows appear in `/admin/payouts` "due" bucket
- [ ] **Payout batch:** create batch → approve → process → ledger entries flip to `paid`
- [ ] **AI chat (real tokens):** send a chat message as a test partner → real response arrives → `AiUsageDay.totalCostUsd` increments by a non-zero amount

**Security**
- [ ] Log in as `accounting` role → confirm cannot impersonate, cannot save settings, cannot save admin users
- [ ] Log in as `partner_support` role → confirm cannot process payouts, can view but not void documents
- [ ] Webhook rate limit: send 61 POSTs to `/api/webhook/referral` in 60s → 61st returns 429 with `Retry-After`
- [ ] Webhook idempotency: POST twice with same `idempotencyKey` → first 201, second 200 with `idempotent: true`

### 1.9 Announce to real partners
Send L1 invites. Monitor:
- Sentry dashboard (real-time error feed)
- Vercel deployment status
- `/admin/dev` → API Log tab (incoming webhook traffic)
- `EmailLog` table (real sends should start appearing with `status="sent"` instead of `"demo"`)

---

## 🟩 Phase 2 — Post-launch follow-ons (non-blocking, land when ready)

### 2.1 Twilio SMS (waiting on A2P 10DLC campaign approval)
When Twilio confirms approval:
- Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_ADMIN_PHONE` on Vercel production
- Redeploy. SMS flows auto-enable (no code change). Welcome SMS + agreement-ready SMS fire on new signups.
- Monitor `SmsLog` — `status` column should start showing `"sent"` instead of `"demo"`.

### 2.2 Twilio Voice
Same pattern as SMS. Voice bridge works via env vars; state-by-state consent + recording deferred to a dedicated phase.

### 2.3 HMAC webhook enforcement
When Frost Law's HubSpot workflow adds HMAC signing:
- Remove `WEBHOOK_SKIP_HMAC` from Vercel production
- Confirm `WEBHOOK_SECRET` is set to the agreed-upon shared secret
- Redeploy. HMAC becomes hard-enforced; any unsigned call returns 401.

### 2.4 Outbound network adapter (sub-spec 1 of 4)
Spec + plan already on main. Dispatch a subagent when ready. Adds the ability to submit client-intake outbound from Fintella to Frost (and future networks) instead of only receiving inbound.

### 2.5 Other queued items (from session-state)
- Admin presence directory (green/red lights in Team Chat) — needs spec+plan
- Notification bell mentions rollup — verify + enhance
- Live Weekly table formatting + resizable columns
- Communications Hub expansion: real Inbox UI surfaced as a separate tab (currently under Email→Inbox via split)
- Phase 18b: Next.js 14 → 16 migration (dedicated session; closes 5 CVEs)

---

## 🔄 Rollback procedure (if launch day goes sideways)

If E2E smoke test fails or real errors spike, rollback is simple:

1. On Vercel: unset `FINTELLA_LIVE_MODE` (or set to `false`). Keep other env vars as-is.
2. On Vercel: revert to the last known-good deployment (deployment dropdown → "Promote to Production" on the previous one).
3. Seed script will run again on next deploy and re-create the test partners/deals (idempotent upserts).
4. CLAUDE.md says "Pre-launch" again; future Claude sessions treat DB as disposable again.

DB state: test rows wiped in step 1.2 are not automatically restored. If rollback requires restoring data, use Neon's point-in-time restore to before the wipe.

---

## 📌 Known dependabot queue (5 open, do NOT auto-merge)

Per CLAUDE.md's "never merge major-version dependabot PRs without a dedicated migration session":

- **#287** postcss 8.5.9 → 8.5.10 (patch) — safe candidate
- **#288** next-auth 5.0-beta.30 → 5.0-beta.31 — beta, risky
- **#289** typescript 5.9.3 → **6.0.3 (MAJOR)** — blocked
- **#290** `@anthropic-ai/sdk` 0.88 → 0.90 — 0.x minor = breaking per semver
- **#291** `@sentry/nextjs` 10.48 → 10.49 (minor) — likely safe

Leave all five for a dedicated triage session. Not launch-relevant.

---

## 📜 Session rhythm for future updates
- `.claude/session-state.md` = mechanical state snapshot, bumped by Claude every major checkpoint
- This file = product-level launch readiness, edited only when launch status materially changes
- When uncertain, this file takes precedence on "is the portal live?" questions
