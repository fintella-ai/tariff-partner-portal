# Admin Navigation Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse 6 scattered admin sidebar entries into two new groups (`Communications`, `Partner Support`), reducing top-level nav from 17 → 11. Zero existing routes removed. Every new group entry registered in Settings → Navigation so order can be customized. Saved nav-order values with stale IDs gracefully reconcile.

**Architecture:** Extract each of the 6 consolidated top-level pages into a reusable `*Panel` component. Two tabbed host pages (`/admin/communications` and `/admin/support`) import those panels. Sidebar + permissions registries + nav-order customizer all updated to reference the two new group IDs. Small new reconcile helper handles migration of saved nav orders with stale IDs.

**Tech Stack:** Next.js 14 App Router, React 18, existing admin-layout nav-group rendering (already supports `NavGroup` with children per `isGroup()` helper in `src/app/(admin)/admin/layout.tsx`), Node `assert` for the reconcile helper test.

**Spec:** `docs/superpowers/specs/2026-04-20-admin-nav-consolidation-design.md`

**⚠️ Hard constraints:**

- This plan MUST NOT run before the partner-DM PR (dispatched 2026-04-20) has landed on main. That PR adds `partnerDmFlags` as a top-level nav entry which this plan relocates into Partner Support. Running out of order produces a conflict.
- Do NOT modify `src/app/api/webhook/referral/route.ts`, any Prisma model, any API route handler, or any business logic. This is purely a sidebar + page-layout restructure plus component extraction.
- Do NOT change the URL of any existing page. `/admin/workflows`, `/admin/team-chat`, `/admin/channels`, `/admin/chat`, `/admin/support`, `/admin/partner-dm-flags` all keep rendering via thin-wrapper page files that import the extracted panels. Old notification links + bookmarks must continue to work.
- Every extracted panel must render identically to its current page behavior — this is move-and-import, not rewrite.

---

### Task 1: Add `reconcileNavOrder` helper with failing tests

**Files:**
- Create: `src/lib/reconcileNavOrder.ts`
- Create: `src/lib/__tests__/reconcileNavOrder.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/__tests__/reconcileNavOrder.test.ts
import assert from "node:assert/strict";
import { reconcileNavOrder } from "../reconcileNavOrder";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

console.log("reconcileNavOrder");

const currentIds = ["partners", "deals", "communications", "partnerSupport", "settings"];

test("stale IDs in saved list are dropped", () => {
  const out = reconcileNavOrder(["partners", "workflows", "chat", "deals"], currentIds);
  assert.deepEqual(out, ["partners", "deals", "communications", "partnerSupport", "settings"]);
});

test("missing new IDs are appended to the end", () => {
  const out = reconcileNavOrder(["partners", "deals"], currentIds);
  assert.deepEqual(out, ["partners", "deals", "communications", "partnerSupport", "settings"]);
});

test("empty saved list returns full current order", () => {
  assert.deepEqual(reconcileNavOrder([], currentIds), currentIds);
});

test("perfect saved list returns unchanged", () => {
  assert.deepEqual(reconcileNavOrder(currentIds, currentIds), currentIds);
});

test("order preserved for items that exist in both", () => {
  const out = reconcileNavOrder(["settings", "deals", "partners", "zombie"], currentIds);
  assert.deepEqual(out, ["settings", "deals", "partners", "communications", "partnerSupport"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify fail**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/reconcileNavOrder.test.ts
```

- [ ] **Step 3: Implementation**

```ts
// src/lib/reconcileNavOrder.ts
/**
 * Clean a saved nav-order list against the current registry of valid IDs.
 *   - Drop IDs no longer present in the registry (stale).
 *   - Append IDs that exist in the registry but are missing from the saved list.
 *   - Preserve the saved order for IDs that are valid.
 */
export function reconcileNavOrder(savedOrder: string[], currentIds: string[]): string[] {
  const currentSet = new Set(currentIds);
  const savedSet = new Set(savedOrder);
  const preserved = savedOrder.filter((id) => currentSet.has(id));
  const appended = currentIds.filter((id) => !savedSet.has(id));
  return [...preserved, ...appended];
}
```

- [ ] **Step 4: Run to verify pass**

