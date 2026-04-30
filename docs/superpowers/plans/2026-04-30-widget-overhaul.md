# Widget Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the widget from a basic light-mode Tailwind prototype into a polished fintech-grade dark glass UI with full functional coverage (referral history, document persistence, calculator handoff, AI assistant, portal footer).

**Architecture:** Shared widget theme tokens → restyle all 5 components + page shell → add new functional components (footer, chat, confirmation modal) → schema migration for document URLs → performance optimizations. Components are independent after the theme file is created, enabling parallel work.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, Prisma 5.20, @vercel/blob 2.3.3, @anthropic-ai/sdk, inline styles with shared COLORS constant

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/widget/widget-theme.ts` | Shared COLORS, SHADOWS, RADII, FONTS constants for all widget components |
| `src/components/widget/WidgetFooter.tsx` | "Powered by Fintella" footer with portal link |
| `src/components/widget/WidgetChat.tsx` | AI help assistant scoped to TMS widget |
| `src/components/widget/ConfirmModal.tsx` | Reusable glass-morphism confirmation popup |
| `src/app/api/widget/chat/route.ts` | AI chat endpoint for widget help bot |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/widget/page.tsx` | Dark shell, new tabs (Help), lazy loading, footer |
| `src/app/widget/layout.tsx` | Dark background, font imports |
| `src/components/widget/WidgetDashboard.tsx` | Full restyle, clickable referrals, confirmation modal |
| `src/components/widget/WidgetCalculator.tsx` | Restyle using shared theme, blob upload on referral submit |
| `src/components/widget/WidgetReferralForm.tsx` | Restyle, prefill summary card |
| `src/components/widget/WidgetHowItWorks.tsx` | Full restyle to dark glass |
| `src/app/api/widget/stats/route.ts` | Return 10 referrals instead of 5 |
| `src/app/api/widget/referral/route.ts` | Accept documentUrls field |
| `prisma/schema.prisma` | Add documentUrls to WidgetReferral |

---

## Task 1: Widget Theme Tokens + Schema Migration

**Files:**
- Create: `src/components/widget/widget-theme.ts`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Create shared widget theme file**

Create `src/components/widget/widget-theme.ts`:

```typescript
export const W = {
  bg: "#060a14",
  bgCard: "rgba(255,255,255,0.03)",
  bgCardHover: "rgba(255,255,255,0.06)",
  bgInput: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  borderFocus: "#c4a050",
  text: "rgba(255,255,255,0.95)",
  textSecondary: "rgba(255,255,255,0.6)",
  textDim: "rgba(255,255,255,0.35)",
  gold: "#c4a050",
  goldLight: "#f0d070",
  goldGlow: "rgba(196,160,80,0.3)",
  goldGlowStrong: "rgba(196,160,80,0.45)",
  blue: "#4f6ef7",
  green: "#22c55e",
  greenBg: "rgba(34,197,94,0.1)",
  red: "#ef4444",
  redBg: "rgba(239,68,68,0.1)",
  amber: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
} as const;

export const SHADOWS = {
  card: "0 2px 12px rgba(0,0,0,0.3)",
  cardHover: "0 4px 20px rgba(0,0,0,0.4)",
  goldCta: "0 4px 20px rgba(196,160,80,0.3)",
  goldCtaHover: "0 6px 28px rgba(196,160,80,0.45)",
  modal: "0 16px 48px rgba(0,0,0,0.5)",
  input: "0 0 0 3px rgba(196,160,80,0.15)",
} as const;

export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  submitted: { bg: "rgba(245,158,11,0.12)", text: "#fbbf24", border: "rgba(245,158,11,0.2)" },
  contacted: { bg: "rgba(59,130,246,0.12)", text: "#60a5fa", border: "rgba(59,130,246,0.2)" },
  qualified: { bg: "rgba(168,85,247,0.12)", text: "#c084fc", border: "rgba(168,85,247,0.2)" },
  converted: { bg: "rgba(34,197,94,0.12)", text: "#4ade80", border: "rgba(34,197,94,0.2)" },
  rejected: { bg: "rgba(239,68,68,0.12)", text: "#f87171", border: "rgba(239,68,68,0.2)" },
};

export function goldGradientStyle(): React.CSSProperties {
  return {
    background: "linear-gradient(135deg, #c4a050, #f0d070)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };
}

export function goldButtonStyle(disabled = false): React.CSSProperties {
  return {
    background: disabled ? "rgba(196,160,80,0.3)" : "linear-gradient(135deg, #c4a050, #f0d070)",
    color: "#060a14",
    fontWeight: 700,
    padding: "14px 28px",
    borderRadius: RADII.md,
    border: "none",
    boxShadow: disabled ? "none" : SHADOWS.goldCta,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
    fontSize: 14,
    width: "100%",
    opacity: disabled ? 0.5 : 1,
  };
}

export function glassCardStyle(hover = false): React.CSSProperties {
  return {
    background: hover ? W.bgCardHover : W.bgCard,
    border: `1px solid ${hover ? W.borderHover : W.border}`,
    borderRadius: RADII.lg,
    backdropFilter: "blur(12px)",
    transition: "all 0.2s ease",
  };
}

export function inputStyle(focused = false): React.CSSProperties {
  return {
    background: W.bgInput,
    border: `1px solid ${focused ? W.borderFocus : "rgba(255,255,255,0.08)"}`,
    borderRadius: RADII.sm + 2,
    color: W.text,
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxShadow: focused ? SHADOWS.input : "none",
    transition: "all 0.2s ease",
  };
}
```

