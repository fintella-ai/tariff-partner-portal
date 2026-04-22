"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FIRM_NAME, FIRM_SLOGAN, FIRM_PHONE } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"partner" | "admin">("partner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        setError("Email and password are required.");
        setLoading(false);
        return;
      }

      const providerId = mode === "partner" ? "partner-login" : "admin-login";
      const result = await signIn(providerId, {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        router.push(mode === "partner" ? "/dashboard/home" : "/admin/partners");
      }
    } catch {
      setError(`Connection error. Please try again or call ${FIRM_PHONE}.`);
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
      <div className="absolute inset-0 pointer-events-none login-grid"
        style={{ backgroundSize: "60px 60px" }}
      />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="text-center mb-8 sm:mb-10 animate-fade-up">
          <div className="font-display text-sm sm:text-[15px] font-semibold text-brand-gold tracking-[2px] uppercase mb-5 leading-relaxed">
            {FIRM_NAME}
          </div>
          <h1 className="font-display text-[26px] sm:text-[32px] font-bold mb-3">
            Partner <span className="gold-gradient">Portal</span>
          </h1>
          <p className="font-body text-[13px] sm:text-sm theme-text-secondary leading-relaxed px-2 italic">
            {FIRM_SLOGAN}
          </p>
          <p className="font-body text-[12px] sm:text-[13px] theme-text-muted leading-relaxed px-2 mt-2">
            View your pipeline, commissions, and downline activity.
          </p>
        </div>

        <div className="animate-fade-up-delay card rounded-2xl p-6 sm:p-8" style={{ borderColor: "rgba(196,160,80,0.18)" }}>
          <div className="flex mb-6 rounded-lg overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
            <button
              type="button"
              onClick={() => { setMode("partner"); setError(""); }}
              className={`flex-1 py-3 font-body text-xs tracking-wider uppercase transition-all ${
                mode === "partner"
                  ? "bg-brand-gold/10 text-brand-gold"
                  : "theme-text-muted"
              }`}
              style={{ borderRight: "1px solid var(--app-border)" }}
            >
              Partner
            </button>
            <button
              type="button"
              onClick={() => { setMode("admin"); setError(""); }}
              className={`flex-1 py-3 font-body text-xs tracking-wider uppercase transition-all ${
                mode === "admin"
                  ? "bg-brand-gold/10 text-brand-gold"
                  : "theme-text-muted"
              }`}
            >
              Admin
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-5">
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
              />
            </div>

            <div className="mb-7">
              <label className="font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full theme-input rounded-lg px-4 py-3.5 sm:py-3 font-body text-sm sm:text-[14px] outline-none focus:border-brand-gold/40 transition-colors"
              />
              <div className="text-right mt-2">
                <a
                  href="/forgot-password"
                  className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold transition-colors"
                >
                  Forgot password?
                </a>
              </div>
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
              {loading ? "Signing In..." : mode === "partner" ? "Sign In to My Portal →" : "Sign In as Admin →"}
            </button>
          </form>

          {mode === "partner" && (
            <div className="font-body text-[11px] theme-text-faint text-center mt-4 leading-relaxed">
              Don&apos;t have a partner account?{" "}
              <a href="/getstarted" className="text-brand-gold/70 hover:text-brand-gold transition-colors">
                Sign up here
              </a>
              <br />
              Need help? Email{" "}
              <a href="mailto:support@fintella.partners" className="text-brand-gold/70 hover:text-brand-gold transition-colors">
                support@fintella.partners
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
