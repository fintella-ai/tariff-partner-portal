# Fintella OS — Managed Single-Tenant White-Label Platform

**Date:** 2026-04-24
**Status:** Brainstorm design complete — awaiting John's review before writing-plans
**Product name (working):** Fintella OS
**Scope:** Multi-PR, multi-phase product. This document is V1 scope + V2/V3 outline.

---

## 1. Product positioning

**Name (working):** Fintella OS
**Tagline:** *The referral network platform — branded for your firm, deployed in hours, running like Fintella does.*

**ICP (Ideal Customer Profile):** Client-sourcing referral networks in regulated services.

| Vertical | Example businesses | Why they fit |
|---|---|---|
| Tax-credit recovery | ERC agencies, R&D tax credit consultancies, PPP-recovery firms, SALT refund shops | One-time deal closure, contingency-fee client economics, multi-level partner comp, same structural shape as Fintella |
| Legal marketing intermediaries | Marketing / lead-gen agencies sourcing clients for law firms (they hold the partner pay-out, not the lawyer) | Sidesteps state fee-splitting rules because the intermediary pays, not the regulated entity |
| Financial services referrals | Mortgage broker networks, insurance broker networks, business brokers, merchant-services referral shops | Same flat/waterfall comp structure |
| Home-services lead networks | Solar, roofing, home-improvement referral networks | Same one-time-deal comp, integrations with installer/contractor networks |

**NOT a fit for V1:** pure law firms (fee-splitting prohibited in most states), pure SaaS affiliate programs (recurring-revenue model — comes in V2), e-commerce affiliate programs (product-sale attribution model — out of scope).

**Differentiators vs incumbents (PartnerStack et al.):**

- **Fast onboarding** — first partner invite sent within 10 minutes of provisioning. PartnerStack's reported "month-long demo wait" is the wedge.
- **Native multi-level downline** with waterfall commission math. Most competitors are single-level.
- **Integrated partner qualification booker** (already built — `/booker` + BookingSlot / PartnerApplication models).
- **Tenant-branded partner portal** — your customer's partners see your customer's brand, not ours.
- **Generic connector framework** — tenant admin plugs in ANY business partner they work with, no waiting on a marketplace listing.

---

## 2. Business model + pricing

**Model:** Managed single-tenant SaaS. Each customer gets their own dedicated Vercel deployment + Neon database. Monthly subscription + one-time setup fee.

### Pricing tiers

| Tier | Monthly | V1 → V2 Deposit | Caps / features |
|---|---|---|---|
| **Starter** | $497 | — | 25 active partners, 500 deals/yr, 1 connector, Fintella footer watermark, shared `*.fintella.os` subdomain only |
| **Growth** | $1,497 | $497 deposit locks $1,197/mo for 12 mo when V2 ships | 150 partners, unlimited deals, 3 active connectors, full white-label, custom domain (CNAME), priority email support |
| **Scale** | $2,997 | $997 deposit locks $2,397/mo for 12 mo when V2 ships | Unlimited partners, unlimited connectors, V2 recurring-revenue engine (when shipped), dedicated Slack channel, founder access, quarterly product consult |

**Setup fee:** $1,500–$3,000 one-time (covers provisioning, domain config, brand setup, data migration from legacy spreadsheets / tools).

**V2 founder-pricing deposit mechanism:**

At V1 signup, Growth + Scale tiers sign an addendum: "V2 recurring-revenue engine founder pricing." They pay the deposit now; when V2 ships they get the discounted rate for 12 months. This gives you cash-flow during V2 build AND pre-validates demand for the recurring-revenue engine before you build it.

**Realistic projection (conservative):**

- 3 customers in first 90 days avg Growth tier: $4.5k MRR + $4.5k setup = ~$9k Q1
- 10 customers by month 6: $15k MRR + ~$15k cumulative setup = $105k run-rate
- V2 ships month 4; V2 deposits from 5 Scale customers: $5k pre-revenue
- 25 customers @ avg Growth tier at saturation = $37k MRR with ~4 hrs/customer/month ops overhead

---

## 3. Architecture — managed single-tenant in a SEPARATE CODEBASE

### Core decision: Fintella OS lives in its own repo, cloned from production Fintella at the start, then diverges independently

**Completely isolated from production Fintella.** Fintella OS is a NEW GitHub repo (`github.com/fintella-ai/fintella-os` or similar) cloned from the current portal codebase as a starting point, then evolved independently. Once the clone is made:

