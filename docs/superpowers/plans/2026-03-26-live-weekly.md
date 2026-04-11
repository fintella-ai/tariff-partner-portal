# Phase 12 — Live Weekly (Conference) Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Live Weekly page to the database with recording playback, meeting notes, calendar download, and admin CRUD management.

**Architecture:** Enhance the existing `ConferenceSchedule` Prisma model with new fields (notes, hostName, duration, weekNumber). Partner page fetches from a new API route and falls back to demo data. Admin gets a dedicated CRUD page. Reuses `VideoModal` from Phase 11 for inline recording playback.

**Tech Stack:** Next.js 14, Prisma/SQLite, Tailwind CSS dark theme, TypeScript

---

## File Structure

### New Files (5)
- `scripts/seed-conference.ts` — Seed 8 conference entries (1 active + 7 past recordings)
- `src/app/api/conference/route.ts` — Partner GET: active schedule + past recordings
- `src/app/api/admin/conference/route.ts` — Admin GET all + POST create
- `src/app/api/admin/conference/[id]/route.ts` — Admin PUT update + DELETE
- `src/app/(admin)/admin/conference/page.tsx` — Admin conference management page

### Modified Files (4)
- `prisma/schema.prisma` — Add fields to ConferenceSchedule model
- `package.json` — Add `db:seed-conference` script
- `src/app/(partner)/dashboard/conference/page.tsx` — Rewrite with API + video + notes
- `src/app/(admin)/admin/layout.tsx` — Add Live Weekly nav item

---

## Task 1: Prisma Schema Update

**Files:**
- Modify: `prisma/schema.prisma:230-243`

- [ ] **Step 1: Add new fields to ConferenceSchedule model**

Replace the existing `ConferenceSchedule` model with:

```prisma
model ConferenceSchedule {
  id           String    @id @default(cuid())
  title        String
  description  String?
  embedUrl     String?   // YouTube/Vimeo embed URL for recording playback
  joinUrl      String?   // Direct join link (Zoom/Meet)
  recordingUrl String?   // External fallback URL for recording
  schedule     String?   // "Weekly, Thursdays at 2pm ET"
  nextCall     DateTime?
  hostName     String?   // Presenter name
  duration     String?   // e.g., "52 min"
  weekNumber   Int?      // For labeling, e.g., 12 for "Week 12"
  notes        String?   // Markdown meeting notes/summary
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

- [ ] **Step 2: Push schema changes**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema"

---

## Task 2: Seed Script

**Files:**
- Create: `scripts/seed-conference.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create the seed script**

