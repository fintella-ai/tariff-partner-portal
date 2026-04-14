"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ROLE_LABELS, type AdminRole } from "@/lib/permissions";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

const ASSIGNABLE_ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "accounting", label: "Accounting" },
  { value: "partner_support", label: "Partner Support" },
];

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [creating, setCreating] = useState(false);

  // Reset password
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");

  const fetchUsers = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  if (!isSuperAdmin) {
    return (
      <div className="card p-12 text-center">
        <div className="font-body text-sm theme-text-muted">Only super admins can manage admin users.</div>
      </div>
    );
  }

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-3 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-2 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Admin Users</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Manage admin accounts and assign portal permissions.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-gold text-[12px] px-4 py-2.5 shrink-0"
        >
          {showCreate ? "Cancel" : "+ Create Admin User"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-4">Create New Admin User</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className={labelClass}>Email *</label>
              <input className={inputClass} placeholder="admin@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Full Name</label>
              <input className={inputClass} placeholder="Jane Smith" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Password *</label>
              <input className={inputClass} type="password" placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Role *</label>
              <select className={inputClass} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role description */}
          <div className="mb-4 p-3 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)]">
            <div className="font-body text-[11px] text-[var(--app-text-muted)]">
              {newRole === "admin" && "Admin — Full access except Revenue tab."}
              {newRole === "accounting" && "Accounting — Can only access Revenue, Reports, Payouts, Documents, and Deals."}
              {newRole === "partner_support" && "Partner Support — Limited access. Cannot see Revenue, void documents, reset partner codes. View-only on Payouts and Deals. Settings restricted to Home Page tab."}
            </div>
          </div>

          <button
            onClick={async () => {
              if (!newEmail.trim() || !newPassword) return alert("Email and password are required");
              if (newPassword.length < 6) return alert("Password must be at least 6 characters");
              setCreating(true);
              try {
                const res = await fetch("/api/admin/users", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "create", email: newEmail.trim(), name: newName.trim(), password: newPassword, userRole: newRole }),
                });
                const data = await res.json();
                if (!res.ok) { alert(data.error || "Failed"); return; }
                setShowCreate(false);
                setNewEmail(""); setNewName(""); setNewPassword(""); setNewRole("admin");
                fetchUsers();
              } catch { alert("Network error"); }
              finally { setCreating(false); }
            }}
            disabled={creating}
            className="btn-gold text-sm px-6 py-2 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create User"}
          </button>
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="card p-8 text-center"><div className="font-body text-sm theme-text-muted">Loading...</div></div>
      ) : users.length === 0 ? (
        <div className="card p-12 text-center"><div className="font-body text-sm theme-text-muted">No admin users found.</div></div>
      ) : (
        <div className="card">
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-5 py-3 border-b border-[var(--app-border)]">
              {["User", "Role", "Created", "Password", "Actions"].map((h) => (
                <div key={h} className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">{h}</div>
              ))}
            </div>
            {users.map((u) => {
              // Self-protection: the logged-in user cannot delete themselves
              // or change their own role from this UI. Backend enforces this
              // too (lines 81-84 + 121-124 of /api/admin/users/route.ts), but
              // hiding the controls also clears up the visual ambiguity.
              const isSelf = u.email === session?.user?.email;
              const isSuperAdminRow = u.role === "super_admin";
              return (
              <div key={u.id} className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                <div>
                  <div className="font-body text-[13px] text-[var(--app-text)] font-medium">
                    {u.name || u.email}
                    {isSelf && (
                      <span className="ml-2 font-body text-[10px] text-brand-gold">(you)</span>
                    )}
                  </div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)]">{u.email}</div>
                </div>
                <div>
                  {isSelf || isSuperAdminRow ? (
                    // Show the role badge for either the logged-in user (no
                    // self-edit) OR any super_admin row. Super admins still
                    // can't be PROMOTED to via this UI (the API at line 87-89
                    // blocks `userRole === "super_admin"` in update_role),
                    // but they can be DELETED entirely by another super_admin
                    // — see the Delete button below.
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${
                        isSuperAdminRow
                          ? "bg-brand-gold/10 text-brand-gold border border-brand-gold/20"
                          : u.role === "admin"
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : u.role === "accounting"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      }`}
                    >
                      {ROLE_LABELS[u.role as AdminRole] || u.role}
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={async (e) => {
                        const res = await fetch("/api/admin/users", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "update_role", userId: u.id, userRole: e.target.value }),
                        });
                        if (res.ok) fetchUsers();
                        else { const d = await res.json(); alert(d.error || "Failed"); }
                      }}
                      className="bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-2 py-1.5 font-body text-[12px] text-[var(--app-text)] outline-none"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                  {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                <div>
                  {!isSelf && !isSuperAdminRow && (
                    resetId === u.id ? (
                      <div className="flex gap-1">
                        <input
                          type="password"
                          className="w-24 bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded px-2 py-1 font-body text-[11px] text-[var(--app-text)] outline-none"
                          placeholder="New pw..."
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                        />
                        <button
                          onClick={async () => {
                            if (resetPw.length < 6) return alert("Min 6 characters");
                            await fetch("/api/admin/users", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "reset_password", userId: u.id, password: resetPw }),
                            });
                            setResetId(null); setResetPw("");
                          }}
                          className="font-body text-[10px] text-green-400 hover:underline"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setResetId(u.id); setResetPw(""); }} className="font-body text-[11px] text-brand-gold hover:underline">
                        Reset
                      </button>
                    )
                  )}
                </div>
                <div>
                  {!isSelf && (
                    <button
                      onClick={async () => {
                        // Stricter confirmation when deleting another super
                        // admin — these have full system access and the
                        // delete is irreversible. Only used for cleaning up
                        // orphaned/duplicate super admin accounts.
                        const confirmText = isSuperAdminRow
                          ? `⚠️ DELETE SUPER ADMIN ⚠️\n\nYou are about to delete a super admin account:\n  ${u.email}\n\nSuper admins have full system access. This is irreversible. Only proceed if this is an orphaned or duplicate account.\n\nContinue?`
                          : `Delete admin user ${u.name || u.email}? This cannot be undone.`;
                        if (!confirm(confirmText)) return;
                        const res = await fetch("/api/admin/users", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "delete", userId: u.id }),
                        });
                        if (!res.ok) {
                          const d = await res.json().catch(() => ({}));
                          alert(d.error || "Failed to delete user");
                          return;
                        }
                        fetchUsers();
                      }}
                      className="font-body text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--app-border)]">
            {users.map((u) => (
              <div key={u.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-body text-sm font-medium text-[var(--app-text)]">{u.name || u.email}</div>
                    <div className="font-body text-xs text-[var(--app-text-muted)]">{u.email}</div>
                  </div>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                    u.role === "super_admin" ? "bg-brand-gold/10 text-brand-gold border border-brand-gold/20"
                      : u.role === "accounting" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : u.role === "partner_support" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                      : "bg-green-500/10 text-green-400 border border-green-500/20"
                  }`}>
                    {ROLE_LABELS[u.role as AdminRole] || u.role}
                  </span>
                </div>
                <div className="font-body text-[10px] text-[var(--app-text-faint)]">
                  Created {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permissions reference */}
      <div className="card mt-6 p-5">
        <div className="font-body font-semibold text-sm mb-4">Role Permissions Reference</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { role: "Super Admin", color: "text-brand-gold", perms: ["Full access to everything", "Create & manage admin users", "Manage enterprise partners", "Reset partner codes"] },
            { role: "Admin", color: "text-green-400", perms: ["All pages except Revenue", "Can void documents", "Can edit deals & payouts", "Full settings access"] },
            { role: "Accounting", color: "text-blue-400", perms: ["Revenue, Reports, Payouts", "Documents, Deals (view only)", "No settings access", "No partner management"] },
            { role: "Partner Support", color: "text-purple-400", perms: ["No Revenue access", "Cannot void documents", "Deals & Payouts (view only)", "Settings: Home Page tab only"] },
          ].map((r) => (
            <div key={r.role} className="p-3 rounded-lg bg-[var(--app-card-bg)] border border-[var(--app-border)]">
              <div className={`font-body text-sm font-semibold ${r.color} mb-2`}>{r.role}</div>
              <ul className="space-y-1">
                {r.perms.map((p) => (
                  <li key={p} className="font-body text-[11px] text-[var(--app-text-muted)] flex items-start gap-1.5">
                    <span className="text-[8px] mt-1 shrink-0">&#9679;</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
