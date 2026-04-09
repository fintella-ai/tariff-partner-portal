"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  l3Rate: number | null;
  l3Enabled: boolean;
  notes: string | null;
  signupDate: string;
};

const statusOptions = ["active", "pending", "inactive", "blocked"];
const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  inactive: "bg-white/10 text-white/50 border border-white/10",
  blocked: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function PartnerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [downline, setDownline] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("active");
  const [referrer, setReferrer] = useState("");
  const [notes, setNotes] = useState("");

  // Commission overrides
  const [l1Rate, setL1Rate] = useState("");
  const [l2Rate, setL2Rate] = useState("");
  const [l3Rate, setL3Rate] = useState("");
  const [l3Enabled, setL3Enabled] = useState(false);

  const fetchPartner = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/partners/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const p = data.partner;
      setPartner(p);
      setDownline(data.downline || []);

      setFirstName(p.firstName);
      setLastName(p.lastName);
      setEmail(p.email);
      setPhone(p.phone || "");
      setStatus(p.status);
      setReferrer(p.referredByPartnerCode || "");
      setNotes(p.notes || "");
      setL1Rate(p.l1Rate != null ? String(Math.round(p.l1Rate * 100)) : "");
      setL2Rate(p.l2Rate != null ? String(Math.round(p.l2Rate * 100)) : "");
      setL3Rate(p.l3Rate != null ? String(Math.round(p.l3Rate * 100)) : "");
      setL3Enabled(p.l3Enabled);
    } catch {} finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPartner(); }, [fetchPartner]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        firstName, lastName, email,
        phone: phone || null,
        status,
        referredByPartnerCode: referrer || null,
        notes: notes || null,
        l1Rate: l1Rate ? parseFloat(l1Rate) / 100 : null,
        l2Rate: l2Rate ? parseFloat(l2Rate) / 100 : null,
        l3Rate: l3Rate ? parseFloat(l3Rate) / 100 : null,
        l3Enabled,
      };
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setPartner(data.partner);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleResetCode = async () => {
    if (!confirm("Generate a new partner code? The partner will need to use the new code to log in.")) return;
    try {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPartnerCode: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setPartner(data.partner);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {}
  };

  const handleDelete = async () => {
    if (!confirm(`Delete partner ${partner?.firstName} ${partner?.lastName}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/partners/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/admin/partners");
    } catch {}
  };

  const inputClass = "w-full bg-white/5 border border-white/[0.12] rounded-lg px-4 py-2.5 text-white font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-white/30";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-white/50 mb-1.5 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-white/40">Loading partner...</div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="text-center py-20">
        <div className="font-body text-sm text-white/40">Partner not found.</div>
        <button onClick={() => router.push("/admin/partners")} className="mt-4 font-body text-sm text-brand-gold hover:underline">← Back to Partners</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push("/admin/partners")} className="font-body text-[12px] text-white/40 hover:text-white/60 mb-2 block">← Back to Partners</button>
          <h2 className="font-display text-xl font-bold">{partner.firstName} {partner.lastName}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[13px] text-white/50">{partner.partnerCode}</span>
            <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[partner.status] || statusBadge.active}`}>
              {partner.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2 self-start">
          <button onClick={handleSave} disabled={saving} className="btn-gold text-[12px] px-5 py-2.5 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button onClick={handleDelete} className="font-body text-[12px] text-red-400/60 border border-red-400/20 rounded-lg px-4 py-2.5 hover:bg-red-400/10 transition-colors">
            Delete
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg font-body text-[13px] text-green-400">
          Partner updated successfully.
        </div>
      )}

      {/* ─── PARTNER INFO ─────────────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Partner Information</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>First Name</label>
            <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0000" />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s} className="bg-brand-dark">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Referred By (Code)</label>
            <input className={inputClass} value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="e.g. PTNJRO001" />
          </div>
        </div>
      </div>

      {/* ─── PARTNER CODE / RESET ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-body font-semibold text-sm">Partner Code</div>
            <p className="font-body text-[12px] text-white/40 mt-0.5">
              Current code: <span className="font-mono text-white/60">{partner.partnerCode}</span> — Used to log in.
            </p>
          </div>
          <button onClick={handleResetCode} className="font-body text-[12px] text-yellow-400/80 border border-yellow-400/20 rounded-lg px-4 py-2 hover:bg-yellow-400/10 transition-colors">
            Reset Code
          </button>
        </div>
      </div>

      {/* ─── COMMISSION OVERRIDES ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-1">Commission Rates</div>
        <p className="font-body text-[12px] text-white/40 mb-4">Leave blank to use global default rates. Enter a value to override for this partner.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>L1 Rate (%)</label>
            <input className={inputClass} type="number" min="0" max="100" value={l1Rate} onChange={(e) => setL1Rate(e.target.value)} placeholder="Default" />
          </div>
          <div>
            <label className={labelClass}>L2 Rate (%)</label>
            <input className={inputClass} type="number" min="0" max="100" value={l2Rate} onChange={(e) => setL2Rate(e.target.value)} placeholder="Default" />
          </div>
          <div>
            <label className={labelClass}>L3 Rate (%)</label>
            <div className="flex gap-2">
              <input className={`${inputClass} flex-1`} type="number" min="0" max="100" value={l3Rate} onChange={(e) => setL3Rate(e.target.value)} placeholder="0" disabled={!l3Enabled} />
              <button
                onClick={() => setL3Enabled(!l3Enabled)}
                className={`relative inline-flex h-10 w-14 items-center rounded-lg shrink-0 transition-colors ${l3Enabled ? "bg-green-500" : "bg-white/10"}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-md bg-white transition-transform ${l3Enabled ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── ADMIN NOTES ─────────────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-3">Admin Notes</div>
        <textarea
          className={`${inputClass} resize-none`}
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this partner..."
        />
      </div>

      {/* ─── DOWNLINE ─────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="font-body font-semibold text-sm">Downline Partners ({downline.length})</div>
        </div>
        {downline.length === 0 ? (
          <div className="px-5 py-8 text-center font-body text-[13px] text-white/30">No downline partners.</div>
        ) : (
          <div>
            {downline.map((d) => (
              <div
                key={d.id}
                className="px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors cursor-pointer flex items-center justify-between"
                onClick={() => router.push(`/admin/partners/${d.id}`)}
              >
                <div>
                  <div className="font-body text-[13px] text-white/80">{d.firstName} {d.lastName}</div>
                  <div className="font-mono text-[11px] text-white/30">{d.partnerCode}</div>
                </div>
                <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[d.status] || statusBadge.active}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-gold text-[12px] px-6 py-2.5 disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
