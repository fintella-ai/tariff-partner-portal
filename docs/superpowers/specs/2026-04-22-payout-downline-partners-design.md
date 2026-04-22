# Payout Downline Partners — Design Spec

**Date:** 2026-04-22
**Status:** Approved by John, ready for implementation plan
**Scope:** Per-L1-partner toggle that switches Fintella between two commission-payout models.

---

## 1. Problem

Today, Fintella's commission engine writes waterfall ledger entries for every tier of a partner deal (L1 / L2 / L3), and the payout batcher pays each tier row separately. In practice this engine is mostly idle because L2/L3 partners rarely become `active` — the current signup flow does not auto-send Fintella SignWell agreements to L2/L3 (they stay `pending` until the L1 manually uploads a signed PDF), so the waterfall-payout pathway almost never fires in production.

Fintella now wants to offer L1 partners a choice, set at invite/add-directly time:

- **Enabled** — Fintella takes full responsibility for the L1's downline. L2/L3 are auto-sent Fintella's SignWell agreements at signup, activate via the `document_completed` webhook, and receive commission payouts directly from Fintella using the existing waterfall math.
- **Disabled (default)** — Fintella only pays the L1 the full L1-rate commission for every deal in their subtree (direct + downline). The L1 is personally responsible for paying their downline. L2/L3 still get a partner portal and still need a signed agreement before being activated — but the agreement is an L1-provided PDF that L1 uploads, and the L2/L3 relationship to Fintella is informational only.

This spec describes the data model, signup/SignWell changes, commission engine branch, UI surfaces, and migration plan needed to add that toggle.

## 2. Decisions locked during brainstorm

| # | Decision |
|---|----------|
| Q1 | Toggle is **lock-at-invite** — set at invite / add-directly time, never flippable post-signup. |
| Q2 | Disabled = **single L1 ledger row** for the full L1 rate. L2/L3 rows are not written. Downline "owed amounts" are computed on the fly from `Deal.l{2,3}CommissionAmount` snapshots. |
| Q3 | Enabled = **auto-dispatch Fintella SignWell** to L2/L3 at signup, using the existing rate-matched templates (20% template for L2 at 20%, etc.). No new templates. |
| Q4 | All 4 existing L1 partners are **grandfathered to Disabled**. No override path, not even for the ⭐ star super admin. |
| Q5 | The invite / add-directly checkbox is visible + interactive for **`super_admin` + `admin` + `partner_support`**. Hidden and server-rejected for `accounting`. |
| Q6 | **Same rate-matched SignWell template** for Enabled and Disabled L1s — no legal template variant, no addendum. |

## 3. Data model

Two new columns, both `Boolean @default(false) @notnull`:

```prisma
model Partner {
  // …existing…
  payoutDownlineEnabled  Boolean  @default(false)
}

model Invite {
  // …existing…
  payoutDownlineEnabled  Boolean  @default(false)
}
```

- **Populated on L1 partners only.** The column exists on all `Partner` rows but is only ever read for L1-tier partners. L2/L3 rows always hold the default `false` and that value is never consulted.
- **Non-L1 writes are ignored.** If the Add Directly form or the `POST /api/admin/partners` route receives `payoutDownlineEnabled: true` in the body for a non-L1 tier, the field is silently coerced to `false` before insert. No error — just quietly normalized. Server-side defensive check even though the client hides the checkbox.
- **Invite carries the intent forward.** The invite flow (always L1) creates an `Invite` row with the admin's chosen value; `/api/signup` reads `Invite.payoutDownlineEnabled` when creating the Partner row so invited partners inherit the intended state.
- **Add-directly writes straight to the Partner row.** No `Invite` detour.
- **Immutable after creation** — no API path writes this field after the Partner row is first inserted.
- **Migration** — additive only. `npx prisma db push --accept-data-loss` is safe; all four existing L1 partners pick up the default `false` naturally and no backfill is needed.

## 4. Admin UX — invite / add-directly

File: `src/app/(admin)/admin/partners/page.tsx`.

**Checkbox placement:**

- Invite Partner modal (around lines 391-486)
- Add Directly form (around lines 488-550)

**Label:** `Enable Payout Downline Partners`

**Helper/tooltip:** *"If enabled, Fintella will send SignWell agreements directly to this L1's L2 and L3 downline at signup and pay them commissions directly. If disabled (default), this L1 will be paid the full commission rate for all downline deals and is responsible for paying their downline themselves."*