Expected: `5 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reconcileNavOrder.ts src/lib/__tests__/reconcileNavOrder.test.ts
git commit -m "feat(lib): reconcileNavOrder — drop stale IDs + append missing"
```

---

### Task 2: Extract `TeamChatPanel` from `/admin/team-chat/page.tsx`

**Files:**
- Create: `src/app/(admin)/admin/team-chat/TeamChatPanel.tsx`
- Modify: `src/app/(admin)/admin/team-chat/page.tsx` (becomes thin wrapper)

- [ ] **Step 1: Move the entire existing `TeamChatPage` component body into a new file**

```tsx
// src/app/(admin)/admin/team-chat/TeamChatPanel.tsx
"use client";
// ... EXACT COPY of the current TeamChatPage function body + all hooks + all imports it references
export default function TeamChatPanel() {
  // body verbatim
}
```

- [ ] **Step 2: Replace `page.tsx` with a thin wrapper**

```tsx
// src/app/(admin)/admin/team-chat/page.tsx
import TeamChatPanel from "./TeamChatPanel";
export default function Page() { return <TeamChatPanel />; }
```

- [ ] **Step 3: Build + verify the route still renders identically**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/team-chat/TeamChatPanel.tsx src/app/\(admin\)/admin/team-chat/page.tsx
git commit -m "refactor(team-chat): extract TeamChatPanel, page.tsx becomes thin wrapper"
```

---

### Task 3: Extract `ChannelsListPanel` from `/admin/channels/page.tsx`

Same pattern as Task 2. Result files:
- `src/app/(admin)/admin/channels/ChannelsListPanel.tsx`
- `src/app/(admin)/admin/channels/page.tsx` reduced to:
  ```tsx
  import ChannelsListPanel from "./ChannelsListPanel";
  export default function Page() { return <ChannelsListPanel />; }
  ```

The `[id]/page.tsx` detail page stays untouched — it's not embedded into any host, just navigated to from the list.

- [ ] **Step 1-3: Copy-extract-wrap-build**
- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/channels/ChannelsListPanel.tsx src/app/\(admin\)/admin/channels/page.tsx
git commit -m "refactor(channels): extract ChannelsListPanel, page.tsx becomes thin wrapper"
```

---

### Task 4: Extract `WorkflowsPanel` from `/admin/workflows/page.tsx`

Same pattern. Result:
- `src/app/(admin)/admin/workflows/WorkflowsPanel.tsx`
- `src/app/(admin)/admin/workflows/page.tsx` → thin wrapper

- [ ] **Step 1-3: Extract, wrap, build**
- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/workflows/WorkflowsPanel.tsx src/app/\(admin\)/admin/workflows/page.tsx
git commit -m "refactor(workflows): extract WorkflowsPanel, page.tsx becomes thin wrapper"
```

---

### Task 5: Extract `LiveChatPanel` from `/admin/chat/page.tsx`

Same pattern.
- `src/app/(admin)/admin/chat/LiveChatPanel.tsx`
- `src/app/(admin)/admin/chat/page.tsx` → thin wrapper

- [ ] **Step 1-3: Extract, wrap, build**
- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/chat/LiveChatPanel.tsx src/app/\(admin\)/admin/chat/page.tsx
git commit -m "refactor(chat): extract LiveChatPanel, page.tsx becomes thin wrapper"
```

---

### Task 6: Extract `SupportTicketsPanel` from `/admin/support/page.tsx`

**Special note:** `/admin/support/page.tsx` will be CONVERTED in Task 8 into the Partner Support tabbed HOST page. Task 6 only extracts the current ticket UI into a panel — we do not touch `page.tsx` here; Task 8 rewrites it as a host.

Result:
- `src/app/(admin)/admin/support/SupportTicketsPanel.tsx` (new, holds current ticket UI)

- [ ] **Step 1: Copy the current `SupportPage` body into `SupportTicketsPanel.tsx`**

Do NOT yet delete or modify the original `page.tsx`. That happens in Task 8.

- [ ] **Step 2: Build to verify the panel file compiles standalone**

```bash
./node_modules/.bin/next build
```

