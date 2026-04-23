"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FIRM_SLOGAN, SUPPORT_EMAIL } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"partner" | "admin">("partner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");

  // Pull the brand logo from PortalSettings so the login chrome matches
  // whatever the admin uploaded in Settings → Brand (same source the
  // InstallPrompt + SoftPhone use).
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings?.logoUrl) setLogoUrl(settings.logoUrl);
      })
      .catch(() => {});
  }, []);

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
      setError(`Connection error. Please try again or email ${SUPPORT_EMAIL}.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-10 relative overflow-hidden" style={{ background: "#000000" }}>
      <style>{`
        .login-grid { background-image: linear-gradient(rgba(196,160,80,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(196,160,80,.04) 1px,transparent 1px); }
      `}</style>
      <div className="absolute inset-0 pointer-events-none login-grid"
        style={{ backgroundSize: "60px 60px" }}
      />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="text-center mb-8 sm:mb-10 animate-fade-up">
          {/* Brand logo — intentionally sized wider than the "Partner Portal"
              heading below so the mark carries the page. */}
          {logoUrl && (
            <div className="mb-6 flex justify-center">
              <img
                src={logoUrl}
                alt="Fintella"
                className="w-full max-w-[380px] sm:max-w-[440px] h-auto object-contain"
              />
            </div>
          )}
          <h1 className="font-display text-[26px] sm:text-[32px] font-bold mb-3 text-white">
            Partner <span className="gold-gradient">Portal</span>
          </h1>
          <p className="font-body text-[13px] sm:text-sm text-white/75 leading-relaxed px-2 italic">
            {FIRM_SLOGAN}
          </p>
          <p className="font-body text-[12px] sm:text-[13px] text-white/55 leading-relaxed px-2 mt-2">
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