**Visibility rules:**

- Shown only when `Tier === "L1"`. Hidden for L2/L3 add-directly flows.
- Default unchecked.
- Hidden from `accounting` role client-side; disabled (not interactive) if somehow rendered.

**Server-side role gate (defense in depth):**

- `POST /api/admin/invites` — accepts optional `payoutDownlineEnabled: boolean`. If the requesting role is `accounting` AND the body sets `true`, return 403. Otherwise persist on the `Invite` row.
- `POST /api/admin/partners` (add-directly) — same gate; persist directly on the `Partner` row.

## 5. Signup + SignWell dispatch

When an L2 or L3 partner completes the signup form (`POST /api/signup`):

1. Create the `Partner` row with `status: "pending"` (existing behavior).
2. Walk the upline chain using the existing helper logic in `src/lib/commission.ts` to find the top-of-chain L1.
3. Branch on that L1's `payoutDownlineEnabled`:
   - **`true` (Enabled)** — look up the rate-matched SignWell template for this partner's assigned rate, call the existing `sendAgreement()` helper in `src/lib/signwell.ts`, and insert a `PartnershipAgreement` row with `status: "sent"`. Identical code path L1 already uses today — no new template logic, no new send code.
   - **`false` (Disabled)** — current behavior unchanged. No auto-send; Partner stays `pending` until L1 uploads a signed PDF.

**Rule:** the top-of-chain L1's flag governs. L2s' `payoutDownlineEnabled` values are always ignored. An L3 whose direct L2 upline sits under an Enabled L1 is treated as Enabled — walk the chain past L2 to the L1 and read there.

**SignWell webhook unchanged.** `src/app/api/signwell/webhook/route.ts` already handles `document_completed` tier-agnostically — it flips any Partner from `pending → active` when their agreement completes. Both the Enabled auto-send path and the Disabled L1-uploads-PDF path reach activation through this same handler.

**L1's own agreement unchanged.** L1 signs the rate-matched template at their assigned rate, regardless of Enabled/Disabled (per Q6).

**Agreement gate middleware unchanged** — already gates on `Partner.status === "active"` plus a signed agreement row; both paths satisfy it.

## 6. Commission engine change

File: `src/lib/commission.ts`. Callers: `src/app/api/webhook/referral/route.ts` (closed_won branch, ~lines 986-1055) and `src/app/api/admin/deals/[id]/payment-received/route.ts` (~lines 79-100).

`computeDealCommissions()` gains one branch at the top:

```
Walk the partner chain → identify top-of-chain L1.

If L1.payoutDownlineEnabled === false AND the submitting partner is not the L1:
  Return exactly one ledger entry:
    { partnerCode: L1.partnerCode, tier: "l1",
      amount: firmFeeAmount * Deal.l1CommissionRate }

Otherwise (Enabled L1, or L1-direct deal):
  Run the existing waterfall (unchanged) → return per-tier entries.
```

**L1-direct deals are unaffected.** They have always been a single L1 row at the full rate and they remain so. Disabled mode only changes commission computation when the submitting partner is L2 or L3.

**`Deal.l1CommissionAmount / l2CommissionAmount / l3CommissionAmount` remain populated** with the waterfall amounts in Disabled mode. These are informational snapshots, not payment obligations; keeping them populated gives the "L1 downline accounting tracking" requirement a source of truth with no schema change.

**What's different in Disabled mode:**

| | Disabled (L2 or L3 deal) | Enabled (L2 or L3 deal) |
|---|---|---|
| CommissionLedger rows | 1 row (L1 at full L1 rate) | 2–3 rows (L1 override + L2 + optionally L3) |
| Payout batch content | 1 row per deal | 2–3 rows per deal |
| `Deal.l{1,2,3}CommissionAmount` snapshot | populated per waterfall | populated per waterfall |

**Idempotency:** the existing `@@unique([dealId, partnerCode, tier])` constraint and the P2002 collision recovery path still apply; with exactly one row per deal in Disabled mode, there is no collision risk.

**Rate snapshot behavior unchanged.** `Deal.l1CommissionRate` is still snapshotted at deal creation per PR #264 — in-flight deals don't pick up later rate changes to the L1 partner.

## 7. Admin surface — partner profile

File: `src/app/(admin)/admin/partners/[id]/page.tsx`, existing `Commission` tab (registered at line 432).

**Render a read-only state row near the top of the Commission tab for L1 partners:**

