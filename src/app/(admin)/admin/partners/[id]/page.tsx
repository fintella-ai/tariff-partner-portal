"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fmtDate } from "@/lib/format";
import { getPermissions } from "@/lib/permissions";
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
  tier: string;
  commissionRate: number;
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
  fileUrl: string;
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
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === "super_admin";
  const permissions = getPermissions((session?.user as any)?.role || "admin");
  const { id } = useParams();
  const router = useRouter();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [downline, setDownline] = useState<Partner[]>([]);
  const [l3Partners, setL3Partners] = useState<Partner[]>([]);
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [adminNotes, setAdminNotes] = useState<any[]>([]);
  const [codeHistory, setCodeHistory] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [enterprisePartner, setEnterprisePartner] = useState<any>(null);
  const [commLogFilter, setCommLogFilter] = useState<"all" | "support" | "email" | "sms" | "chat" | "phone">("all");
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
  const [uploadingAgreement, setUploadingAgreement] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [status, setStatus] = useState("active");
  const [referrer, setReferrer] = useState("");
  const [notes, setNotes] = useState("");

  // Address
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");

  // Payout / Banking
  const [payoutMethod, setPayoutMethod] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankAddress, setBankAddress] = useState("");

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
      setAdminNotes(data.adminNotes || []);
      setCodeHistory(data.codeHistory || []);
      setSupportTickets(data.supportTickets || []);
      setNotifications(data.notifications || []);
      setEnterprisePartner(data.enterprisePartner || null);

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
      setPayoutMethod(prof?.payoutMethod || "");
      setBankName(prof?.bankName || "");
      setAccountType(prof?.accountType || "");
      setRoutingNumber(prof?.routingNumber || "");
      setAccountNumber(prof?.accountNumber || "");
      setBeneficiaryName(prof?.beneficiaryName || "");
      setBankAddress(prof?.bankAddress || "");
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
        payoutMethod, bankName, accountType, routingNumber,
        accountNumber, beneficiaryName, bankAddress,
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
    if (!confirm(`Generate a new partner code for ${partner?.firstName} ${partner?.lastName}?\n\nCurrent code: ${partner?.partnerCode}\n\nThis action cannot be undone. A new unique code will be generated.`)) return;
    if (!confirm(`FINAL CONFIRMATION: This will permanently replace the partner code for ${partner?.firstName} ${partner?.lastName}. Continue?`)) return;
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
        <div className="flex gap-2 self-start flex-wrap">
          <button onClick={handleSave} disabled={saving} className="btn-gold text-[12px] px-5 py-2.5 disabled:opacity-50">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/admin/impersonate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ partnerCode: partner.partnerCode }),
                });
                if (res.ok) {
                  const { url } = await res.json();
                  window.open(url, "_blank");
                }
              } catch {}
            }}
            className="font-body text-[12px] text-purple-400/80 border border-purple-400/20 rounded-lg px-4 py-2.5 hover:bg-purple-400/10 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View as Partner
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

      {/* ─── LOGIN CREDENTIALS ──────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Login Credentials</div>

        {/* Partner Code */}
        <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div>
            <div className="font-body text-[12px] text-[var(--app-text-secondary)]">Partner Code</div>
            <div className="font-mono text-[14px] text-[var(--app-text)] mt-0.5">{partner.partnerCode}</div>
            <p className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">Legacy login method (email + code)</p>
          </div>
          {isSuperAdmin && (
          <button onClick={handleResetCode} className="font-body text-[12px] text-yellow-400/80 border border-yellow-400/20 rounded-lg px-4 py-2 hover:bg-yellow-400/10 transition-colors">
            Generate New Code
          </button>
          )}
        </div>

        {/* Code History */}
        {codeHistory.length > 0 && (
          <div className="mb-4 pb-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-2">Previous Codes</div>
            <div className="space-y-1.5">
              {codeHistory.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ background: "var(--app-card-bg)" }}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] text-[var(--app-text-muted)] line-through">{h.oldCode}</span>
                    <span className="text-[var(--app-text-faint)]">&rarr;</span>
                    <span className="font-mono text-[12px] text-[var(--app-text-secondary)]">{h.newCode}</span>
                  </div>
                  <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                    {new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} by {h.changedBy}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Set Password */}
        <div>
          <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-2">Set / Reset Password</div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="partnerNewPassword"
              type="password"
              className={inputClass + " flex-1"}
              placeholder="Enter new password (min 6 characters)"
            />
            <button
              onClick={async () => {
                const input = document.getElementById("partnerNewPassword") as HTMLInputElement;
                const pw = input?.value;
                if (!pw || pw.length < 6) { alert("Password must be at least 6 characters."); return; }
                if (!confirm(`Set a new password for ${partner.firstName} ${partner.lastName}?`)) return;
                try {
                  const res = await fetch(`/api/admin/partners/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newPassword: pw }),
                  });
                  if (res.ok) {
                    input.value = "";
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                  } else {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || "Failed to set password");
                  }
                } catch { alert("Network error"); }
              }}
              className="font-body text-[12px] text-green-400/80 border border-green-400/20 rounded-lg px-4 py-2.5 hover:bg-green-400/10 transition-colors shrink-0"
            >
              Set Password
            </button>
          </div>
          <p className="font-body text-[10px] text-[var(--app-text-muted)] mt-1.5">Partner will log in with their email + this password.</p>
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

      {/* ─── PAYOUT INFORMATION ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Payout Information</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Payout Method</label>
            <select className={inputClass} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
              <option value="">Select method...</option>
              <option value="wire">Domestic Wire Transfer</option>
              <option value="ach">ACH Transfer</option>
              <option value="check">Paper Check</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Bank Name</label>
            <input className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase, Bank of America" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Account Type</label>
            <select className={inputClass} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              <option value="">Select type...</option>
              <option value="checking">Business Checking</option>
              <option value="savings">Business Savings</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Beneficiary Name</label>
            <input className={inputClass} value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="Name on the account" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Routing Number</label>
            <input className={inputClass} value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} placeholder="9-digit routing number" maxLength={9} />
          </div>
          <div>
            <label className={labelClass}>Account Number</label>
            <input className={inputClass} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Bank Address</label>
          <input className={inputClass} value={bankAddress} onChange={(e) => setBankAddress(e.target.value)} placeholder="Full bank branch street address" />
        </div>
      </div>

      {/* ─── COMMISSION & TIER ────────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Commission Structure</div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {/* Tier */}
          <div className="p-4 rounded-lg bg-brand-gold/[0.06] border border-brand-gold/20">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Partner Tier</div>
            <div className="font-display text-xl font-bold text-brand-gold">{(partner.tier || "l1").toUpperCase()}</div>
          </div>

          {/* Commission rate */}
          <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Commission Rate</div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {partner.commissionRate ? `${Math.round(partner.commissionRate * 100)}%` : "25%"}
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">of firm fee on direct deals</div>
          </div>

          {/* L3 toggle */}
          <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">L3 Recruitment</div>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setL3Enabled(!l3Enabled)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full shrink-0 transition-colors ${l3Enabled ? "bg-green-500" : "bg-[var(--app-input-bg)]"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${l3Enabled ? "translate-x-7" : "translate-x-1.5"}`} />
              </button>
              <span className={`font-body text-[13px] font-medium ${l3Enabled ? "text-green-400" : "text-[var(--app-text-muted)]"}`}>
                {l3Enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-2">
              {l3Enabled ? "This partner can recruit L3 sub-partners" : "Enable to allow this partner to recruit L3 sub-partners"}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-brand-gold/[0.04] border border-brand-gold/10">
          <p className="font-body text-[11px] text-[var(--app-text-muted)] leading-relaxed">
            All partners earn <strong className="text-brand-gold">25%</strong> of the firm fee total across tiers. L2/L3 rates are chosen by the recruiting partner (10%, 15%, or 20%) when they generate a recruitment link. The override (25% minus the recruit&apos;s rate) goes to the upline.
          </p>
        </div>

        {/* Enterprise Partner Commission (only visible if this partner is an EP) */}
        {enterprisePartner && (
          <div className="mt-4 p-4 rounded-lg bg-purple-500/[0.06] border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase bg-purple-500/15 text-purple-400 border border-purple-500/25">
                Enterprise Partner
              </span>
              {enterprisePartner.applyToAll && (
                <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase bg-green-500/10 text-green-400 border border-green-500/20">
                  GLOBAL
                </span>
              )}
              <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase ${
                enterprisePartner.status === "active"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
              }`}>
                {enterprisePartner.status}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Total Rate</div>
                <div className="font-display text-xl font-bold text-purple-400">{Math.round(enterprisePartner.totalRate * 100)}%</div>
              </div>
              <div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Override Rate</div>
                <div className="font-display text-xl font-bold text-purple-400">{Math.round(enterprisePartner.overrideRate * 100)}%</div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)]">above standard 25%</div>
              </div>
              <div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Coverage</div>
                <div className="font-body text-sm font-semibold text-[var(--app-text)]">
                  {enterprisePartner.applyToAll ? "All Partners" : `${enterprisePartner.overrides?.length || 0} L1 Partners`}
                </div>
              </div>
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-3">
              Confidential — this information is only visible to admins and the enterprise partner. Managed in Revenue &gt; Custom Commissions.
            </div>
          </div>
        )}
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
              commissionRate: partner.commissionRate,
              children: downline.map((d) => ({
                id: d.id,
                partnerCode: d.partnerCode,
                firstName: d.firstName,
                lastName: d.lastName,
                status: d.status,
                commissionRate: d.commissionRate,
                children: l3Partners
                  .filter((l3) => l3.referredByPartnerCode === d.partnerCode)
                  .map((l3) => ({
                    id: l3.id,
                    partnerCode: l3.partnerCode,
                    firstName: l3.firstName,
                    lastName: l3.lastName,
                    status: l3.status,
                    commissionRate: (l3 as any).commissionRate,
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

      {/* ─── ADMIN NOTES (audit log) ──────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="font-body font-semibold text-sm mb-3">Admin Notes</div>
          <div className="flex gap-2">
            <textarea
              id="newAdminNote"
              className={`${inputClass} resize-none flex-1`}
              rows={2}
              placeholder="Add a note about this partner..."
            />
            <button
              onClick={async () => {
                const textarea = document.getElementById("newAdminNote") as HTMLTextAreaElement;
                const content = textarea?.value;
                if (!content?.trim()) return;
                try {
                  const res = await fetch("/api/admin/notes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ partnerCode: partner.partnerCode, content }),
                  });
                  if (res.ok) {
                    textarea.value = "";
                    fetchPartner();
                  } else {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || "Failed to add note");
                  }
                } catch { alert("Network error"); }
              }}
              className="self-end font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-4 py-2.5 hover:bg-brand-gold/10 transition-colors shrink-0"
            >
              Post Note
            </button>
          </div>
        </div>

        {/* Notes audit log — pinned first, then newest first */}
        {(() => {
          const pinned = adminNotes.filter((n: any) => n.isPinned);
          const unpinned = adminNotes.filter((n: any) => !n.isPinned);
          const allSorted = [...pinned, ...unpinned];

          return allSorted.length > 0 ? (
            <div>
              {allSorted.map((n: any) => (
                <div key={n.id} className={`px-5 py-3 ${n.isPinned ? "bg-brand-gold/[0.04]" : ""}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      {n.isPinned && <span className="text-[10px] text-brand-gold">&#128204;</span>}
                      <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)]">{n.authorName}</div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                        {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {" "}
                        {new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch("/api/admin/notes", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ noteId: n.id, isPinned: !n.isPinned }),
                        });
                        fetchPartner();
                      }}
                      className="font-body text-[9px] theme-text-muted hover:text-brand-gold transition-colors shrink-0"
                    >
                      {n.isPinned ? "Unpin" : "Pin"}
                    </button>
                  </div>
                  <div className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed whitespace-pre-wrap">{n.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-6 text-center font-body text-[13px] text-[var(--app-text-muted)]">No notes yet.</div>
          );
        })()}
      </div>

      {/* ─── DOCUMENTS & AGREEMENT ─────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between">
          <div className="font-body font-semibold text-sm">Documents & Agreement</div>
          <div className="flex gap-2 flex-wrap">
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
            <label className={`font-body text-[11px] text-green-400/70 border border-green-400/20 rounded-lg px-3 py-1.5 hover:bg-green-400/10 transition-colors cursor-pointer ${uploadingAgreement ? "opacity-50 pointer-events-none" : ""}`}>
              {uploadingAgreement ? "Uploading..." : "Upload Agreement"}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingAgreement(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const res = await fetch("/api/admin/documents", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          partnerCode: partner.partnerCode,
                          docType: "agreement",
                          fileName: file.name,
                          fileData: reader.result,
                        }),
                      });
                      if (res.ok) {
                        fetchPartner();
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || "Upload failed");
                      }
                      setUploadingAgreement(false);
                    };
                    reader.readAsDataURL(file);
                  } catch { setUploadingAgreement(false); }
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={async () => {
                setSendingW9(true);
                try {
                  await fetch("/api/admin/partners/" + id, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ w9Requested: true }),
                  });
                  setSaved(true);
                  setTimeout(() => setSaved(false), 3000);
                } catch {} finally { setSendingW9(false); }
              }}
              disabled={sendingW9}
              className="font-body text-[11px] text-purple-400/70 border border-purple-400/20 rounded-lg px-3 py-1.5 hover:bg-purple-400/10 transition-colors disabled:opacity-50"
            >
              {sendingW9 ? "Sending..." : "Request W9"}
            </button>
            <label className={`font-body text-[11px] text-blue-400/70 border border-blue-400/20 rounded-lg px-3 py-1.5 hover:bg-blue-400/10 transition-colors cursor-pointer ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
              {uploadingDoc ? "Uploading..." : "Upload W9"}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingDoc(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const res = await fetch("/api/admin/documents", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          partnerCode: partner.partnerCode,
                          docType: "w9",
                          fileName: file.name,
                          fileData: reader.result,
                        }),
                      });
                      if (res.ok) {
                        fetchPartner();
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || "Upload failed");
                      }
                      setUploadingDoc(false);
                    };
                    reader.readAsDataURL(file);
                  } catch { setUploadingDoc(false); }
                  e.target.value = "";
                }}
              />
            </label>
            <label className={`font-body text-[11px] text-green-400/70 border border-green-400/20 rounded-lg px-3 py-1.5 hover:bg-green-400/10 transition-colors cursor-pointer ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}>
              Upload Bank Letter
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingDoc(true);
                  try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const res = await fetch("/api/admin/documents", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          partnerCode: partner.partnerCode,
                          docType: "bank_letter",
                          fileName: file.name,
                          fileData: reader.result,
                        }),
                      });
                      if (res.ok) {
                        fetchPartner();
                        setSaved(true);
                        setTimeout(() => setSaved(false), 3000);
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || "Upload failed");
                      }
                      setUploadingDoc(false);
                    };
                    reader.readAsDataURL(file);
                  } catch { setUploadingDoc(false); }
                  e.target.value = "";
                }}
              />
            </label>
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
              agreement?.status === "signed" || agreement?.status === "approved"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : agreement?.status === "pending"
                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  : agreement?.status === "under_review"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : agreement?.status === "amended"
                      ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                      : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
            }`}>
              {agreement?.status === "approved" ? "signed & approved" : agreement?.status?.replace("_", " ") || "none"}
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
            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-[1.5fr_0.8fr_0.6fr_0.8fr] gap-3 px-5 py-2.5 border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">Document Name</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">Document Type</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted">Status</div>
              <div className="font-body text-[10px] tracking-[1px] uppercase theme-text-muted text-right">Actions</div>
            </div>
            {documents.map((d) => (
              <div key={d.id} className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 sm:grid sm:grid-cols-[1.5fr_0.8fr_0.6fr_0.8fr] sm:gap-3 sm:items-center flex flex-col sm:flex-row gap-2">
                <div className="min-w-0">
                  <div className="font-body text-[13px] text-[var(--app-text)] truncate">{d.fileName}</div>
                  <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 sm:hidden">
                    {d.docType === "agreement" ? "Agreement" : d.docType === "w9" ? "Tax Document (W9)" : d.docType === "bank_letter" ? "Bank Letter / Voided Check" : d.docType.toUpperCase()} &middot; {fmtDate(d.createdAt)}
                  </div>
                  <div className="hidden sm:block font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">{fmtDate(d.createdAt)}</div>
                </div>
                <div className="hidden sm:block">
                  <span className="font-body text-[12px] text-[var(--app-text-secondary)]">
                    {d.docType === "agreement" ? "Agreement" : d.docType === "w9" ? "Tax Document (W9)" : d.docType === "bank_letter" ? "Bank Letter / Voided Check" : d.docType.toUpperCase()}
                  </span>
                </div>
                {/* Status column */}
                <div>
                  <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${
                    d.status === "approved"
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : d.status === "voided"
                        ? "bg-gray-500/10 text-gray-400 border border-gray-500/20 line-through"
                        : d.status === "under_review"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          : d.status === "rejected"
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}>
                    {d.status.replace("_", " ")}
                  </span>
                </div>
                {/* Actions column */}
                <div className="flex items-center gap-2 justify-end">
                  {d.fileUrl && (
                    <>
                      <button
                        onClick={() => {
                          const w = window.open();
                          if (w) { w.document.write(`<iframe src="${d.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); w.document.title = d.fileName; }
                        }}
                        className="font-body text-[10px] text-brand-gold/60 hover:text-brand-gold transition-colors"
                      >
                        View
                      </button>
                      <a href={d.fileUrl} download={d.fileName} className="font-body text-[10px] text-blue-400/60 hover:text-blue-400 transition-colors">
                        Download
                      </a>
                    </>
                  )}
                  {d.status === "under_review" && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Approve this ${d.docType === "agreement" ? "agreement" : "document"} for ${partner.firstName} ${partner.lastName}?${d.docType === "agreement" ? "\n\nThis will activate the partner." : ""}`)) return;
                        try {
                          const res = await fetch("/api/admin/documents", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ documentId: d.id, action: "approve" }),
                          });
                          if (res.ok) { fetchPartner(); setSaved(true); setTimeout(() => setSaved(false), 3000); }
                          else { const err = await res.json().catch(() => ({})); alert(err.error || "Failed to approve"); }
                        } catch { alert("Network error"); }
                      }}
                      className="font-body text-[10px] text-green-400 border border-green-400/20 rounded px-2 py-0.5 hover:bg-green-400/10 transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {d.status !== "voided" && permissions.canVoidDocuments && (
                    <button
                      onClick={async () => {
                        const docLabel = d.docType === "agreement" ? "agreement" : "W9";
                        if (!confirm(`Void this ${docLabel} (${d.fileName})?${d.docType === "agreement" ? "\n\nThis will set the partner back to PENDING status until a new agreement is uploaded." : ""}`)) return;
                        if (!confirm(`CONFIRM: Void ${d.fileName}? This cannot be undone.`)) return;
                        try {
                          const res = await fetch("/api/admin/documents", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ documentId: d.id, action: "void" }),
                          });
                          if (res.ok) {
                            fetchPartner();
                            setSaved(true);
                            setTimeout(() => setSaved(false), 3000);
                          } else {
                            const err = await res.json().catch(() => ({}));
                            alert(err.error || "Failed to void");
                          }
                        } catch { alert("Network error"); }
                      }}
                      className="font-body text-[10px] text-red-400/60 hover:text-red-400 border border-red-400/15 hover:border-red-400/30 rounded px-2 py-0.5 transition-colors"
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ COMMUNICATION LOG ═══ */}
      <div className="card">
        <div className="px-5 py-4 border-b border-[var(--app-border)]">
          <div className="font-body font-semibold text-sm">Communication Log</div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">All communications with this partner across all channels.</div>
        </div>

        {/* Filter tabs */}
        <div className="px-5 py-3 border-b border-[var(--app-border)] flex gap-2 overflow-x-auto">
          {([
            { key: "all", label: "All", icon: "📋" },
            { key: "support", label: "Support Tickets", icon: "🎫" },
            { key: "email", label: "Email", icon: "📧" },
            { key: "sms", label: "SMS", icon: "💬" },
            { key: "chat", label: "Live Chat", icon: "🗨" },
            { key: "phone", label: "Phone Calls", icon: "📞" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setCommLogFilter(f.key)}
              className={`font-body text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition flex items-center gap-1.5 ${
                commLogFilter === f.key
                  ? "bg-brand-gold/20 text-brand-gold"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text)]"
              }`}
            >
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>

        {/* Support Tickets */}
        {(commLogFilter === "all" || commLogFilter === "support") && supportTickets.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                Support Tickets ({supportTickets.length})
              </div>
            </div>
            {supportTickets.map((t: any) => (
              <div
                key={t.id}
                className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer"
                onClick={() => router.push("/admin/support")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">🎫</span>
                      <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{t.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-body text-[var(--app-text-muted)]">{t.category}</span>
                      <span className="text-[var(--app-text-faint)]">&middot;</span>
                      <span className="font-body text-[var(--app-text-muted)]">{fmtDate(t.createdAt)}</span>
                      <span className="text-[var(--app-text-faint)]">&middot;</span>
                      <span className="font-body text-[var(--app-text-muted)]">
                        {t.messages?.length || 0} {t.messages?.length === 1 ? "message" : "messages"}
                      </span>
                    </div>
                  </div>
                  <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 ${
                    t.status === "open" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : t.status === "in_progress" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      : t.status === "resolved" ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]"
                  }`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* System Notifications (show under "all") */}
        {commLogFilter === "all" && notifications.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                System Notifications ({notifications.length})
              </div>
            </div>
            {notifications.map((n: any) => (
              <div key={n.id} className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0">
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5 shrink-0">
                    {n.type === "deal_update" ? "📋" : n.type === "commission_paid" ? "💰" : n.type === "document_request" ? "📄" : n.type === "ticket_response" ? "🎫" : "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-[13px] text-[var(--app-text)]">{n.title}</div>
                    <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">{n.message}</div>
                    <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">{fmtDate(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-brand-gold shrink-0 mt-1.5" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Email placeholder */}
        {commLogFilter === "email" && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">📧</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">Email communication logs will appear here once email integration is connected.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">Coming in Phase 15 — SendGrid Integration</div>
          </div>
        )}

        {/* SMS placeholder */}
        {commLogFilter === "sms" && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">💬</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">SMS message logs will appear here once SMS integration is connected.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">Coming in Phase 15 — Twilio Integration</div>
          </div>
        )}

        {/* Live Chat placeholder */}
        {commLogFilter === "chat" && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">🗨</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">Live chat conversation logs will appear here once the chat system is live.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">Coming in Phase 17 — AI Support Bot</div>
          </div>
        )}

        {/* Phone Calls placeholder */}
        {commLogFilter === "phone" && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">📞</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">Phone call logs and recordings will appear here once VOIP is connected.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">Coming in Phase 15 — Twilio VOIP Integration</div>
          </div>
        )}

        {/* Empty state for filtered views */}
        {commLogFilter === "all" && supportTickets.length === 0 && notifications.length === 0 && (
          <div className="px-5 py-8 text-center font-body text-[13px] text-[var(--app-text-muted)]">
            No communications recorded yet.
          </div>
        )}
        {commLogFilter === "support" && supportTickets.length === 0 && (
          <div className="px-5 py-8 text-center font-body text-[13px] text-[var(--app-text-muted)]">
            No support tickets from this partner.
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