Create `scripts/seed-conference.ts` with the following structure. Uses `prisma.conferenceSchedule.upsert()` with deterministic IDs for idempotency:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1 active upcoming call
  const upcoming = await prisma.conferenceSchedule.upsert({
    where: { id: "cs-week-13" },
    update: {},
    create: {
      id: "cs-week-13",
      title: "Weekly Partner Training & Q&A",
      description: "Product updates, training topics, success stories, and live Q&A.",
      joinUrl: "https://zoom.us/j/1234567890",
      schedule: "Every Thursday at 2:00 PM ET — 45-60 minutes",
      nextCall: new Date("2026-03-26T18:00:00.000Z"), // 2pm ET = 6pm UTC
      hostName: "TRLN Leadership Team",
      weekNumber: 13,
      isActive: true,
    },
  });
  console.log(`Upserted active: ${upcoming.id} — ${upcoming.title}`);

  // 7 past recordings (weeks 12 down to 6)
  const pastEntries = [
    {
      id: "cs-week-12",
      title: "Section 301 Update & New Partner Tools",
      hostName: "Sarah Mitchell",
      weekNumber: 12,
      nextCall: new Date("2026-03-19T18:00:00.000Z"),
      duration: "52 min",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      notes: "**Key Topics:**\n- Section 301 tariff updates effective April 1\n- New partner portal features walkthrough\n- Partner spotlight: How Mike S. closed 5 deals in one week\n\n**Action Items:**\n- Review updated Section 301 reference sheet in Resources\n- Try the new bulk lead submission feature\n- Submit Q1 performance reports by March 31",
    },
    {
      id: "cs-week-11",
      title: "Commission Deep Dive & Top Partner Q&A",
      hostName: "John Orlando",
      weekNumber: 11,
      nextCall: new Date("2026-03-12T18:00:00.000Z"),
      duration: "47 min",
      embedUrl: "https://www.youtube.com/embed/9bZkp7q19f0",
      notes: "**Key Topics:**\n- How L1, L2, and L3 commissions are calculated\n- Payout timeline walkthrough (filing → IRS → payment)\n- Q&A with top 3 partners on their lead generation strategies\n\n**Action Items:**\n- Review your commission dashboard for Q1 estimates\n- Set up direct deposit if you haven't already",
    },
    {
      id: "cs-week-10",
      title: "IEEPA Changes & Client Outreach Strategies",
      hostName: "Sarah Mitchell",
      weekNumber: 10,
      nextCall: new Date("2026-03-05T19:00:00.000Z"),
      duration: "58 min",
      embedUrl: "https://www.youtube.com/embed/LXb3EKWsInQ",
      notes: "**Key Topics:**\n- New IEEPA executive order implications for tariff recovery\n- Expanded eligibility criteria for importers\n- Effective cold outreach scripts for CPAs and trade advisors\n\n**Action Items:**\n- Download the updated Client Conversation Script\n- Identify 5 potential leads using the new eligibility criteria",
    },
    {
      id: "cs-week-9",
      title: "Onboarding Best Practices for New Partners",
      hostName: "TRLN Leadership Team",
      weekNumber: 9,
      nextCall: new Date("2026-02-26T19:00:00.000Z"),
      duration: "41 min",
      recordingUrl: "https://zoom.us/rec/share/example-week-9",
      notes: "**Key Topics:**\n- First 7 days as a TRLN partner — what to do\n- Portal walkthrough for new partners\n- Common mistakes to avoid when submitting leads\n\n**Action Items:**\n- Complete all Onboarding training modules\n- Submit your W-9 and partnership agreement",
    },
    {
      id: "cs-week-8",
      title: "Tax Season Strategies & Pipeline Management",
      hostName: "John Orlando",
      weekNumber: 8,
      nextCall: new Date("2026-02-19T19:00:00.000Z"),
      duration: "44 min",
      embedUrl: "https://www.youtube.com/embed/kJQP7kiw5Fk",
      notes: "**Key Topics:**\n- Leveraging tax season for client outreach\n- Managing your deal pipeline effectively\n- How to re-engage cold leads",
    },
    {
      id: "cs-week-7",
      title: "Building Your Downline — Advanced Recruiting",
      hostName: "Sarah Mitchell",
      weekNumber: 7,
      nextCall: new Date("2026-02-12T19:00:00.000Z"),
      duration: "55 min",
      embedUrl: "https://www.youtube.com/embed/RgKAFK5djSk",
      notes: "**Key Topics:**\n- L2 and L3 commission opportunities through recruiting\n- Where to find CPAs and trade advisors\n- Partner referral link best practices",
    },
    {
      id: "cs-week-6",
      title: "Product Knowledge Deep Dive — IEEPA & Section 301",
      hostName: "TRLN Leadership Team",
      weekNumber: 6,
      nextCall: new Date("2026-02-05T19:00:00.000Z"),
      duration: "49 min",
      recordingUrl: "https://zoom.us/rec/share/example-week-6",
      notes: "**Key Topics:**\n- Differences between IEEPA and Section 301 tariffs\n- Client qualification criteria for each program\n- Estimated refund calculations walkthrough",
    },
  ];

  for (const entry of pastEntries) {
    const result = await prisma.conferenceSchedule.upsert({
      where: { id: entry.id },
      update: {},
      create: {
        ...entry,
        description: `Week ${entry.weekNumber} partner call recording.`,
        isActive: false,
      },
    });
    console.log(`Upserted past: ${result.id} — Week ${entry.weekNumber}: ${entry.title}`);
  }

  console.log("\nSeed complete: 1 active + 7 past recordings.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add npm script to package.json**

Add to `"scripts"` in `package.json`:
```json
"db:seed-conference": "npx ts-node --compiler-options {\"module\":\"commonjs\"} scripts/seed-conference.ts"
```

- [ ] **Step 3: Run the seed script**

Run: `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-conference.ts`
Expected: 8 lines of "Upserted" output + "Seed complete: 1 active + 7 past recordings."

---

## Task 3: Partner API Route

**Files:**
- Create: `src/app/api/conference/route.ts`

- [ ] **Step 1: Create the partner conference API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/conference
 * Returns the active conference schedule (next call) and past recordings.
 * Requires authenticated partner session.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const partnerCode = (session.user as any).partnerCode;
  if (!partnerCode) {
    return NextResponse.json({ error: "Not a partner" }, { status: 403 });
  }

  try {
    // Fetch the active schedule entry (next upcoming call)
    const activeSchedule = await prisma.conferenceSchedule.findFirst({
      where: { isActive: true },
      orderBy: { nextCall: "asc" },
    });

    // Fetch past recordings (inactive entries, newest first)
    const pastRecordings = await prisma.conferenceSchedule.findMany({
      where: { isActive: false },
      orderBy: { nextCall: "desc" },
    });

    return NextResponse.json({
      activeSchedule,
      pastRecordings,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch conference data" },
      { status: 500 }
    );
  }
}
```

---

## Task 4: Admin API Routes

**Files:**
- Create: `src/app/api/admin/conference/route.ts`
- Create: `src/app/api/admin/conference/[id]/route.ts`

- [ ] **Step 1: Create admin conference list + create route**

Create `src/app/api/admin/conference/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/conference
 * Returns all conference schedule entries (including inactive).
 * Requires admin role.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const entries = await prisma.conferenceSchedule.findMany({
      orderBy: { nextCall: "desc" },
    });
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch conference entries" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/conference
 * Create a new conference schedule entry.
 * Requires admin role.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const entry = await prisma.conferenceSchedule.create({
      data: {
        title: body.title,
        description: body.description || null,
        embedUrl: body.embedUrl || null,
        joinUrl: body.joinUrl || null,
        recordingUrl: body.recordingUrl || null,
        schedule: body.schedule || null,
        nextCall: body.nextCall ? new Date(body.nextCall) : null,
        hostName: body.hostName || null,
        duration: body.duration || null,
        weekNumber: body.weekNumber ? parseInt(body.weekNumber, 10) : null,
        notes: body.notes || null,
        isActive: body.isActive ?? true,
      },
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create conference entry" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create admin conference update + delete route**

Create `src/app/api/admin/conference/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/admin/conference/[id]
 * Update a conference schedule entry.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data: Record<string, any> = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.embedUrl !== undefined) data.embedUrl = body.embedUrl || null;
    if (body.joinUrl !== undefined) data.joinUrl = body.joinUrl || null;
    if (body.recordingUrl !== undefined) data.recordingUrl = body.recordingUrl || null;
    if (body.schedule !== undefined) data.schedule = body.schedule || null;
    if (body.nextCall !== undefined) data.nextCall = body.nextCall ? new Date(body.nextCall) : null;
    if (body.hostName !== undefined) data.hostName = body.hostName || null;
    if (body.duration !== undefined) data.duration = body.duration || null;
    if (body.weekNumber !== undefined) data.weekNumber = body.weekNumber ? parseInt(body.weekNumber, 10) : null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const entry = await prisma.conferenceSchedule.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ entry });
  } catch {
    return NextResponse.json(
      { error: "Failed to update conference entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/conference/[id]
 * Delete a conference schedule entry.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.conferenceSchedule.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete conference entry" },
      { status: 500 }
    );
  }
}
```

---

## Task 5: Enhanced Partner Conference Page

**Files:**
- Modify: `src/app/(partner)/dashboard/conference/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the partner conference page**

Replace the entire file with a new implementation that:

1. **Imports**: `useState`, `useEffect` from React; `useDevice` from `@/lib/useDevice`; `FIRM_SHORT` from `@/lib/constants`; `VideoModal` from `@/components/ui/VideoModal`
2. **Interfaces**: `ConferenceEntry` with all ConferenceSchedule fields
3. **Demo fallback data**: `DEMO_ACTIVE` (1 upcoming call) and `DEMO_RECORDINGS` (4 past recordings) matching the current hardcoded data, as fallback if API fails
4. **Data fetching**: `useEffect` fetches from `/api/conference`, sets `activeSchedule` and `pastRecordings` state, falls back to demo data on error
5. **Loading state**: Shows "Loading conference data..." while fetching
6. **Next Call Hero Card**: Same visual design as current (green pulse, gold border, gradient bg) but data from API. "Join Call" opens `joinUrl` in new tab via `window.open()`. "Add to Calendar" calls a `generateICS()` helper function that creates a Blob with ICS content and triggers download.
7. **Call Schedule Card**: Shows `activeSchedule.schedule` text
8. **Past Recordings List**: Maps `pastRecordings` array. Each entry has:
   - Title with week number label: `Week {weekNumber} — {title}`
   - Date and duration metadata
   - Watch button: if `embedUrl` → sets `videoModal` state to open `VideoModal`; else if `recordingUrl` → `window.open(recordingUrl, "_blank")`
   - Expandable notes: chevron button toggles `expandedNotes` Set state. When expanded, shows `notes` field with `whitespace-pre-line` styling below a `border-t border-white/[0.04]` divider

The `generateICS()` helper:
```typescript
function generateICS(entry: ConferenceEntry) {
  const start = entry.nextCall ? new Date(entry.nextCall) : new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TRLN//Partner Portal//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${entry.title}`,
    `DESCRIPTION:${entry.description || "Weekly TRLN partner call"}`,
    entry.joinUrl ? `URL:${entry.joinUrl}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trln-weekly-call.ics";
  a.click();
  URL.revokeObjectURL(url);
}
```

Visual styling must match the current page exactly (same classes, same layout, same dark theme). The page should be ~200 lines.

---

## Task 6: Admin Conference Page + Nav Update

**Files:**
- Create: `src/app/(admin)/admin/conference/page.tsx`
- Modify: `src/app/(admin)/admin/layout.tsx:7-16`

- [ ] **Step 1: Add Live Weekly to admin nav**

In `src/app/(admin)/admin/layout.tsx`, insert after the Training entry (line 11) and before Documents (line 12):

```typescript
  { id: "conference", href: "/admin/conference", icon: "\u{1F4F9}", label: "Live Weekly" },
```

- [ ] **Step 2: Create admin conference management page**

Create `src/app/(admin)/admin/conference/page.tsx` — a full admin CRUD page following the same patterns as `src/app/(admin)/admin/training/page.tsx`:

1. **State**: `entries` array, `loading`, `showForm`, `editingItem` for add/edit form
2. **Data fetching**: GET `/api/admin/conference` on mount, fallback to demo data
3. **Stats cards** (4): Total Entries, Active/Upcoming, Past Recordings, With Notes
4. **"+ Add Entry" button** — gold styled, opens the add form
5. **Table** (desktop) with columns: Week #, Title, Host, Date, Duration, Recording? (✓/—), Notes? (✓/—), Active (badge), Actions (Edit/Toggle/Delete)
6. **Mobile cards** with same data in condensed format
7. **Add/Edit form** — card with fields:
   - Title (text input, required)
   - Description (textarea)
   - Host Name (text)
   - Week Number (number)
   - Join URL (text) — for live call link
   - Embed URL (text) — for YouTube/Vimeo recording
   - Recording URL (text) — external fallback
   - Schedule (text) — recurring description
   - Next Call Date (datetime-local input)
   - Duration (text)
   - Notes (textarea, tall — 6 rows)
   - Active (checkbox toggle)
   - Save + Cancel buttons
8. **CRUD operations**: POST to create, PUT to update, DELETE to remove. Refresh list after each operation.
9. **Toggle Active**: PUT with `{ isActive: !current }` — useful for marking a past call as inactive after the recording is added

Styling: exact same patterns as admin training page — `card p-4 sm:p-5` stats, `text-[11px] text-white/30 uppercase tracking-wider` table headers, green Published / amber Draft badges for Active/Inactive, `btn-gold` for save, red for delete.

Page should be ~400-500 lines.

---

## Task 7: Update ROADMAP + Build Verification

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update ROADMAP.md**

Change Phase 12 from:
```
### Phase 12 — Live Weekly (Conference) Page 🔲
- [ ] Weekly meeting schedule display
- [ ] Zoom/Google Meet link integration
- [ ] Past recordings archive
- [ ] Meeting notes / summaries
```

To:
```
### Phase 12 — Live Weekly (Conference) Page ✅
- [x] Weekly meeting schedule display (from DB via ConferenceSchedule model)
- [x] Zoom/Google Meet link integration (Join Call button, Add to Calendar .ics)
- [x] Past recordings archive (inline VideoModal + external link fallback)
- [x] Meeting notes / summaries (expandable notes per recording)
- [x] Admin conference management (CRUD for schedule entries, recordings, notes)
- [x] Database seeding (1 active + 7 past recordings with notes)
```

- [ ] **Step 2: Run build**

Run: `npx next build`
Expected: Compiled successfully, all routes present including `/admin/conference`, `/api/conference`, `/api/admin/conference`, `/api/admin/conference/[id]`

- [ ] **Step 3: Start dev server and verify partner page**

Run dev server, log in as partner, navigate to `/dashboard/conference`. Verify:
- Next Call hero card shows data from DB
- Join Call button present
- Add to Calendar button triggers .ics download
- Past recordings list shows 7 entries
- Watch button opens VideoModal for embed URLs
- Notes expand/collapse works on recordings

- [ ] **Step 4: Verify admin page**

Log in as admin, navigate to `/admin/conference`. Verify:
- Training nav item present in sidebar
- Stats cards show correct counts
- Table lists all 8 entries
- Add/Edit form works
- Toggle active/inactive works
