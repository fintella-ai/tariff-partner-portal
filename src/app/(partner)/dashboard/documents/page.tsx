"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";
import { useSession } from "next-auth/react";
import { FIRM_SHORT, DOC_TYPE_LABELS } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";

type AgreementStatus = "not_sent" | "pending" | "partner_signed" | "signed" | "approved" | "amended" | "under_review";
type DocStatus = "required" | "uploaded" | "under_review" | "approved" | "expired" | "voided";

const AGREEMENT_STATUS_CONFIG: Record<
  AgreementStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  not_sent:     { label: "Not Sent",           bg: "bg-[var(--app-input-bg)]",        text: "text-[var(--app-text-secondary)]",   dot: "bg-[var(--app-text-muted)]" },
  pending:      { label: "Pending Signature",  bg: "bg-yellow-500/15",   text: "text-yellow-400", dot: "bg-yellow-400" },
  partner_signed: { label: "Awaiting Co-sign", bg: "bg-blue-500/15",    text: "text-blue-400",   dot: "bg-blue-400" },
  signed:       { label: "Signed",             bg: "bg-green-500/15",    text: "text-green-400",  dot: "bg-green-400" },
  approved:     { label: "Signed & Approved",  bg: "bg-green-500/15",    text: "text-green-400",  dot: "bg-green-400" },
  under_review: { label: "Under Review",       bg: "bg-blue-500/15",     text: "text-blue-400",   dot: "bg-blue-400" },
  amended:      { label: "Amendment Pending",  bg: "bg-orange-500/15",   text: "text-orange-400", dot: "bg-orange-400" },
};

const DOC_STATUS_CONFIG: Record<
  DocStatus,
  { label: string; bg: string; text: string }
> = {
  required:     { label: "Required",     bg: "bg-red-500/15",     text: "text-red-400" },
  uploaded:     { label: "Uploaded",     bg: "bg-blue-500/15",    text: "text-blue-400" },
  under_review: { label: "Under Review", bg: "bg-yellow-500/15",  text: "text-yellow-400" },
  approved:     { label: "Approved",     bg: "bg-green-500/15",   text: "text-green-400" },
  expired:      { label: "Expired",      bg: "bg-red-500/15",     text: "text-red-400" },
  voided:       { label: "Voided",      bg: "bg-gray-500/15",    text: "text-gray-400" },
};

interface RequiredDoc {
  name: string;
  status: DocStatus;
  date: string | null;
}

interface AgreementData {
  id: string;
  status: AgreementStatus;
  version: number;
  sentDate: string | null;
  signedDate: string | null;
  documentUrl: string | null;
  embeddedSigningUrl: string | null;
  signwellDocumentId: string | null;
}

