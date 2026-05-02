"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import { W, SHADOWS, RADII, glassCardStyle, goldButtonStyle, greenButtonStyle, goldGradientStyle, inputStyle } from "@/components/widget/widget-theme";
import WidgetFooter from "@/components/widget/WidgetFooter";
import WidgetHowItWorks from "@/components/widget/WidgetHowItWorks";

type Tab = "dashboard" | "calc" | "refer" | "how" | "help";

const DEMO_PARTNER = "Pacific Coast Logistics";
const DEMO_RATE = 20;

function DemoToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
      background: "linear-gradient(135deg, #c4a050, #f0d070)", color: "#060a14",
      padding: "10px 20px", borderRadius: RADII.full, fontSize: 13, fontWeight: 700,
      boxShadow: SHADOWS.modal, zIndex: 100, whiteSpace: "nowrap",
      animation: "demo-toast-in 0.3s ease",
    }}>
      {message}
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: 12, fontWeight: 700, color: "#060a14" }}>&times;</button>
      <style>{`@keyframes demo-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}

function LeadCaptureModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", companyName: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.email.trim()) { setError("Name and email are required"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          referralSource: "widget_demo",
          audienceContext: "Converted from widget demo — high intent prospect",
          utmSource: "widget_demo",
          utmMedium: "interactive",
          utmCampaign: "demo_lead_capture",
        }),
      });
      if (res.ok) { onSuccess(); } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong");
      }
    } catch { setError("Connection failed"); } finally { setSubmitting(false); }
  };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, animation: "demo-toast-in 0.2s ease",
    }}>
      <div style={{
        ...glassCardStyle(), width: "100%", maxWidth: 380, padding: 24,
        boxShadow: SHADOWS.modal, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 12, background: "none", border: "none",
          color: W.textDim, fontSize: 18, cursor: "pointer", lineHeight: 1,
        }}>&times;</button>

        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1F680;</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, ...goldGradientStyle(), marginBottom: 4 }}>
            Ready to Earn Real Commissions?
          </h3>
          <p style={{ fontSize: 12, color: W.textSecondary, lineHeight: 1.5 }}>
            Apply to become a Fintella partner. Get your own widget, calculator, and referral tools — free to join.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: W.textDim, display: "block", marginBottom: 3 }}>First Name *</label>
              <input style={inputStyle()} value={form.firstName} onChange={set("firstName")} placeholder="John" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: W.textDim, display: "block", marginBottom: 3 }}>Last Name</label>
              <input style={inputStyle()} value={form.lastName} onChange={set("lastName")} placeholder="Smith" />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: W.textDim, display: "block", marginBottom: 3 }}>Email *</label>
            <input style={inputStyle()} type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" required />
          </div>
          <div>
            <label style={{ fontSize: 10, color: W.textDim, display: "block", marginBottom: 3 }}>Phone</label>
            <input style={inputStyle()} value={form.phone} onChange={set("phone")} placeholder="(555) 123-4567" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: W.textDim, display: "block", marginBottom: 3 }}>Company</label>
            <input style={inputStyle()} value={form.companyName} onChange={set("companyName")} placeholder="Your company name" />
          </div>
          {error && <div style={{ fontSize: 11, color: W.red, textAlign: "center" }}>{error}</div>}
          <button type="submit" disabled={submitting} style={greenButtonStyle(submitting)}>
            {submitting ? "Submitting..." : "Apply Now — It's Free"}
          </button>
          <p style={{ fontSize: 10, color: W.textDim, textAlign: "center", marginTop: 2 }}>
            No cost. No obligation. Start earning on every referral.
          </p>
        </form>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...glassCardStyle(), padding: "16px 14px", flex: 1 }}>
      <div style={{ fontSize: 11, color: W.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, ...goldGradientStyle() }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: W.textSecondary, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DemoDashboard() {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <StatCard label="Referrals" value="12" sub="3 pending" />
        <StatCard label="Earnings" value="$47,250" sub="$12,400 pending" />
      </div>
      <div style={{ ...glassCardStyle(), padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: W.text, marginBottom: 12 }}>Recent Activity</div>
        {[
          { co: "Meridian Trade Co.", status: "Converted", amount: "$14,200", color: W.green },
          { co: "Atlas Freight LLC", status: "Submitted", amount: "$8,750", color: W.amber },
          { co: "Harbor Point Imports", status: "Contacted", amount: "$6,300", color: W.blue },
        ].map((r) => (
          <div key={r.co} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${W.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: W.text }}>{r.co}</div>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: RADII.full, background: `${r.color}15`, color: r.color, fontWeight: 600 }}>{r.status}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: W.gold }}>{r.amount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemoCalculator({ onToast, onCapture }: { onToast: (m: string) => void; onCapture: () => void }) {
  const [showResults, setShowResults] = useState(false);
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {!showResults ? (
        <>
          <div style={{ ...glassCardStyle(), padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: W.text, marginBottom: 12 }}>Tariff Refund Calculator</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: W.textDim, display: "block", marginBottom: 4 }}>Country of Origin</label>
                <select style={{ ...inputStyle(), background: W.bgInput, appearance: "none" as const }} defaultValue="CN">
                  <option value="CN">China (CN)</option>
                  <option value="VN">Vietnam (VN)</option>
                  <option value="MX">Mexico (MX)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: W.textDim, display: "block", marginBottom: 4 }}>Total Import Value (USD)</label>
                <input style={inputStyle()} defaultValue="2,300,000" readOnly />
              </div>
              <div>
                <label style={{ fontSize: 11, color: W.textDim, display: "block", marginBottom: 4 }}>Number of Entries</label>
                <input style={inputStyle()} defaultValue="47" readOnly />
              </div>
            </div>
          </div>
          <button onClick={() => setShowResults(true)} style={goldButtonStyle()}>
            Calculate Estimated Refund
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...glassCardStyle(), padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: W.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Estimated Refund</div>
            <div style={{ fontSize: 36, fontWeight: 800, ...goldGradientStyle() }}>$575,000</div>
            <div style={{ fontSize: 12, color: W.textSecondary, marginTop: 4 }}>Based on 25% IEEPA tariff rate</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ ...glassCardStyle(), padding: 12, flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: W.textDim }}>Your Commission</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: W.green }}>$115,000</div>
              <div style={{ fontSize: 10, color: W.textDim }}>{DEMO_RATE}% rate</div>
            </div>
            <div style={{ ...glassCardStyle(), padding: 12, flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: W.textDim }}>Confidence</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: W.green }}>94%</div>
              <div style={{ fontSize: 10, color: W.textDim }}>High</div>
            </div>
          </div>
          <button onClick={onCapture} style={greenButtonStyle()}>
            Submit as Referral &#x1F680;
          </button>
        </div>
      )}
    </div>
  );
}

function DemoReferralForm({ onCapture }: { onCapture: () => void }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...glassCardStyle(), padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: W.text, marginBottom: 14 }}>Submit Client Referral</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Company Name", val: "Pacific Coast Imports" },
            { label: "Contact Name", val: "Sarah Chen" },
            { label: "Email", val: "sarah@pacificcoastimports.com" },
            { label: "Phone", val: "(310) 555-0142" },
            { label: "Est. Import Value", val: "$2,300,000" },
          ].map((f) => (
            <div key={f.label}>
              <label style={{ fontSize: 11, color: W.textDim, display: "block", marginBottom: 4 }}>{f.label}</label>
              <input style={inputStyle()} defaultValue={f.val} readOnly />
            </div>
          ))}
        </div>
      </div>
      <button onClick={onCapture} style={greenButtonStyle()}>
        Submit Referral &#x1F680;
      </button>
    </div>
  );
}

function DemoChat() {
  const msgs: { role: "ai" | "user"; text: string }[] = [
    { role: "ai", text: "Hi! I'm Stella, your tariff recovery assistant. How can I help today?" },
    { role: "user", text: "How does the IEEPA refund process work?" },
    { role: "ai", text: "Great question! The IEEPA refund process involves filing a protest through CAPE (Customs Automated Protest Engine) within 180 days of liquidation. Here's a quick breakdown:\n\n1. Identify eligible entries with IEEPA tariffs\n2. Gather supporting documentation (entry summaries, commercial invoices)\n3. File a protest via ACE/CAPE\n4. CBP reviews and issues refund\n\nThe typical timeline is 6-12 months. Would you like to run a calculation on a specific client?" },
  ];
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px", borderRadius: RADII.md,
              background: m.role === "user" ? "linear-gradient(135deg, #c4a050, #f0d070)" : W.bgCard,
              color: m.role === "user" ? "#060a14" : W.text,
              fontSize: 13, lineHeight: 1.5,
              border: m.role === "ai" ? `1px solid ${W.border}` : "none",
              whiteSpace: "pre-line",
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...inputStyle(), flex: 1 }} placeholder="Ask about tariff recovery..." readOnly />
        <button style={{ ...goldButtonStyle(), width: "auto", padding: "12px 16px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#060a14" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
        </button>
      </div>
    </div>
  );
}

const tabIcons: Record<Tab, (c: string, active: boolean) => ReactNode> = {
  dashboard: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? c : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.999L12 4l8 9.999" fill="none"/><path d="M6 12.5V20a1 1 0 001 1h3.5v-5a1.5 1.5 0 013 0v5H17a1 1 0 001-1v-7.5" fill={a ? "rgba(196,160,80,0.15)" : "none"}/></svg>,
  calc: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2.5" fill={a ? "rgba(196,160,80,0.1)" : "none"}/><rect x="7" y="5" width="10" height="3" rx="1"/><circle cx="8.5" cy="12" r="0.8" fill={c}/><circle cx="12" cy="12" r="0.8" fill={c}/><circle cx="15.5" cy="12" r="0.8" fill={c}/><circle cx="8.5" cy="15.5" r="0.8" fill={c}/><circle cx="12" cy="15.5" r="0.8" fill={c}/><circle cx="15.5" cy="15.5" r="0.8" fill={c}/><circle cx="8.5" cy="19" r="0.8" fill={c}/><rect x="11" y="18.2" width="5.5" height="1.6" rx="0.8" fill={c}/></svg>,
  refer: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" strokeWidth="2"/><path d="M22 2L15 22l-4-9-9-4z" fill={a ? "rgba(196,160,80,0.12)" : "none"}/></svg>,
  how: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? "rgba(196,160,80,0.1)" : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4" strokeWidth="2.5"/><circle cx="12" cy="8" r="1" fill={c} stroke="none"/></svg>,
  help: (c, a) => <svg width="20" height="20" viewBox="0 0 24 24" fill={a ? "rgba(196,160,80,0.1)" : "none"} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="12" cy="10" r="0.8" fill={c} stroke="none"/><circle cx="8" cy="10" r="0.8" fill={c} stroke="none"/><circle cx="16" cy="10" r="0.8" fill={c} stroke="none"/></svg>,
};

export default function WidgetDemoPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [toast, setToast] = useState<string | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [captured, setCaptured] = useState(false);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Home" },
    { id: "calc", label: "Calc" },
    { id: "refer", label: "Refer" },
    { id: "how", label: "Info" },
    { id: "help", label: "Help" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}>
      {/* Demo watermark */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        <div style={{
          transform: "rotate(-35deg)", fontSize: 64, fontWeight: 900,
          color: "rgba(196,160,80,0.04)", letterSpacing: 12,
          whiteSpace: "nowrap", userSelect: "none",
        }}>
          DEMO
        </div>
      </div>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0c1220, #060a14)",
        padding: "14px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/ai-avatars/stella.png" alt="Stella" style={{
            width: 34, height: 34, borderRadius: "50%",
            border: "2px solid rgba(196,160,80,0.4)", flexShrink: 0, objectFit: "cover",
          }} />
          <span style={{
            fontSize: 13, fontWeight: 700, color: W.gold,
            fontFamily: "'DM Serif Display', Georgia, serif", letterSpacing: 0.3,
          }}>
            FinStellaTMS
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: W.text, fontWeight: 600 }}>{DEMO_PARTNER}</span>
          <span style={{
            fontSize: 9, color: W.gold, fontWeight: 600, marginTop: 2,
            background: "rgba(196,160,80,0.12)", padding: "2px 8px", borderRadius: RADII.full,
          }}>
            {DEMO_RATE}% commission
          </span>
        </div>
      </div>

      {/* Demo banner */}
      <div style={{
        background: "linear-gradient(135deg, rgba(196,160,80,0.15), rgba(196,160,80,0.05))",
        padding: "6px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        borderBottom: `1px solid ${W.border}`,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={W.gold} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><circle cx="12" cy="8" r="1" fill={W.gold} stroke="none"/></svg>
        <span style={{ fontSize: 11, color: W.gold, fontWeight: 600 }}>Interactive Demo — all features functional with sample data</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${W.border}` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "8px 0 6px", fontSize: 11, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center",
              border: "none", background: "transparent", cursor: "pointer",
              transition: "all 0.2s", position: "relative",
              color: tab === t.id ? W.gold : "rgba(255,255,255,0.4)",
              borderBottom: tab === t.id ? `2px solid ${W.gold}` : "2px solid transparent",
            }}
          >
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, margin: "0 auto",
              transition: "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
              transform: tab === t.id ? "scale(1.2)" : "scale(1)",
              filter: tab === t.id ? "drop-shadow(0 0 6px rgba(196,160,80,0.4))" : "none",
            }}>
              {tabIcons[t.id](tab === t.id ? W.gold : "rgba(255,255,255,0.35)", tab === t.id)}
            </span>
            <span style={{ fontSize: 9, marginTop: 4, display: "block", letterSpacing: 0.8 }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 36 }}>
        {tab === "dashboard" && <DemoDashboard />}
        {tab === "calc" && <DemoCalculator onToast={showToast} onCapture={() => setShowCapture(true)} />}
        {tab === "refer" && <DemoReferralForm onCapture={() => setShowCapture(true)} />}
        {tab === "how" && <WidgetHowItWorks commissionRate={DEMO_RATE} />}
        {tab === "help" && <DemoChat />}
      </div>

      <WidgetFooter />
      {toast && <DemoToast message={toast} onClose={() => setToast(null)} />}
      {showCapture && !captured && (
        <LeadCaptureModal
          onClose={() => setShowCapture(false)}
          onSuccess={() => { setCaptured(true); setShowCapture(false); showToast("Application submitted! We'll be in touch."); }}
        />
      )}
    </div>
  );
}