```
Payout Downline Partners:  Enabled  ✓    (or "Disabled" in muted color when false)
```

- Hidden entirely on L2 / L3 partner profiles (flag is meaningless there).
- Read-only — no Edit button, no toggle, no PATCH path. Lock-at-invite per Q1.
- Tooltip: *"Enabled: Fintella pays this L1's L2/L3 downline directly and sends Fintella agreements to them at signup. Disabled: This L1 receives the full rate for all downline deals and is responsible for paying their own downline."*
- Visual language matches the existing read-only rows on the Commission tab (e.g. the L3-enabled indicator).

**API:** add `payoutDownlineEnabled` to the select list in `GET /api/admin/partners/[id]`.

**No list-view badge for v1.** The `/admin/partners` list page stays untouched. Can be added later if operators find themselves clicking into profiles just to check the state.

## 8. Partner surface — `/dashboard/reporting` Commissions tab

### 8.1 L1 on their own Reporting → Commissions tab

**If `payoutDownlineEnabled` is true (Enabled):**

Show a small informational badge at the top of the Commissions tab:

```
★ Payout Downline Partners: Enabled
Fintella is paying your L2/L3 downline directly. You receive the override portion for downline deals.
```

No action, purely informational.

**If `payoutDownlineEnabled` is false (Disabled), AND the L1 has any downline deals:**

Render a new **"Downline Accounting"** subsection below the existing ledger rows:

```
Downline Accounting — what you owe your downline

Per deal:
  Deal "Terralyst Steel" — $10,000 firm fee
    You received from Fintella:       $2,500  (25% L1 rate)
    You owe Bob Smith (L2 @ 20%):     $2,000
    You keep:                           $500

(…one block per downline deal…)

Totals
  Total received from Fintella:  $XX,XXX
  Total owed to downline:        $XX,XXX
  Total kept:                    $XX,XXX
```

Numbers computed on the fly from `Deal.l{2,3}CommissionAmount` (kept populated per §6). No new persistence.

**If Disabled and no downline deals yet:** the subsection is hidden entirely (nothing to show).

### 8.2 L2 / L3 partner on their own Reporting → Commissions tab

- **Under Enabled L1:** no UI change. They see their own ledger rows just like they would today if they had any.
- **Under Disabled L1:** they have no `CommissionLedger` rows for themselves (only the L1 does). Their Commissions tab shows an explicit empty-state note:

  > *"Your commissions are paid by your upline partner. Contact them for details. Fintella is not responsible for paying you directly."*

  This is gated on `topOfChainL1.payoutDownlineEnabled === false` — if they ever switch uplines to an Enabled L1 (not currently a supported operation, but defensive), the note disappears and their ledger rows appear normally.

**API change for both cases:** the existing partner-facing commissions endpoint (likely `/api/commissions` per Section 1 of the explore) returns the logged-in partner's `payoutDownlineEnabled` value AND — for L2/L3 — the top-of-chain L1's value. Client branches off these two flags.

## 9. Edge cases

- **L1-direct deal, any mode** — single L1 row at full rate, unchanged.
- **L3 deal under Disabled L1 where `l3Enabled === false`** — impossible in current code (L3 partner can't exist without the L1's `l3Enabled` flag). No extra guard required.
- **L3 deal under Disabled L1 where `l3Enabled === true`** — single L1 row at full L1 rate; L2 + L3 get no ledger rows; `Deal.l{2,3}CommissionAmount` still populated for downline-accounting tracking.
- **Enabled-mode L2 signup, SignWell send fails mid-request** — `Partner` row created, `PartnershipAgreement` row written with `status: "failed"`. Admin sees the failure in the existing agreements queue and can retry from the admin UI. Same failure path L1 already has.
- **Concurrent `closed_won` PATCHes** — the `@@unique([dealId, partnerCode, tier])` constraint + P2002 recovery handles races. Exactly one row per deal in Disabled mode, so no collision risk.
- **Disabled L1's pre-existing active downline** — no retro SignWell send. Their agreements remain valid. Their deals still pay through the engine with Disabled-mode logic (single L1 row).
- **`accounting` role submitting the invite with `payoutDownlineEnabled: true`** — 403 from both API routes. Client hides the checkbox as UX polish; server is authoritative.
- **Admin deletes an invite before acceptance** — unchanged flow. The unapplied Invite row gets soft-deleted or purged as today.

## 10. Testing

**Unit tests:**

Add cases to `calcWaterfallCommissions` coverage in `src/lib/commission.ts`:

