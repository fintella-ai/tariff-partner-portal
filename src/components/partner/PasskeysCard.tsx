"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";

type Passkey = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

/**
 * PasskeysCard — partner-facing management UI for WebAuthn credentials.
 *
 * Lists enrolled passkeys, lets the partner enroll a new one (with an
 * optional friendly label), and remove existing ones. Enrollment runs
 * through @simplewebauthn/browser on the client + the four /api/auth/
 * passkey/* endpoints on the server.
 *
 * Feature-detects WebAuthn support and silently hides itself on
 * unsupported browsers (mostly ancient mobile Safari). A short explainer
 * still renders above the list so a user on iOS 14 knows WHY there's
 * no button.
 */
export default function PasskeysCard() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollName, setEnrollName] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@simplewebauthn/browser");
        if (!cancelled) setSupported(mod.browserSupportsWebAuthn());
      } catch {
        if (!cancelled) setSupported(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/partner/passkeys");
      if (r.ok) {
        const d = await r.json();
        setPasskeys(Array.isArray(d.passkeys) ? d.passkeys : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const enroll = async () => {
    setError("");
    setEnrolling(true);
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const optsRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optsRes.ok) {
        const e = await optsRes.json().catch(() => ({}));
        throw new Error(e.error || "Failed to start enrollment");
      }
      const options = await optsRes.json();

      let attestation;
      try {
        attestation = await startRegistration(options);
      } catch (err: any) {
        if (err?.name === "NotAllowedError") { setEnrolling(false); return; }
        throw err;
      }

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: attestation, name: enrollName.trim() || null }),
      });
      if (!verifyRes.ok) {
        const e = await verifyRes.json().catch(() => ({}));
        throw new Error(e.error || "Verification failed");
      }
      setEnrollName("");
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not enroll passkey");
    } finally {
      setEnrolling(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this passkey? It will no longer be accepted at sign-in.")) return;
    const r = await fetch(`/api/partner/passkeys/${id}`, { method: "DELETE" });
    if (r.ok) void load();
    else alert("Could not remove passkey");
  };

  return (
    <div className="card p-5 sm:p-6 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="font-body font-semibold text-sm mb-1">Passkeys</div>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] max-w-md">
            Use Touch ID, Face ID, Windows Hello, or a hardware security key to sign in without a password. Passkeys sync across your Apple or Google devices automatically.
          </p>
        </div>
        {supported === false ? (
          <span className="font-body text-[11px] text-[var(--app-text-faint)] italic">Not supported on this browser</span>
        ) : (
          <button
            type="button"
            disabled={enrolling || supported === null}
            onClick={() => void enroll()}
            className="font-body text-[12px] text-brand-gold/80 border border-brand-gold/30 rounded-lg px-3 py-2 hover:bg-brand-gold/10 transition-colors disabled:opacity-50"
          >
            {enrolling ? "Waiting for passkey…" : "+ Add Passkey"}
          </button>
        )}
      </div>

      {supported !== false && (
        <div className="mb-4">
          <label className="font-body text-[11px] tracking-[1px] uppercase text-[var(--app-text-muted)] mb-1.5 block">
            Name (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. iPhone 15, Work Laptop, YubiKey"
            value={enrollName}
            onChange={(e) => setEnrollName(e.target.value)}
            className="w-full theme-input rounded-lg px-3 py-2 font-body text-[13px] outline-none focus:border-brand-gold/40 transition-colors"
          />
          <p className="font-body text-[11px] text-[var(--app-text-faint)] mt-1">
            Helpful when you enroll more than one device. You can leave it blank and rename later.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[12px] text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="font-body text-[12px] text-[var(--app-text-muted)]">Loading…</div>
      ) : passkeys.length === 0 ? (
        <div className="font-body text-[13px] text-[var(--app-text-muted)] py-3">
          No passkeys enrolled yet. Click <strong>+ Add Passkey</strong> to set one up.
        </div>
      ) : (
        <div className="space-y-2">
          {passkeys.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)]">
              <div className="min-w-0">
                <div className="font-body text-[13px] font-medium text-[var(--app-text)] truncate">
                  {p.name || "Unnamed passkey"}
                </div>
                <div className="font-body text-[11px] text-[var(--app-text-muted)]">
                  {p.deviceType === "multiDevice" ? "Cloud-synced" : "Single-device"}
                  {p.backedUp ? " · Backed up" : ""}
                  {" · Added "}{fmtDate(p.createdAt)}
                  {p.lastUsedAt ? ` · Last used ${fmtDate(p.lastUsedAt)}` : " · Never used"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void remove(p.id)}
                className="font-body text-[11px] text-red-400/70 hover:text-red-400 transition-colors shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
