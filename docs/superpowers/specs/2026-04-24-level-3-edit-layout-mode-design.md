# Level 3 — Edit Layout Mode (spec)

**Date:** 2026-04-24
**Status:** Phase A implementing. Phases B-D queued for future sessions.
**Source:** John verbatim 2026-04-24: *"Make all our portals editable by having an Edit Layout button and basically showing the screen we're on in the partner portal or in the admin portal and be able to drag and change order of sections, or any text styles / fonts / backgrounds / add widgets … every page of both sides of the portal."*

Ambition: a floating **Edit Layout** button visible only to the ⭐ star super admin on every page of both portals. Click → inline edit mode where text, section ordering, visibility, and new sections can all be modified without a developer.

## Rollout — A → B → C → D (in order, one per PR)

| Phase | What ships | Primitive introduced | Est. scope |
|---|---|---|---|
| **A — Inline text edit** | Star super admin can click any `<EditableText>` marker, edit inline, blur-to-save | Registry + contentEditable wrapper, 1 marked page | 1 PR |
| **B — Visibility toggles** | Toggle entire marked sections on/off per-page | `<EditableSection visibleWhen={...}>` wrapper | 1 PR |
| **C — Section reorder** | Drag-reorder marked sections on a page | Section order persisted on PortalSettings | 1-2 PRs |
| **D — Add/remove sections** | Pull from a section-type registry; add a "Promo Banner" section anywhere | Section registry + type-scoped editors | 2-3 PRs |

Each phase reuses the primitive from the previous phase. Each phase works on ONE page first (partner `/dashboard/home`), then gradually gets sprinkled onto other pages as admins request it — this is Option C (hybrid) from the earlier sketch, starting minimal and organic.

## Architecture — chosen

**Approach: Registry-based opt-in markers. NOT a Webflow-style DOM overlay.**

Why:
- We don't own the DOM contract of every page (React re-renders, client routing, Next.js server components). A DOM overlay editor is fragile against upstream JSX changes — every code edit risks breaking the overlay's tags.
- A registry-based marker system means:
  - Developers explicitly wrap editable regions with `<EditableText id="home.hero.headline" fallback="Welcome back">`
  - The ID is a stable key into `PortalSettings.pageTextOverrides` (or equivalent blob)
  - Upstream code changes to the wrapped component are fine — the ID + fallback stay stable
  - We never need to parse/walk the DOM to find "editable stuff"
- Pages are migrated one-at-a-time by swapping hardcoded strings for `<EditableText>` — follows the same gradual pattern we use for glossary tooltips + admin overrides
- The cost is upfront: every editable region is a developer action to mark. The benefit is long-term: no fragile overlay, no schema-driven page rewrite, no lock-in to a specific editor framework.

### Comparable systems

| System | What they do | Steal | Avoid |
|---|---|---|---|
| **Webflow** | Full DOM-level WYSIWYG | None (too complex for our need) | Locking into a proprietary schema |
| **Framer** | Component + properties side-panel | Properties-panel UX when we get to Phase D section-type registry | Over-engineering before we have a use case |
| **Notion** | Block-based, every block has a type | Block-type registry idea for Phase D | Don't force everything into "blocks" — some regions are just paragraphs |
| **Sanity Studio** | Schema-driven CMS | Schema-as-source-of-truth for overrides | Don't ship a separate CMS app; keep editing in-portal |
| **Ghost / Wordpress Gutenberg** | Block editor + shortcodes | Shortcode-ish `<EditableText id="…">` pattern | Don't let admins write HTML — stay visual |

Key insight from Notion + Framer: **the primitive matters more than the visual editor.** Phase A ships the primitive (`<EditableText>`), and every subsequent phase is "compose this primitive with one more capability."

## Phase A — inline text edit (implementing now)

### Schema

Single new nullable Json field on `PortalSettings`:

```prisma
pageTextOverrides Json?  // { "<page>.<section>.<key>": "override string", ... }
```

Shape example:
```json
{
  "home.hero.headline": "Welcome back, partner.",
  "home.announcements.title": "Latest from the Fintella team"
}
```

No schema migration risk — additive nullable JSON.

### Library

`src/lib/page-text-overrides.ts`:
- `getOverride(id: string): Promise<string | null>` — server read, cached per-request
- `getAllOverrides(): Promise<Record<string, string>>` — for hydrating the edit mode UI
- `setOverride(id: string, value: string | null): Promise<void>` — admin-only

### API

`POST /api/admin/page-overrides` — `{ id, value }` — star super admin only
- `value === null` or empty string → remove override (revert to fallback)
- otherwise → upsert

`GET /api/admin/page-overrides` — list all current overrides (for the edit mode to hydrate)

### Client component

`<EditableText id="home.hero.headline" fallback="Welcome back" as="h1" className="…">`:
- In display mode (everyone): reads the override via server prop or client fetch; falls back to `fallback`
- In edit mode (star super admin, toggled): wraps in a `contentEditable` span, saves on blur
- Uses `useEditLayout()` context to know if edit mode is active

### Edit-mode context

`<EditLayoutProvider>` mounted inside `(admin)/admin/layout.tsx` + `(partner)/dashboard/layout.tsx`:
- Star super admin only — gated via `isStarSuperAdminEmail(session.user.email)`
- Provides `{ editMode, toggleEditMode, overrides, refresh }`
- Hydrates `overrides` once via `GET /api/admin/page-overrides` on mount

### Floating button

`<EditLayoutButton />` mounted in both layouts:
- Fixed bottom-right corner
- Gear icon + "Edit Layout" label
- Visible ONLY to star super admin
- Click toggles edit mode via context
- In edit mode: changes label to "✓ Done editing"

### First-page migration

Partner `/dashboard/home`:
- Wrap the hero greeting in `<EditableText id="home.greeting" fallback="Welcome back">`
- Wrap the Announcements section title in `<EditableText id="home.announcements.title" fallback="Announcements">`

That's it for Phase A. Ships the primitive, proves the pattern, gets one page editable.

## Phase B — section visibility toggles (future PR)

Extend the marker with `<EditableSection id="home.announcements">` that wraps a whole block. Adds a `hidden: true` flag to `pageTextOverrides` (or a sibling blob). Edit mode gains a small "Hide section" control on each wrapped region. Same stable-id contract.

## Phase C — section reorder (future PR)

Sections gain explicit `order` integers. Edit mode gains drag-handles on each `<EditableSection>`. Page render reads the order array from `pageSectionOrder` blob and reorders its children accordingly.

## Phase D — section add/remove (future PR)

Section-type registry (`Hero`, `FeatureGrid`, `CTABanner`, `Divider`, `PromoBanner`, etc.). Edit mode gains a "+ Add section" button between any two sections, opening a type picker. Each section type has its own editor schema. This is essentially the Level 2 landing builder primitives, generalized.

## Explicitly NOT in scope

- Visual style / color / font editing (separate primitive — add after D)
- Arbitrary widget embedding (Notion-style)
- Multi-tenant scoping (tier / role visibility per-section) — can bolt on later
- Version history / undo (page overrides are last-write-wins for now)

## Rollback strategy

Every override lives in one JSON blob on `PortalSettings`. A single `DELETE` resets the page. No page change requires a code deploy — the fallback string lives in the wrapper component, always correct.

## Open questions (for later phases)

- Star super admin only, or all super admins? (Phase A: star only. Revisit at Phase C.)
- Draft → publish flow or live edits? (Phase A: live. Scary but simple. Revisit if it bites.)
- Per-page permissions (partner_support can edit partner-facing copy only)? (Not v1.)
- Localization — do overrides need language scoping? (Not v1; English only.)
