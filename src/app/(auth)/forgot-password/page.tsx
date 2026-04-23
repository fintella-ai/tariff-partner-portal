"use client";

import { useState } from "react";
import { FIRM_NAME, FIRM_SLOGAN, SUPPORT_EMAIL } from "@/lib/constants";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError(`Connection error. Please try again or email ${SUPPORT_EMAIL}.`);
    } finally {
      setLoading(false);
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
            Reset <span className="gold-gradient">Password</span>
          </h1>
          <p className="font-body text-[13px] sm:text-sm theme-text-secondary leading-relaxed px-2 italic">
            {FIRM_SLOGAN}
          </p>
        </div>

        <div className="animate-fade-up-delay card rounded-2xl p-6 sm:p-8" style={{ borderColor: "rgba(196,160,80,0.18)" }}>
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="font-body text-sm theme-text-secondary leading-relaxed">
                If an account exists for <strong className="text-brand-gold">{email}</strong>, a password reset link
                has been sent. The link expires in 1 hour.
              </div>
              <div className="font-body text-[12px] theme-text-faint leading-relaxed">
                Check your spam folder if you don&apos;t see it within a few minutes.
              </div>
              <a
                href="/login"
                className="inline-block font-body text-[13px] text-brand-gold/80 hover:text-brand-gold transition-colors mt-4"
              >
                ← Back to sign in
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="font-body text-[13px] theme-text-secondary leading-relaxed mb-6">
                Enter the email address on your account and we&apos;ll send you a link to set a new password.
              </p>
              <div className="mb-6">
                <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="jane@yourfirm.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full theme-input rounded-lg px-4 py-3.5 sm:py-3 font-body text-sm sm:text-[14px] outline-none focus:border-brand-gold/40 transition-colors"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
              </div>

              {error && (
                <div className="mb-5 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[13px] text-red-400 leading-relaxed">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-gold w-full rounded-md min-h-[52px]"
              >
                {loading ? "Sending..." : "Send Reset Link →"}
              </button>

              <div className="text-center mt-5">
                <a
                  href="/login"
                  className="font-body text-[12px] text-brand-gold/70 hover:text-brand-gold transition-colors"
                >
                  ← Back to sign in
                </a>
              </div>
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
