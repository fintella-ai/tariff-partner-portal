"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";
import { useSession } from "next-auth/react";
import { FIRM_SHORT } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

type AgreementStatus = "not_sent" | "pending" | "signed" | "amended";
type DocStatus = "required" | "uploaded" | "under_review" | "approved" | "expired";

const AGREEMENT_STATUS_CONFIG: Record<
  AgreementStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  not_sent:  { label: "Not Sent",           bg: "bg-white/10",        text: "text-white/60",   dot: "bg-white/40" },
  pending:   { label: "Pending Signature",  bg: "bg-yellow-500/15",   text: "text-yellow-400", dot: "bg-yellow-400" },
  signed:    { label: "Signed",             bg: "bg-green-500/15",    text: "text-green-400",  dot: "bg-green-400" },
  amended:   { label: "Amendment Pending",  bg: "bg-orange-500/15",   text: "text-orange-400", dot: "bg-orange-400" },
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
}

export default function DocumentsPage() {
  const device = useDevice();
  const { data: session } = useSession();
  const partnerCode = (session?.user as any)?.partnerCode ?? "—";

  const [agreementData, setAgreementData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSigningModal, setShowSigningModal] = useState(false);

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

  // Demo fallback docs
  const requiredDocs: RequiredDoc[] = [
    { name: "W-9 Form",            status: "uploaded", date: "2025-02-15" },
    { name: "Tax ID Verification",  status: "required", date: null },
  ];

  // Fetch agreement status from API
  useEffect(() => {
    fetch("/api/agreement")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data.agreement) {
          setAgreementData(data.agreement);
        }
      })
      .catch(() => {
        // Demo fallback — no agreement in DB yet
      })
      .finally(() => setLoading(false));
  }, []);

  const agreementStatus: AgreementStatus = agreementData?.status || "not_sent";
  const astCfg = AGREEMENT_STATUS_CONFIG[agreementStatus];
  const isSigned = agreementStatus === "signed";
  const isPending = agreementStatus === "pending";

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
    setShowSigningModal(true);
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
        <div className="font-body text-sm text-white/40">Loading documents...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">Documents</h2>
      <p className="font-body text-sm text-white/40 mb-6">
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
          <div className="flex items-start gap-4 p-4 bg-green-500/[0.06] border border-green-500/20 rounded-lg">
            <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold text-green-400 mb-1">
                Partnership Agreement Signed
              </p>
              <p className="font-body text-xs text-white/50">
                Signed on {fmtDate(agreementData?.signedDate)} &middot; Version {agreementData?.version || 1}
              </p>
            </div>
            {agreementData?.documentUrl && (
              <button
                onClick={() => window.open(agreementData.documentUrl!, "_blank")}
                className="shrink-0 text-[12px] font-medium tracking-wide uppercase text-white/60 border border-white/[0.12] rounded-lg px-4 py-2 hover:border-white/25 hover:text-white/80 transition-colors"
              >
                View Agreement
              </button>
            )}
          </div>
        ) : isPending ? (
          <div className="flex items-start gap-4 p-4 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-lg">
            <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold text-yellow-400 mb-1">
                Agreement Sent — Awaiting Your Signature
              </p>
              <p className="font-body text-xs text-white/50 leading-relaxed">
                Sent on {fmtDate(agreementData?.sentDate)}.
                {agreementData?.embeddedSigningUrl
                  ? " Click below to review and sign right here."
                  : " Check your email for the signing link from SignWell."}
              </p>
            </div>
            {agreementData?.embeddedSigningUrl && (
              <button
                onClick={handleOpenSigning}
                className="shrink-0 btn-gold text-[12px] px-5 py-2"
              >
                Sign Now
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-4 p-4 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-lg">
            <div className="shrink-0 w-10 h-10 rounded-full bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center">
              <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-semibold text-yellow-400 mb-1">
                Partnership Agreement Required
              </p>
              <p className="font-body text-xs text-white/50 leading-relaxed">
                You must sign your partnership agreement before submitting deals to {FIRM_SHORT}.
              </p>
            </div>
            <button
              onClick={handleSignAgreement}
              disabled={sending}
              className="shrink-0 btn-gold text-[12px] px-5 py-2 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Sign Agreement"}
            </button>
          </div>
        )}
      </div>

      {/* ── Required Documents ─────────────────────────────────────────────── */}
      <div className={`card ${device.cardPadding} ${device.borderRadius} mb-6`}>
        <h3 className="font-display text-base sm:text-lg font-bold mb-1">Required Documents</h3>
        <p className="font-body text-xs text-white/40 mb-5">
          Documents are only required if you have earned commissions.
        </p>

        {device.isMobile ? (
          <div className={`flex flex-col ${device.gap}`}>
            {requiredDocs.map((doc) => {
              const dCfg = DOC_STATUS_CONFIG[doc.status];
              return (
                <div
                  key={doc.name}
                  className="p-4 bg-white/[0.03] border border-white/[0.08] rounded-lg"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center">
                      <svg className="w-4.5 h-4.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm font-medium text-white truncate">{doc.name}</p>
                      <p className="font-body text-[11px] text-white/35">
                        {doc.date ? fmtDate(doc.date) : "No date"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase ${dCfg.bg} ${dCfg.text}`}
                    >
                      {dCfg.label}
                    </span>
                    <button className="text-[12px] font-medium tracking-wide uppercase text-white/60 border border-white/[0.12] rounded-lg px-3.5 py-1.5 hover:border-white/25 hover:text-white/80 transition-colors">
                      {doc.status === "required" || doc.status === "expired" ? "Upload" : "View"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-white/[0.08] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_140px_100px] gap-4 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.08]">
              <span className="font-body text-[11px] tracking-[1px] uppercase text-white/40">Document</span>
              <span className="font-body text-[11px] tracking-[1px] uppercase text-white/40">Status</span>
              <span className="font-body text-[11px] tracking-[1px] uppercase text-white/40">Date</span>
              <span className="font-body text-[11px] tracking-[1px] uppercase text-white/40 text-right">Action</span>
            </div>
            {requiredDocs.map((doc) => {
              const dCfg = DOC_STATUS_CONFIG[doc.status];
              return (
                <div
                  key={doc.name}
                  className="grid grid-cols-[1fr_140px_140px_100px] gap-4 px-4 py-3 items-center border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <span className="font-body text-sm text-white">{doc.name}</span>
                  </div>
                  <span
                    className={`inline-flex items-center w-fit px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase ${dCfg.bg} ${dCfg.text}`}
                  >
                    {dCfg.label}
                  </span>
                  <span className="font-body text-sm text-white/50">
                    {doc.date ? fmtDate(doc.date) : "—"}
                  </span>
                  <div className="text-right">
                    <button className="text-[12px] font-medium tracking-wide uppercase text-white/60 border border-white/[0.12] rounded-lg px-3.5 py-1.5 hover:border-white/25 hover:text-white/80 transition-colors">
                      {doc.status === "required" || doc.status === "expired" ? "Upload" : "View"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Upload Area ────────────────────────────────────────────────────── */}
      <div className={`card ${device.cardPadding} ${device.borderRadius}`}>
        <div className="border-2 border-dashed border-white/[0.12] rounded-lg p-8 sm:p-12 text-center hover:border-white/20 transition-colors cursor-pointer">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
            <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="font-body text-sm text-white/60 mb-2">
            Drag &amp; drop files here or click to upload
          </p>
          <p className="font-body text-[11px] text-white/30">
            Accepted formats: PDF, JPG, PNG up to 10MB
          </p>
        </div>
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
          <div className="relative w-full max-w-4xl mx-4 h-[85vh] flex flex-col bg-brand-dark border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] shrink-0">
              <div>
                <h3 className="font-display text-sm font-bold">
                  Sign Partnership Agreement
                </h3>
                <p className="font-body text-[11px] text-white/40 mt-0.5">
                  Review and sign your {FIRM_SHORT} partnership agreement below
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSigningComplete}
                  className="btn-gold text-[11px] px-4 py-1.5"
                >
                  Done Signing
                </button>
                <button
                  onClick={() => setShowSigningModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
                >
                  <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                <div className="flex flex-col items-center justify-center h-full bg-brand-dark">
                  <div className="w-16 h-16 rounded-full bg-brand-gold/10 border border-brand-gold/25 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <p className="font-display text-sm font-semibold mb-2">Demo Mode</p>
                  <p className="font-body text-xs text-white/50 text-center max-w-sm leading-relaxed">
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