- [ ] **Step 2: Add documentUrls to WidgetReferral schema**

In `prisma/schema.prisma`, add to the WidgetReferral model after the `notes` field:

```prisma
  documentUrls      String[]  // Vercel Blob URLs for uploaded documents
```

- [ ] **Step 3: Run prisma generate**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add src/components/widget/widget-theme.ts prisma/schema.prisma
git commit -m "feat: widget theme tokens + documentUrls schema field"
```

---

## Task 2: Widget Shell + Layout + Footer

**Files:**
- Modify: `src/app/widget/layout.tsx`
- Modify: `src/app/widget/page.tsx`
- Create: `src/components/widget/WidgetFooter.tsx`
- Create: `src/components/widget/ConfirmModal.tsx`

- [ ] **Step 1: Restyle layout.tsx**

Replace the layout body styling from light to dark:

```typescript
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fintella Partner Widget",
  robots: { index: false, follow: false },
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#060a14", color: "rgba(255,255,255,0.95)", maxWidth: 420, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create ConfirmModal component**

Create `src/components/widget/ConfirmModal.tsx`:

Glass-morphism modal with backdrop blur overlay. Props: `open`, `title`, `body`, `confirmLabel`, `onConfirm`, `onCancel`. Uses W colors, SHADOWS, gold button for confirm, ghost button for cancel. Renders null when `!open`. Backdrop: `position: fixed, inset: 0, background: rgba(0,0,0,0.65), backdropFilter: blur(8px)`. Modal card: glass card style with SHADOWS.modal.

- [ ] **Step 3: Create WidgetFooter component**

Create `src/components/widget/WidgetFooter.tsx`:

36px fixed footer at bottom. Left: "F" logo mark (gold, 12px) + "Powered by Fintella" (11px, dim text). Right: "Open Portal →" link. Both link to `https://fintella.partners/dashboard`. Separator line at top: `border-top: 1px solid rgba(255,255,255,0.06)`. Background matches W.bg.

- [ ] **Step 4: Restyle page.tsx shell**

Transform the widget page.tsx:
- Header: dark gradient background (`linear-gradient(135deg, #0c1220, #060a14)`), gold "F" avatar circle, DM Serif Display partner name, commission pill badge
- Tab bar: dark background with gold underline on active tab, pill-style tabs with transition
- Add "Help" tab (5th tab) for AI assistant
- Import and render WidgetFooter below the content area
- Lazy-load WidgetCalculator and WidgetChat with React.lazy + Suspense
- Content area: `flex: 1, overflowY: auto, padding-bottom: 36px` (for footer clearance)

- [ ] **Step 5: Commit**

```bash
git add src/app/widget/ src/components/widget/WidgetFooter.tsx src/components/widget/ConfirmModal.tsx
git commit -m "feat: dark glass widget shell, footer, and confirm modal"
```

---

## Task 3: Restyle WidgetDashboard + Clickable Referrals