- Production Fintella (`github.com/fintella-ai/tariff-partner-portal`) stays unchanged — its branch protection, CI, deploys, env vars, database, and Vercel project are entirely separate.
- Fintella OS develops its own feature set without affecting production Fintella.
- No shared code, no cross-repo PRs, no "upstream patch dispatcher" back into production Fintella.
- Dependency upgrades, breaking changes, schema evolution — all independent.

### Repo structure: monorepo with two apps

Fintella OS is a monorepo containing:

```
fintella-os/
├─ apps/
│  ├─ meta-portal/         # Fintella OS meta-portal — customer CRM + Stripe + provisioning. Only YOU log in.
│  └─ tenant-portal/       # White-label template — deployed per customer, branded to their firm.
├─ packages/
│  ├─ shared-types/        # TypeScript types shared between meta + tenant
│  ├─ commission-engine/   # Shared commission rules engine
│  └─ connector-framework/ # Shared generic connector builder
├─ prisma/
│  ├─ meta-schema.prisma   # Meta-portal DB schema (customers, subscriptions)
│  └─ tenant-schema.prisma # Tenant DB schema (cloned from production Fintella, stripped)
└─ scripts/
   └─ provision-tenant.ts  # Per-customer Vercel + Neon + DNS automation
```

Monorepo tool: Turborepo (simplest for Next.js monorepo, fast builds, clean dependency graph).

### NO multi-tenant database

Each customer gets their own Vercel project + their own Neon database. Data isolation is infrastructure-level, not code-level. This is the key simplification that lets us ship in 4–6 weeks instead of 3+ months.

### Per-customer deployment flow

```
Fintella OS admin clicks "Provision: Acme ERC Recovery"
  → Vercel API: create new project `fintella-os-acme` from apps/tenant-portal
  → Neon API: create new DB from the tenant-schema.prisma baseline
  → Cloudflare API: create `acme.fintella.os` subdomain (or customer's custom domain via CNAME)
  → Tenant env populated: DATABASE_URL, NEXTAUTH_URL, brand defaults
  → First deploy triggers seed-generic.ts (stripped of Fintella-specific content)
  → Stripe subscription activated on signup
  → Super-admin credentials emailed to customer contact
  → Target: < 10 minutes end-to-end
```

### Per-customer upgrade flow (replaces "upstream patch dispatcher")

When `apps/tenant-portal` in the Fintella OS repo ships a new feature or fix:
- GitHub Action fires on `main` merge
- Dispatcher reads the meta-portal's customer list
- For each active customer, triggers a Vercel redeploy of their tenant project from latest `main` in the Fintella OS repo
- Prisma migrations run automatically via each deployment's build step

**Note:** this is DIFFERENT from how production Fintella updates. Production Fintella has its own main branch in its own repo, its own deploys, its own lifecycle. Fintella OS customers never see production Fintella code; production Fintella never sees Fintella OS code.

**Rollback:** per-customer "pin to commit" override in the meta-portal if a customer needs to hold back a bad release.

### Shared secrets vs per-customer secrets

