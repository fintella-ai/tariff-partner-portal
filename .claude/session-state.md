# Session State

🕒 Last updated: 2026-04-24 — PRs #463 + #464 + #465 merged (A2P 10DLC resubmit prep): #463 updated Fintella mailing address on /privacy + /terms to `111 2nd Ave NE #1250, St. Petersburg, FL 33701`; #464 added Privacy + Terms links to the partner dashboard footer (centered under the copyright, new-tab); #465 updated the signup SMS consent checkbox text to match the Twilio campaign submission verbatim. Earlier: #461 made /signup a public preview when no token is present — all three URLs (/signup, /privacy, /terms) are now ready to resubmit. #459 widget body fills its own box; #457 fit fixes; #455 partner tagging; #454 widget V1 + orphan cleanup. V1 (#454) mounted InternalChatWidget in admin/layout.tsx (floating 💬 bubble → 440×640 panel, localStorage position + open state, search filter passed into TeamChatPanel, embeds the existing TeamChatPanel for SSE/mentions/send). Also shipped a new /api/admin/dev/orphaned-chat endpoint + Data Cleanup section for AdminChatThread rows whose dealId points to a deleted Deal. V2 (#455) added partner tagging via `&partner` trigger — new parsePartnerRefs + renderer segment + pink-chip UI linking to /admin/partners?code=; MentionInput now supports @admin / #deal / &partner side-by-side. Earlier today: #442 workspace V1, #444 Home in admin nav reorder registry, #446 workspace V2 (PartnerContextDrawer + Activity Timeline + per-admin reorder), #448 open invites in the workspace Needs-Attention feed, #450 Level column on partner Full Reporting → Downline → Your Partners, #452 Google Calendar embed on workspace. 2026-04-23 session had 21 PRs (Google Calendar OAuth, Jitsi embed, HubSpot-style workflow editor, reminder triggers, orphan cleanup, etc.).

