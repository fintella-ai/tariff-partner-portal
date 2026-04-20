# Fintella Partner Portal

Self-sustaining partner management platform. Next.js 14 (App Router) + React 18 + TypeScript + Prisma 5.20 + Neon PostgreSQL + NextAuth.js JWT. Deployed on Vercel at **https://fintella.partners**.

- **Brand**: Fintella — Financial Intelligence Network (DBA of Annexation PR LLC)
- **Historical brand**: Previously "TRLN" — rebranded April 2026, pre-launch so no customer impact
- **Legacy domain**: https://trln.partners (still resolves, redirect pending)
- **AI narrative**: "Fintella" is a portmanteau of the planned dual-personality assistant — **Finn** (direct, data-driven) + **Stella** (warm, relationship-focused). Current single "Fintella PartnerOS" assistant is a placeholder; Phase 17b splits it.

## ⚠️ Development status (read first)

**LIVE — real partner data in production.** The portal flipped out of demo mode on 2026-04-20 per `docs/launch-status.md`. `FINTELLA_LIVE_MODE=true` on Vercel production gates the build-time seed from re-creating test partners/deals. Implications:

- **Production DB is NOT disposable.** Real partner rows, real commissions, real audit logs.
- **Do NOT run `prisma db push --accept-data-loss` casually.** Only for strictly-additive schema changes. Any column drop or type change needs a planned migration.
- **Do NOT wipe production data** without an explicit John instruction AND a Neon snapshot taken first.
- Smoke-test schema changes against a Vercel preview deployment FIRST, not directly on prod.
- Post-launch hardening still in progress: `WEBHOOK_SKIP_HMAC=true` stays until Frost Law's HubSpot workflow adds HMAC signing, at which point flip to `false` and HMAC enforcement returns.
- Twilio SMS: env vars UNSET until TCR approves the A2P 10DLC campaign. Sends stay in demo mode until approval lands; re-add the three Twilio vars when it does.
- Add "this writes to the real DB" warnings for any potentially destructive action.

## Architecture: hub-and-spoke

- **Fintella = HUB** — owns partners, commissions, reporting, payouts, all comms logs
- **Frost Law = SPOKE** — runs its own CRM, receives referrals via iframe on `/dashboard/submit-client`, pushes deal updates back via webhook
- **Connection**: webhooks only, no direct CRM integration
- **Phase 14 HubSpot integration is DESCOPED** — do not build or recreate
- **Phase 18b Next.js 14 → 16 migration is DEFERRED** pending dedicated session

## Data flow

