# Admin Navigation Consolidation — Design

**Date:** 2026-04-20
**Status:** Approved for implementation (after partner-DM PR lands)
**Surface:** admin sidebar across all `/admin/*` pages, plus Settings → Navigation drag-and-drop editor.

## Goal

Fix the admin sidebar bloat by grouping the 6 communication / support surfaces that have accumulated this week. The admin nav drops from 17 top-level entries to 11. Zero existing routes break; all deep links keep working. Every new group is reorderable in the existing Settings → Navigation editor.

## Non-goals (v1)

- No change to the partner-side `/dashboard` sidebar.
- No change to any underlying page's functionality — we only restructure the sidebar + add two lightweight tabbed host pages.
- Not introducing a new nav-customization mechanism — we reuse the existing `portalSettings.navOrder` storage.

## New top-level groups

### Group: Communications

Replaces the current flat "Communications" entry with a nested group. Children:

- **Email** — the current email-template + compose UX, now with three sub-sub-tabs: Inbox, Compose, Templates.
- **SMS** — SMS logs + compose, mirrors Email.
- **Phone** — call log + click-to-call.
- **Automations** — the current top-level "Workflows" page, relocated and renamed.
- **Team Chat** — the current top-level "Team Chat" page, relocated (route stays `/admin/team-chat`).
- **Channels** — the current top-level "Channels" page, relocated (route stays `/admin/channels`).

### Group: Partner Support

Brand-new group. Children:

- **Support Tickets** — the current top-level "Support" page, relocated (route stays `/admin/support`).
- **Live Chat Support** — the current top-level "Live Chat" page, relocated (route stays `/admin/chat`).
- **DM Flags** — the partner-DM flag inbox from the in-flight partner-DM PR (route stays `/admin/partner-dm-flags`).

### Top-level entries removed (relocated into groups)

- `workflows` → Communications › Automations
- `teamChat` → Communications › Team Chat
- `channels` → Communications › Channels
- `support` → Partner Support › Support Tickets
- `chat` → Partner Support › Live Chat Support
- `partnerDmFlags` → Partner Support › DM Flags

### Final top-level (11 entries, down from 17)

```
Partners
Deals
Reporting (existing group, unchanged — Reports / Revenue / Custom Commissions / Payouts)
Communications (NEW group — 6 children)
Partner Support (NEW group — 3 children)
Training
Live Weekly
Documents
Settings
Admin Users
Feature Requests
Development
```

(12 listed — Development is super_admin-only, others are role-gated per existing matrix.)

## Route compatibility

**No existing routes are removed.** All URLs keep working for deep links, notifications, webhook link fields, and bookmarks:

- `/admin/workflows` stays — now the default target of `Communications > Automations`.
- `/admin/team-chat` stays — Communications > Team Chat.
- `/admin/channels` (list + `/[id]` detail) stays — Communications > Channels.
- `/admin/support` stays — Partner Support > Support Tickets.
- `/admin/chat` stays — Partner Support > Live Chat Support.
- `/admin/partner-dm-flags` (list + `/[id]` detail) stays — Partner Support > DM Flags.

Old notification `link` fields (e.g. `/admin/team-chat?threadId=…`, `/admin/partner-dm-flags/<id>`) continue to resolve.

The new group hosts `/admin/communications` and `/admin/support` ARE themselves routes — they are NOT redirects. They're tabbed pages that let the admin pick a sub-surface or default to the first child.

## Communications host page (`/admin/communications`)

**Two levels of tabs:**

Top-level (horizontal pill tabs across the top):
- Email (default)
- SMS
- Phone
- Automations
- Team Chat
- Channels

**Email tab has its own second-level tabs (nested):**
- Inbox (default)
- Compose
- Templates

Clicking "Team Chat" doesn't navigate to `/admin/team-chat` — it switches the second pane of this host page to EMBED the existing Team Chat UI (same component). Same for Channels and Automations. We extract the page bodies into reusable components that can be imported BOTH as the `/admin/team-chat` default page AND as a tab inside `/admin/communications`. This avoids duplication.

URL encoding of the tab state:
- `?tab=email&view=inbox` (default)
- `?tab=team-chat` → routes within the host page's internal state
- Also: `/admin/team-chat` still works as a direct link and renders the same component

**Permission inheritance:** each child tab runs its own permission check server-side (unchanged from today). The host page has no additional permission gate beyond `isAnyAdmin`.

## Partner Support host page (`/admin/support`)

Top-level pill tabs:
- Support Tickets (default) — renders the same component that `/admin/support` renders today
- Live Chat Support — embeds the existing `/admin/chat` component
- DM Flags — embeds the partner-DM-flag inbox component (from the in-flight PR)

Same URL encoding + same permission inheritance.

## Component extraction

For each of these pages, extract the body from the current top-level `page.tsx` into a sibling component that exports the UI:

