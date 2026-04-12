"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FIRM_NAME, FIRM_SHORT, FIRM_SLOGAN } from "@/lib/constants";

interface InviteData {
  targetTier: string;
  commissionRate: number;
  inviterName: string;
  inviterCompany: string | null;
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}><div className="font-body text-sm theme-text-muted">Loading...</div></div>}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ partnerCode: string; message: string } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmSignupPassword, setConfirmSignupPassword] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);

  useEffect(() => {
    if (!token) { setError("No invite token provided. Please use the link your partner shared with you."); setLoading(false); return; }
    fetch(`/api/signup?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInvite(data.invite);
      })
      .catch(() => setError("Failed to validate invite link."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }
    if (!signupPassword || signupPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (signupPassword !== confirmSignupPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!emailOptIn || !smsOptIn) {
      setError("You must consent to both email and SMS communications to proceed.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName, lastName, email, phone, companyName, password: signupPassword, emailOptIn, smsOptIn }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Signup failed"); return; }
      setSuccess({ partnerCode: data.partnerCode, message: data.message });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const ratePercent = invite ? Math.round(invite.commissionRate * 100) : 0;
  const inputClass = "w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-10" style={{ background: "var(--app-bg)" }}>
      <div className="w-full max-w-[500px]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="font-display text-sm font-semibold text-brand-gold tracking-[2px] uppercase mb-4">{FIRM_NAME}</div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">Partner Signup</h1>
          <p className="font-body text-[13px] theme-text-muted italic">{FIRM_SLOGAN}</p>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="font-body text-sm theme-text-muted">Validating invite link...</div>
          </div>
        )}

        {!loading && error && !invite && (
          <div className="card p-6 text-center">
            <div className="text-red-400 text-4xl mb-4">!</div>
            <h2 className="font-display text-lg font-bold mb-2">Invalid Invite</h2>
            <p className="font-body text-[13px] theme-text-muted mb-4">{error}</p>
            <a href="/login" className="font-body text-sm text-brand-gold hover:underline">Already have an account? Log in</a>
          </div>
        )}

        {!loading && invite && !success && (
          <>
            {/* Invite info card */}
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider">Invited by</div>
                  <div className="font-body text-sm font-semibold">{invite.inviterName}</div>
                  {invite.inviterCompany && <div className="font-body text-[12px] theme-text-muted">{invite.inviterCompany}</div>}
                </div>
                <div className="text-right">
                  <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider">Your Commission</div>
                  <div className="font-display text-2xl font-bold text-brand-gold">{ratePercent}%</div>
                  <div className="font-body text-[10px] theme-text-muted">of firm fee</div>
                </div>
              </div>
              <div className="font-body text-[12px] theme-text-muted" style={{ borderTop: "1px solid var(--app-border)", paddingTop: 12 }}>
                You are joining as an <strong className="text-brand-gold">{invite.targetTier.toUpperCase()}</strong> partner. You will earn {ratePercent}% of the firm fee on every deal you refer.
              </div>
            </div>

            {/* Signup form */}
            <div className="card p-5 sm:p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[13px] text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>First Name <span className="text-red-400">*</span></label>
                    <input className={inputClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
                  </div>
                  <div>
                    <label className={labelClass}>Last Name <span className="text-red-400">*</span></label>
                    <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" />
                  </div>
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Email <span className="text-red-400">*</span></label>
                  <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@yourfirm.com" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Password <span className="text-red-400">*</span></label>
                    <input className={inputClass} type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} placeholder="Min 6 characters" />
                  </div>
                  <div>
                    <label className={labelClass}>Confirm Password <span className="text-red-400">*</span></label>
                    <input className={inputClass} type="password" value={confirmSignupPassword} onChange={(e) => setConfirmSignupPassword(e.target.value)} placeholder="Re-enter password" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <label className={labelClass}>Company <span className="theme-text-faint normal-case">(optional)</span></label>
                    <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
                  </div>
                </div>

                {/* Communications opt-in (required) */}
                <div className="mb-4 p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
                  <div className="font-body text-[12px] font-semibold theme-text-secondary mb-3">Communications Consent <span className="text-red-400">*</span></div>
                  <label className="flex items-start gap-3 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailOptIn}
                      onChange={(e) => setEmailOptIn(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-brand-gold/30 bg-transparent text-brand-gold focus:ring-brand-gold/50 cursor-pointer shrink-0"
                    />
                    <span className="font-body text-[12px] theme-text-secondary leading-relaxed">
                      I consent to receive email communications from {FIRM_SHORT} including partnership updates, deal notifications, commission statements, and program announcements.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsOptIn}
                      onChange={(e) => setSmsOptIn(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-brand-gold/30 bg-transparent text-brand-gold focus:ring-brand-gold/50 cursor-pointer shrink-0"
                    />
                    <span className="font-body text-[12px] theme-text-secondary leading-relaxed">
                      I consent to receive SMS/text messages from {FIRM_SHORT} for time-sensitive deal updates, commission alerts, and important program notifications. Msg &amp; data rates may apply.
                    </span>
                  </label>
                </div>

                <button type="submit" disabled={submitting || !emailOptIn || !smsOptIn} className={`btn-gold w-full min-h-[48px] mt-2 ${(!emailOptIn || !smsOptIn) ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {submitting ? "Creating Account..." : "Sign Up as Partner"}
                </button>
              </form>

              <div className="text-center mt-4">
                <a href="/login" className="font-body text-[12px] theme-text-muted hover:text-brand-gold transition-colors">
                  Already have an account? Log in
                </a>
              </div>
            </div>
          </>
        )}

        {success && (
          <div className="card p-6 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-bold mb-2">Welcome to {FIRM_SHORT}!</h2>
            <p className="font-body text-[13px] theme-text-secondary mb-4 leading-relaxed">
              Your account has been created successfully.
            </p>

            <div className="card p-3 mb-4" style={{ background: "var(--app-input-bg)" }}>
              <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider mb-1">Your Partner Code</div>
              <div className="font-mono text-lg font-bold text-brand-gold tracking-[2px]">{success.partnerCode}</div>
            </div>

            <div className="p-3.5 mb-5 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/20">
              <p className="font-body text-[12px] text-yellow-400/80 leading-relaxed">
                Your upline partner will submit your signed partnership agreement. Once reviewed and approved by our team, your account will be activated and you can begin submitting client referrals.
              </p>
            </div>

            <a href="/login" className="btn-gold inline-block px-8 py-3 text-[13px]">
              Log In to Your Portal
            </a>
            <p className="font-body text-[11px] theme-text-muted mt-3">
              Use your email and password to log in.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
