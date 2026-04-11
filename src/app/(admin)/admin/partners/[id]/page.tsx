"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import CountryCodeSelect, { parseMobilePhone, buildMobilePhone } from "@/components/ui/CountryCodeSelect";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";

type Partner = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string | null;
  mobilePhone: string | null;
  tin: string | null;
  status: string;
  referredByPartnerCode: string | null;
  l1Rate: number | null;
  l2Rate: number | null;
  l3Rate: number | null;
  l3Enabled: boolean;
  notes: string | null;
  signupDate: string;
};

type PartnerProfile = {
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type DocEntry = {
  id: string;
  docType: string;
  fileName: string;
  status: string;
  createdAt: string;
};

type Agreement = {
  id: string;
  status: string;
  version: number;
  sentDate: string | null;
  signedDate: string | null;
};

const statusOptions = ["active", "pending", "inactive", "blocked"];
const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  inactive: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] border border-[var(--app-border)]",
  blocked: "bg-red-500/10 text-red-400 border border-red-500/20",
};

export default function PartnerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [downline, setDownline] = useState<Partner[]>([]);
  const [l3Partners, setL3Partners] = useState<Partner[]>([]);
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [downlineView, setDownlineView] = useState<"list" | "tree">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobileCountry, setMobileCountry] = useState("US");
  const [mobileNumber, setMobileNumber] = useState("");
  const [tin, setTin] = useState("");
  const [sendingAgreement, setSendingAgreement] = useState(false);
  const [sendingW9, setSendingW9] = useState(false);
  const [status, setStatus] = useState("active");
  const [referrer, setReferrer] = useState("");
  const [notes, setNotes] = useState("");

  // Address
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");

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
      const prof = data.profile;
      setPartner(p);
      setDownline(data.downline || []);
      setL3Partners(data.l3Partners || []);
      setDocuments(data.documents || []);
      setAgreement(data.agreement || null);

      setFirstName(p.firstName);
      setLastName(p.lastName);
      setCompanyName(p.companyName || "");
      setEmail(p.email);
      setPhone(p.phone || "");
      const parsedMobile = parseMobilePhone(p.mobilePhone || "");
      setMobileCountry(parsedMobile.countryCode);
      setMobileNumber(parsedMobile.phoneNumber);
      setTin(p.tin || "");
      setStatus(p.status);
      setReferrer(p.referredByPartnerCode || "");
      setNotes(p.notes || "");
      setStreet(prof?.street || "");
      setStreet2(prof?.street2 || "");
      setCity(prof?.city || "");
      setAddrState(prof?.state || "");
      setZip(prof?.zip || "");
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
        companyName: companyName || null,
        phone: phone || null,
        mobilePhone: buildMobilePhone(mobileCountry, mobileNumber) || null,
        tin: tin || null,
        status,
        referredByPartnerCode: referrer || null,
        notes: notes || null,
        street, street2, city, state: addrState, zip,
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

  const inputClass = "w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-4 py-2.5 text-[var(--app-text)] font-body text-sm outline-none focus:border-brand-gold/40 transition-colors placeholder:text-[var(--app-text-muted)]";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading partner...</div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="text-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Partner not found.</div>
        <button onClick={() => router.push("/admin/partners")} className="mt-4 font-body text-sm text-brand-gold hover:underline">← Back to Partners</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <button onClick={() => router.push("/admin/partners")} className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] mb-2 block">← Back to Partners</button>
          <h2 className="font-display text-xl font-bold">{partner.firstName} {partner.lastName}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-[13px] text-[var(--app-text-secondary)]">{partner.partnerCode}</span>
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
            <label className={labelClass}>Company Name</label>
            <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="If applicable" />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0000" />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={labelClass}>Mobile Phone (SMS)</label>
            <div className="flex gap-2">
              <CountryCodeSelect selectedCode={mobileCountry} onChange={setMobileCountry} />
              <input className={`${inputClass} flex-1 min-w-0`} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="555-555-0000" />
            </div>
          </div>
          <div>
            <label className={labelClass}>TIN</label>
            <input className={inputClass} value={tin} onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
              setTin(digits.length <= 2 ? digits : `${digits.slice(0, 2)}-${digits.slice(2)}`);
            }} placeholder="##-#######" maxLength={10} />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s} className="bg-[var(--app-bg)]">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
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
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-0.5">
              Current code: <span className="font-mono text-[var(--app-text-secondary)]">{partner.partnerCode}</span> — Used to log in.
            </p>
          </div>
          <button onClick={handleResetCode} className="font-body text-[12px] text-yellow-400/80 border border-yellow-400/20 rounded-lg px-4 py-2 hover:bg-yellow-400/10 transition-colors">
            Reset Code
          </button>
        </div>
      </div>

      {/* ─── ADDRESS ────────────────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Address</div>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className={labelClass}>Street Address 1</label>
            <input className={inputClass} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" />
          </div>
          <div>
            <label className={labelClass}>Street Address 2</label>
            <input className={inputClass} value={street2} onChange={(e) => setStreet2(e.target.value)} placeholder="Suite 100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>City</label>
              <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input className={inputClass} value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="State" />
            </div>
            <div>
              <label className={labelClass}>Zip Code</label>
              <input className={inputClass} value={zip} onChange={(e) => setZip(e.target.value)} placeholder="12345" />
            </div>
          </div>
        </div>
      </div>

      {/* ─── COMMISSION OVERRIDES ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-1">Commission Rates</div>
        <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">Leave blank to use global default rates. Enter a value to override for this partner.</p>
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
                className={`relative inline-flex h-11 w-14 items-center rounded-lg shrink-0 transition-colors ${l3Enabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
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
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-body font-semibold text-sm">Downline Partners ({downline.length})</div>
          {downline.length > 0 && (
            <div className="flex bg-[var(--app-input-bg)] rounded-lg p-0.5">
              <button
                onClick={() => setDownlineView("list")}
                className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  downlineView === "list" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                List
              </button>
              <button
                onClick={() => setDownlineView("tree")}
                className={`font-body text-[11px] px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  downlineView === "tree" ? "bg-brand-gold/15 text-brand-gold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 0a4 4 0 014 4h2a2 2 0 012 2v2M12 8a4 4 0 00-4 4H6a2 2 0 00-2 2v2m8-8v4m0 0a2 2 0 012 2v2m-2-4a2 2 0 00-2 2v2" />
                </svg>
                Tree View
              </button>
            </div>
          )}
        </div>
        {downline.length === 0 ? (
          <div className="px-5 py-8 text-center font-body text-[13px] text-[var(--app-text-muted)]">No downline partners.</div>
        ) : downlineView === "tree" ? (
          (() => {
            const rootPartner: TreePartner = {
              id: partner.id,
              partnerCode: partner.partnerCode,
              firstName: partner.firstName,
              lastName: partner.lastName,
              status: partner.status,
              children: downline.map((d) => ({
                id: d.id,
                partnerCode: d.partnerCode,
                firstName: d.firstName,
                lastName: d.lastName,
                status: d.status,
                children: l3Partners
                  .filter((l3) => l3.referredByPartnerCode === d.partnerCode)
                  .map((l3) => ({
                    id: l3.id,
                    partnerCode: l3.partnerCode,
                    firstName: l3.firstName,
                    lastName: l3.lastName,
                    status: l3.status,
                    children: [],
                  })),
              })),
            };
            return <DownlineTree root={rootPartner} />;
          })()
        ) : (
          <div>
            {downline.map((d) => (
              <div
                key={d.id}
                className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer flex items-center justify-between"
                onClick={() => router.push(`/admin/partners/${d.id}`)}
              >
                <div>
                  <div className="font-body text-[13px] text-[var(--app-text)]">{d.firstName} {d.lastName}</div>
                  <div className="font-mono text-[11px] text-[var(--app-text-muted)]">{d.partnerCode}</div>
                </div>
                <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[d.status] || statusBadge.active}`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── DOCUMENTS & AGREEMENT ─────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
          <div className="font-body font-semibold text-sm">Documents & Agreement</div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setSendingAgreement(true);
                try {
                  await fetch(`/api/admin/agreement/${partner.partnerCode}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, name: `${firstName} ${lastName}` }),
                  });
                  fetchPartner();
                  setSaved(true);
                  setTimeout(() => setSaved(false), 3000);
                } catch {} finally { setSendingAgreement(false); }
              }}
              disabled={sendingAgreement}
              className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-50"
            >
              {sendingAgreement ? "Sending..." : "Send Agreement"}
            </button>
            <button
              onClick={async () => {
                setSendingW9(true);
                try {
                  await fetch("/api/admin/partners/" + id, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ w9Requested: true }),
                  });
                  // Create a document record for the W9 request
                  setSaved(true);
                  setTimeout(() => setSaved(false), 3000);
                } catch {} finally { setSendingW9(false); }
              }}
              disabled={sendingW9}
              className="font-body text-[11px] text-purple-400/70 border border-purple-400/20 rounded-lg px-3 py-1.5 hover:bg-purple-400/10 transition-colors disabled:opacity-50"
            >
              {sendingW9 ? "Sending..." : "Request W9"}
            </button>
          </div>
        </div>

        {/* Agreement status */}
        <div className="px-5 py-3 border-b border-[var(--app-border)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)]">Partnership Agreement</div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                {agreement
                  ? `Version ${agreement.version} — ${agreement.signedDate ? `Signed ${fmtDate(agreement.signedDate)}` : `Sent ${fmtDate(agreement.sentDate)}`}`
                  : "No agreement on file"}
              </div>
            </div>
            <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${
              agreement?.status === "signed"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : agreement?.status === "pending"
                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  : agreement?.status === "amended"
                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                    : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
            }`}>
              {agreement?.status || "none"}
            </span>
          </div>
        </div>

        {/* W9 status */}
        <div className="px-5 py-3 border-b border-[var(--app-border)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)]">W-9 (1099 Tax Filing)</div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                {(() => {
                  const w9 = documents.find((d) => d.docType === "w9");
                  return w9 ? `Uploaded ${fmtDate(w9.createdAt)}` : "Required for year-end 1099 reporting";
                })()}
              </div>
            </div>
            <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${
              (() => {
                const w9 = documents.find((d) => d.docType === "w9");
                if (!w9) return "bg-red-500/10 text-red-400 border border-red-500/20";
                if (w9.status === "approved") return "bg-green-500/10 text-green-400 border border-green-500/20";
                if (w9.status === "under_review") return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
                return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
              })()
            }`}>
              {(() => {
                const w9 = documents.find((d) => d.docType === "w9");
                if (!w9) return "needed";
                return w9.status.replace("_", " ");
              })()}
            </span>
          </div>
        </div>

        {/* Uploaded documents */}
        {documents.length === 0 ? (
          <div className="px-5 py-8 text-center font-body text-[13px] text-[var(--app-text-muted)]">No documents uploaded.</div>
        ) : (
          <div>
            {documents.map((d) => (
              <div key={d.id} className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 flex items-center justify-between">
                <div>
                  <div className="font-body text-[13px] text-[var(--app-text)]">{d.fileName}</div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                    {d.docType.toUpperCase()} &middot; {fmtDate(d.createdAt)}
                  </div>
                </div>
                <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${
                  d.status === "approved"
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : d.status === "under_review"
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : d.status === "rejected"
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}>
                  {d.status.replace("_", " ")}
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