- **Fintella OS platform secrets (env var in the meta-portal):** `STRIPE_SECRET_KEY` (Fintella OS's billing account), `VERCEL_API_TOKEN`, `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`, `ANTHROPIC_API_KEY` (Fintella's shared Claude account for the 🪄 Regenerate feature — optional per-customer override)
- **Per-customer secrets (set during provisioning):** `DATABASE_URL`, `NEXTAUTH_URL`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `SENDGRID_API_KEY`, `TWILIO_*`, `SIGNWELL_API_KEY`, `STRIPE_*` (customer's own Stripe for their partner payouts) — customers bring their own for outbound comms + agreement signing + partner payouts

---

## 4. V1 feature scope (ships in 4–6 weeks)

### 4.1 Fintella OS meta-portal (new codebase, separate repo)

- Customer CRM: company, primary contact, domain, tier, subscription status, deployment URL, Neon DB id
- Stripe subscription management (create / upgrade / downgrade / cancel / deposit tracking)
- Provisioning button: "Provision new customer" → runs Vercel + Neon + DNS flow end-to-end
- Upstream patch dispatcher (GitHub Action triggered)
- Basic monitoring: per-customer uptime + error-count ping (from the customer's deployment health endpoint)

### 4.2 Per-customer portal deployment (extensions to existing Fintella portal codebase)

**Brand surface (all admin-editable via existing `/admin/settings`):**
- Firm name, short name, slogan, phone, support email
- Logo, favicon, OG image
- 4 color-theme presets + custom theme editor
- Custom domain config (CNAME verification helper)

**Commission rules engine (per-tenant configurable — exposes existing waterfall as admin-editable rules):**
- Basis selector: flat-fee / % of firm fee / % of deal size / % of custom field / other-custom
- Structure: flat / tiered / waterfall
- Waterfall depth: 1 / 2 / 3 (mirrors existing L1/L2/L3)
- Custom-field name for the commission variable (per-tenant — e.g. `firm_fee` vs `refund_amount` vs `policy_premium`)
- Per-tier rate caps

**Per-service custom deal fields:**
- Tenant admin defines 3–8 custom fields per service type
- Example: ERC tenant tracks `quarters_claimed`, `employees_count`, `total_wages`
- Example: Mortgage tenant tracks `loan_type`, `funded_date`, `principal_amount`
- Webhook payload schema + portal forms both auto-adapt to the tenant's custom fields

**Generic connector framework (supports any B2B service partner, no curated marketplace):**
- Admin UI: "Add new connector" wizard
- Fields: name, description, auth method (API key / bearer / HMAC-signed / OAuth2), webhook URL or inbound endpoint
- Field-mapping UI: paste sample payload → visual drag-to-map fields to portal deal model
- Test mode: send a dummy payload, verify parsing + fire in portal
- Activate: connector is live, flows become actionable deals
- Connector marketplace: NOT built in V1. Pre-built templates for common services (HubSpot, Salesforce, Stripe) may ship post-V1 as marketing bullets, 2–3 days each.

**Fintella-brand-strip pass (cleanup work):**
- `scripts/seed-all.js`, `seed-partners.ts`, `seed-training.ts`, `seed-conference.ts` — replace any Fintella-specific or Frost-Law-specific training modules / FAQs / agreements with generic placeholders
- FAQ defaults — rewrite to be firm-name-agnostic
- Email templates — replace any hardcoded `{{firmName}}` strings with dynamic PortalSettings.firmName
- Nav labels + landing content — already PortalSettings-backed; verify + genericize any remaining hardcoded strings
- Docs (`/docs/install-app`, `/docs/webhook-guide`) — genericize
- Legal placeholders (privacy, terms, TCR copy) — neutral "SAMPLE — replace with your firm's copy" with clear "compliance review required" warnings
- CLAUDE.md + memory files — unchanged (production Fintella documentation)

**Everything else from current Fintella carries forward unchanged:**
- Invite-only partner signup (L1 admin, L2/L3 upline link)
- SignWell partnership agreements
- Downline commission waterfall
- 3-phase ledger (pending → due → paid)
- Payout batches
- Full Reporting tabs
- Training library + resources
- PartnerOS AI (Fin + Stella personas, per-tenant API key)
- Landing page editor (ships per PR #518)
- PartnerApplication intake + booker
- Multi-auth (password + Google OAuth + Passkey)
- Admin role matrix (super_admin / admin / accounting / partner_support)

### 4.3 Rebrand considerations

The existing Fintella production instance at `fintella.partners` (in the production `tariff-partner-portal` repo) stays unchanged — it's the real business, real partners, real Frost Law relationship. **Fintella OS is a cloned codebase** at the point of the initial clone, then diverges. The initial clone pass strips Fintella-proprietary content so customer deployments start clean.

Implementation approach for the initial clone → stripped baseline:

- Clone `github.com/fintella-ai/tariff-partner-portal` → `github.com/fintella-ai/fintella-os`
- Remove Frost-Law / Fintella-specific references from:
  - Seed scripts (`scripts/seed-all.js`, `seed-partners.ts`, etc.)
  - FAQ defaults
  - Email templates (replace hardcoded strings with `{{firmName}}` tokens)
  - Nav labels + landing content defaults
  - Docs (`/docs/install-app`, `/docs/webhook-guide`)
  - Legal placeholders (privacy, terms, TCR copy)
- Replace production-specific env var references with tenant-provisioning patterns
- Rename the monorepo structure per section 3 (apps/meta-portal, apps/tenant-portal, packages/*)
- Add a CI check in the Fintella OS repo: `grep "Frost Law"` against the tenant-seed content fails the build (final safety net)

**Production Fintella's codebase is NOT modified in this process** — the clone is a one-way fork. Future Fintella production work continues in the `tariff-partner-portal` repo independently.

---

## 5. V2 feature scope (ships 6–8 weeks post-V1)

- **Recurring-revenue commission engine** — monthly % of MRR, N-month residuals, churn-adjusted clawbacks
- **Cookie attribution** — 30/60/90-day windows, first-touch / last-touch / linear
- **Deep pre-built integrations:** Stripe + Chargebee billing-event ingestion, HubSpot CRM deep sync, Salesforce connector
- **Self-serve tenant signup for Starter tier** — up to now V1 is sales-assisted only
- **V2 deposit holders get founder pricing for 12 mo**

---

## 6. V3 feature scope (Q4 2026)

- Partner-discovery marketplace (tenants advertise to partners looking for programs)
- AI-driven partner/deal matching
- Enterprise tier (SSO, custom SLAs, audit export, on-prem option)
- Multi-tenant database option (for price-sensitive customers who don't need infrastructure isolation)

---

## 7. Timeline

| Week | Milestone |
|---|---|
| 1 | Fintella OS meta-portal skeleton (customer CRM + Stripe billing scaffold) |
| 2 | Provisioning automation (Vercel API + Neon API + DNS API end-to-end) |
| 3 | Commission rules engine + per-service custom fields |
| 4 | Connector framework + inbound webhook wizard |
| 5 | Fintella-brand-strip pass + tenant branding surfaces + pricing page |
| 6 | End-to-end test: provision a test customer, launch first paying tenant, collect payment |

Weeks 7–14: V2 engineering runs in parallel to V1 sales motion.

---

## 8. Success metrics

**V1 launch (Q2 2026):**
- 3 paying customers within 90 days
- ~$9k Q1 revenue ($4.5k MRR + $4.5k setup)
- Provisioning time < 10 minutes end-to-end
- Zero customer-facing downtime during upstream patches

**V2 launch (Q3 2026):**
- 10 total paying customers
- 5+ V2 deposit-holders converted to Scale tier
- First recurring-revenue tenant live

**Scaling target (end of Year 1):**
- 25 paying customers
- $37k MRR
- Average customer onboarding time: 4 hours of founder (your) involvement

---

## 9. Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Customer-portal upgrade breaks a customer | Customer-visible downtime | Per-customer "pin to commit" override + staged rollout (deploy to a sample customer first, then all); Fintella OS repo has its own staging environment |
| Customer data leaks across deployments | Existential for the product | Infrastructure-level isolation (separate Neon DBs) + no code-level cross-tenant queries possible |
| Customer wants to migrate OFF Fintella OS | Churn + PR risk | Export-all-data feature in admin (CSV for deals, partners, payouts) — ship as V1 requirement |
| Frost-Law-branded content leaks into tenant seed | Contract risk for John | Brand-strip pass gated by CI check in Fintella OS repo — `grep "Frost Law"` on the tenant-seed content fails the build |
| Fintella OS repo + production Fintella repo drift creates confusion | Engineering overhead | Explicit "these are separate products" docs + separate CLAUDE.md + separate branch protection + separate teams/ownership; no shared PRs |
| Customer runs illegal comp structure in regulated state | Legal liability if John could've known | Terms of service disclaimer + Starter tier help-page "compliance review required before launch" |
| Provisioning automation breaks mid-flow | Failed customer onboarding | Provisioning steps are idempotent + rollback-safe; meta-portal shows per-step status |

---

## 10. Open decisions requiring John's input

These are flagged for your call before we transition to writing-plans:

### 10.1 Product name — CLOSED
Resolved per John's 2026-04-24 confirmation: **Fintella OS**. Repo: `github.com/fintella-ai/fintella-os`. Meta-portal domain: see 10.4.

### 10.2 Pricing tier comfort
- $497 / $1,497 / $2,997 monthly
- $1,500–$3,000 setup fee
- V2 deposit: $497 (Growth) / $997 (Scale)
- OK to proceed, or you want to adjust?

### 10.3 SignWell — shared account or per-customer BYO?
- **Option A (shared):** Fintella OS provides a single SignWell account; all customer template agreements funnel through it. Simpler for customers. But customers don't own their SignWell contract data — compliance risk for legal industry customers.
- **Option B (per-customer BYO):** each customer brings their own SignWell account + templates. Full ownership. More work during provisioning.
- **Recommended:** Option B — customers in regulated services should own their own agreement paper trail.

### 10.4 Domain for the meta-portal
- `fintella.os` (requires buying the `.os` TLD — available, ~$60/yr)
- `os.fintella.partners` (subdomain, $0)
- Something separate entirely (`fintellaos.com`, `fintellanetworks.com`, etc.)

### 10.5 First 3 pre-built connectors to ship post-V1
- Candidate list: HubSpot CRM, Salesforce, Stripe Connect (for payouts), Pipedrive, Zoho CRM, Zapier, Make
- Which 3 matter most based on your target ICP conversations?

### 10.6 Fintella production — CLOSED
Resolved per John's 2026-04-24 directive: Fintella OS lives in a **completely separate repo** (`github.com/fintella-ai/fintella-os`), cloned from production Fintella as a one-time fork, then evolved independently. No patient-zero, no shared codebase, no collision risk with production. This decision is baked into Section 3 (Architecture).

---

## 11. Adjacent product-line extensions (post-V3 / separate product)

A key insight from the 2026-04-24 brainstorm: Fintella OS's V1 architecture (tenant isolation + custom fields + generic connector framework + commission-agnostic ledger + admin/partner/client role separation) makes it **easy and cheap** — ~10% of greenfield build time — to extend into adjacent SMB service-business operations. These become expansion product lines once V1/V2 are humming, OR separate SKUs sold to the same ICP.

### Natural extensions the architecture already supports

| Extension | What it adds | Effort on top of V1 |
|---|---|---|
| **Project management backend** | Kanban boards, task assignments, deadlines, per-deal project workflows | 2–3 weeks (extends Deal model with project phases + TaskItem relation) |
| **Client support ticketing** | External client portal where customers' clients submit support tickets — already partially built via `SupportTicket` model, just needs tenant-facing UX | 1–2 weeks (leverage existing SupportTicket + TicketMessage models) |
| **Sales front-end system** | Deal pipeline CRM view for tenant staff (not just partners) — lead → qualified → closed-won workflow with assignment, notes, follow-ups | 2–3 weeks (extends Deal model with a `leadSource=inbound_sales` path) |
| **Client portal (end-client-facing)** | Clients of the tenant's clients log in to track their own deal, upload docs, see status | 2–3 weeks (new top-level role alongside partner/admin) |
| **Secure document collection** | Client-upload flow for regulated docs (W-9, employment records, tax forms, incorporation docs); per-doc encryption + audit log | 2 weeks (extends Document model; add end-to-end-encrypted upload endpoint) |
| **IRS transcript parsing** | Client uploads IRS transcript PDF → OCR → extract fields → populate deal record | 1–2 weeks (Claude-API-backed parsing pipeline; PDF → structured JSON → Deal fields) |
| **Reporting + analytics suite** | Pre-built dashboards for tenant's business ops (pipeline velocity, conversion rate, rep performance, commission forecasts) | 2–3 weeks (extends existing `/admin/reports` tabs) |

### Strategic implication

This is a **defensible moat**: a tenant who adopts Fintella OS for referral-network management gets a gravity-well upgrade path into full SMB ops tooling. Competitors offering single-point solutions (just affiliate tracking, or just CRM, or just e-sign) can't match the integrated workflow.

**V1 does not ship any of these extensions.** But V1's architecture is intentionally designed so each extension is a 2–3 week engineering sprint rather than a rebuild. The value is captured in the sales conversation: "Start with referral-network management. Add project management next quarter. Add client portal after that. One codebase, one login, one dataset, tenant-branded throughout."

**John's capability note:** John has domain expertise in these adjacent areas — especially IRS transcript parsing + secure document collection for tax-recovery workflows. His 10% build-time estimate reflects this experience. Any of these extensions, when greenlit, starts with a dedicated brainstorm → design → writing-plans loop of its own.

---

## 13. What this design explicitly does NOT do

- **Does NOT build a multi-tenant database.** If V3 needs it for price-sensitive tier, that's a separate ~4-week project.
- **Does NOT build a self-serve signup flow for V1.** Sales-assisted only — you provision manually after a demo call.
- **Does NOT build a partner marketplace / directory.** V3 territory.
- **Does NOT build the recurring-revenue commission engine.** V2 — sold as a deposit-locked future feature in V1.
- **Does NOT rebuild the commission engine.** V1 exposes existing waterfall as admin-editable rules, no math rewrite.
- **Does NOT promise compliance coverage.** Customers in regulated states must validate their own comp structure. We provide infrastructure, not legal opinion.
- **Does NOT try to compete with PartnerStack head-on in V1.** V1 is narrow ICP; V2 opens the SaaS-affiliate market.

---

## 14. Post-design next steps

1. **John reviews this spec** — approve as-is, or push back on sections (especially section 10 open decisions)
2. **Once approved**, I invoke the `superpowers:writing-plans` skill to produce the detailed implementation plan (task breakdown, dependency graph, per-task acceptance criteria)
3. **Plan lands**, John reviews the plan
4. **Week 1 kickoff** — start with Fintella OS meta-portal skeleton + Stripe billing scaffold
