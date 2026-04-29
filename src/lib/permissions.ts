/**
 * Admin Role-Based Permissions
 *
 * Roles:
 *   super_admin    — Full access to everything. Can create/manage other admins.
 *   admin          — Full access except Revenue tab.
 *   accounting     — Revenue, Reports, Payouts, Documents, Deals only.
 *   partner_support — Limited access. Cannot see Revenue, cannot void docs,
 *                     cannot reset partner codes, view-only on Payouts/Deals,
 *                     Settings restricted to Home Page tab only.
 */

export type AdminRole = "super_admin" | "admin" | "accounting" | "partner_support";

// Which sidebar nav items each role can see.
//
// Notes on consolidation (2026-04-20):
//   - `communications` is a flat leaf pointing at /admin/communications.
//     That hub page owns its own in-page tabs (Email / SMS / Phone /
//     Automations / Team Chat / Channels) — same pattern as Reporting.
//   - `internalChats` is a flat leaf pointing at /admin/internal-chats.
//     That hub page owns tabs for Team Chat / Channels / DM Flags.
//     Accounting is excluded.
//   - `partnerSupport` is a flat leaf pointing at /admin/support. That
//     hub page owns tabs for Support Tickets / Live Chat Support.
//   - Legacy namespaced child IDs (e.g. `communications:email`,
//     `internalChats:team-chat`, `partnerSupport:tickets`) are no longer
//     in the registry. The layout's `reconcileNavOrder` helper silently
//     drops them from saved nav orders on first render after deploy.
//   - `reporting` is synthetic: the layout shows the Reporting row if any
//     of `reports`/`revenue`/`payouts` is visible to the role. Those three
//     finance-page IDs remain in each role's list below.
export const ROLE_VISIBLE_NAV: Record<AdminRole, string[]> = {
  super_admin: [
    "home",
    "partners", "applications", "internal-leads", "landingPages", "deals",
    "communications", "internalChats", "partnerSupport",
    "training", "conference", "documents",
    "automations", "gettingStartedEditor", "aiActivity",
    "payouts", "revenue", "reports",
    "settings", "billing", "users", "dev", "features",
  ],
  admin: [
    "home",
    "partners", "applications", "internal-leads", "landingPages", "deals",
    "communications", "internalChats", "partnerSupport",
    "training", "conference", "documents",
    "automations", "gettingStartedEditor", "aiActivity",
    "payouts", "reports",
    "settings",
  ],
  accounting: [
    "home",
    "deals", "documents",
    "payouts", "revenue", "reports",
    "communications",
    "aiActivity",
  ],
  partner_support: [
    "home",
    "partners", "applications", "deals",
    "communications", "internalChats", "partnerSupport",
    "training", "conference", "documents",
    "payouts",
    "settings",
    "aiActivity",
  ],
};

// Specific permission flags per role
export const ROLE_PERMISSIONS: Record<AdminRole, {
  canSeeRevenue: boolean;
  canVoidDocuments: boolean;
  canResetPartnerCode: boolean;
  canEditDeals: boolean;
  canEditPayouts: boolean;
  canManageAdmins: boolean;
  canManageEnterprise: boolean;
  settingsTabs: string[]; // which settings tabs they can see
  payoutsReadOnly: boolean;
  dealsReadOnly: boolean;
  canUploadDocuments: boolean;
}> = {
  super_admin: {
    canSeeRevenue: true,
    canVoidDocuments: true,
    canResetPartnerCode: true,
    canEditDeals: true,
    canEditPayouts: true,
    canManageAdmins: true,
    canManageEnterprise: true,
    settingsTabs: ["branding", "themes", "navigation", "homepage", "commissions", "agreements", "integrations"],
    payoutsReadOnly: false,
    dealsReadOnly: false,
    canUploadDocuments: true,
  },
  admin: {
    canSeeRevenue: false,
    canVoidDocuments: true,
    canResetPartnerCode: true,
    canEditDeals: true,
    canEditPayouts: true,
    canManageAdmins: false,
    canManageEnterprise: false,
    settingsTabs: ["branding", "themes", "navigation", "homepage", "commissions", "agreements"],
    payoutsReadOnly: false,
    dealsReadOnly: false,
    canUploadDocuments: true,
  },
  accounting: {
    canSeeRevenue: true,
    canVoidDocuments: false,
    canResetPartnerCode: false,
    canEditDeals: false,
    canEditPayouts: true,
    canManageAdmins: false,
    canManageEnterprise: false,
    settingsTabs: [],
    payoutsReadOnly: false,
    dealsReadOnly: true,
    canUploadDocuments: false,
  },
  partner_support: {
    canSeeRevenue: false,
    canVoidDocuments: false,
    canResetPartnerCode: false,
    canEditDeals: false,
    canEditPayouts: false,
    canManageAdmins: false,
    canManageEnterprise: false,
    settingsTabs: ["homepage"],
    payoutsReadOnly: true,
    dealsReadOnly: true,
    canUploadDocuments: true,
  },
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accounting: "Accounting",
  partner_support: "Partner Support",
};

export function getPermissions(role: string) {
  return ROLE_PERMISSIONS[(role as AdminRole)] || ROLE_PERMISSIONS.admin;
}

export function getVisibleNav(role: string) {
  return ROLE_VISIBLE_NAV[(role as AdminRole)] || ROLE_VISIBLE_NAV.admin;
}

export function isAdminRole(role: string): boolean {
  return ["super_admin", "admin", "accounting", "partner_support"].includes(role);
}

/** Check if a role string is any valid admin role (for API route guards) */
export function isAnyAdmin(role: string): boolean {
  return ["super_admin", "admin", "accounting", "partner_support"].includes(role);
}