| Current file | Extract to | Reuse in |
|---|---|---|
| `src/app/(admin)/admin/team-chat/page.tsx` | `src/app/(admin)/admin/team-chat/TeamChatPanel.tsx` | both `/team-chat` page AND Communications host |
| `src/app/(admin)/admin/channels/page.tsx` | `src/app/(admin)/admin/channels/ChannelsListPanel.tsx` | both `/channels` page AND Communications host |
| `src/app/(admin)/admin/workflows/page.tsx` | `src/app/(admin)/admin/workflows/WorkflowsPanel.tsx` | both `/workflows` page AND Communications host |
| `src/app/(admin)/admin/chat/page.tsx` | `src/app/(admin)/admin/chat/LiveChatPanel.tsx` | both `/chat` page AND Partner Support host |
| `src/app/(admin)/admin/support/page.tsx` | `src/app/(admin)/admin/support/SupportTicketsPanel.tsx` | both `/support` page AND Partner Support host |
| `src/app/(admin)/admin/partner-dm-flags/page.tsx` | `src/app/(admin)/admin/partner-dm-flags/DmFlagsListPanel.tsx` | both `/partner-dm-flags` page AND Partner Support host |

Each extraction is a pure move-and-import: no behavior change. The top-level page file becomes a thin wrapper:

```tsx
// src/app/(admin)/admin/team-chat/page.tsx (after extraction)
import TeamChatPanel from "./TeamChatPanel";
export default function Page() { return <TeamChatPanel />; }
```

The Communications host then imports `TeamChatPanel` directly when its `Team Chat` tab is active.

## Sidebar layout changes

