# Phase 12 — Live Weekly (Conference) Page Design

## Context
The TRLN partner portal has a "Live Weekly Call!" page at `/dashboard/conference` with hardcoded demo data. The Prisma `ConferenceSchedule` model exists but is unused. This phase wires the page to the database, adds recording playback and meeting notes, and provides admin management.

## Requirements
- Display the next upcoming call with a live join button (Zoom/Google Meet)
- Archive of past recordings with inline playback (YouTube/Vimeo via VideoModal) or external link fallback
- Expandable meeting notes/summaries below each recording
- Admin CRUD for managing schedule entries, recordings, and notes
- Add to Calendar (.ics download) for the next call

## Schema Changes

**Modify `ConferenceSchedule` model** — add fields:
- `notes String?` — markdown meeting notes/summary
- `hostName String?` — presenter name
- `duration String?` — e.g., "52 min"
- `weekNumber Int?` — for labeling (e.g., "Week 12")

Existing fields retained: id, title, description, embedUrl (YouTube/Vimeo embed), joinUrl (Zoom/Meet direct link), schedule (human-readable recurring description), nextCall (DateTime), recordingUrl (external fallback), isActive, timestamps.

## Partner Page (`/dashboard/conference`)

**Rewrite existing page** to fetch from API instead of hardcoded data.

### Sections
1. **Next Call Hero** — the active schedule entry with nearest `nextCall` date
   - Animated green pulse + "Next Live Call" label
   - Title, date/time, host name
   - "Join Call" button (opens `joinUrl` in new tab)
   - "Add to Calendar" button (generates .ics file download)
2. **Call Schedule** — static card showing the `schedule` field from the active entry
3. **Past Recordings** — list of inactive entries ordered by `nextCall` descending
   - Each entry shows: title (with week number), date, duration
   - Watch button: if `embedUrl` → opens VideoModal inline; else if `recordingUrl` → opens in new tab
   - Expandable notes section (chevron toggle, shows markdown notes)

### Data Fetching
- GET `/api/conference` on mount
- Falls back to hardcoded demo data on failure

## Admin Page (`/admin/conference`)

**New page** with admin CRUD for conference schedule entries.

### Features
- Stats cards: Total Entries, Upcoming, Past Recordings, Has Notes count
- Table: Week #, Title, Date, Duration, Recording?, Notes?, Active, Actions
- Add/Edit form: Title, Description, Host Name, Week Number, Join URL, Embed URL, Recording URL, Schedule text, Next Call date, Duration, Notes (textarea), Active toggle
- Actions: Edit, Toggle Active, Delete

### Nav
Add to admin sidebar after Training: `{ id: "conference", href: "/admin/conference", icon: "📹", label: "Live Weekly" }`

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/conference/route.ts` | GET | Partner: active schedule + past recordings |
| `/api/admin/conference/route.ts` | GET, POST | Admin: all entries + create |
| `/api/admin/conference/[id]/route.ts` | PUT, DELETE | Admin: update/delete entry |

## Seed Data

8 conference entries:
- 1 active (next upcoming call, Thursday March 27 2026)
- 7 past recordings (weeks 6-12) with titles, durations, embed URLs, and meeting notes

## Reused Components
- `VideoModal` from Phase 11 — for inline recording playback
- Expand/collapse pattern from training page — for meeting notes
- Same API auth pattern from `commissions/route.ts`

## Files

### New (5)
- `scripts/seed-conference.ts`
- `src/app/api/conference/route.ts`
- `src/app/api/admin/conference/route.ts`
- `src/app/api/admin/conference/[id]/route.ts`
- `src/app/(admin)/admin/conference/page.tsx`

### Modified (3)
- `prisma/schema.prisma` — add fields to ConferenceSchedule
- `src/app/(partner)/dashboard/conference/page.tsx` — rewrite with API + features
- `src/app/(admin)/admin/layout.tsx` — add Live Weekly nav item

## Verification
1. `prisma db push` — schema syncs
2. Seed script inserts 8 entries
3. Partner page loads next call + 7 past recordings from API
4. Join Call button opens URL; Add to Calendar downloads .ics
5. Watch button: inline VideoModal for embed URLs, new tab for external
6. Notes expand/collapse on each recording
7. Admin page: CRUD works, toggle active, entries reflect on partner page
