"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FIRM_NAME, FIRM_SLOGAN, SUPPORT_EMAIL } from "@/lib/constants";

type TokenState =
  | { status: "checking" }
  | { status: "valid"; email: string }
  | { status: "invalid"; reason: string };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [tokenState, setTokenState] = useState<TokenState>({ status: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState({ status: "invalid", reason: "This reset link is missing its token." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setTokenState({ status: "valid", email: data.email });
        } else {
          const data = await res.json().catch(() => ({}));
          const reasonMap: Record<string, string> = {
            expired: "This reset link has expired. Please request a new one.",
            used: "This reset link has already been used.",
            not_found: "This reset link is invalid.",
            missing_token: "This reset link is missing its token.",
          };
          setTokenState({
            status: "invalid",
            reason: reasonMap[data.reason] || "This reset link is invalid.",
          });
        }
      } catch {
        if (!cancelled) {
          setTokenState({ status: "invalid", reason: "Could not validate link. Please try again." });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not reset password.");
      }
    } catch {
      setError(`Connection error. Please try again or email ${SUPPORT_EMAIL}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-10 relative overflow-hidden login-bg">
      <style>{`
        .login-bg { background: radial-gradient(ellipse 70% 60% at 50% 40%, #e8e4df 0%, #f5f6fa 70%); }
        .login-grid { background-image: linear-gradient(rgba(196,160,80,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(196,160,80,.06) 1px,transparent 1px); }
        @media (prefers-color-scheme: dark) {
          .login-bg { background: radial-gradient(ellipse 70% 60% at 50% 40%, #0d1a3a 0%, #080d1c 70%); }
          .login-grid { background-image: linear-gradient(rgba(196,160,80,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(196,160,80,.02) 1px,transparent 1px); }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none login-grid" style={{ backgroundSize: "60px 60px" }} />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="text-center mb-8 sm:mb-10 animate-fade-up">
          <div className="font-display text-sm sm:text-[15px] font-semibold text-brand-gold tracking-[2px] uppercase mb-5 leading-relaxed">
            {FIRM_NAME}
          </div>
          <h1 className="font-display text-[26px] sm:text-[32px] font-bold mb-3">
            Choose a New <span className="gold-gradient">Password</span>
          </h1>
          <p className="font-body text-[13px] sm:text-sm theme-text-secondary leading-relaxed px-2 italic">
            {FIRM_SLOGAN}
          </p>
        </div>

        <div className="animate-fade-up-delay card rounded-2xl p-6 sm:p-8" style={{ borderColor: "rgba(196,160,80,0.18)" }}>
          {tokenState.status === "checking" && (
            <div className="text-center font-body text-sm theme-text-muted">Checking link…</div>
          )}

          {tokenState.status === "invalid" && (
            <div className="text-center space-y-4">
              <div className="font-body text-sm text-red-400 leading-relaxed">{tokenState.reason}</div>
              <a
                href="/forgot-password"
                className="inline-block btn-gold rounded-md min-h-[48px] px-6 leading-[48px]"
              >
                Request a new link
              </a>
              <div>
                <a
                  href="/login"
                  className="font-body text-[12px] text-brand-gold/70 hover:text-brand-gold transition-colors"
                >
                  ← Back to sign in
                </a>
              </div>
            </div>
          )}

          {tokenState.status === "valid" && done && (
            <div className="text-center space-y-3">
              <div className="font-body text-sm theme-text-secondary leading-relaxed">
                Password updated. Redirecting to sign-in…
              </div>
            </div>
          )}

          {tokenState.status === "valid" && !done && (
            <form onSubmit={handleSubmit}>
              <p className="font-body text-[13px] theme-text-secondary leading-relaxed mb-6">
                Resetting password for <strong className="text-brand-gold">{tokenState.email}</strong>.
              </p>

              <div className="mb-5">
                <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full theme-input rounded-lg px-4 py-3.5 sm:py-3 font-body text-sm sm:text-[14px] outline-none focus:border-brand-gold/40 transition-colors"
                  autoFocus
                />
              </div>

              <div className="mb-7">
                <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Re-enter the password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full theme-input rounded-lg px-4 py-3.5 sm:py-3 font-body text-sm sm:text-[14px] outline-none focus:border-brand-gold/40 transition-colors"
                />
              </div>

              {error && (
                <div className="mb-5 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[13px] text-red-400 leading-relaxed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-gold w-full rounded-md min-h-[52px]"
              >
                {submitting ? "Updating..." : "Update Password →"}
              </button>
            </form>
          )}
        </div>

        <div className="font-body text-[11px] theme-text-faint text-center mt-5 leading-relaxed">
          Need help? Email <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-brand-gold">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
