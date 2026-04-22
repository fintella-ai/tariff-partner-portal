/**
 * Star Super Admin
 *
 * A tier above the regular `super_admin` role, scoped to a single email —
 * `admin@fintella.partners` (John). Grants capabilities that even other
 * super_admins don't have, specifically:
 *   - Edit any admin user's name / email / role / password
 *   - Delete admin notes on a partner record (regular super_admins can
 *     only pin/unpin; the immutable-audit-trail rule still applies to
 *     everyone else)
 *
 * The identity is intentionally email-based rather than a new `role` value
 * so there's no way for another super_admin to accidentally promote their
 * account into the star tier via the `update_role` flow (which is itself
 * star-gated, anyway — belt-and-suspenders).
 *
 * Changing the star email is a code change + deploy. That's deliberate.
 */

export const STAR_SUPER_ADMIN_EMAIL = "admin@fintella.partners";

export function isStarSuperAdminEmail(email?: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === STAR_SUPER_ADMIN_EMAIL;
}

/**
 * Client-side convenience: accepts a next-auth session and returns true iff
 * the logged-in user is the star super admin. Safe to call when session is
 * loading — returns false until session data is available.
 */
export function isStarSuperAdminSession(
  session: { user?: { email?: string | null } | null } | null | undefined
): boolean {
  return isStarSuperAdminEmail(session?.user?.email);
}
