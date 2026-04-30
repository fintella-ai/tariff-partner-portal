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
      icon: "💰",
      title: `You earn ${commissionRate}%`,
      desc: "Paid when your client receives their tariff refund. No risk, no upfront cost.",
    },
  ];

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{
              flexShrink: 0, width: 40, height: 40, borderRadius: RADII.md,
              background: "rgba(196,160,80,0.1)", border: "1px solid rgba(196,160,80,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>
              {step.icon}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: W.gold,
                  background: "rgba(196,160,80,0.12)", padding: "3px 8px",
                  borderRadius: RADII.full, letterSpacing: 0.5,
                }}>
                  STEP {i + 1}
                </span>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: W.text, margin: 0 }}>
                  {step.title}
                </h3>
              </div>
              <p style={{ fontSize: 13, color: W.textSecondary, margin: 0, lineHeight: 1.4 }}>
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        ...glassCardStyle(),
        borderColor: "rgba(196,160,80,0.15)",
        padding: 20, textAlign: "center",
      }}>
        <div style={{
          ...goldGradientStyle(),
          fontSize: 36, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif",
          letterSpacing: -0.5,
        }}>
          $47,000
        </div>
        <div style={{ fontSize: 12, color: W.gold, marginTop: 4, fontWeight: 500 }}>
          Average client refund
        </div>
      </div>

      <div style={{
        ...glassCardStyle(), padding: 14,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <h4 style={{ fontSize: 12, fontWeight: 600, color: W.textSecondary, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Who qualifies?
        </h4>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
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
