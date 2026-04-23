"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { FIRM_NAME, FIRM_SHORT, FIRM_SLOGAN } from "@/lib/constants";
import CountryCodeSelect, { buildMobilePhone } from "@/components/ui/CountryCodeSelect";

interface InviteData {
  invitedEmail: string | null;
  invitedName: string | null;
  commissionRate: number;
}

function GetStartedContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ partnerCode: string; embeddedSigningUrl: string | null } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobileCountry, setMobileCountry] = useState("US");
  const [mobileNumber, setMobileNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  // Validate invite token on mount
  useEffect(() => {
    if (!token) {
      setTokenError("No invite link provided. Please use the link from your invitation email.");
      setLoading(false);
      return;
    }
    fetch(`/api/getstarted?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setTokenError(data.error);
        } else {
          setInvite(data.invite);
          // Pre-fill email and name from the invite
          if (data.invite.invitedEmail) setEmail(data.invite.invitedEmail);
          if (data.invite.invitedName) {
            const parts = data.invite.invitedName.trim().split(" ");
            if (parts[0]) setFirstName(parts[0]);
            if (parts.length > 1) setLastName(parts.slice(1).join(" "));
          }
        }
      })
      .catch(() => setTokenError("Failed to validate invite link. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError("");
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("First name, last name, and email are required.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const hasPhone = phone.replace(/\D/g, "").length >= 7;
    const hasMobile = mobileNumber.replace(/\D/g, "").length >= 7;
    if (!hasPhone && !hasMobile) {
      setPhoneError("Please enter at least one valid phone number (Phone or Mobile).");
      return;
    }
    if (!emailOptIn || !smsOptIn) {
      setError("You must consent to both email and SMS communications to proceed.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/getstarted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          email,
          phone,
          mobilePhone: buildMobilePhone(mobileCountry, mobileNumber) || null,
          companyName,
          password,
          emailOptIn,
          smsOptIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Signup failed"); return; }
      setSuccess({ partnerCode: data.partnerCode, embeddedSigningUrl: data.embeddedSigningUrl });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full theme-input rounded-lg px-4 py-3 font-body text-sm outline-none focus:border-brand-gold/40 transition-colors";
  const labelClass = "font-body text-[11px] tracking-[1px] uppercase theme-text-muted mb-2 block";

  // ── LOADING ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="font-body text-sm theme-text-muted">Validating invite link...</div>
      </div>
    );
  }

  // ── INVALID TOKEN ──
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--app-bg)" }}>
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-8">
            <div className="font-display text-sm font-semibold text-brand-gold tracking-[2px] uppercase mb-4">{FIRM_NAME}</div>
          </div>
          <div className="card p-6 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-bold mb-2">Invalid Invite</h2>
            <p className="font-body text-[13px] theme-text-muted mb-5 leading-relaxed">{tokenError}</p>
            <a href="/login" className="font-body text-sm text-brand-gold hover:underline">Already have an account? Log in</a>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS: Show embedded signing or email fallback ──
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--app-bg)" }}>
        <div className="w-full max-w-[900px]">
          <div className="card p-5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold mb-1">Welcome to {FIRM_SHORT}!</h2>
                <p className="font-body text-[13px] theme-text-muted">Your account has been created. Please sign your partnership agreement below to activate your account.</p>
                <p className="font-body text-[11px] theme-text-faint mt-1">A copy has also been sent to your email if you prefer to complete it later.</p>
              </div>
              <div className="text-center sm:text-right shrink-0">
                <div className="font-body text-[10px] theme-text-muted uppercase tracking-wider">Your Partner Code</div>
                <div className="font-mono text-lg font-bold text-brand-gold tracking-[2px]">{success.partnerCode}</div>
              </div>
            </div>
          </div>

          {/* SignWell blocks iframe embedding — open the signing URL in a
              new tab instead. Matches the dashboard "Sign Now" pattern. */}
          <div className="card p-6 text-center mb-4">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-500/10 border border-green-500/25 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-body text-[14px] font-semibold text-[var(--app-text)] mb-1">
              Partnership agreement sent
            </p>
            <p className="font-body text-[12px] theme-text-muted leading-relaxed max-w-[420px] mx-auto">
              A copy has been sent to your email. You can sign it now or later — signing activates your account and unlocks the partner portal.
            </p>
            {success.embeddedSigningUrl && (
              <button
                onClick={() => window.open(success.embeddedSigningUrl!, "_blank")}
                className="btn-gold inline-flex items-center gap-2 mt-5 px-6 py-3 text-[13px]"
              >
                <span>✍️</span>
                <span>Sign Agreement Now</span>
              </button>
            )}
          </div>

          <div className="text-center">
            <a href="/login" className="btn-gold inline-block px-8 py-3 text-[13px]">Sign In to Your Portal</a>
            <p className="font-body text-[11px] theme-text-muted mt-3">Use your email and password to log in after signing.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── SIGNUP FORM ──
  const ratePercent = invite ? Math.round(invite.commissionRate * 100) : 25;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-10" style={{ background: "var(--app-bg)" }}>
      <div className="w-full max-w-[500px]">
        <div className="text-center mb-8">
          <div className="font-display text-sm font-semibold text-brand-gold tracking-[2px] uppercase mb-4">{FIRM_NAME}</div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mb-2">Become a Partner</h1>
          <p className="font-body text-[13px] theme-text-muted italic">{FIRM_SLOGAN}</p>
        </div>

        {/* Invite info card */}
        <div className="card p-4 mb-5">
          <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3">
            <div>
              <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider mb-1">You&apos;ve been invited by</div>
              <div className="font-body text-sm font-semibold">{FIRM_SHORT} Team</div>
            </div>
            <div className="xs:text-right">
              <div className="font-body text-[11px] theme-text-muted uppercase tracking-wider">Your Commission</div>
              <div className="font-display text-2xl font-bold text-brand-gold">{ratePercent}%</div>
              <div className="font-body text-[10px] theme-text-muted">of firm fee</div>
            </div>
          </div>
        </div>

        <div className="card p-5 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[13px] text-red-400">{error}</div>
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
                <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className={labelClass}>Confirm Password <span className="text-red-400">*</span></label>
                <input className={inputClass} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Phone <span className="theme-text-faint normal-case">(optional)</span></label>
                <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div>
                <label className={labelClass}>Mobile Phone (SMS) <span className="theme-text-faint normal-case">(optional)</span></label>
                <div className="flex gap-2">
                  <div className="shrink-0"><CountryCodeSelect selectedCode={mobileCountry} onChange={setMobileCountry} /></div>
                  <input className={inputClass} type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="(123) 444-2124" />
                </div>
              </div>
            </div>
            {phoneError && (
              <div className="mb-4 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-lg font-body text-[13px] text-red-400">{phoneError}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={labelClass}>Company <span className="theme-text-faint normal-case">(optional)</span></label>
                <input className={inputClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" />
              </div>
            </div>

            {/* Communications opt-in */}
            <div className="mb-4 p-4 rounded-lg" style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}>
              <div className="font-body text-[12px] font-semibold theme-text-secondary mb-3">Communications Consent <span className="text-red-400">*</span></div>
              <label className="flex items-start gap-3 mb-3 cursor-pointer">
                <input type="checkbox" checked={emailOptIn} onChange={(e) => setEmailOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-brand-gold/30 bg-transparent text-brand-gold focus:ring-brand-gold/50 cursor-pointer shrink-0" />
                <span className="font-body text-[12px] theme-text-secondary leading-relaxed">
                  I agree to receive email communications about my account activity, deal status updates, commission statements, and important program announcements. I can unsubscribe at any time via the link in any email or by contacting support.
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-brand-gold/30 bg-transparent text-brand-gold focus:ring-brand-gold/50 cursor-pointer shrink-0" />
                <span className="font-body text-[12px] theme-text-secondary leading-relaxed">
                  I agree to receive SMS notifications about my account activity, deal status updates, and commission payment alerts. Message frequency varies. Message and data rates may apply. Reply STOP to cancel at any time.
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
      </div>
    </div>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}><div className="font-body text-sm theme-text-muted">Loading...</div></div>}>
      <GetStartedContent />
    </Suspense>
  );
}
