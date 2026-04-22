"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ROLE_LABELS, type AdminRole } from "@/lib/permissions";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

const BASE_ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "accounting", label: "Accounting" },
  { value: "partner_support", label: "Partner Support" },
];

const STAR_ROLES: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  ...BASE_ROLES,
];

// Generate a strong, memorable-ish password. 16 characters from a
// 70-char alphabet (letters+digits, ambiguous chars stripped) →
// ~98 bits of entropy. Crypto.getRandomValues gives us a CSPRNG.
function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}

function RoleBadge({ role, isStar }: { role: string; isStar: boolean }) {
  const cls =
    role === "super_admin"
      ? "bg-brand-gold/10 text-brand-gold border border-brand-gold/20"
      : role === "admin"
      ? "bg-green-500/10 text-green-400 border border-green-500/20"
      : role === "accounting"
      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
      : "bg-purple-500/10 text-purple-400 border border-purple-500/20";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${cls}`}>
      {isStar && <span title="Star Super Admin" className="text-brand-gold">★</span>}
      {ROLE_LABELS[role as AdminRole] || role}
    </span>
  );
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const sessionEmail = (session?.user as any)?.email as string | undefined;
  const isStar = isStarSuperAdminEmail(sessionEmail);
  const assignableRoles = isStar ? STAR_ROLES : BASE_ROLES;
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

  // Edit modal — star super admin only
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("admin");
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordVisible, setEditPasswordVisible] = useState(false);
  const [editCopyFeedback, setEditCopyFeedback] = useState<"idle" | "copied">("idle");
  const [savingEdit, setSavingEdit] = useState(false);

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

  function openEdit(u: AdminUser) {
    setEditUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditPassword("");
    setEditPasswordVisible(false);
    setEditCopyFeedback("idle");
  }

  function closeEdit() {
    setEditUser(null);
    setEditPassword("");
  }

  async function copyPassword() {
    if (!editPassword) return;
    try {
      await navigator.clipboard.writeText(editPassword);
      setEditCopyFeedback("copied");
      setTimeout(() => setEditCopyFeedback("idle"), 1800);
    } catch {
      alert("Could not copy to clipboard");
    }
  }

  async function saveEdit() {
    if (!editUser) return;
    setSavingEdit(true);
    try {
      const profileChanged = (editName.trim() !== (editUser.name || "")) || (editEmail.trim().toLowerCase() !== editUser.email);
      const roleChanged = editRole !== editUser.role;
      const passwordChanged = editPassword.length > 0;

      if (passwordChanged && editPassword.length < 6) {
        alert("Password must be at least 6 characters.");
        setSavingEdit(false);
        return;
      }

      if (profileChanged) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_profile", userId: editUser.id, name: editName.trim(), email: editEmail.trim() }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to update profile"); setSavingEdit(false); return; }
      }
      if (roleChanged) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_role", userId: editUser.id, userRole: editRole }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to update role"); setSavingEdit(false); return; }
      }
      if (passwordChanged) {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset_password", userId: editUser.id, password: editPassword }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Failed to reset password"); setSavingEdit(false); return; }
      }
      if (!profileChanged && !roleChanged && !passwordChanged) {
        alert("Nothing changed.");
      }
      fetchUsers();
      closeEdit();
    } catch {
      alert("Network error");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Admin Users</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Manage admin accounts and assign portal permissions.
            {isStar && (
              <span className="ml-2 inline-flex items-center gap-1 text-brand-gold">
                <span>★</span>
                <span className="font-semibold">Star Super Admin</span>
                <span className="theme-text-muted font-normal">— full edit access to every admin</span>
              </span>
            )}
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
                {assignableRoles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
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
              const isSelf = u.email === sessionEmail;
              const rowIsStar = isStarSuperAdminEmail(u.email);
              return (
                <div key={u.id} className="grid grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 items-center hover:bg-[var(--app-card-bg)] transition-colors">
                  <div>
                    <div className="font-body text-[13px] text-[var(--app-text)] font-medium flex items-center gap-1.5">
                      {rowIsStar && <span title="Star Super Admin" className="text-brand-gold">★</span>}
                      {u.name || u.email}
                      {isSelf && (
                        <span className="font-body text-[10px] text-brand-gold">(you)</span>
                      )}
                    </div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)]">{u.email}</div>
                  </div>
                  <div>
                    <RoleBadge role={u.role} isStar={rowIsStar} />
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                    {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {/* Password column: bcrypt hashes can't be retrieved — show dots.
                      Star super admin clicks Edit to SET a new one (the only safe UX). */}
                  <div className="font-body text-[12px] text-[var(--app-text-muted)] tracking-widest">
                    ••••••••
                  </div>
                  <div>
                    {isStar ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(u)}
                          className="font-body text-[11px] text-brand-gold hover:underline"
                        >
                          Edit
                        </button>
                        {!isSelf && (
                          <button
                            onClick={async () => {
                              const confirmText = u.role === "super_admin"
                                ? `⚠️ DELETE SUPER ADMIN ⚠️\n\nYou are about to delete:\n  ${u.email}\n\nThis is irreversible. Continue?`
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
                    ) : (
                      <span className="font-body text-[10px] theme-text-muted">— read-only</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--app-border)]">
            {users.map((u) => {
              const rowIsStar = isStarSuperAdminEmail(u.email);
              return (
                <div key={u.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-body text-sm font-medium text-[var(--app-text)] flex items-center gap-1.5">
                        {rowIsStar && <span title="Star Super Admin" className="text-brand-gold">★</span>}
                        {u.name || u.email}
                      </div>
                      <div className="font-body text-xs text-[var(--app-text-muted)]">{u.email}</div>
                    </div>
                    <RoleBadge role={u.role} isStar={rowIsStar} />
                  </div>
                  <div className="font-body text-[10px] text-[var(--app-text-faint)]">
                    Created {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {isStar && (
                    <button
                      onClick={() => openEdit(u)}
                      className="mt-3 font-body text-[12px] text-brand-gold hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit modal — star super admin only. Gate already enforced above,
          but rendered null defensively in case session flips mid-session. */}
      {editUser && isStar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeEdit}>
          <div className="w-full max-w-md card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Edit Admin User</h3>
              <button onClick={closeEdit} className="font-body text-[20px] text-[var(--app-text-muted)] hover:text-[var(--app-text)]">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Jane Smith" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input className={inputClass} value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="admin@example.com" />
              </div>
              <div>
                <label className={labelClass}>Role</label>
                <select
                  className={inputClass}
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={editUser.email === sessionEmail}
                  title={editUser.email === sessionEmail ? "You cannot change your own role" : undefined}
                >
                  {STAR_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  New Password
                  <span className="ml-2 font-normal normal-case tracking-normal text-[10px] theme-text-muted">
                    — leave blank to keep current. Existing passwords are bcrypt-hashed and cannot be retrieved.
                  </span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      className={`${inputClass} pr-20`}
                      type={editPasswordVisible ? "text" : "password"}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditPasswordVisible((v) => !v)}
                        className="p-1.5 text-[var(--app-text-muted)] hover:text-brand-gold transition"
                        title={editPasswordVisible ? "Hide password" : "Show password"}
                      >
                        {editPasswordVisible ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={copyPassword}
                        disabled={!editPassword}
                        className="p-1.5 text-[var(--app-text-muted)] hover:text-brand-gold transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title={editPassword ? "Copy password" : "Type or generate a password first"}
                      >
                        {editCopyFeedback === "copied" ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const p = generatePassword(16);
                      setEditPassword(p);
                      setEditPasswordVisible(true);
                    }}
                    className="font-body text-[11px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-3 whitespace-nowrap hover:bg-brand-gold/10 transition"
                  >
                    Generate
                  </button>
                </div>
                {editCopyFeedback === "copied" && (
                  <div className="font-body text-[10px] text-green-400 mt-1">Copied to clipboard</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={closeEdit} className="font-body text-[12px] px-4 py-2 theme-text-secondary hover:text-[var(--app-text)] transition">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit} className="btn-gold text-[12px] px-4 py-2 disabled:opacity-50">
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions reference */}
      <div className="card mt-6 p-5">
        <div className="font-body font-semibold text-sm mb-4">Role Permissions Reference</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { role: "Super Admin", color: "text-brand-gold", perms: ["Full access to everything", "Create & delete admin users", "Manage enterprise partners", "Reset partner codes"] },
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
        <div className="mt-4 p-3 rounded-lg bg-brand-gold/5 border border-brand-gold/20">
          <div className="font-body text-[12px] text-brand-gold font-semibold mb-1 flex items-center gap-1.5">
            <span>★</span>
            <span>Star Super Admin — admin@fintella.partners</span>
          </div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)]">
            Single-email tier above super_admin. Exclusive capabilities: edit any admin user&apos;s name / email / role /
            password; delete + edit admin notes on partner records. Existing passwords are bcrypt-hashed and cannot
            be retrieved — &quot;view password&quot; means viewing a new password before it&apos;s saved.
          </div>
        </div>
      </div>
    </div>
  );
}