1. L1 partner generates an invite link → recruit opens `fintella.partners/signup?token=XXX` → partner created as `pending`
2. Partner signs agreement via SignWell embedded iframe → `document_completed` webhook flips `Partner.status` pending → active (PR #76)
3. Partner shares referral link (`utm_content=partnerCode`) → client fills Frost Law form
4. Frost Law POSTs to `/api/webhook/referral` → Deal created with `stage: "new_lead"` and `idempotencyKey` honored if provided
5. Frost Law PATCHes `/api/webhook/referral` with `dealId` + stage updates
6. On first `closed_won` transition with a firm fee → webhook auto-creates `CommissionLedger` entries with `status="pending"` via waterfall (PR #79)
7. Client pays Frost Law → Frost Law pays Fintella the override → admin clicks "Mark Payment Received" on `/admin/deals` → pending entries flipped to `due` (PR #71 + #79)
8. Admin creates a `PayoutBatch` from all `due` entries → processes → flips entries to `paid`

## Commission waterfall

- **L1 direct deal**: L1 = their assigned rate (10/15/20/25%) of firm fee
- **L2 deal**: L2 = their assigned rate (10/15/20%), L1 override = L1 rate − L2 rate
- **L3 deal** (if enabled): L3 = their assigned rate (10/15%), L2 override = L2 rate − L3 rate, L1 override = L1 rate − L2 rate
- **Total across all tiers: always equals the L1 partner's assigned rate** (never exceeds it; 25% is the max cap)
- L1 rate is picked by an admin when creating the L1 recruitment invite; L2/L3 rates are picked by the upline partner when recruiting downline
- Each rate maps to a SignWell agreement template (configured in admin Settings → Agreements)
- `Deal.l1CommissionRate` snapshots the L1's rate at deal creation (PR #264) so later rate changes don't retro-affect in-flight deals
- Shared helper: `computeDealCommissions()` in `src/lib/commission.ts` — walks the partner chain, calls `calcWaterfallCommissions`, returns ledger entries. Used by both the webhook PATCH handler and the admin Mark Payment Received route.

## Three-phase commission ledger lifecycle (post-PR #79)

| Status | Set by | Meaning |
|---|---|---|
| `pending` | `/api/webhook/referral` PATCH on first closed_won transition | Deal closed, firm has not yet paid Fintella the override |
| `due` | Admin "Mark Payment Received" button on `/admin/deals` | Firm has paid, ready to batch |
| `paid` | `process_batch` action on `/api/admin/payouts` | Partner has been paid |

`CommissionLedger` has a `@@unique([dealId, partnerCode, tier])` constraint so there's exactly one row per partner per tier per deal. Webhook PATCH handles P2002 collisions as idempotent success.

## Admin role matrix (post-PR #77)

Four roles: `super_admin`, `admin`, `accounting`, `partner_support`. Middleware gates `/admin/*` to any of the four. Per-route gates at the API level:

| Route | Allowed roles |
|---|---|
| `/api/admin/impersonate` POST | `super_admin`, `admin` only (privilege escalation surface) |
| `/api/admin/payouts` POST (create/approve/process batch) | `super_admin`, `admin`, `accounting` |
| `/api/admin/settings` PUT | `super_admin` only (portal-wide config) |
| `/api/admin/users` | `super_admin` only |
| `/api/admin/dev/*` (dev page, webhook test, errors) | `super_admin` only |
| Most GETs | All 4 admin roles |

Impersonation tokens are 32-byte random hex, **60-second TTL**, single-use, deleted after first consumption.

## Webhook security contract (post-PR #74)

`/api/webhook/referral` accepts **EITHER** auth scheme:

- `X-Fintella-Api-Key: <key>` (preferred, env var `FROST_LAW_API_KEY`)
- `x-webhook-secret: <key>` OR `Authorization: Bearer <key>` (legacy, env var `REFERRAL_WEBHOOK_SECRET`)

Plus:
- **60 req/60s per key** sliding-window rate limit, 429 with `Retry-After`
- **Idempotency** via optional `idempotencyKey` body field — re-POST with same key returns 200 with original `dealId`
- **HMAC signature** optional (`X-Fintella-Signature: sha256=<hex>`) — log-only, not yet enforced, flip when Frost Law cuts over
- **Event type whitelist** optional: `{referral.submitted, referral.stage_updated, referral.closed}`

Full integration spec at `/docs/webhook-guide` (refreshed in PR #75).

## Integration status

| Integration | Status | Gate (env var) |
|---|---|---|
| SignWell (e-signatures, 4-template by rate) | Demo-gated | `SIGNWELL_API_KEY` |
| SendGrid (transactional email, 4 templates) | Demo-gated | `SENDGRID_API_KEY` + domain auth DNS |
| Twilio SMS (TCPA opt-in gate, 4 templates) | Demo-gated | `TWILIO_ACCOUNT_SID` + A2P 10DLC approval |
| Twilio Voice (bridged click-to-call) | Demo-gated | `TWILIO_AUTH_TOKEN` + `TWILIO_ADMIN_PHONE` |
| PartnerOS AI (Claude Sonnet 4.6) | Demo-gated | `ANTHROPIC_API_KEY` |
| Sentry | Configured | `NEXT_PUBLIC_SENTRY_DSN` |
| Vercel Analytics + Speed Insights | Active | — |
| PWA (manifest, install prompt, safe-area) | Active | — |

Every integration follows the **demo-gate pattern**: if the env var is unset, the send is a no-op that still writes an audit row with `status="demo"`. No provider SDKs — raw `fetch()` against REST APIs. TCPA enforcement is hard — every SMS send checks `Partner.smsOptIn` **before** the network call.

## Public pages (unauthenticated)

`/`, `/login`, `/signup`, `/impersonate`, `/getstarted`, `/docs/*`, `/privacy` (TCR), `/terms` (TCR), `/api/auth/*`, `/api/webhook/referral` (auth'd via API key, not session).

## Project structure

```
src/app/(admin)/admin/       — Admin routes (partners, deals, payouts, settings, dev, etc.)
src/app/(partner)/dashboard/ — Partner routes (home, deals, commissions, downline, submit-client, etc.)
src/app/api/                 — API routes, role-gated via auth() + session.user.role
src/app/api/webhook/referral — Frost Law webhook (POST + PATCH + GET)
src/app/api/signwell/webhook — SignWell document events (handles document_completed → partner activation)
src/lib/                     — auth.ts, prisma.ts, commission.ts, signwell.ts, sendgrid.ts, twilio.ts, twilio-voice.ts, ai.ts
src/middleware.ts            — Public-route allowlist + admin role gate
prisma/schema.prisma         — Source of truth for data model
scripts/seed-all.js          — Runs on every Vercel build
```

## Key files

- `src/app/api/webhook/referral/route.ts` — Frost Law webhook (hardened in #74, auto-ledger in #79)
- `src/app/api/admin/deals/[id]/payment-received/route.ts` — Mark Payment Received flip/create (#71 + #79)
- `src/app/api/signwell/webhook/route.ts` — document_completed → Partner.status activation (#76)
- `src/lib/commission.ts` — Waterfall math + `computeDealCommissions` helper
- `src/app/api/admin/payouts/route.ts` — Batch creation, approval, processing, EP overrides
- `prisma/schema.prisma` — 30+ models, source of truth

## Commands

```bash
npm run dev                              # Dev server on :3000
npm run build                            # Full build (prisma generate + db push + seed + next build)
npm run lint                             # ESLint
npx prisma studio                        # DB browser
npx prisma generate                      # Regenerate client after schema edits
npx prisma db push --accept-data-loss    # Apply schema (safe pre-launch)
```

Build currently produces **97/97 static pages** with only a pre-existing `global-error.tsx` Sentry deprecation warning.

## Code patterns

- **Demo gate**: `if (!ENV_VAR) { log "demo"; write audit row status="demo"; return mock; }`
- **Webhook handlers**: preflight (auth + rate limit + HMAC) → parse → validate → transactional write → return `{...}`
- **Commission writes**: idempotent, enforced via `@@unique([dealId, partnerCode, tier])` + P2002 race recovery
- **Email/SMS**: fire-and-forget, `.catch()` only, failures write `status="failed"` audit rows and never block the user
- **SMS TCPA gate**: every send helper checks `Partner.smsOptIn` **before** the network call
- **Theme system**: CSS custom properties via `prefers-color-scheme`; use `var(--app-*)` and `theme-*` classes, never hardcoded colors
- **Agreement gate**: `/dashboard/submit-client` + `/dashboard/referral-links` require BOTH `agreement.status in (signed, approved)` AND `Partner.status === "active"` (post-#77 defense-in-depth)

## Git workflow

- Branches: `claude/<short-description>-<suffix>`
- Conventional commits: `feat:`, `fix:`, `docs:`, `security:`, `chore:`
- `main` is **branch-protected** via GitHub ruleset — all changes via PR, no force push, CodeQL + Vercel checks must pass
- Squash merge to `main` → Vercel auto-deploys production
- Remote feature branches auto-deleted by `.github/workflows/delete-merged-branches.yml` after merge
- **Never merge major-version dependabot PRs without a dedicated migration session** (the ignore rule in `.github/dependabot.yml` blocks new ones)

## Mandatory pre-commit checks

1. `./node_modules/.bin/next build` — must compile cleanly, 97/97 pages expected
2. Fix TypeScript errors at the root cause — **never** suppress with `any` / `@ts-ignore`
3. `npx prisma generate` after any `schema.prisma` edit
4. Stage only intentional files — **never `git add -A`** blindly (risks grabbing `.env`, `package-lock.json` drift, node_modules leak)
5. UI changes: verify `theme-*` classes, ≥44px touch targets, `pt-safe`/`pb-safe` for fixed elements, responsive breakpoints
6. No commit with failing hooks — fix the root cause, don't use `--no-verify`
7. Never amend existing commits — always create new ones (avoids destroying work when a hook fails)

## Session continuity protocol

**Single source of truth**: `.claude/session-state.md`. File is mechanically maintained by the active Claude Code session (not hand-edited) and committed to the repo so it survives across machines.

**MANDATORY — read on startup**: at the start of every session, before responding to the first user message, read `.claude/session-state.md`. If the `🕒 Last updated` timestamp is within ~48 hours, treat it as authoritative context and summarize "where we left off" in your first response.

**MANDATORY — update at checkpoints**:
1. After every PR merge — bump the merge log, shift "what's next"
2. At the end of every completed task
3. Before any session-ending operation (build verify, major commit)
4. On explicit user request ("checkpoint", "save state")
5. Proactively when the session feels long

**Proactive usage-limit alerts**: flag when the session is getting long (40+ exchanges, or >10 distinct files touched, or repeated auto-compaction notices). Say something like "Heads up — this conversation is getting long, want me to checkpoint state and break?". Don't stop working unless John says so.

**Structure of `.claude/session-state.md`**: `🕒 Last updated` / `🌿 Git state` / `✅ What's done` / `🔄 What's in flight` / `🎯 What's next` / `🧠 Context that matters for resuming` / `📂 Relevant files for the next task`.

See also `docs/launch-status.md` for the product-level launch-readiness document.

## Session signoff style (MANDATORY format)

Every time Claude signals task completion, the response MUST include BOTH of these sections BEFORE the rainbow:

1. **🧹 Git status** — concrete block with at minimum:
   - Current `main` commit SHA + deploy status
   - Feature branch HEAD SHA + sync state (if alive)
   - Working tree cleanliness
   - Responsive verification (or "N/A — backend only")
2. **🎯 What's next** — short menu of logical next steps (top pick + 2-3 alternatives)

**Rainbow signoff format** (EXACT, 14 circles per border row, H1 heading):

```
# 🔴🟠🟡🟢🔵🟣🔴🟠🟡🟢🔵🟣🔴🟠
# 🎉 JOHN, I AM DONE NOW 🎉
# 🟣🔵🟢🟡🟠🔴🟣🔵🟢🟡🟠🔴🟣🔵
```

Rainbow rules:
- Exactly 14 circles per border row (John tested this width on iOS Claude app — it aligns perfectly with the text row)
- Top row: warm-to-cool (`🔴🟠🟡🟢🔵🟣` × 2 + `🔴🟠`)
- Bottom row: cool-to-warm reverse (`🟣🔵🟢🟡🟠🔴` × 2 + `🟣🔵`)
- Party emoji 🎉 on both sides of text
- **Only on FULLY complete tasks** — incomplete work gets "stopping here for now" WITHOUT the rainbow so the rainbow retains meaning as "100% done"

## Compact instructions

When compacting, ALWAYS preserve:

- Current integration activation status (which env vars are set, what's waiting)
- Active blockers + resolution status (e.g. Twilio A2P approval window, SendGrid DNS)
- Files modified this session
- The hub-and-spoke architecture (**NEVER reintroduce HubSpot integration**)
- **Phase 14 HubSpot is DESCOPED** — do not recreate
- **Phase 18b Next.js 14→16 is DEFERRED** — do not attempt without dedicated session

Reference `@.claude/session-state.md` for current in-flight work and `@docs/launch-status.md` for product-level launch state.
