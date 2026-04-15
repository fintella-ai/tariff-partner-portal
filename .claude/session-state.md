# Session State

🕒 Last updated: 2026-04-15 — softphone fixed, Stripe env vars added

## 🌿 Git state
- **main HEAD:** `098c1d9` — chore(session): checkpoint (local only, 1 ahead of origin/main)
- **origin/main HEAD:** `41bbaed` — feat(settings): DB-driven call recording toggle + softphone recording fix (#134)
- **Working tree:** clean (`.env.local` and `.env.production` are gitignored)

## ✅ What's done (this session)
- **PR #135 — Phase 16 Stripe Connect** — merged to main, deployed ✓
- **PR #134 — Phase 15c call recording toggle** — merged to main, deployed ✓
  - DB-driven `callRecordingEnabled` toggle in admin Settings
  - `partner-consent-webhook` for playing consent to called party
  - Diagnostic endpoint at `/api/admin/dev/twilio-voice`
- **Softphone root cause found and fixed:**
  - Vercel had `TWILIO_PHONE_NUMBER` but code reads `TWILIO_FROM_NUMBER`
  - Added `TWILIO_FROM_NUMBER=+17276108292` to all 3 Vercel environments
  - Triggered production redeploy via Vercel CLI — live at fintella.partners
  - Full diagnostic: ✅ All 7 env vars, ✅ TwiML App URL, ✅ Access Token
- **Vercel project now properly linked:** `tariff-partner-portal-iwki` (was incorrectly linked to old `tariff-partner-portal`)
- **Stripe env vars added to Vercel:** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (added 17-19m ago by user)

## 🔄 What's in flight
- Nothing — working tree is clean

## 🎯 What's next
1. **Smoke-test softphone** — make a test call from admin panel to confirm bridged call works now
2. **Smoke-test Stripe Connect** — add Stripe webhook in Stripe dashboard pointing to `https://fintella.partners/api/stripe/webhook`, then test partner onboarding flow
3. **Smoke-test invite flow** — create partner via invite link, sign agreement, verify status flips to `active`
4. **HMAC enforcement on `/api/webhook/referral`** — flip from log-only to enforced when Frost Law is ready
5. **Phase 18b** — Next.js 14→16 migration (dedicated session)

## 🧠 Context that matters for resuming
- Vercel project name: `tariff-partner-portal-iwki` (NOT `tariff-partner-portal`)
- Vercel team: `john-fflaw-projects`
- `TWILIO_PHONE_NUMBER` is the old Vercel env var name; `TWILIO_FROM_NUMBER` is what the code reads
- Stripe Connect is demo-gated — needs `STRIPE_SECRET_KEY` in Vercel (now set) and Stripe webhook configured
- All DB data is test/seed — safe to test against production
- Playwright: user said "im not worried about playwright" — not on roadmap

## 📂 Relevant files for the next task
- `.claude/session-state.md` — this file
- `src/lib/twilio-voice.ts` — bridged call initiation
- `src/lib/twilio.ts` — SMS + demo-gate check (uses TWILIO_FROM_NUMBER)
- `src/app/api/twilio/voice-webhook/route.ts` — TwiML response handler
- `src/lib/stripe.ts` — Stripe raw fetch client
- `src/app/api/stripe/webhook/route.ts` — account.updated handler
