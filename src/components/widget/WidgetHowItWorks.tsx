import { W, RADII, glassCardStyle, goldGradientStyle } from "./widget-theme";

export default function WidgetHowItWorks({ commissionRate }: { commissionRate: number }) {
  const steps = [
    {
      icon: "📋",
      title: "You refer a client",
      desc: "Fill in the referral form or upload document(s) — takes 60 seconds. We take it from there.",
    },
    {
      icon: "⚖️",
      title: "We back you up",
      desc: "Legal coverage for your client, audit-ready filing review, and error minimization — you file via CAPE with confidence.",
    },
    {
      icon: "💸",
      title: "Receive Your Payout",
      desc: "Paid via ACH, wire, or check when your client receives their tariff refund. No risk, no upfront cost.",
      link: { label: "Payout Settings →", href: "https://fintella.partners/dashboard/settings#payout" },
    },
  ];

  return (
    <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            textAlign: "center", gap: 8,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: RADII.lg,
              background: "rgba(196,160,80,0.1)", border: "1px solid rgba(196,160,80,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>
              {step.icon}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: W.gold,
              background: "rgba(196,160,80,0.12)", padding: "3px 10px",
              borderRadius: RADII.full, letterSpacing: 0.5,
            }}>
              STEP {i + 1}
            </span>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: W.text, margin: 0 }}>
              {step.title}
            </h3>
            <p style={{ fontSize: 13, color: W.textSecondary, margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
              {step.desc}
            </p>
            {step.link && (
              <a
                href={step.link.href}
                target="_blank"
                rel="noopener"
                style={{
                  fontSize: 12, color: W.gold, fontWeight: 500,
                  textDecoration: "none", marginTop: 2,
                }}
              >
                {step.link.label}
              </a>
            )}
          </div>
        ))}
      </div>

      <div style={{
        ...glassCardStyle(),
        borderColor: "rgba(196,160,80,0.15)",
        padding: 24, textAlign: "center",
      }}>
        <div style={{
          ...goldGradientStyle(),
          fontSize: 40, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif",
          letterSpacing: -0.5,
        }}>
          $47,000
        </div>
        <div style={{ fontSize: 13, color: W.gold, marginTop: 6, fontWeight: 500 }}>
          Average client refund
        </div>
      </div>

      <div style={{
        ...glassCardStyle(), padding: 18,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: W.textSecondary, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Who qualifies?
        </h4>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "U.S. importers of record",
            "Paid tariffs under IEEPA, Section 232, or 301",
            "Imported within the eligible recovery window",
            "Documented entries with CBP",
          ].map((item) => (
            <li key={item} style={{ display: "flex", gap: 8, fontSize: 13, color: W.textSecondary }}>
              <span style={{ color: W.green, flexShrink: 0 }}>✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