**Files:**
- Modify: `src/components/widget/WidgetDashboard.tsx`
- Modify: `src/app/api/widget/stats/route.ts`

- [ ] **Step 1: Update stats API to return 10 referrals**

In `stats/route.ts`, change the `findMany` take from 5 to 10.

- [ ] **Step 2: Restyle WidgetDashboard**

Complete restyle using W theme tokens:
- Stats cards: glass card style, gold gradient text for numbers (DM Serif Display), dim labels
- "Refer a Client →" button: gold gradient CTA with glow shadow
- Recent referrals: glass card list items with hover effect (`bgCardHover`), status badges using `STATUS_COLORS`, company name + date + value
- Clickable referral rows: `cursor: pointer`, hover brightens border, onClick shows ConfirmModal
- Confirmation modal: "Open Fintella Portal?" with Cancel/Open Portal buttons
- On confirm: `window.open('https://fintella.partners/dashboard', '_blank')`
- Loading: gold spinner on dark background
- Error: subtle red glass card with error message

- [ ] **Step 3: Commit**

```bash
git add src/components/widget/WidgetDashboard.tsx src/app/api/widget/stats/route.ts
git commit -m "feat: restyle Dashboard with glass UI + clickable referrals"
```

---

## Task 4: Restyle WidgetReferralForm + Prefill Summary Card

**Files:**
- Modify: `src/components/widget/WidgetReferralForm.tsx`

- [ ] **Step 1: Restyle referral form**

Complete restyle using W theme tokens:
- All inputs: `inputStyle()` from widget-theme, gold focus ring
- Labels: `textSecondary` color, 12px, weight 500
- Grid layout preserved (2-column for name/email)
- Import period checkboxes: dark glass toggle style
- Submit button: `goldButtonStyle()` with dynamic commission text
- Error alert: glass card with red border accent
- Success screen: glass card with green accent, gold gradient tracking ID, "Refer Another" ghost button

- [ ] **Step 2: Add prefill summary card**

