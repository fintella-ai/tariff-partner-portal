"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";

type Partner = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  referredByPartnerCode: string | null;
  l1Rate: number | null;
  l2Rate: number | null;
  notes: string | null;
  signupDate: string;
};

const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  inactive: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]",
  blocked: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function AdminPartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Add form
  const [formFirst, setFormFirst] = useState("");
  const [formLast, setFormLast] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formReferrer, setFormReferrer] = useState("");
  const [formError, setFormError] = useState("");

  const fetchPartners = useCallback(async () => {
    try {
      const url = search ? `/api/admin/partners?search=${encodeURIComponent(search)}` : "/api/admin/partners";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPartners(data.partners || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const handleAdd = async () => {
    setFormError("");
    if (!formFirst.trim() || !formLast.trim() || !formEmail.trim()) {
      setFormError("First name, last name, and email are required.");
      return;
    }
    try {
      const res = await fetch("/api/admin/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formFirst.trim(),
          lastName: formLast.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || null,
          partnerCode: formCode.trim() || undefined,
          referredByPartnerCode: formReferrer.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || "Failed to create partner");
        return;
      }
      setShowForm(false);
      setFormFirst(""); setFormLast(""); setFormEmail(""); setFormPhone(""); setFormCode(""); setFormReferrer("");
      fetchPartners();
    } catch {
      setFormError("Connection error");
    }
  };

  const total = partners.length;
  const active = partners.filter((p) => p.status === "active").length;
  const pending = partners.filter((p) => p.status === "pending").length;
  const blocked = partners.filter((p) => p.status === "blocked").length;

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-2.5 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Partner Management</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1">View, add, and manage partners.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-gold text-[12px] px-4 py-2.5 self-start">
          + Add Partner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Partners", value: total, color: "text-[var(--app-text)]" },
          { label: "Active", value: active, color: "text-green-400" },
          { label: "Pending", value: pending, color: "text-yellow-400" },
          { label: "Blocked", value: blocked, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add Partner Form */}
      {showForm && (
        <div className="card p-5 mb-6">
          <div className="font-body font-semibold text-sm mb-4">Add New Partner</div>
          {formError && <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg font-body text-[12px] text-red-400">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input className={inputClass} value={formFirst} onChange={(e) => setFormFirst(e.target.value)} placeholder="First Name *" />
            <input className={inputClass} value={formLast} onChange={(e) => setFormLast(e.target.value)} placeholder="Last Name *" />
            <input className={inputClass} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="Email *" type="email" />
            <input className={inputClass} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone" />
            <input className={inputClass} value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="Partner Code (auto-generated)" />
            <input className={inputClass} value={formReferrer} onChange={(e) => setFormReferrer(e.target.value)} placeholder="Referred By (partner code)" />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="btn-gold text-[12px] px-5 py-2.5">Create Partner</button>
            <button onClick={() => setShowForm(false)} className="font-body text-[12px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-5 py-2.5 hover:text-[var(--app-text-secondary)] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or partner code..." />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="font-body text-sm text-[var(--app-text-muted)]">Loading partners...</div>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="card hidden sm:block">
            <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.8fr_0.6fr] gap-3 px-5 py-3 border-b border-[var(--app-border)]">
              {["Partner", "Code", "Email", "Status", "Joined", ""].map((h) => (
                <div key={h} className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider">{h}</div>
              ))}
            </div>
            {partners.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.8fr_0.6fr] gap-3 px-5 py-3.5 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors items-center cursor-pointer"
                onClick={() => router.push(`/admin/partners/${p.id}`)}
              >
                <div className="font-body text-[13px] text-[var(--app-text)] font-medium">{p.firstName} {p.lastName}</div>
                <div className="font-mono text-[12px] text-[var(--app-text-secondary)]">{p.partnerCode}</div>
                <div className="font-body text-[12px] text-[var(--app-text-secondary)] truncate">{p.email}</div>
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                    {p.status}
                  </span>
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(p.signupDate)}</div>
                <div className="text-right">
                  <span className="font-body text-[11px] text-brand-gold/60 hover:text-brand-gold transition-colors">View →</span>
                </div>
              </div>
            ))}
            {partners.length === 0 && (
              <div className="px-5 py-10 text-center font-body text-[13px] text-[var(--app-text-muted)]">No partners found.</div>
            )}
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {partners.map((p) => (
              <div key={p.id} className="card p-4 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors" onClick={() => router.push(`/admin/partners/${p.id}`)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{p.firstName} {p.lastName}</div>
                    <div className="font-mono text-[11px] text-[var(--app-text-muted)] mt-0.5">{p.partnerCode}</div>
                  </div>
                  <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[p.status] || statusBadge.active}`}>
                    {p.status}
                  </span>
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-1">{p.email}</div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">Joined {fmtDate(p.signupDate)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