Expected: compiles. The panel exports, the page still renders exactly as today.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/support/SupportTicketsPanel.tsx
git commit -m "refactor(support): extract SupportTicketsPanel (page.tsx stays flat for now)"
```

---

### Task 7: Extract `DmFlagsListPanel` from `/admin/partner-dm-flags/page.tsx`

Same pattern as Task 2-5. Relies on the partner-DM PR having landed.

- `src/app/(admin)/admin/partner-dm-flags/DmFlagsListPanel.tsx`
- `src/app/(admin)/admin/partner-dm-flags/page.tsx` → thin wrapper

- [ ] **Step 1-3: Extract, wrap, build**
- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/partner-dm-flags/DmFlagsListPanel.tsx src/app/\(admin\)/admin/partner-dm-flags/page.tsx
git commit -m "refactor(partner-dm-flags): extract DmFlagsListPanel, page.tsx becomes thin wrapper"
```

---

### Task 8: Convert `/admin/support/page.tsx` into the Partner Support tabbed host

**Files:**
- Modify: `src/app/(admin)/admin/support/page.tsx`

- [ ] **Step 1: Replace the page with the tabbed host**

```tsx
// src/app/(admin)/admin/support/page.tsx
"use client";
import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SupportTicketsPanel from "./SupportTicketsPanel";
import LiveChatPanel from "../chat/LiveChatPanel";
import DmFlagsListPanel from "../partner-dm-flags/DmFlagsListPanel";

type Tab = "tickets" | "livechat" | "dmflags";
const TABS: { id: Tab; label: string }[] = [
  { id: "tickets",  label: "Support Tickets" },
  { id: "livechat", label: "Live Chat Support" },
  { id: "dmflags",  label: "DM Flags" },
];

function SupportHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = params?.get("tab");
  const initial: Tab = (TABS.some((t) => t.id === urlTab) ? (urlTab as Tab) : "tickets");
  const [tab, setTab] = useState<Tab>(initial);

  const onSelect = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams(params?.toString() || "");
    qs.set("tab", t);
    router.replace(`/admin/support?${qs.toString()}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>
      {tab === "tickets"  && <SupportTicketsPanel />}
      {tab === "livechat" && <LiveChatPanel />}
      {tab === "dmflags"  && <DmFlagsListPanel />}
    </div>
  );
}

export default function Page() {
  return <Suspense><SupportHostInner /></Suspense>;
}
```

(The `Suspense` boundary is required because `useSearchParams()` must be wrapped per Next 14 static-export rules — exact same pattern the admin Team Chat page had to add.)

- [ ] **Step 2: Build + verify all three tabs render**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/support/page.tsx
git commit -m "feat(support): convert /admin/support into Partner Support tabbed host"
```

---

### Task 9: Convert `/admin/communications/page.tsx` into the Communications tabbed host

**Files:**
- Modify: `src/app/(admin)/admin/communications/page.tsx`

The existing page currently shows email templates + wired-template indicator. We need to:
1. Move the existing email-template UI body into a new `EmailTemplatesTab.tsx` component inside the same directory.
2. Scaffold placeholder components for Inbox, Compose, SMS, Phone, Automations tabs (reuse existing code where applicable).
3. Rewrite `page.tsx` as a tabbed host.

- [ ] **Step 1: Extract existing email body → `EmailTemplatesTab.tsx`**

Move the existing `CommunicationsPage` body (email templates CRUD + wired indicator) into `src/app/(admin)/admin/communications/EmailTemplatesTab.tsx`. Default-export `EmailTemplatesTab`.

- [ ] **Step 2: Add placeholder tab components (these wire to existing admin surfaces)**

```tsx
// src/app/(admin)/admin/communications/EmailInboxTab.tsx
"use client";
export default function EmailInboxTab() {
  // Renders the existing inbound-email log. If an inbound-email inbox UI
  // already exists in the codebase, import and render it here. Otherwise
  // placeholder the read-only list of InboundEmail rows from
  // /api/admin/inbound-emails (check if endpoint exists; if not, note
  // this tab is a stub for v1 and needs its own follow-up spec).
  return <div className="font-body text-sm text-[var(--app-text-muted)]">Email inbox (wire to existing inbound-email log).</div>;
}
```

```tsx
// src/app/(admin)/admin/communications/EmailComposeTab.tsx
"use client";
export default function EmailComposeTab() {
  return <div className="font-body text-sm text-[var(--app-text-muted)]">Compose outbound email (wire to existing /api/admin/email-compose endpoint if present; else placeholder).</div>;
}
```