export default function DocumentsPage() {
  const device = useDevice();
  const { data: session } = useSession();
  const partnerCode = (session?.user as any)?.partnerCode ?? "—";

  const [agreementData, setAgreementData] = useState<AgreementData | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSigningModal, setShowSigningModal] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  // Close modal on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSigningModal(false);
    };
    if (showSigningModal) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [showSigningModal]);

  const fetchDocuments = () => {
    fetch("/api/partner/documents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.documents) setDocuments(data.documents); })
      .catch(() => {});
  };

  // Fetch agreement + documents from API
  useEffect(() => {
    Promise.all([
      fetch("/api/agreement").then((r) => (r.ok ? r.json() : null)).then((data) => {
        if (data?.agreement) setAgreementData(data.agreement);
      }),
      fetch("/api/partner/documents").then((r) => (r.ok ? r.json() : null)).then((data) => {
        if (data?.documents) setDocuments(data.documents);
      }),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Show all documents (including agreements uploaded via My Documents)
  const allDocs = documents;

  const agreementStatus: AgreementStatus = agreementData?.status || "not_sent";
  const astCfg = AGREEMENT_STATUS_CONFIG[agreementStatus];
  const isSigned = agreementStatus === "signed" || agreementStatus === "approved";
  const isPending = agreementStatus === "pending" || agreementStatus === "partner_signed";

  // Request signing — sends agreement then opens embedded signing modal
  const handleSignAgreement = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/agreement", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAgreementData(data.agreement);
        // Open embedded signing modal (shows iframe if URL available, demo state otherwise)
        setShowSigningModal(true);
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  };

  // Open embedded signing for a pending agreement
  const handleOpenSigning = () => {
    const url = agreementData?.embeddedSigningUrl;
    if (url) window.open(url, "_blank");
  };

  // Called when signing is completed in the embedded modal
  const handleSigningComplete = () => {
    setShowSigningModal(false);
    // Re-fetch agreement status
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data.agreement) setAgreementData(data.agreement);
      })
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="font-body text-sm text-[var(--app-text-muted)]">Loading documents...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Documents</h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Access and manage your partnership documents.
      </p>

      {/* ── Partnership Agreement ──────────────────────────────────────────── */}
      <div className={`card ${device.cardPadding} ${device.borderRadius} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base sm:text-lg font-bold">Partnership Agreement</h3>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase ${astCfg.bg} ${astCfg.text}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${astCfg.dot}`} />
            {astCfg.label}
          </span>
        </div>

        {isSigned ? (
          <div className="p-4 bg-green-500/[0.06] border border-green-500/20 rounded-lg">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-green-400 mb-1">
                  Partnership Agreement Signed
                </p>
                <p className="font-body text-xs text-[var(--app-text-secondary)]">
                  Signed on {fmtDate(agreementData?.signedDate)} &middot; Version {agreementData?.version || 1}
                </p>
              </div>
            </div>
            {agreementData?.documentUrl && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => window.open(agreementData.documentUrl!, "_blank")}
                  className="sm:w-auto text-[12px] font-medium tracking-wide uppercase text-[var(--app-text-secondary)] border border-[var(--app-input-border)] rounded-lg px-4 py-2.5 hover:border-[var(--app-border)] hover:text-[var(--app-text)] transition-colors text-center"
                >
                  View
                </button>
                <a
                  href={agreementData.documentUrl}
                  download={`Partnership-Agreement-v${agreementData.version || 1}.pdf`}
                  className="sm:w-auto text-[12px] font-medium tracking-wide uppercase text-blue-400/80 border border-blue-400/20 rounded-lg px-4 py-2.5 hover:bg-blue-400/10 hover:text-blue-400 transition-colors text-center"
                >
                  Download
                </a>
              </div>
            )}
          </div>
        ) : isPending && agreementData?.status === "partner_signed" ? (
          <div className="p-4 bg-blue-500/[0.06] border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-green-400 mb-1">
                  Your Signature Complete ✓
                </p>
                <p className="font-body text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  Awaiting Fintella co-signer to complete the agreement. You will be notified when it&apos;s fully executed.
                </p>
              </div>
              <span className="shrink-0 font-body text-[11px] tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-3 py-1.5">
                Awaiting Co-sign
              </span>
            </div>
          </div>
        ) : isPending ? (
          <div className="p-4 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-yellow-400 mb-1">
                  Agreement Sent — Awaiting Your Signature
                </p>
                <p className="font-body text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  Sent on {fmtDateTime(agreementData?.sentDate)}. Review and sign your partnership agreement to activate your account.
                </p>
              </div>
              {agreementData?.embeddedSigningUrl && (
                <button
                  onClick={handleOpenSigning}
                  className="shrink-0 btn-gold text-[12px] px-5 py-2.5 min-h-[44px]"
                >
                  ✍️ Sign Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-yellow-400 mb-1">
                  Partnership Agreement Required
                </p>
                <p className="font-body text-xs text-[var(--app-text-secondary)] leading-relaxed">
                  You must sign your partnership agreement before submitting deals to {FIRM_SHORT}.
                </p>
              </div>
            </div>
            <button
              onClick={handleSignAgreement}
              disabled={sending}
              className="w-full sm:w-auto mt-3 btn-gold text-[12px] px-5 py-2.5 disabled:opacity-50 text-center"
            >
              {sending ? "Sending..." : "Sign Agreement"}
            </button>
          </div>
        )}
      </div>

      {/* ── My Documents ─────────────────────────────────────────────── */}
      <div className={`card ${device.cardPadding} ${device.borderRadius} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base sm:text-lg font-bold">My Documents</h3>
          <button onClick={() => setShowUpload(!showUpload)} className="btn-gold text-[12px] px-4 py-2.5">{showUpload ? "Cancel" : "+ Upload"}</button>
        </div>

        {showUpload && (
          <div className="mb-4 p-4 rounded-lg border border-brand-gold/20 bg-brand-gold/[0.03]">
            <div className={`grid ${device.isMobile ? "grid-cols-1" : "grid-cols-2"} gap-3 mb-3`}>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Document Type *</label>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-sm outline-none">
                  <option value="">Select type...</option>
                  <option value="agreement">Agreement</option>
                  <option value="w9">W-9 Form</option>
                  <option value="w8">W-8 Form</option>
                  <option value="tax_form">Tax Form</option>
                  <option value="bank_letter">Bank Letter</option>
                  <option value="voided_check">Voided Check</option>
                </select>
              </div>
              <div>
                <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-secondary)] mb-1.5 block">Notes</label>
                <input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="w-full bg-[var(--app-input-bg)] border border-[var(--app-input-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-sm outline-none" placeholder="Notes about this document..." />
              </div>
            </div>
            <label className={`inline-flex items-center gap-2 btn-gold text-[12px] px-5 py-2.5 cursor-pointer ${uploading || !uploadType ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? "Uploading..." : "Choose File & Upload"}
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" className="hidden" disabled={uploading || !uploadType} onChange={async (e) => { const file = e.target.files?.[0]; if (!file || !uploadType) return; setUploading(true); try { const reader = new FileReader(); reader.onload = async () => { const res = await fetch("/api/partner/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docType: uploadType, fileName: file.name, fileData: reader.result, notes: uploadNotes || null }) }); if (res.ok) { setShowUpload(false); const savedType = uploadType; setUploadType(""); setUploadNotes(""); fetchDocuments(); if (savedType === "agreement") { fetch("/api/agreement").then((r) => (r.ok ? r.json() : null)).then((data) => { if (data?.agreement) setAgreementData(data.agreement); }).catch(() => {}); } } else { const err = await res.json().catch(() => ({})); alert(err.error || "Upload failed"); } setUploading(false); }; reader.readAsDataURL(file); } catch { setUploading(false); } e.target.value = ""; }} />
            </label>
          </div>
        )}

        {allDocs.length === 0 && !showUpload ? (
          <div className="p-8 text-center">
            <div className="font-body text-sm text-[var(--app-text-muted)] mb-2">No documents uploaded yet.</div>
            <button onClick={() => setShowUpload(true)} className="font-body text-[12px] text-brand-gold hover:underline">Upload your first document</button>
          </div>
        ) : allDocs.length > 0 ? (
          <>
            <div className="hidden md:block border border-[var(--app-border)] rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.5fr_0.8fr_0.7fr_0.6fr_0.6fr] gap-3 px-4 py-2.5 bg-[var(--app-card-bg)] border-b border-[var(--app-border)]">
                {["Document", "Type", "Status", "Date", "Action"].map((h) => (
                  <span key={h} className={`font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-muted)] ${h === "Action" ? "text-right" : h === "Status" ? "text-center" : ""}`}>{h}</span>
                ))}
              </div>
              {allDocs.map((doc: any) => {
                const dCfg = DOC_STATUS_CONFIG[(doc.status || "uploaded") as DocStatus] || DOC_STATUS_CONFIG.uploaded;
                return (
                  <div key={doc.id} className="grid grid-cols-[1.5fr_0.8fr_0.7fr_0.6fr_0.6fr] gap-3 px-4 py-3 items-center border-b border-[var(--app-border)] last:border-b-0 hover:bg-[var(--app-card-bg)] transition-colors">
                    <div>
                      <div className="font-body text-sm text-[var(--app-text)] truncate">{doc.fileName}</div>
                      {doc.notes && <div className="font-body text-[10px] text-[var(--app-text-muted)] mt-0.5 truncate">Note: {doc.notes}</div>}
                    </div>
                    <div className="font-body text-[12px] text-[var(--app-text-secondary)]">{DOC_TYPE_LABELS[doc.docType] || doc.docType}</div>
                    <div className="text-center"><span className={`inline-flex items-center w-fit px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${dCfg.bg} ${dCfg.text}`}>{dCfg.label}</span></div>
                    <span className="font-body text-[12px] text-[var(--app-text-muted)]">{fmtDate(doc.createdAt)}</span>
                    <div className="text-right">
                      {doc.fileUrl && <div className="flex items-center gap-2"><button onClick={() => { const w = window.open(); if (w) { w.document.write(`<iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); w.document.title = doc.fileName; } }} className="text-[11px] text-brand-gold hover:underline">View</button><a href={doc.fileUrl} download={doc.fileName} className="text-[11px] text-blue-400 hover:underline">Download</a></div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="md:hidden flex flex-col gap-3">
              {allDocs.map((doc: any) => {
                const dCfg = DOC_STATUS_CONFIG[(doc.status || "uploaded") as DocStatus] || DOC_STATUS_CONFIG.uploaded;
                return (
                  <div key={doc.id} className="p-4 bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-body text-sm font-medium text-[var(--app-text)] truncate">{doc.fileName}</div>
                        <div className="font-body text-[11px] text-[var(--app-text-muted)]">{DOC_TYPE_LABELS[doc.docType] || doc.docType} &middot; {fmtDate(doc.createdAt)}</div>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase shrink-0 ${dCfg.bg} ${dCfg.text}`}>{dCfg.label}</span>
                    </div>
                    {doc.notes && <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">Note: {doc.notes}</div>}
                    {doc.fileUrl && <div className="flex items-center gap-2"><button onClick={() => { const w = window.open(); if (w) { w.document.write(`<iframe src="${doc.fileUrl}" style="width:100%;height:100vh;border:none;"></iframe>`); w.document.title = doc.fileName; } }} className="text-[11px] text-brand-gold hover:underline">View</button><a href={doc.fileUrl} download={doc.fileName} className="text-[11px] text-blue-400 hover:underline">Download</a></div>}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {/* ── Embedded Signing Modal ─────────────────────────────────────────── */}
      {showSigningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSigningModal(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-4xl mx-2 sm:mx-4 h-[95vh] sm:h-[85vh] flex flex-col bg-[var(--app-bg)] border border-[var(--app-border)] rounded-xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--app-border)] shrink-0">
              <div className="min-w-0 flex-1 mr-3">
                <h3 className="font-display text-sm font-bold truncate">
                  Sign Partnership Agreement
                </h3>
                <p className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5 hidden sm:block">
                  Review and sign your {FIRM_SHORT} partnership agreement below
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  onClick={handleSigningComplete}
                  className="btn-gold text-[11px] px-3 sm:px-4 py-1.5"
                >
                  Done
                </button>
                <button
                  onClick={() => setShowSigningModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--app-card-bg)] hover:bg-[var(--app-hover)] transition-colors"
                >
                  <svg className="w-4 h-4 text-[var(--app-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Signing iframe */}
            <div className="flex-1 bg-white">
              {agreementData?.embeddedSigningUrl ? (
                <iframe
                  src={agreementData.embeddedSigningUrl}
                  className="w-full h-full border-0"
                  title="Sign Partnership Agreement"
                  allow="camera; microphone"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-[var(--app-bg)]">
                  <div className="w-16 h-16 rounded-full bg-brand-gold/10 border border-brand-gold/25 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <p className="font-display text-sm font-semibold mb-2">Demo Mode</p>
                  <p className="font-body text-xs text-[var(--app-text-secondary)] text-center max-w-sm leading-relaxed">
                    In demo mode, the signing document is not available for embedded viewing.
                    When SignWell is configured with a real API key, the agreement will load
                    right here for you to review and sign without leaving the portal.
                  </p>
                  <button
                    onClick={handleSigningComplete}
                    className="btn-gold text-[12px] px-6 py-2.5 mt-5"
                  >
                    Complete Demo Signing
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