### `src/app/(admin)/admin/layout.tsx` — `ADMIN_NAV_ITEMS_MAP` adds two group entries

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
    { id: "partnerSupport:tickets",  href: "/admin/support",            icon: "📩", label: "Support Tickets" },
    { id: "partnerSupport:livechat", href: "/admin/chat",               icon: "💬", label: "Live Chat Support" },
    { id: "partnerSupport:dmflags",  href: "/admin/partner-dm-flags",   icon: "🚩", label: "DM Flags" },
  ],
},
```

### `ADMIN_NAV_IDS_DEFAULT` changes

Replace the old flat list:
- Remove: `communications` (old flat entry), `workflows`, `chat`, `support`, `teamChat`, `channels`, `partnerDmFlags`
- Add in their place: `communications` (now a group), `partnerSupport` (new group)

```ts
const ADMIN_NAV_IDS_DEFAULT = [
  "partners", "deals", "reporting",
  "communications",      // group
  "partnerSupport",      // group
  "training", "conference", "documents",
  "settings", "users", "features", "dev",
];
```

### Existing rendering is already group-aware

`src/app/(admin)/admin/layout.tsx` already distinguishes `NavLeaf | NavGroup` via the `isGroup()` helper (verified earlier this session). So rendering a group with children just works — same pattern as the existing `reporting` group.

## Permission matrix changes

`src/lib/permissions.ts` — `ROLE_VISIBLE_NAV` for each role gets updated:

**Before → after per role:**

- **super_admin:** `[...previous, "workflows", "teamChat", "channels", "chat", "support", "partnerDmFlags"]` → remove those 6, add `"partnerSupport"` (Communications was already there). Team Chat/Channels/Workflows are reachable via the Communications group.
- **admin, accounting, partner_support:** similar — each role loses the individual entries for things they had, gains the groups they're allowed to see.

**Key rule:** a role sees a group in the sidebar if it has permission for ANY of the group's children. The render loop in `layout.tsx` filters children by per-child permission so role-gated sub-tabs still hide appropriately.

**Concrete per-role membership for the new groups:**

Communications group:
- super_admin, admin: all 6 children visible
- accounting: only Email / SMS / Phone / Automations (no internal chat surfaces) — TBD, matches current practice
- partner_support: all 6 children visible (matches current role access)

Partner Support group:
- super_admin, admin, partner_support: all 3 children
- accounting: group hidden (no access to Tickets, Live Chat, DM Flags today)

Final per-role nav IDs recorded explicitly in the plan.

## Settings → Navigation editor updates

`src/app/(admin)/admin/settings/page.tsx` — `ALL_ADMIN_NAV_ITEMS` updates:

```ts
const ALL_ADMIN_NAV_ITEMS = [
  { id: "partners", label: "Partners", icon: "👥" },
  { id: "deals", label: "Deals", icon: "📋" },
  { id: "communications", label: "Communications", icon: "💬" },    // now a group; label applies to group node
  { id: "partnerSupport", label: "Partner Support", icon: "🎧" },   // NEW
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

Removed from customizer (no longer top-level reorderable): `workflows`, `chat`, `support`. (`teamChat`, `channels`, `partnerDmFlags` were already inside groups before consolidation from a customizer standpoint, or added in-flight — they don't appear as separate reorderable top-level rows.)

**Note on group-children reordering:** v1 does NOT add drag-and-drop for child order within a group. Children render in the hardcoded order defined in `ADMIN_NAV_ITEMS_MAP`. A follow-up can layer per-group child reordering via a new `navChildOrder` JSON map in settings. Out of scope for this spec.

## Migration for existing saved `navOrder` values

`portalSettings.navOrder` is a JSON string array of nav IDs. Any existing saved order may reference IDs that no longer exist (e.g. `"workflows"`, `"chat"`) or be missing the two new group IDs.

**On load (`src/app/(admin)/admin/layout.tsx` + settings page):**
1. Parse saved `navOrder`. Filter out any id not in the current `ALL_ADMIN_NAV_ITEMS` / `ADMIN_NAV_ITEMS_MAP`. (Graceful skip of stale ids.)
2. Append any ids that exist in the current map but are missing from the saved order. (So `communications` group and `partnerSupport` group appear at the bottom if a user had a customized order pre-this-change.)
3. Use this reconciled list for rendering.

No data migration script needed — the reconcile is live on every load. Settings page saves back the reconciled list the first time an admin opens Settings → Navigation post-deploy (writes the tidy-ed JSON), which silently cleans up the stored value.

## Files touched

**New:**
- `src/app/(admin)/admin/communications/` — if the existing flat Communications page is repurposed as the host, no new top-level page file. But 6 panel files are extracted:
  - `src/app/(admin)/admin/team-chat/TeamChatPanel.tsx`
  - `src/app/(admin)/admin/channels/ChannelsListPanel.tsx` (plus `ChannelsDetailPanel.tsx` if the `[id]` detail page also gets extracted — analyze at plan time)
  - `src/app/(admin)/admin/workflows/WorkflowsPanel.tsx`
  - `src/app/(admin)/admin/chat/LiveChatPanel.tsx`
  - `src/app/(admin)/admin/support/SupportTicketsPanel.tsx`
  - `src/app/(admin)/admin/partner-dm-flags/DmFlagsListPanel.tsx`
- `src/app/(admin)/admin/support/page.tsx` gets converted from the "Support Tickets" page into the Partner Support tabbed host. The old ticket UI body moves into `SupportTicketsPanel.tsx`.

**Modified:**
- `src/app/(admin)/admin/communications/page.tsx` — the existing flat Communications page becomes the Communications tabbed host. Existing email-template CRUD moves into its Email tab under Templates sub-tab.
- `src/app/(admin)/admin/layout.tsx` — `ADMIN_NAV_ITEMS_MAP` + `ADMIN_NAV_IDS_DEFAULT` restructured as above
- `src/app/(admin)/admin/settings/page.tsx` — `ALL_ADMIN_NAV_ITEMS` updated
- `src/lib/permissions.ts` — `ROLE_VISIBLE_NAV` per role updated to reference the new group IDs
- Six `page.tsx` files reduce to thin wrappers that import their extracted `*Panel` component (team-chat, channels, workflows, chat, support, partner-dm-flags)

**Explicitly NOT touched:**
- `src/app/api/webhook/referral/route.ts`
- Any API route under `/api/admin/*` or `/api/announcements/*` or `/api/partner-dm/*`
- Any Prisma model
- Partner-side dashboard nav

## Error handling

- Deep link to `/admin/communications?tab=unknown` → default to `email` tab, don't error.
- Permission-denied for a tab → tab hidden from the pill bar AND a fallback message if the URL points there directly.
- Old bookmark URL (e.g. `/admin/workflows`) → still renders the same panel via its thin-wrapper page.
- Migration for saved `navOrder` with stale IDs → silent reconcile (see Migration section).

## Testing

Manual (after deploy):
- Admin sees 11 top-level sidebar entries (12 with Development for super_admin).
- Communications group expands; each child tab works.
- Email tab's nested Inbox/Compose/Templates switch correctly.
- Direct links to `/admin/team-chat`, `/admin/channels`, `/admin/workflows`, `/admin/chat`, `/admin/support`, `/admin/partner-dm-flags` still render identical behavior to pre-change.
- Settings → Navigation shows Communications + Partner Support as drag-reorderable rows; save applies; nav order persists across reloads.
- Admin who had a customized nav order before this change sees their old items merged in + the two new groups appended.

Unit tests (none new) — this is primarily UI restructuring and one reconcile helper:
- `src/lib/__tests__/reconcileNavOrder.test.ts` — 4 cases: (1) saved list has stale IDs, (2) saved list missing new IDs, (3) empty saved list, (4) perfect saved list.

## Implementation dependency ordering

1. The partner-DM subagent's PR must land first (it adds `partnerDmFlags` as a top-level entry, which this consolidation then moves into the Partner Support group).
2. Then this consolidation lands as a single PR.

## Out of v1

- Drag-and-drop for child order within a group (plain hardcoded order in v1).
- New icons beyond what's mapped here.
- Collapsing group state persistence (each admin's expanded/collapsed groups reset per session in v1).
- Any new functionality inside Email / SMS / Phone sub-tabs beyond what's already built. Compose/Inbox/Templates for Email wire to the existing email-template CRUD + inbound-email log surfaces that already exist.