Similarly create `SmsTab.tsx`, `PhoneTab.tsx`. These may be thin stubs in v1 if no existing functionality maps — document clearly in the component body.

- [ ] **Step 3: Rewrite `page.tsx` as the host**

```tsx
// src/app/(admin)/admin/communications/page.tsx
"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import EmailInboxTab from "./EmailInboxTab";
import EmailComposeTab from "./EmailComposeTab";
import EmailTemplatesTab from "./EmailTemplatesTab";
import SmsTab from "./SmsTab";
import PhoneTab from "./PhoneTab";
import WorkflowsPanel from "../workflows/WorkflowsPanel";
import TeamChatPanel from "../team-chat/TeamChatPanel";
import ChannelsListPanel from "../channels/ChannelsListPanel";

type Tab = "email" | "sms" | "phone" | "automations" | "team-chat" | "channels";
type EmailView = "inbox" | "compose" | "templates";

const TABS: { id: Tab; label: string }[] = [
  { id: "email",       label: "Email" },
  { id: "sms",         label: "SMS" },
  { id: "phone",       label: "Phone" },
  { id: "automations", label: "Automations" },
  { id: "team-chat",   label: "Team Chat" },
  { id: "channels",    label: "Channels" },
];

const EMAIL_VIEWS: { id: EmailView; label: string }[] = [
  { id: "inbox",     label: "Inbox" },
  { id: "compose",   label: "Compose" },
  { id: "templates", label: "Templates" },
];

function CommunicationsHostInner() {
  const params = useSearchParams();
  const router = useRouter();
  const urlTab = params?.get("tab");
  const urlView = params?.get("view");

  const [tab, setTab] = useState<Tab>((TABS.some((t) => t.id === urlTab) ? urlTab : "email") as Tab);
  const [emailView, setEmailView] = useState<EmailView>((EMAIL_VIEWS.some((v) => v.id === urlView) ? urlView : "inbox") as EmailView);

  const onSelectTab = (t: Tab) => {
    setTab(t);
    const qs = new URLSearchParams();
    qs.set("tab", t);
    if (t === "email") qs.set("view", emailView);
    router.replace(`/admin/communications?${qs.toString()}`);
  };
  const onSelectEmailView = (v: EmailView) => {
    setEmailView(v);
    const qs = new URLSearchParams({ tab: "email", view: v });
    router.replace(`/admin/communications?${qs.toString()}`);
  };

  return (
    <div>
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onSelectTab(t.id)}
            className={`font-body text-sm px-4 py-2 rounded-full whitespace-nowrap transition ${
              tab === t.id ? "bg-brand-gold/20 text-brand-gold" : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === "email" && (
        <>
          <div className="flex gap-1 mb-6 border-b border-[var(--app-border)] overflow-x-auto">
            {EMAIL_VIEWS.map((v) => (
              <button key={v.id} onClick={() => onSelectEmailView(v.id)}
                className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  emailView === v.id ? "text-brand-gold border-brand-gold" : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
                }`}>{v.label}</button>
            ))}
          </div>
          {emailView === "inbox"     && <EmailInboxTab />}
          {emailView === "compose"   && <EmailComposeTab />}
          {emailView === "templates" && <EmailTemplatesTab />}
        </>
      )}
      {tab === "sms"         && <SmsTab />}
      {tab === "phone"       && <PhoneTab />}
      {tab === "automations" && <WorkflowsPanel />}
      {tab === "team-chat"   && <TeamChatPanel />}
      {tab === "channels"    && <ChannelsListPanel />}
    </div>
  );
}

export default function Page() {
  return <Suspense><CommunicationsHostInner /></Suspense>;
}
```

- [ ] **Step 4: Build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. All six tabs render. Email sub-tabs switch.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/communications/
git commit -m "feat(communications): convert page into tabbed host — Email/SMS/Phone/Automations/Team Chat/Channels"
```

---

### Task 10: Update `ADMIN_NAV_ITEMS_MAP` and `ADMIN_NAV_IDS_DEFAULT`

**Files:**
- Modify: `src/app/(admin)/admin/layout.tsx`

- [ ] **Step 1: Remove individual entries from `ADMIN_NAV_ITEMS_MAP`**

Delete these keys: `workflows`, `chat`, `support`, `teamChat`, `channels`, `partnerDmFlags` (any that exist). Keep `communications` but replace its value with a group.

- [ ] **Step 2: Add the two new group entries**

```ts
communications: {
  id: "communications",
  icon: "💬",
  label: "Communications",
  children: [
    { id: "communications:email",       href: "/admin/communications?tab=email",       icon: "📧", label: "Email" },
    { id: "communications:sms",         href: "/admin/communications?tab=sms",         icon: "📱", label: "SMS" },
    { id: "communications:phone",       href: "/admin/communications?tab=phone",       icon: "📞", label: "Phone" },
    { id: "communications:automations", href: "/admin/communications?tab=automations", icon: "⚡", label: "Automations" },
    { id: "communications:team-chat",   href: "/admin/team-chat",                      icon: "💬", label: "Team Chat" },
    { id: "communications:channels",    href: "/admin/channels",                       icon: "📣", label: "Channels" },
  ],
},
partnerSupport: {
  id: "partnerSupport",
  icon: "🎧",
  label: "Partner Support",
  children: [
    { id: "partnerSupport:tickets",  href: "/admin/support?tab=tickets",  icon: "📩", label: "Support Tickets" },
    { id: "partnerSupport:livechat", href: "/admin/support?tab=livechat", icon: "💬", label: "Live Chat Support" },
    { id: "partnerSupport:dmflags",  href: "/admin/support?tab=dmflags",  icon: "🚩", label: "DM Flags" },
  ],
},
```

- [ ] **Step 3: Update `ADMIN_NAV_IDS_DEFAULT`**

```ts
const ADMIN_NAV_IDS_DEFAULT = [
  "partners", "deals", "reporting",
  "communications", "partnerSupport",
  "training", "conference", "documents",
  "settings", "users", "features", "dev",
];
```

- [ ] **Step 4: Integrate `reconcileNavOrder` into the layout's nav-order loader**

Find where the layout reads `portalSettings.navOrder`. After parsing, pass through `reconcileNavOrder(saved, ADMIN_NAV_IDS_DEFAULT)` so stale IDs silently drop and new group IDs append.

- [ ] **Step 5: Build — every admin page should still load**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(admin\)/admin/layout.tsx
git commit -m "feat(admin-nav): two new groups (Communications, Partner Support) + stale-id reconcile"
```

---

### Task 11: Update `ROLE_VISIBLE_NAV` per role

**Files:**
- Modify: `src/lib/permissions.ts`

- [ ] **Step 1: Rewrite each role's nav array**

Before:
```ts
super_admin: ["partners", "deals", "communications", "training", "conference", "documents", "support", "chat", "payouts", "revenue", "reports", "settings", "users", "dev", "features", "workflows"],
admin:       [..., "support", "chat", "workflows", ...],
accounting:  ["deals", "documents", "payouts", "revenue", "reports"],
partner_support: ["partners", ..., "support", "chat", ...],
```

After:
```ts
super_admin: ["partners", "deals", "communications", "partnerSupport", "training", "conference", "documents", "settings", "users", "features", "dev", "reporting"],
admin:       ["partners", "deals", "communications", "partnerSupport", "training", "conference", "documents", "reporting", "settings"],
accounting:  ["deals", "documents", "reporting"],
partner_support: ["partners", "deals", "communications", "partnerSupport", "training", "conference", "documents", "reporting", "settings"],
```

(Note: I consolidated "reports" + "revenue" + "payouts" into the existing `reporting` group ID — if current implementation uses individual IDs, check before changing and keep the status-quo reporting key.)

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/next build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/permissions.ts
git commit -m "feat(permissions): role nav arrays updated for Communications + Partner Support groups"
```

---

### Task 12: Update Settings → Navigation customizer registry

**Files:**
- Modify: `src/app/(admin)/admin/settings/page.tsx`

- [ ] **Step 1: Rewrite `ALL_ADMIN_NAV_ITEMS`**

```ts
const ALL_ADMIN_NAV_ITEMS = [
  { id: "partners", label: "Partners", icon: "👥" },
  { id: "deals", label: "Deals", icon: "📋" },
  { id: "communications", label: "Communications", icon: "💬" },
  { id: "partnerSupport", label: "Partner Support", icon: "🎧" },
  { id: "training", label: "Training", icon: "📖" },
  { id: "conference", label: "Live Weekly", icon: "📹" },
  { id: "documents", label: "Documents", icon: "📁" },
  { id: "reporting", label: "Reporting", icon: "📈" },
  { id: "settings", label: "Settings", icon: "⚙️" },
  { id: "users", label: "Admin Users", icon: "🔐" },
  { id: "dev", label: "Development", icon: "🛠️" },
  { id: "features", label: "Feature Requests", icon: "💡" },
];
```

(Items removed from the customizable list: `workflows`, `chat`, `support`. They're no longer top-level entries.)

- [ ] **Step 2: Integrate `reconcileNavOrder` into the settings loader too**

On load (the effect that parses `settings.navOrder`), wrap the parsed value through `reconcileNavOrder(saved, ALL_ADMIN_NAV_ITEMS.map(n => n.id))` so the customizer UI shows clean rows even if a prior admin saved an order with since-removed IDs.

- [ ] **Step 3: Build + commit**

```bash
./node_modules/.bin/next build
git add src/app/\(admin\)/admin/settings/page.tsx
git commit -m "feat(settings): Navigation editor registry updated to new group IDs + reconcile"
```

---

### Task 13: Final sweep — constraint verification + sidebar smoke test

**Files:** none (verification only)

- [ ] **Step 1: Confirm webhook + API + Prisma untouched**

```bash
git log --oneline main.. -- src/app/api/webhook/referral/route.ts prisma/schema.prisma
```

Expected: empty output.

```bash
git log --oneline main.. -- 'src/app/api/**/*.ts'
```

Expected: empty (no API handler changes in this plan).

- [ ] **Step 2: Run all unit tests**

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' src/lib/__tests__/reconcileNavOrder.test.ts
```

Expected: `5 passed, 0 failed`.

- [ ] **Step 3: Final build**

```bash
./node_modules/.bin/next build
```

Expected: `✓ Compiled successfully`. All admin routes in the prerender list.

---

### Task 14: PR

- [ ] **Step 1: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(admin): consolidate sidebar into Communications + Partner Support groups" --body "$(cat <<'EOF'
## Summary

Collapse 6 scattered admin-sidebar entries into two new groups:

- **Communications** group: Email (Inbox/Compose/Templates) + SMS + Phone + Automations + Team Chat + Channels
- **Partner Support** group: Support Tickets + Live Chat Support + DM Flags

Top-level nav drops from 17 → 11. All existing routes keep rendering identically via thin-wrapper \`page.tsx\` files. Old notification deep-links still resolve. New \`reconcileNavOrder\` helper silently migrates saved nav-orders that reference removed IDs.

Implements \`docs/superpowers/specs/2026-04-20-admin-nav-consolidation-design.md\`.

## Changes

- Extract 6 panel components (TeamChat, Channels, Workflows, LiveChat, SupportTickets, DmFlagsList)
- Convert \`/admin/communications\` and \`/admin/support\` into tabbed host pages
- Sidebar registry: remove 6 individual entries, add 2 group entries
- \`ROLE_VISIBLE_NAV\` per role updated
- Settings → Navigation customizer uses new group IDs
- \`reconcileNavOrder\` helper + 5 unit tests

## Strictly NOT touched
- \`/api/webhook/referral\`
- Any API handler, Prisma model, or business logic
- No URL changes — all 6 old routes still render their panels

## Test plan

- [ ] 5/5 pass on \`reconcileNavOrder\` tests
- [ ] Admin sees 11 top-level entries (12 with Development for super_admin)
- [ ] Communications tabs navigate correctly (Email sub-tabs work)
- [ ] Partner Support tabs navigate correctly
- [ ] Direct links to \`/admin/team-chat\`, \`/admin/channels\`, \`/admin/workflows\`, \`/admin/chat\`, \`/admin/support\`, \`/admin/partner-dm-flags\` still render identical behavior
- [ ] Settings → Navigation shows two new reorderable rows
- [ ] Existing notification \`link\` fields still open correctly
- [ ] CI green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Stop — do not merge.**

---

## Out of scope (from the spec)

- Per-group child reordering (drag-and-drop for sub-items within a group)
- New icons
- Collapsing group state persistence
- Any functional change inside extracted panels — these are pure moves