When `prefill` prop is provided, render a summary card at the top of the form:
- Glass card with gold left border (3px solid #c4a050)
- "From your calculation:" label in dim text
- Display: estimated value, import period
- Small "Clear" link (ghost style) to call `onPrefillConsumed()`
- Card uses W.bgCardHover background for slight emphasis

- [ ] **Step 3: Commit**

```bash
git add src/components/widget/WidgetReferralForm.tsx
git commit -m "feat: restyle Referral form + calculator prefill card"
```

---

## Task 5: Restyle WidgetCalculator + Blob Upload

**Files:**
- Modify: `src/components/widget/WidgetCalculator.tsx`
- Modify: `src/app/api/widget/referral/route.ts`

- [ ] **Step 1: Update WidgetCalculator COLORS to use W theme**

Replace the existing `COLORS` constant at the top of WidgetCalculator.tsx with an import from `widget-theme.ts`. Update all references from `COLORS.xxx` to `W.xxx` throughout the file. The mapping:
- `COLORS.bg` → `W.bg`, `COLORS.bgCard` → use `glassCardStyle()`, `COLORS.border` → `W.border`
- `COLORS.text` → `W.text`, `COLORS.textMuted` → `W.textSecondary`, `COLORS.textDim` → `W.textDim`
- `COLORS.gold` → `W.gold`, etc.

Update card styling throughout to use `glassCardStyle()` for consistent glass morphism.
Update buttons to use `goldButtonStyle()`.
Update inputs to use `inputStyle()`.

- [ ] **Step 2: Add blob upload on referral submit**

When user clicks "Submit as Referral" in the calculator:
1. If document files exist in state, upload them to Vercel Blob before submitting referral
2. Use `fetch('/api/blob/upload', ...)` or direct `@vercel/blob` client upload
3. Pass the returned blob URLs in the `onSubmitAsReferral` callback as `documentUrls`

Add to the referral prefill data shape:
```typescript
onSubmitAsReferral: (data: {
  estimatedImportValue: string;
  importDateRange: string;
  documentUrls?: string[];
}) => void;
```

- [ ] **Step 3: Update referral API to accept documentUrls**

In `src/app/api/widget/referral/route.ts`, accept `documentUrls` from the request body and pass it to the `prisma.widgetReferral.create()` call:

```typescript
const { documentUrls, ...otherFields } = body;

const referral = await prisma.widgetReferral.create({
  data: {
    ...existingData,
    documentUrls: Array.isArray(documentUrls) ? documentUrls : [],
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/widget/WidgetCalculator.tsx src/app/api/widget/referral/route.ts
git commit -m "feat: restyle Calculator + blob upload for documents"
```

---

## Task 6: Restyle WidgetHowItWorks

**Files:**
- Modify: `src/components/widget/WidgetHowItWorks.tsx`

- [ ] **Step 1: Full restyle**

Transform from light Tailwind to dark glass theme:
- Step containers: glass card style with gold step badges
- Step icons: gold background circles with subtle glow
- Step titles: W.text, 14px, weight 600
- Step descriptions: W.textSecondary, 13px
- $47,000 callout: gold gradient text (DM Serif Display), glass card with gold border accent
- "Who qualifies?" section: glass card with green checkmarks
- Bullet items: W.textSecondary with green `✓` prefix

- [ ] **Step 2: Commit**

```bash
git add src/components/widget/WidgetHowItWorks.tsx
git commit -m "feat: restyle HowItWorks to dark glass theme"
```

---

## Task 7: Widget AI Help Chat

**Files:**
- Create: `src/components/widget/WidgetChat.tsx`
- Create: `src/app/api/widget/chat/route.ts`

- [ ] **Step 1: Create chat API endpoint**

Create `src/app/api/widget/chat/route.ts`:
- POST + OPTIONS (CORS)
- Auth: JWT bearer token (same as other widget endpoints)
- Rate limit: 10 messages per 5 minutes per session
- Body: `{ messages: { role: "user" | "assistant", content: string }[] }`
- System prompt: TMS widget integration specialist — knows API key setup, CargoWise/Magaya/Generic installation, widget features, troubleshooting CORS/auth/rate-limit issues, commission structure
- Uses existing `getClient()` from `@/lib/ai` to call Claude API
- Model: `claude-haiku-4-5-20251001` (fast, cheap for help bot)
- Max tokens: 500 per response
- Returns: `{ reply: string }`

- [ ] **Step 2: Create WidgetChat component**

Create `src/components/widget/WidgetChat.tsx`:
- Props: `{ token: string }`
- State: messages array, input text, sending boolean
- UI: dark glass chat interface
  - Message bubbles: user = right-aligned with gold-tinted glass (`rgba(196,160,80,0.08)`), bot = left-aligned dark glass (`W.bgCard`)
  - Input bar: `inputStyle()` with gold send button (arrow icon)
  - Typing indicator: 3-dot pulse animation
  - Welcome message on mount: "Hi! I can help you set up and use the Fintella widget in your TMS. What do you need help with?"
  - Quick-action chips below welcome: "How to install", "Troubleshoot", "Features"
  - Auto-scroll on new messages
  - Enter to send, Shift+Enter for newline
- Fetch: POST to `/api/widget/chat` with Bearer token + message history (last 10 messages)

- [ ] **Step 3: Commit**

```bash
git add src/components/widget/WidgetChat.tsx src/app/api/widget/chat/route.ts
git commit -m "feat: widget AI help assistant for TMS integration"
```

---

## Task 8: Build Verification + PR

- [ ] **Step 1: Run prisma generate**

```bash
npx prisma generate
```

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Fix any TypeScript errors. Expected: 276+ static pages, no new errors.

- [ ] **Step 3: Create PR**

```bash
git push -u origin claude/widget-overhaul
gh pr create --title "feat: widget overhaul — fintech glass UI + functional gaps" --body "..."
```

- [ ] **Step 4: Merge to main**

After CI passes, squash merge to main. Vercel auto-deploys.

---

## Dependency Graph

```
Task 1 (theme + schema) ─┬─→ Task 2 (shell + footer)
                          ├─→ Task 3 (dashboard + referrals) 
                          ├─→ Task 4 (referral form)
                          ├─→ Task 5 (calculator + blob)
                          ├─→ Task 6 (how it works)
                          └─→ Task 7 (AI chat)
                               ↓
                          Task 8 (build + PR)
```

Tasks 2-7 are independent after Task 1 completes — can run in parallel.