## 🌿 Git state
- **main HEAD:** `40744d5` — chore(signup): match SMS consent text to Twilio A2P submission verbatim (#465)
- **origin/main:** in sync
- **Open non-dependabot PRs:** 0 (#357 still DRAFT — flagged, don't merge)
- **Working tree:** clean
- **Active branch:** main

## ✅ This session (late 2026-04-22) — 14 PRs shipped

**Partner home overhaul (Phase 1 → Phase 2):**
- **#389** Partner home Phase 1 — centered welcome, embedded video (HeyGen/YouTube/Vimeo), 2-col desktop layout, per-module visibility toggles. Schema: `homeEmbedVideoUrl` + `homeHiddenModules`.
- **#392** Reorder home sections: Events → Announcements → Leaderboard → Opportunities, all section headers centered, 2-col announcements.
- **#394** Phase 2 — drag-to-reorder modules + per-module columns (1/2/3) + per-module alignment (left/center). Schema: `homeModuleOrder` + `homeModuleLayout`. HTML5 native drag on the admin Module Layout & Order card.
- **#397** Highlighted (featured card) flag on Announcements + Upcoming Events (parity with Referral Opportunities).
- **#398** Support + NotificationBell pulled out of the floating top-right fixed corner into the right side of the sticky top bar. Home module cards (events/announcements/opportunities) all text-centered.

**Shared header + footer + layout polish:**
- **#390** Center ★ Star Super Admin row in admin sidebar footer.
- **#391** Center welcome block, left-align Submit/Referral sticky CTAs.
- **#395** Move date under the header (shared partner layout), add full-bleed divider, drop duplicate "Welcome Back" from home body.
- **#396** Site-wide partner footer with favicon + "© Fintella Financial Intelligence Network 2026" + `mt-24 sm:mt-32` breathing room.
- **#399** Bump desktop padding `px-10` → `px-14`, add `overflow-x-hidden` to both portal main content containers.
- **#401** Further padding bump `px-14` → `px-24` desktop + `px-10` tablet.
- **#402** Dark header strip via new `--app-header-bg` CSS var (light `#cfd3dd` / dark `#070c18`); `text-center` wrapper on `{children}` cascades centered alignment to every partner page body.

**Fixes / misc:**
- **#393** Restore Communications tab bar on Live Weekly Call page (regression from #388 — PageTabBar was inside the loading branch only).
- **#400** Swap Partner Support icon 🎧 → 🙋 to match admin; move Documents from sidebar into `/dashboard/reporting` as rightmost tab; extract shared `<DocumentsView />` component so `/dashboard/documents` deep-link still works.

## 🎯 Queued for tomorrow (top of stack)

1. **Email templates → workflow actions** — mirror SMS pattern from #358/#360. Start with brainstorming skill. Keep `password_reset` hardcoded (security). 7 other sends to migrate. See `project_fintella_email_workflow_migration` memory.

2. **Contabo VPS / MinIO bootstrap** — unblocks PR #357 multi-file note attachments. See `project_fintella_minio_vps_plan` memory.

3. **Post-#404 live verification (light)** — click through each partner route on the Vercel preview to confirm the left-align default + tightened mobile padding read correctly on forms, tables, and the home page.

4. **Flagged from earlier sessions:**
   - Live Weekly column formatting + resizable columns
   - Notification bell mentions rollup (verify #293 plumbing first)
   - HTTP method selector on webhook.post for PATCH updates

## 🧠 Context that matters for resuming

- **Partner portal is visually finished for this pass.** Home page fully customizable (drag order, columns, alignment, visibility per module). Highlighted flag works on all 3 content modules. Video embed. Admin-configured layout persists. Header has a dark strip above a full-bleed divider. All page bodies inherit centered text. Footer shows favicon + copyright with big breathing room. Sticky top bar has Submit/Referral left + Support/Bell right.
- **Admin portal also got the padding + overflow-x-hidden treatment** (#399 #401). ★ Star Super Admin row centered (#390).
- **No schema migrations pending.** All new PortalSettings fields are additive with defaults — safe to push.
- **Build is clean at 97/97 static pages** (pre-existing `global-error.tsx` Sentry warning is the only warning).
- **Vercel auto-deploys main on every push** — all 14 merges already deployed.

## 📂 Relevant files for the next task (by priority)

### If tackling email→workflow migration
- `src/app/api/workflows/execute/route.ts` — action dispatch
- `src/lib/sendgrid.ts` — existing email helpers
- `src/app/api/cron/monthly-newsletter/route.ts` — cron (rearchitected out)
- PR #358 + #360 — SMS pattern to mirror
- Start with brainstorming skill per user preference

### If bootstrapping MinIO on Contabo VPS
- `~/.claude/plans/can-a-vps-contabo-humble-moon.md` — full plan document
- VPS: `ssh root@217.216.52.147`
- Bucket name target: `fintella-attachments`
- `prisma/schema.prisma:341-343` — `NoteAttachment.url` migration seam
- `src/app/api/admin/notes/route.ts:72-90` — POST handler to rewire
- `src/app/api/admin/deal-notes/route.ts:56-74` — POST handler to rewire

### If eyeballing partner text-center cascade
- `src/app/(partner)/dashboard/layout.tsx:~610` — `<div className="text-center">{children}</div>`
- Inspect each top-level partner route: deals, commissions, training, reporting, submit-client, referral-links, feature-request

### If tweaking home page layout further
- `src/app/(partner)/dashboard/home/page.tsx` — module dispatcher + renderers
- `src/app/(admin)/admin/settings/page.tsx` — Module Layout & Order card (search for `DEFAULT_MODULE_ORDER`)
- `src/components/partner/DocumentsView.tsx` — extracted Documents content
- `prisma/schema.prisma` — PortalSettings with homeModuleOrder, homeModuleLayout, homeEmbedVideoUrl, homeHiddenModules

## Previous sessions preserved below (condensed)

### 2026-04-22 earlier (13 PRs): Commission system overhaul
PRs #370–#378. Payout Downline Partners, EP override flat-rate rewrite, full commission round-trip with Undo, per-deal commission rates in admin revenue, stage-aware refund resolver, deal-delete cascade, workflow payload + webhook body template expansion. See `project_fintella_session_apr16_18` memory for details.

## 📌 Dependabot status (5 open, do NOT auto-merge per CLAUDE.md)
#287 postcss patch · #288 next-auth beta · #289 typescript 6.0 MAJOR · #290 @anthropic-ai/sdk 0.x breaking · #291 @sentry/nextjs minor
