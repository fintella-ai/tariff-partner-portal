"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getPermissions } from "@/lib/permissions";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";
import CountryCodeSelect, { parseMobilePhone, buildMobilePhone } from "@/components/ui/CountryCodeSelect";
import DownlineTree, { type TreePartner } from "@/components/ui/DownlineTree";
import ComposeEmailForm from "@/components/admin/ComposeEmailForm";
import LevelTag from "@/components/ui/LevelTag";
import { AdminGettingStartedCard } from "@/components/admin/AdminGettingStartedCard";

type Partner = {
  id: string;
  partnerCode: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  title: string | null;
  phone: string | null;
  mobilePhone: string | null;
  tin: string | null;
  status: string;
  referredByPartnerCode: string | null;
  tier: string;
  commissionRate: number;
  l3Enabled: boolean;
  payoutDownlineEnabled: boolean;
  notes: string | null;
  ccEmail: string | null;
  corporatePartner: boolean;
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
  viewedAt: string | null;
  signedDate: string | null;
  embeddedSigningUrl: string | null;
  cosignerSigningUrl: string | null;
  signwellDocumentId: string | null;
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
  const isStarSuperAdmin = isStarSuperAdminEmail((session?.user as any)?.email);
  const permissions = getPermissions((session?.user as any)?.role || "admin");
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tabs on the partner detail page. "info" (default) covers the main
  // landing card — partner info, address, admin utilities. All the other
  // long sections have been split into their own tabs so the page is no
  // longer a giant vertical scroll.
  type PartnerTab = "info" | "notes" | "downline" | "commission" | "payout" | "documents" | "communications";
  const PARTNER_TABS: PartnerTab[] = ["info", "notes", "downline", "commission", "payout", "documents", "communications"];
  // Honor ?tab=<name> so notification deep-links open the right section.
  const initialTab: PartnerTab = (() => {
    const t = searchParams?.get("tab");
    return (t && (PARTNER_TABS as string[]).includes(t)) ? (t as PartnerTab) : "info";
  })();
  const [activeTab, setActiveTab] = useState<PartnerTab>(initialTab);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [downline, setDownline] = useState<Partner[]>([]);
  const [l3Partners, setL3Partners] = useState<Partner[]>([]);
  const [documents, setDocuments] = useState<DocEntry[]>([]);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [adminNotes, setAdminNotes] = useState<any[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [codeHistory, setCodeHistory] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [inboundEmails, setInboundEmails] = useState<any[]>([]);
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [callingPartner, setCallingPartner] = useState(false);
  const [callMessage, setCallMessage] = useState<string | null>(null);
  const [showComposeEmail, setShowComposeEmail] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [postingNote, setPostingNote] = useState(false);
  const [enterprisePartner, setEnterprisePartner] = useState<any>(null);
  const [commLogFilter, setCommLogFilter] = useState<"all" | "support" | "email" | "sms" | "chat" | "phone">("all");
  // Inline row expand for the comms feed. Key is "<type>-<id>" so rows
  // across different sections don't collide.
  const [expandedCommKey, setExpandedCommKey] = useState<string | null>(null);
  const toggleCommRow = (key: string) =>
    setExpandedCommKey((prev) => (prev === key ? null : key));
  const [downlineView, setDownlineView] = useState<"list" | "tree">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPwVisible, setNewPwVisible] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);

  // Editable fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobileCountry, setMobileCountry] = useState("US");
  const [mobileNumber, setMobileNumber] = useState("");
  const [tin, setTin] = useState("");
  const [sendingAgreement, setSendingAgreement] = useState(false);
  // Rate the admin picks when sending the SignWell template. Defaults to
  // whatever the partner record has, but admins can override to send a
  // different template without first editing the partner.
  const [sendAgreementRate, setSendAgreementRate] = useState<number>(0.25);
  const [sendAgreementCustomPct, setSendAgreementCustomPct] = useState<string>("");
  const [sendAgreementIsCustom, setSendAgreementIsCustom] = useState(false);
  const [sendAgreementError, setSendAgreementError] = useState<string | null>(null);
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
  const [bankStreet, setBankStreet] = useState("");
  const [bankStreet2, setBankStreet2] = useState("");
  const [bankCity, setBankCity] = useState("");
  const [bankState, setBankState] = useState("");
  const [bankZip, setBankZip] = useState("");

  // Note: Partner.l3Enabled is inert post-Option B Phase 6. No client
  // state needed — the column is no longer read or written by this page.
  // Editable tier + commission rate, super-admin only. Seeded from the
  // fetched partner row; sent in the PUT payload when they change.
  const [tier, setTier] = useState<"l1" | "l2" | "l3">("l1");
  const [commissionRate, setCommissionRate] = useState<number>(0.25);
  const [commissionEditMode, setCommissionEditMode] = useState(false);

  const fetchPartner = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/partners/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const p = data.partner;
      const prof = data.profile;
      setPartner(p);
      // Pre-seed the Send Agreement rate picker with the partner's own
      // commission rate so the default matches the partner record.
      if (typeof p?.commissionRate === "number") {
        setSendAgreementRate(p.commissionRate);
      }
      setDownline(data.downline || []);
      setL3Partners(data.l3Partners || []);
      setDocuments(data.documents || []);
      setAgreement(data.agreement || null);
      setAdminNotes(data.adminNotes || []);
      setCodeHistory(data.codeHistory || []);
      setSupportTickets(data.supportTickets || []);
      setNotifications(data.notifications || []);
      setEmailLogs(data.emailLogs || []);
      setInboundEmails(data.inboundEmails || []);
      setSmsLogs(data.smsLogs || []);
      setCallLogs(data.callLogs || []);
      setEnterprisePartner(data.enterprisePartner || null);

      setFirstName(p.firstName);
      setLastName(p.lastName);
      setCompanyName(p.companyName || "");
      setTitle((p as any).title || "");
      setEmail(p.email);
      setCcEmail(p.ccEmail || "");
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
      setBankStreet(prof?.bankStreet || "");
      setBankStreet2(prof?.bankStreet2 || "");
      setBankCity(prof?.bankCity || "");
      setBankState(prof?.bankState || "");
      setBankZip(prof?.bankZip || "");
      // p.l3Enabled no longer hydrated — Phase 6 inert field
      setTier(((p.tier || "l1").toLowerCase() as "l1" | "l2" | "l3"));
      setCommissionRate(typeof p.commissionRate === "number" ? p.commissionRate : 0.25);
    } catch {} finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPartner(); }, [fetchPartner]);

  // Initiate a call to the partner. Prefers the in-browser WebRTC
  // softphone (window.__fintellaSoftphone, mounted in the admin layout)
  // when available; falls back to the legacy bridged-call API which
  // dials the admin's mobile first.
  async function handleCallPartner() {
    if (!partner?.partnerCode) return;
    setCallingPartner(true);
    setCallMessage(null);

    const phoneNumber = partner.mobilePhone || partner.phone;
    const softphone = typeof window !== "undefined" ? window.__fintellaSoftphone : undefined;
    if (softphone && phoneNumber) {
      softphone.call(
        phoneNumber,
        `${partner.firstName} ${partner.lastName}`.trim(),
        partner.partnerCode
      );
      setCallMessage("Softphone dialing — see the floating softphone panel.");
      setCallingPartner(false);
      return;
    }
    if (!phoneNumber) {
      setCallMessage("No phone number on file for this partner.");
      setCallingPartner(false);
      return;
    }

    try {
      const res = await fetch("/api/twilio/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerCode: partner.partnerCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCallMessage(data.error || "Failed to initiate call");
      } else if (data.status === "demo") {
        setCallMessage("Demo mode — call logged but not actually placed (Twilio Voice not configured).");
      } else if (data.status === "initiated") {
        setCallMessage("Call initiated — your phone will ring momentarily.");
      } else {
        setCallMessage(data.error || "Call failed.");
      }
      fetchPartner();
    } catch (err: any) {
      setCallMessage(err?.message || "Network error");
    } finally {
      setCallingPartner(false);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        firstName, lastName, email, ccEmail: ccEmail || null,
        companyName: companyName || null,
        title: title || null,
        phone: phone || null,
        mobilePhone: buildMobilePhone(mobileCountry, mobileNumber) || null,
        tin: tin || null,
        status,
        referredByPartnerCode: referrer || null,
        notes: notes || null,
        street, street2, city, state: addrState, zip,
        payoutMethod, bankName, accountType, routingNumber,
        accountNumber, beneficiaryName,
        bankStreet, bankStreet2, bankCity, bankState, bankZip,
        // Option B Phase 6: l3Enabled is inert — deliberately NOT sent in
        // the save body so existing column values aren't overwritten
        // on every save. Column stays in the DB for rollback safety.
        // Super-admin-only fields — the API rejects these for other
        // roles, but sending them unconditionally keeps the client
        // logic simple. The server is the source of truth.
        ...(isSuperAdmin ? { tier, commissionRate } : {}),
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
          <h2 className="font-display text-xl font-bold flex items-center gap-2 flex-wrap">
            <span>{partner.firstName} {partner.lastName}</span>
            <LevelTag tier={partner.tier} />
          </h2>
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

      {/* ─── TAB BAR ─────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-6 overflow-x-auto border-b border-[var(--app-border)]">
        {([
          { id: "info", label: "Info" },
          { id: "notes", label: "Notes" },
          { id: "communications", label: "Communications" },
          { id: "downline", label: "Downline" },
          { id: "commission", label: "Commission" },
          { id: "payout", label: "Payout" },
          { id: "documents", label: "Documents" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`font-body text-[13px] px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? "text-brand-gold border-brand-gold"
                : "text-[var(--app-text-muted)] border-transparent hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "notes" && (
      <div className="card mb-6">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="font-body font-semibold text-sm mb-1">Admin Notes</div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-3">
            Internal audit log. Attach a screenshot, PDF, or CSV if useful. One file per note.
          </div>
          <div className="flex flex-col gap-2">
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Add a note about this partner..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            {noteFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {noteFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 font-body text-[10px] text-[var(--app-text-secondary)] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-full px-2.5 py-1"
                  >
                    <span>📎 {f.name}</span>
                    <span className="text-[var(--app-text-muted)]">{(f.size / 1024).toFixed(0)}KB</span>
                    <button
                      onClick={() => setNoteFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors"
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="font-body text-[11px] text-[var(--app-text-muted)] border border-[var(--app-border)] rounded-lg px-3 py-2 cursor-pointer hover:text-[var(--app-text-secondary)] transition-colors">
                <span>{noteFiles.length > 0 ? "Add more files" : "Attach files (optional)"}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.doc,.docx,.csv,.xls,.xlsx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const picked = e.target.files ? Array.from(e.target.files) : [];
                    if (picked.length) setNoteFiles((prev) => [...prev, ...picked]);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="flex items-center gap-2">
                {noteFiles.length > 0 && (
                  <button
                    onClick={() => setNoteFiles([])}
                    className="font-body text-[10px] text-[var(--app-text-muted)] hover:text-red-400 transition-colors"
                  >
                    Clear all
                  </button>
                )}
                <button
                  disabled={postingNote || (!noteDraft.trim() && noteFiles.length === 0)}
                  onClick={async () => {
                    if (!partner) return;
                    setPostingNote(true);
                    try {
                      const attachments = await Promise.all(
                        noteFiles.map(async (f) => {
                          const fd = new FormData();
                          fd.append("file", f);
                          const up = await fetch("/api/admin/upload", { method: "POST", body: fd });
                          if (!up.ok) { const e = await up.json().catch(() => ({})); throw new Error(e.error || "Upload failed"); }
                          const data = await up.json();
                          return { name: data.name || f.name, url: data.url, type: data.type || f.type || null, size: data.size || f.size };
                        })
                      );
                      const res = await fetch("/api/admin/notes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ partnerCode: partner.partnerCode, content: noteDraft, attachments }),
                      });
                      if (res.ok) {
                        setNoteDraft("");
                        setNoteFiles([]);
                        fetchPartner();
                      } else {
                        const err = await res.json().catch(() => ({}));
                        alert(err.error || "Failed to add note");
                      }
                    } catch { alert("Network error"); } finally {
                      setPostingNote(false);
                    }
                  }}
                  className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-4 py-2.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {postingNote ? "Posting..." : "Post Note"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {(() => {
          const pinned = adminNotes.filter((n: any) => n.isPinned);
          const unpinned = adminNotes.filter((n: any) => !n.isPinned);
          const allSorted = [...pinned, ...unpinned];

          return allSorted.length > 0 ? (
            <div>
              {allSorted.map((n: any) => {
                // Union the new child-table attachments with the legacy
                // single-attachment columns from PR #356 so older notes
                // still render. Dedup trivially — legacy rows never have
                // a child attachment with the same id.
                const atts: Array<{ id?: string; name: string; url: string; type?: string | null; size?: number | null }> = [];
                if (Array.isArray(n.attachments)) atts.push(...n.attachments);
                if (n.attachmentUrl && atts.length === 0) {
                  atts.push({
                    name: n.attachmentName || "attachment",
                    url: n.attachmentUrl,
                    type: n.attachmentType,
                    size: n.attachmentSize,
                  });
                }
                return (
                <div key={n.id} className={`px-5 py-3 ${n.isPinned ? "bg-brand-gold/[0.04]" : ""}`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.isPinned && <span className="text-[10px] text-brand-gold">&#128204;</span>}
                      <div className="font-body text-[12px] font-semibold text-[var(--app-text-secondary)]">{n.authorName}</div>
                      <div className="font-body text-[10px] text-[var(--app-text-muted)]">
                        {new Date(n.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {" "}
                        {new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={async () => {
                          await fetch("/api/admin/notes", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ noteId: n.id, isPinned: !n.isPinned }),
                          });
                          fetchPartner();
                        }}
                        className="font-body text-[9px] theme-text-muted hover:text-brand-gold transition-colors"
                      >
                        {n.isPinned ? "Unpin" : "Pin"}
                      </button>
                      {isStarSuperAdmin && editingNoteId !== n.id && (
                        <button
                          onClick={() => {
                            setEditingNoteId(n.id);
                            setEditingNoteContent(n.content || "");
                          }}
                          className="font-body text-[9px] theme-text-muted hover:text-brand-gold transition-colors"
                          title="Edit note (★ star super admin only)"
                        >
                          Edit
                        </button>
                      )}
                      {isStarSuperAdmin && (
                        <button
                          onClick={async () => {
                            if (!confirm("Delete this admin note? This is irreversible.")) return;
                            const res = await fetch(`/api/admin/notes?noteId=${encodeURIComponent(n.id)}`, { method: "DELETE" });
                            if (!res.ok) {
                              const d = await res.json().catch(() => ({}));
                              alert(d.error || "Failed to delete note");
                              return;
                            }
                            fetchPartner();
                          }}
                          className="font-body text-[9px] text-red-400/60 hover:text-red-400 transition-colors"
                          title="Delete note (★ star super admin only)"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  {editingNoteId === n.id ? (
                    <div className="mt-1">
                      <textarea
                        value={editingNoteContent}
                        onChange={(e) => setEditingNoteContent(e.target.value)}
                        rows={3}
                        className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/40 transition-colors"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={async () => {
                            const content = editingNoteContent.trim();
                            if (!content) return alert("Note content cannot be empty");
                            const res = await fetch("/api/admin/notes", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ noteId: n.id, content }),
                            });
                            if (!res.ok) {
                              const d = await res.json().catch(() => ({}));
                              alert(d.error || "Failed to save note");
                              return;
                            }
                            setEditingNoteId(null);
                            setEditingNoteContent("");
                            fetchPartner();
                          }}
                          className="font-body text-[11px] text-brand-gold hover:underline"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingNoteId(null); setEditingNoteContent(""); }}
                          className="font-body text-[11px] theme-text-muted hover:text-[var(--app-text)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    n.content && (
                      <div className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed whitespace-pre-wrap">{n.content}</div>
                    )
                  )}
                  {atts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {atts.map((a, i) => {
                        const isImage = typeof a.type === "string" && a.type.startsWith("image/");
                        return isImage ? (
                          <a key={a.id || i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-block">
                            <img
                              src={a.url}
                              alt={a.name}
                              className="max-h-40 rounded-lg border border-[var(--app-border)] object-contain bg-[var(--app-input-bg)]"
                            />
                          </a>
                        ) : (
                          <a
                            key={a.id || i}
                            href={a.url}
                            download={a.name}
                            className="inline-flex items-center gap-2 font-body text-[12px] text-brand-gold/80 hover:text-brand-gold border border-[var(--app-border)] rounded-lg px-3 py-2 transition-colors"
                          >
                            <span>📎</span>
                            <span>{a.name}</span>
                            {typeof a.size === "number" && (
                              <span className="text-[10px] text-[var(--app-text-muted)]">
                                {(a.size / 1024).toFixed(0)} KB
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-6 text-center font-body text-[13px] text-[var(--app-text-muted)]">No notes yet.</div>
          );
        })()}
      </div>
      )}

      {activeTab === "info" && (<>
      {/* ─── GETTING-STARTED PROGRESS ────────────────────────────── */}
      <AdminGettingStartedCard partnerId={partner.partnerCode} />

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

        {/* Client Submission Link */}
        <div className="mb-4 pb-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-body text-[12px] text-[var(--app-text-secondary)]">Client Submission Link</div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={partner.corporatePartner || false}
                onChange={async (e) => {
                  const val = e.target.checked;
                  await fetch(`/api/admin/partners/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ corporatePartner: val }),
                  });
                  fetchPartner();
                }}
                className="accent-[var(--brand-gold)]"
              />
              <span className="font-body text-[11px] text-[var(--app-text-muted)]">Corporate Referral Partner</span>
            </label>
          </div>
          {(() => {
            const base = "https://referral.frostlawaz.com/l/ANNEXATIONPR/";
            const link = partner.corporatePartner
              ? `${base}?utm_content=${partner.partnerCode}&/?ep=[insert_your_code_here]`
              : `${base}?utm_content=${partner.partnerCode}`;
            return (
              <div
                onClick={() => { navigator.clipboard.writeText(link); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
                className="font-mono text-[12px] text-brand-gold bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 cursor-pointer hover:bg-brand-gold/10 transition-colors break-all"
                title="Click to copy"
              >
                {link}
              </div>
            );
          })()}
          <p className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">Click to copy. {partner.corporatePartner ? "Corporate link — partner replaces [insert_your_code_here] with their own EP code." : "Standard partner tracking link."}</p>
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
            <div className="relative flex-1">
              <input
                id="partnerNewPassword"
                type={newPwVisible ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={inputClass + " w-full pr-10"}
                placeholder="Enter new password (min 6 characters)"
              />
              <button
                type="button"
                onClick={() => setNewPwVisible((v) => !v)}
                aria-label={newPwVisible ? "Hide password" : "Show password"}
                title={newPwVisible ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-[var(--app-text-muted)] hover:text-brand-gold transition-colors"
              >
                {newPwVisible ? (
                  // eye-off
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  // eye
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={async () => {
                if (!newPw || newPw.length < 6) { alert("Password must be at least 6 characters."); return; }
                if (!confirm(`Set a new password for ${partner.firstName} ${partner.lastName}?`)) return;
                try {
                  const res = await fetch(`/api/admin/partners/${id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ newPassword: newPw }),
                  });
                  if (res.ok) {
                    setNewPw("");
                    setNewPwVisible(false);
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

        {/* Send Reset Password email — triggers the standard forgot-password
            flow against the partner's email so they can set their own
            password via the 1-hour single-use link. */}
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--app-border)" }}>
          <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-2">Send Reset Password Email</div>
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <div className="flex-1">
              <p className="font-body text-[11px] text-[var(--app-text-muted)] leading-relaxed">
                Emails <span className="font-mono text-[var(--app-text-secondary)]">{partner.email}</span> a single-use reset link (expires in 24 hours). The partner sets their own password — admin never sees it.
              </p>
            </div>
            <button
              onClick={async () => {
                if (!partner.email) { alert("Partner has no email on file."); return; }
                if (!confirm(`Send a password reset link to ${partner.email}?`)) return;
                setSendingResetLink(true);
                try {
                  const res = await fetch("/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: partner.email }),
                  });
                  if (res.ok) {
                    setResetLinkSent(true);
                    setTimeout(() => setResetLinkSent(false), 4000);
                  } else {
                    alert("Failed to send reset email.");
                  }
                } catch { alert("Network error"); }
                finally { setSendingResetLink(false); }
              }}
              disabled={sendingResetLink || !partner.email}
              className="font-body text-[12px] text-blue-400/80 border border-blue-400/20 rounded-lg px-4 py-2.5 hover:bg-blue-400/10 transition-colors shrink-0 disabled:opacity-50"
            >
              {sendingResetLink ? "Sending…" : resetLinkSent ? "Sent ✓" : "Send Reset Link"}
            </button>
          </div>
        </div>
      </div>

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
            <label className={labelClass}>Title</label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CEO, Founder, Managing Partner..." />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <label className={labelClass}>CC Email</label>
            <input className={inputClass} value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} type="email" placeholder="Secondary email — CC'd on all comms" />
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

      </>)}

      {activeTab === "downline" && (<>
      {/* ─── DOWNLINE ─────────────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-body font-semibold text-sm">Downline Partners ({downline.length + l3Partners.length})</div>
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
            {downline.map((d) => {
              // Render each L2 followed by any L3s recruited under that L2.
              // Previously the list view only showed `downline` (L2s) and
              // silently dropped `l3Partners`, even though the tree view on
              // the same page rendered them correctly. L3 rows are indented
              // so the parent→child relationship still reads.
              const nested = l3Partners.filter((l3) => l3.referredByPartnerCode === d.partnerCode);
              return (
                <React.Fragment key={d.id}>
                  <div
                    className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer flex items-center justify-between gap-3"
                    onClick={() => router.push(`/admin/partners/${d.id}`)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <LevelTag tier={d.tier} />
                      <div className="min-w-0">
                        <div className="font-body text-[13px] text-[var(--app-text)] truncate">{d.firstName} {d.lastName}</div>
                        <div className="font-mono text-[11px] text-[var(--app-text-muted)] truncate">{d.partnerCode}</div>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[d.status] || statusBadge.active}`}>
                      {d.status}
                    </span>
                  </div>
                  {nested.map((l3) => (
                    <div
                      key={l3.id}
                      className="pl-12 pr-5 py-3 border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors cursor-pointer flex items-center justify-between gap-3"
                      onClick={(e) => { e.stopPropagation(); router.push(`/admin/partners/${l3.id}`); }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <LevelTag tier={l3.tier} />
                        <div className="min-w-0">
                          <div className="font-body text-[13px] text-[var(--app-text)] truncate">
                            {l3.firstName} {l3.lastName}
                            <span className="font-body text-[11px] text-[var(--app-text-muted)] ml-2">via {d.firstName} {d.lastName}</span>
                          </div>
                          <div className="font-mono text-[11px] text-[var(--app-text-muted)] truncate">{l3.partnerCode}</div>
                        </div>
                      </div>
                      <span className={`shrink-0 inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase ${statusBadge[l3.status] || statusBadge.active}`}>
                        {l3.status}
                      </span>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      </>)}

      {activeTab === "commission" && (<>
      {/* ─── COMMISSION & TIER ────────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="font-body font-semibold text-sm mb-4">Commission Structure</div>

        {partner.tier === "l1" && (
          <div className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-body text-[12px] font-semibold text-[var(--app-text)]">
                  Payout Downline Partners
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 max-w-[520px]">
                  {partner.payoutDownlineEnabled
                    ? "Fintella sends SignWell agreements to this L1's L2/L3 downline at signup and pays them commissions directly."
                    : "This L1 receives the full rate for all downline deals and is responsible for paying their own downline."}
                </div>
              </div>
              <span
                className={
                  partner.payoutDownlineEnabled
                    ? "shrink-0 rounded-full bg-brand-gold/15 text-brand-gold px-3 py-1 font-body text-[11px] font-semibold"
                    : "shrink-0 rounded-full border border-[var(--app-border)] text-[var(--app-text-muted)] px-3 py-1 font-body text-[11px]"
                }
              >
                {partner.payoutDownlineEnabled ? "Enabled ✓" : "Disabled"}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="p-4 rounded-lg bg-brand-gold/[0.06] border border-brand-gold/20">
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Partner Tier</div>
            {isSuperAdmin && commissionEditMode ? (
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as "l1" | "l2" | "l3")}
                className="font-display text-xl font-bold text-brand-gold bg-transparent border border-brand-gold/30 rounded px-2 py-0.5 outline-none focus:border-brand-gold/60"
              >
                <option value="l1">L1</option>
                <option value="l2">L2</option>
                <option value="l3">L3</option>
              </select>
            ) : (
              <div className="font-display text-xl font-bold text-brand-gold">{(tier || "l1").toUpperCase()}</div>
            )}
          </div>

          <div className="p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Commission Rate</div>
            {isSuperAdmin && commissionEditMode ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={Math.round(commissionRate * 100)}
                  onChange={(e) => {
                    const pct = parseInt(e.target.value || "0", 10);
                    if (isFinite(pct)) setCommissionRate(Math.max(0.01, Math.min(0.5, pct / 100)));
                  }}
                  className="font-display text-xl font-bold text-brand-gold bg-transparent border border-brand-gold/30 rounded px-2 py-0.5 outline-none focus:border-brand-gold/60 w-20"
                />
                <span className="font-display text-xl font-bold text-brand-gold">%</span>
              </div>
            ) : (
              <div className="font-display text-xl font-bold text-brand-gold">
                {commissionRate ? `${Math.round(commissionRate * 100)}%` : "25%"}
              </div>
            )}
            <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5">of firm fee on direct deals</div>
          </div>

          {/* L3 toggle removed in Option B Phase 6 — the per-partner flag
              is no longer consulted anywhere. Every partner whose rate
              leaves room below them can recruit to depth 1 and their
              downline can keep recruiting as the chain grows. The
              Partner.l3Enabled column stays in the DB for rollback
              safety but is inert. */}
        </div>

        {isSuperAdmin && (
          <div className="mb-4">
            <button
              onClick={() => setCommissionEditMode((v) => !v)}
              className={`font-body text-[12px] px-4 py-2 rounded-lg border transition-colors ${
                commissionEditMode
                  ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                  : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-brand-gold/40"
              }`}
            >
              {commissionEditMode ? "🔒 Lock Editing" : "✏️ Edit Commission Structure"}
            </button>
          </div>
        )}

        <div className="p-3 rounded-lg bg-brand-gold/[0.04] border border-brand-gold/10">
          <p className="font-body text-[11px] text-[var(--app-text-muted)] leading-relaxed">
            L1 partners earn <strong className="text-brand-gold">10–25%</strong> of the firm fee on direct deals. L2/L3 rates are chosen by the recruiting partner (10%, 15%, or 20%) when they generate a recruitment link. The upline earns the override (their rate minus the recruit&apos;s rate). Total across all tiers always equals the L1 partner&apos;s assigned rate.
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
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Override Rate</div>
                <div className="font-display text-xl font-bold text-purple-400">+{Math.round(enterprisePartner.overrideRate * 100)}%</div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)]">on top of each partner&rsquo;s waterfall</div>
              </div>
              <div>
                <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">Coverage</div>
                <div className="font-body text-sm font-semibold text-[var(--app-text)]">
                  {enterprisePartner.applyToAll ? "All Partners" : `${enterprisePartner.overrides?.length || 0} L1 Partners`}
                </div>
                {enterprisePartner.excludedCodes?.length > 0 && (
                  <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-1">
                    Excluded: {enterprisePartner.excludedCodes.join(", ")}
                  </div>
                )}
              </div>
            </div>
            <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-3">
              Does not apply to your own direct deals. Confidential — visible to admins and the enterprise partner only. Managed in Revenue &gt; Custom Commissions.
            </div>
          </div>
        )}
      </div>

      </>)}

      {activeTab === "payout" && (<>
      {/* ─── PAYOUT INFORMATION ─────────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-body font-semibold text-sm">Payout Information</div>
          {agreement?.status === "signed" && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/admin/agreement/${partner.partnerCode}?action=sync_payout`);
                  const data = await res.json();
                  if (res.ok && data.saved > 0) {
                    fetchPartner();
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                    alert(`Synced ${data.saved} payout fields from signed agreement`);
                  } else if (res.ok && data.saved === 0) {
                    alert("No payout fields found in SignWell document — check template api_ids (e.g. bank_name, routing_number, account_number)");
                  } else {
                    alert(data.error || "Sync failed");
                  }
                } catch { alert("Network error"); }
              }}
              className="font-body text-[11px] text-blue-400/70 border border-blue-400/20 rounded-lg px-3 py-1.5 hover:bg-blue-400/10 transition-colors"
              title="Re-extract payout fields from the signed SignWell agreement"
            >
              🔄 Sync from Agreement
            </button>
          )}
        </div>
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
              <option value="business_checking">Business Checking</option>
              <option value="business_savings">Business Savings</option>
              <option value="personal_checking">Personal Checking</option>
              <option value="personal_savings">Personal Savings</option>
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
        <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-3 mt-2">Bank Branch Address</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelClass}>Street Address 1</label>
            <input className={inputClass} value={bankStreet} onChange={(e) => setBankStreet(e.target.value)} placeholder="123 Main St" />
          </div>
          <div>
            <label className={labelClass}>Street Address 2</label>
            <input className={inputClass} value={bankStreet2} onChange={(e) => setBankStreet2(e.target.value)} placeholder="Suite, Floor, etc." />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>City</label>
            <input className={inputClass} value={bankCity} onChange={(e) => setBankCity(e.target.value)} placeholder="City" />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <select className={inputClass} value={bankState} onChange={(e) => setBankState(e.target.value)}>
              <option value="">Select state...</option>
              {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Zip Code</label>
            <input className={inputClass} value={bankZip} onChange={(e) => setBankZip(e.target.value)} placeholder="12345" maxLength={10} />
          </div>
        </div>
      </div>

      </>)}

      {activeTab === "documents" && (<>
      {/* ─── DOCUMENTS & AGREEMENT ─────────────────────────────── */}
      <div className="card mb-6">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="font-body font-semibold text-sm text-center sm:text-left">Documents &amp; Agreement</div>
          <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
            <div className="flex items-center gap-2 flex-wrap">
              {sendAgreementIsCustom ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={0.5}
                    value={sendAgreementCustomPct}
                    onChange={(e) => setSendAgreementCustomPct(e.target.value)}
                    placeholder="28"
                    className="w-20 font-body text-[11px] bg-[var(--app-input-bg)] border border-brand-gold/20 text-brand-gold/80 rounded-lg px-2 py-1.5 outline-none focus:border-brand-gold/40"
                    title="Custom commission rate %"
                  />
                  <span className="font-body text-[11px] text-brand-gold/80">%</span>
                  <button
                    type="button"
                    onClick={() => { setSendAgreementIsCustom(false); setSendAgreementCustomPct(""); }}
                    className="ml-1 font-body text-[10px] theme-text-muted hover:text-brand-gold"
                  >
                    ←
                  </button>
                </div>
              ) : (
                <select
                  value={sendAgreementRate}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") setSendAgreementIsCustom(true);
                    else setSendAgreementRate(parseFloat(e.target.value));
                  }}
                  title="Agreement template rate — controls which SignWell template is sent"
                  className="font-body text-[11px] bg-[var(--app-input-bg)] border border-brand-gold/20 text-brand-gold/80 rounded-lg px-2 py-1.5 outline-none focus:border-brand-gold/40"
                >
                  {tier === "l1" && <option value={0.25} className="bg-[var(--app-bg)]">25% L1</option>}
                  {(tier === "l1" || tier === "l2") && <option value={0.20} className="bg-[var(--app-bg)]">20% {tier.toUpperCase()}</option>}
                  {(tier === "l1" || tier === "l2" || tier === "l3") && <option value={0.15} className="bg-[var(--app-bg)]">15% {tier.toUpperCase()}</option>}
                  <option value={0.10} className="bg-[var(--app-bg)]">10% {tier.toUpperCase()}</option>
                  <option value="__custom__" className="bg-[var(--app-bg)]">Custom…</option>
                </select>
              )}
              <button
                onClick={async () => {
                  setSendingAgreement(true);
                  setSendAgreementError(null);
                  try {
                    let rateToSend = sendAgreementRate;
                    if (sendAgreementIsCustom) {
                      const pct = parseFloat(sendAgreementCustomPct);
                      if (!isFinite(pct) || pct <= 0 || pct > 50) {
                        setSendAgreementError("Custom rate must be between 1 and 50.");
                        setSendingAgreement(false);
                        return;
                      }
                      rateToSend = Math.round(pct * 100) / 10000;
                    }
                    const res = await fetch(`/api/admin/agreement/${partner.partnerCode}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email,
                        name: `${firstName} ${lastName}`,
                        rate: rateToSend,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      setSendAgreementError(data.error || `Send failed (HTTP ${res.status}).`);
                      return;
                    }
                    fetchPartner();
                    setSaved(true);
                    setTimeout(() => setSaved(false), 3000);
                  } catch (e: any) {
                    setSendAgreementError(e?.message || "Network error");
                  } finally {
                    setSendingAgreement(false);
                  }
                }}
                disabled={sendingAgreement}
                className="font-body text-[11px] text-brand-gold/70 border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-50"
              >
                {sendingAgreement ? "Sending..." : "Send Agreement"}
              </button>
              {agreement && ["pending", "viewed", "partner_signed"].includes(agreement.status) && (
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/admin/agreement/${partner.partnerCode}?action=remind`);
                      const data = await res.json();
                      if (res.ok) {
                        alert(`Reminder sent (${data.emailStatus}). ${data.signingUrl ? "Signing link included." : "No signing URL available."}`);
                      } else {
                        alert(data.error || "Remind failed");
                      }
                    } catch { alert("Network error"); }
                  }}
                  className="font-body text-[11px] text-amber-400/70 border border-amber-400/20 rounded-lg px-3 py-1.5 hover:bg-amber-400/10 transition-colors"
                  title="Resend agreement reminder email + SMS without creating a new agreement"
                >
                  📧 Resend Reminder
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/admin/agreement/${partner.partnerCode}?action=refresh`);
                    const data = await res.json();
                    if (res.ok) {
                      fetchPartner();
                      if (data.cosignerUrl) {
                        window.open(data.cosignerUrl, "_blank");
                      }
                      alert(`Status: ${data.status}${data.cosignerUrl ? " — Co-sign link opened in new tab" : ""}\n\nRecipients:\n${data.recipients?.map((r: any) => `${r.name}: ${r.status}`).join("\n") || "None"}`);
                    } else {
                      alert(data.error || "Refresh failed");
                    }
                  } catch { alert("Network error"); }
                }}
                className="font-body text-[11px] text-blue-400/70 border border-blue-400/20 rounded-lg px-3 py-1.5 hover:bg-blue-400/10 transition-colors"
              >
                🔄 Refresh Status
              </button>
            </div>
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

        {sendAgreementError && (
          <div className="px-5 py-2 border-b border-red-500/30 bg-red-500/10 font-body text-[11px] text-red-400">
            {sendAgreementError}
          </div>
        )}

        {/* Agreement status */}
        <div className="px-5 py-3 border-b border-[var(--app-border)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-body text-[13px] text-[var(--app-text-secondary)]">Partnership Agreement</div>
              <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">
                {agreement
                  ? `Version ${agreement.version} — ${agreement.signedDate ? `Signed ${fmtDate(agreement.signedDate)}` : agreement.viewedAt ? `Viewed ${fmtDate(agreement.viewedAt)}` : `Sent ${fmtDate(agreement.sentDate)}`}`
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
          {(agreement?.status === "pending" || agreement?.status === "partner_signed") && (agreement.embeddedSigningUrl || agreement.cosignerSigningUrl) && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div>
                <a
                  href={agreement.embeddedSigningUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-body text-[12px] text-brand-gold hover:text-brand-gold/80 underline underline-offset-2 transition-colors"
                >
                  ✍️ Partner Signing Link
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(agreement.embeddedSigningUrl!);
                    alert("Partner signing URL copied to clipboard");
                  }}
                  className="ml-3 font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors"
                >
                  Copy
                </button>
              </div>
              {agreement.cosignerSigningUrl && (
                <div>
                  <a
                    href={agreement.cosignerSigningUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-body text-[12px] text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
                  >
                    ✍️ Fintella Co-sign Link
                  </a>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(agreement.cosignerSigningUrl!);
                      alert("Co-signer URL copied to clipboard");
                    }}
                    className="ml-3 font-body text-[11px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          )}
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

      </>)}

      {activeTab === "communications" && (<>
      {/* ═══ COMMUNICATION LOG ═══ */}
      <div className="card">
        <div className="px-5 py-4 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-body font-semibold text-sm">Communication Log</div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">All communications with this partner across all channels.</div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {partner?.email && (
              <button
                onClick={() => setShowComposeEmail((v) => !v)}
                className={`font-body text-[11px] rounded-lg px-3 py-2 min-h-[40px] active:scale-95 transition-all flex items-center gap-1.5 ${
                  showComposeEmail
                    ? "text-black bg-brand-gold border border-brand-gold hover:bg-brand-gold/90"
                    : "text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/10"
                }`}
                title="Compose and send an email to this partner"
              >
                <span>✉️</span>
                <span>{showComposeEmail ? "Close Email" : "Send Email"}</span>
              </button>
            )}
            {partner?.mobilePhone && (
              <button
                onClick={handleCallPartner}
                disabled={callingPartner}
                className="font-body text-[11px] text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-2 min-h-[40px] hover:bg-brand-gold/10 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
                title="Initiate a Twilio bridged voice call to this partner"
              >
                <span>📞</span>
                <span>{callingPartner ? "Initiating..." : "Call Partner"}</span>
              </button>
            )}
          </div>
        </div>
        {showComposeEmail && partner?.email && (
          <div className="px-5 py-4 border-b border-[var(--app-border)] bg-[var(--app-card-bg)]">
            <ComposeEmailForm
              lockTo
              initialToEmail={partner.email}
              initialToName={`${partner.firstName} ${partner.lastName}`.trim()}
              initialPartnerCode={partner.partnerCode}
              onSent={() => {
                void fetchPartner();
              }}
            />
          </div>
        )}
        {callMessage && (
          <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)] font-body text-[11px] text-[var(--app-text-secondary)]">
            {callMessage}
          </div>
        )}

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
                      <span className="font-body text-[var(--app-text-muted)]">{fmtDateTime(t.createdAt)}</span>
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
                    <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">{fmtDateTime(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-brand-gold shrink-0 mt-1.5" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Email logs (Phase 15a — SendGrid) */}
        {(commLogFilter === "all" || commLogFilter === "email") && emailLogs.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                Emails ({emailLogs.length})
              </div>
            </div>
            {emailLogs.map((e: any) => {
              const statusBadge =
                e.status === "sent"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : e.status === "failed"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]";
              const key = `email-${e.id}`;
              const isOpen = expandedCommKey === key;
              return (
                <div key={e.id} className="border-b border-[var(--app-border)] last:border-b-0">
                  <div
                    className="px-5 py-3 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors"
                    onClick={() => toggleCommRow(key)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-base mt-0.5 shrink-0">📧</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{e.subject}</span>
                          <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 ${statusBadge}`}>
                            {e.status}
                          </span>
                        </div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                          To: {e.toEmail} · {e.template}
                        </div>
                        {e.bodyPreview && !isOpen && (
                          <div className="font-body text-[11px] text-[var(--app-text-secondary)] mt-1 line-clamp-2">{e.bodyPreview}</div>
                        )}
                        {e.errorMessage && (
                          <div className="font-body text-[10px] text-red-400 mt-1 truncate">{e.errorMessage}</div>
                        )}
                        <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">{fmtDateTime(e.createdAt)}</div>
                      </div>
                      <span className={`text-[10px] text-[var(--app-text-faint)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 bg-[var(--app-card-bg)]">
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-body text-[11px] mb-2">
                        <span className="text-[var(--app-text-muted)]">From:</span>
                        <span className="text-[var(--app-text-secondary)]">{e.fromEmail}</span>
                        <span className="text-[var(--app-text-muted)]">To:</span>
                        <span className="text-[var(--app-text-secondary)]">{e.toEmail}</span>
                        <span className="text-[var(--app-text-muted)]">Subject:</span>
                        <span className="text-[var(--app-text-secondary)]">{e.subject}</span>
                        <span className="text-[var(--app-text-muted)]">Template:</span>
                        <span className="text-[var(--app-text-secondary)] font-mono">{e.template}</span>
                        {e.providerMessageId && (
                          <>
                            <span className="text-[var(--app-text-muted)]">Msg ID:</span>
                            <span className="text-[var(--app-text-faint)] font-mono truncate">{e.providerMessageId}</span>
                          </>
                        )}
                      </div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3 border border-[var(--app-border)]">
                        {e.bodyPreview || "(no body preview available)"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {commLogFilter === "email" && emailLogs.length === 0 && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">📧</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">No emails sent to this partner yet.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">
              Transactional sends (welcome, agreement, activation) appear here automatically.
            </div>
          </div>
        )}

        {/* Inbound emails (SendGrid Inbound Parse) */}
        {(commLogFilter === "all" || commLogFilter === "email") && inboundEmails.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                Inbound Emails ({inboundEmails.length})
              </div>
            </div>
            {inboundEmails.map((e: any) => {
              const key = `inbound-${e.id}`;
              const isOpen = expandedCommKey === key;
              return (
              <div key={e.id} className="border-b border-[var(--app-border)] last:border-b-0">
                <div
                  className="px-5 py-3 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors"
                  onClick={() => toggleCommRow(key)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5 shrink-0">📥</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{e.subject}</span>
                        <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          inbound
                        </span>
                        {e.replied && (
                          <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 bg-green-500/10 text-green-400 border border-green-500/20">
                            replied
                          </span>
                        )}
                        {!e.read && (
                          <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 bg-brand-gold/10 text-brand-gold border border-brand-gold/20">
                            unread
                          </span>
                        )}
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                        From: {e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail} · to {e.toEmail}
                      </div>
                      {e.textBody && !isOpen && (
                        <div className="font-body text-[11px] text-[var(--app-text-secondary)] mt-1 line-clamp-2 whitespace-pre-wrap">{e.textBody}</div>
                      )}
                      <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">
                        {fmtDateTime(e.createdAt)}
                        {e.supportTicketId && (
                          <> · <a href={`/admin/support?ticket=${e.supportTicketId}`} target="_blank" rel="noopener noreferrer" className="text-brand-gold underline" onClick={(evt) => evt.stopPropagation()}>linked ticket</a></>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] text-[var(--app-text-faint)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="px-5 pb-4 pt-1 bg-[var(--app-card-bg)]">
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-body text-[11px] mb-2">
                      <span className="text-[var(--app-text-muted)]">From:</span>
                      <span className="text-[var(--app-text-secondary)]">{e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail}</span>
                      <span className="text-[var(--app-text-muted)]">To:</span>
                      <span className="text-[var(--app-text-secondary)]">{e.toEmail}</span>
                      <span className="text-[var(--app-text-muted)]">Subject:</span>
                      <span className="text-[var(--app-text-secondary)]">{e.subject}</span>
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3 border border-[var(--app-border)] max-h-96 overflow-y-auto">
                      {e.textBody || "(no body)"}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* SMS logs (Phase 15b — Twilio) */}
        {(commLogFilter === "all" || commLogFilter === "sms") && smsLogs.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                SMS ({smsLogs.length})
              </div>
            </div>
            {smsLogs.map((s: any) => {
              const isInbound = s.direction === "inbound";
              const statusBadge =
                s.status === "sent"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : s.status === "received"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : s.status === "failed"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : s.status === "skipped_optout"
                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]";
              const statusLabel = s.status === "skipped_optout" ? "skipped (no opt-in)" : s.status;
              const directionLabel = isInbound ? "From" : "To";
              const directionPhone = isInbound ? s.fromPhone : s.toPhone;
              const key = `sms-${s.id}`;
              const isOpen = expandedCommKey === key;
              return (
                <div key={s.id} className="border-b border-[var(--app-border)] last:border-b-0">
                  <div
                    className="px-5 py-3 cursor-pointer hover:bg-[var(--app-card-bg)] transition-colors"
                    onClick={() => toggleCommRow(key)}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-base mt-0.5 shrink-0">{isInbound ? "📥" : "💬"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">{s.template}</span>
                          {isInbound && (
                            <span className="inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              inbound
                            </span>
                          )}
                          <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 ${statusBadge}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                          {directionLabel}: {directionPhone || "(no number)"}
                        </div>
                        {s.body && !isOpen && (
                          <div className="font-body text-[11px] text-[var(--app-text-secondary)] mt-1 line-clamp-2">{s.body}</div>
                        )}
                        {s.errorMessage && (
                          <div className="font-body text-[10px] text-red-400 mt-1 truncate">{s.errorMessage}</div>
                        )}
                        <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">{fmtDateTime(s.createdAt)}</div>
                      </div>
                      <span className={`text-[10px] text-[var(--app-text-faint)] transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-1 bg-[var(--app-card-bg)]">
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-body text-[11px] mb-2">
                        <span className="text-[var(--app-text-muted)]">{directionLabel}:</span>
                        <span className="text-[var(--app-text-secondary)]">{directionPhone || "(no number)"}</span>
                        <span className="text-[var(--app-text-muted)]">Template:</span>
                        <span className="text-[var(--app-text-secondary)] font-mono">{s.template}</span>
                        {s.providerMessageId && (
                          <>
                            <span className="text-[var(--app-text-muted)]">Msg SID:</span>
                            <span className="text-[var(--app-text-faint)] font-mono truncate">{s.providerMessageId}</span>
                          </>
                        )}
                      </div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3 border border-[var(--app-border)]">
                        {s.body || "(no body)"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {commLogFilter === "sms" && smsLogs.length === 0 && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">💬</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">No SMS sent to this partner yet.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">
              Transactional sends (welcome, agreement, activation) appear here when the partner has opted in.
            </div>
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

        {/* Call logs (Phase 15c — Twilio Voice) */}
        {(commLogFilter === "all" || commLogFilter === "phone") && callLogs.length > 0 && (
          <div>
            <div className="px-5 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
              <div className="font-body text-[10px] tracking-[1.5px] uppercase text-[var(--app-text-muted)]">
                Phone Calls ({callLogs.length})
              </div>
            </div>
            {callLogs.map((c: any) => {
              const statusBadge =
                c.status === "completed"
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : c.status === "in-progress" || c.status === "ringing" || c.status === "initiated"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : c.status === "failed" || c.status === "no-answer" || c.status === "busy" || c.status === "canceled"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-[var(--app-input-bg)] text-[var(--app-text-muted)] border border-[var(--app-border)]";
              const fmtDuration = (s: number | null) =>
                typeof s === "number" && s > 0
                  ? `${Math.floor(s / 60)}m ${s % 60}s`
                  : null;
              const dur = fmtDuration(c.durationSeconds);
              return (
                <div key={c.id} className="px-5 py-3 border-b border-[var(--app-border)] last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5 shrink-0">📞</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                          Outbound call to {c.toPhone || "(no number)"}
                        </span>
                        <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[9px] font-semibold tracking-wider uppercase shrink-0 ${statusBadge}`}>
                          {c.status}
                        </span>
                      </div>
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate">
                        {c.initiatedByName || c.initiatedByEmail || "Admin"}
                        {dur && <> · {dur}</>}
                      </div>
                      {c.recordingUrl && (
                        <a
                          href={`/api/twilio/recording?url=${encodeURIComponent(c.recordingUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-body text-[11px] text-brand-gold hover:underline mt-1 inline-block"
                        >
                          ▶ Listen to recording
                        </a>
                      )}
                      {c.errorMessage && (
                        <div className="font-body text-[10px] text-red-400 mt-1 truncate">{c.errorMessage}</div>
                      )}
                      <div className="font-body text-[10px] text-[var(--app-text-faint)] mt-1">{fmtDateTime(c.createdAt)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {commLogFilter === "phone" && callLogs.length === 0 && (
          <div className="px-5 py-8 text-center">
            <div className="text-2xl mb-2">📞</div>
            <div className="font-body text-sm text-[var(--app-text-muted)]">No calls placed to this partner yet.</div>
            <div className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">
              Use the &ldquo;Call Partner&rdquo; button at the top of this page to initiate a Twilio bridged call.
            </div>
          </div>
        )}

        {/* Empty state for filtered views */}
        {commLogFilter === "all" && supportTickets.length === 0 && notifications.length === 0 && emailLogs.length === 0 && smsLogs.length === 0 && callLogs.length === 0 && (
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

      </>)}

      {/* Bottom save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-gold text-[12px] px-6 py-2.5 disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