- `{ L1 disabled, L2 deal }` → single L1 row at full L1 rate.
- `{ L1 disabled, L3 deal }` → single L1 row at full L1 rate.
- `{ L1 disabled, L1-direct deal }` → unchanged (single L1 row, as today).
- `{ L1 enabled, any tier deal }` → unchanged (waterfall rows, as today).

**E2E flow (Vercel preview deploy, manual):**

1. Invite an L1 with the checkbox UN-checked.
2. L1 signs → recruit an L2 → complete signup → confirm **no** Fintella SignWell sent → L2 stays `pending`.
3. Separately invite another L1 with the checkbox checked.
4. L1 signs → recruit an L2 → complete signup → confirm Fintella SignWell auto-sent → L2 completes it → status flips to `active` via webhook.
5. Submit a deal under each L2 → drive to `closed_won` → verify ledger rows:
   - Disabled path → 1 row (L1 at full L1 rate).
   - Enabled path → 2 rows (L1 override + L2).
6. Verify the Disabled L1's `/dashboard/reporting` Commissions tab renders the "Downline Accounting" subsection with correct totals.
7. Verify the Enabled L1's Commissions tab renders the "★ Enabled" badge.
8. Log in as the L2 under the Disabled L1 → Commissions tab shows the "paid by your upline" empty-state note.

**Role gate check:**

- Log in as `accounting` → open Invite Partner modal → checkbox not visible.
- `curl`-hit `POST /api/admin/invites` as `accounting` with `payoutDownlineEnabled: true` in the body → confirm 403.

**Admin profile visual check:**

- L1 profile Commission tab → state row visible (Enabled or Disabled, matching the partner's setting).
- L2 profile Commission tab → state row NOT visible.

## 11. Out of scope

- Flipping the flag post-signup (Q1 locked it).
- Retroactive SignWell dispatch to existing downline under a hypothetically flipped L1 (cannot happen).
- Migrating any of the 4 existing L1s to Enabled (Q4 — no override path).
- Legal template variants for Enabled vs Disabled L1s (Q6 — same rate-matched template).
- New L2/L3-specific SignWell templates (Q3 — reuse existing rate-matched).
- `/admin/partners` list-view badge showing the flag state (deferred to post-v1 if needed).
- Dedicated notification email to L2/L3 under an Enabled L1 explaining the payout shift. The existing SignWell "you have an agreement to sign" email handles onboarding; a dedicated "Fintella is now paying you directly" email is deferred.
- Any change to how L1 pays their downline in Disabled mode — that's entirely off-portal (bank transfer, Venmo, whatever L1 chooses).

## 12. Implementation sequencing hint

Suggested PR order when the implementation plan is written:

1. **Schema + migration** — `Partner.payoutDownlineEnabled`, `Invite.payoutDownlineEnabled`, additive `prisma db push`. Safe to deploy alone — new columns, no readers yet.
2. **Admin API routes + UI** — invite + add-directly checkbox, role gating, server validation, silent coerce for non-L1 tiers. Safe to deploy alone — writes the new column, nobody reads it yet.
3. **Commission engine branch** — `computeDealCommissions` branch, unit tests. **⚠️ This PR flips the commission behavior for every existing L1** (all 4 of them are grandfathered to Disabled). Any L2/L3 deal that closes won AFTER this deploys writes one ledger row (L1 at full rate) instead of the current 2-3 waterfall rows. The engine comment in `src/lib/commission.ts` should explicitly call out the launch-day semantics flip so a future developer doesn't mistake this for the original behavior. Deals already at `closed_won` with ledger rows already written are untouched — `computeDealCommissions` only fires on first closed_won transition.
4. **Signup + SignWell auto-dispatch for Enabled L2/L3** — plumb the Invite→Partner flag, wire the rate-matched SignWell send, `PartnershipAgreement` row. Only takes effect for NEW L2/L3 signups under L1s created with the flag `true`; existing grandfathered L1s (all Disabled) still take the upload-PDF path.
5. **Admin profile Commission tab state row** — one-liner on `/admin/partners/[id]`.
6. **Partner Reporting → Commissions surface** — Enabled badge, Disabled "Downline Accounting" subsection, L2/L3 "paid by upline" empty state.
7. **E2E smoke test on Vercel preview**.
8. **Merge to main**.

Each step is additively safe to deploy in order. The semantics flip lands in Step 3 and should be coordinated with John so he can communicate to any active downline partners if needed.
