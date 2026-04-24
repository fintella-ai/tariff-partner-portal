import { redirect } from "next/navigation";

/**
 * Root redirects to /login. The full promotional landing page shipped in
 * PR #516 is hidden while we rebuild it on a dedicated page-builder
 * platform (ClickFunnels-style drag-and-drop — per John's 2026-04-24
 * directive). All intake + booking + admin infrastructure from #516
 * remains live:
 *   - POST /api/apply
 *   - GET /api/booking/slots
 *   - POST /api/booking/reserve
 *   - /admin/applications, /admin/booking-slots
 * The rebuilt landing page (wherever it lives) can POST the intake form
 * to /api/apply and the booker backend keeps working unchanged.
 *
 * To restore the Next.js landing temporarily, revert this file to the
 * version in commit dc2764e (PR #516 merge).
 */
export default function Home() {
  redirect("/login");
}
