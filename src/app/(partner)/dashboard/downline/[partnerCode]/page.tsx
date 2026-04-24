"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import StatusBadge from "@/components/ui/StatusBadge";
import RelativeLevelTag from "@/components/ui/RelativeLevelTag";
import { fmtDate } from "@/lib/format";

type DownlineDetail = {
  partner: {
    partnerCode: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    tier: string;
    status: string;
    signupDate: string | null;
    commissionRate: number | null;
    referredByPartnerCode: string | null;
  } | null;
  agreements: Array<{
    id: string;
    version: number;
    status: string;
    sentDate: string | null;
    signedDate: string | null;
    documentUrl: string | null;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    status: string;
    createdAt: string;
  }>;
  /**
   * Depth of this partner below the logged-in viewer.
   *   2 = direct recruit  ("My L2")
   *   3 = grandchild      ("My L3")
   * Populated by /api/partner/downline/[partnerCode] during the
   * authorization walk — the API already has to determine it to decide
   * whether the caller is allowed to see this row.
   */
  relativeDepth?: 2 | 3 | null;
};

export default function DownlineDetailPage() {
  const router = useRouter();
  const params = useParams<{ partnerCode: string }>();
  const partnerCode = (params?.partnerCode || "").toString().toUpperCase();

  const [data, setData] = useState<DownlineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/partner/downline/${partnerCode}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error || `Failed to load (${r.status})`);
        setData(null);
        return;
      }
      setData(await r.json());
      setErr("");
    } finally {
      setLoading(false);
    }
  }, [partnerCode]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await fetch("/api/partner/upload-agreement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPartnerCode: partnerCode, fileName: file.name, fileData: reader.result }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          alert(d.error || "Upload failed");
        } else {
          alert("Agreement uploaded! It will be reviewed by an admin.");
          await load();
        }
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div>
        <div className="animate-pulse mb-6">
          <div className="h-6 w-48 bg-[var(--app-card-bg)] rounded-lg mb-2" />
          <div className="h-3 w-72 bg-[var(--app-card-bg)] rounded-lg" />
        </div>
        <div className="card p-6 mb-6">
          <div className="h-4 w-48 bg-[var(--app-card-bg)] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (err || !data?.partner) {
    return (
      <div>
        <Link href="/dashboard/downline" className="font-body text-[12px] text-brand-gold/80 hover:text-brand-gold">← Back to downline</Link>
        <div className="card p-8 mt-4 text-center font-body text-sm text-[var(--app-text-muted)]">
          {err || "Partner not found or outside your downline."}
        </div>
      </div>
    );
  }

  const p = data.partner;
  const canUpload = ["pending", "invited", "under_review"].includes(p.status);
  const fullName = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.partnerCode;

  return (
    <div>
      <Link href="/dashboard/downline" className="font-body text-[12px] text-brand-gold/80 hover:text-brand-gold">← Back to downline</Link>

      {/* Partner card */}
      <div className="card p-5 sm:p-6 mt-4 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-display text-xl sm:text-2xl font-bold truncate">{fullName}</h1>
              <RelativeLevelTag relativeLevel={data.relativeDepth ?? 2} />
            </div>
            <div className="font-body text-[13px] text-[var(--app-text-muted)] truncate">{p.email}</div>
            {p.phone && <div className="font-body text-[12px] text-[var(--app-text-muted)]">{p.phone}</div>}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={p.status} />
            <div className="font-mono text-[11px] text-[var(--app-text-muted)]">{p.partnerCode}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-[var(--app-border)]">
          <div>
            <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] mb-1">Joined</div>
            <div className="font-body text-[13px]">{fmtDate(p.signupDate)}</div>
          </div>
          <div>
            <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] mb-1">Commission rate</div>
            <div className="font-body text-[13px]">{p.commissionRate != null ? `${Math.round(p.commissionRate * 100)}%` : "—"}</div>
          </div>
          <div>
            <div className="font-body text-[10px] tracking-[1px] uppercase text-[var(--app-text-muted)] mb-1">Referred by</div>
            <div className="font-mono text-[12px] text-[var(--app-text-muted)]">{p.referredByPartnerCode || "—"}</div>
          </div>
        </div>
      </div>

      {/* Drop zone — only when upload is allowed */}
      {canUpload && (
        <div
          className={`card p-6 sm:p-8 mb-6 border-2 border-dashed transition-colors ${dragOver ? "border-brand-gold/60 bg-brand-gold/[0.05]" : "border-[var(--app-border)]"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
        >
          <div className="text-center">
            <div className="font-body font-semibold text-sm mb-1">
              {p.status === "under_review" ? "Replace the agreement under review" : "Upload the signed L1↔downline agreement"}
            </div>
            <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4 max-w-md mx-auto">
              Drop a file anywhere on this card or click <strong>Choose File</strong>. Accepted: PDF, DOC, DOCX, PNG, JPG. The upload is queued for admin review and will activate the partner once approved.
            </p>
            <label className="inline-block font-body text-[12px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-4 py-2 hover:bg-brand-gold/10 transition-colors cursor-pointer">
              {uploading ? "Uploading…" : "Choose File"}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Agreement history */}
      <div className="card">
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--app-border)] font-body font-semibold text-sm">
          Agreement history
        </div>
        {data.agreements.length === 0 && data.documents.length === 0 ? (
          <div className="p-6 text-center font-body text-[13px] text-[var(--app-text-muted)]">No agreements on file yet.</div>
        ) : (
          <div>
            {data.agreements.map((a) => (
              <div key={a.id} className="px-5 sm:px-6 py-3 border-b border-[var(--app-border)] last:border-b-0 grid grid-cols-[0.6fr_1fr_1fr_1fr_auto] gap-3 items-center">
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">v{a.version}</div>
                <div><StatusBadge status={a.status} /></div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                  {a.sentDate ? `Sent ${fmtDate(a.sentDate)}` : "—"}
                </div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                  {a.signedDate ? `Signed ${fmtDate(a.signedDate)}` : "Unsigned"}
                </div>
                <div className="text-right">
                  {a.documentUrl && (
                    <a
                      href={a.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
            {data.documents.map((d) => (
              <div key={d.id} className="px-5 sm:px-6 py-3 border-b border-[var(--app-border)] last:border-b-0 grid grid-cols-[0.6fr_1fr_1fr_1fr_auto] gap-3 items-center">
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">doc</div>
                <div><StatusBadge status={d.status} /></div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)] truncate">{d.fileName}</div>
                <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                  {fmtDate(d.createdAt)}
                </div>
                <div className="text-right">
                  {d.fileUrl && (
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
