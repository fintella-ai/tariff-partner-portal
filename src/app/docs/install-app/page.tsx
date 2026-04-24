import { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Install the Fintella App",
  description: "Step-by-step instructions to install Fintella on iPhone, Android, and desktop.",
};

async function getLogoUrl(): Promise<string | null> {
  try {
    const settings = await prisma.portalSettings.findUnique({
      where: { id: "global" },
      select: { logoUrl: true },
    });
    return settings?.logoUrl || null;
  } catch {
    return null;
  }
}

const themeCSS = `
  :root {
    --doc-bg: #ffffff;
    --doc-text: #1a1a2e;
    --doc-text-secondary: #555;
    --doc-text-muted: #888;
    --doc-border: #e5e7eb;
    --doc-card-bg: #f8f9fa;
    --doc-gold: #c4a050;
    --doc-gold-bg: rgba(196,160,80,0.08);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --doc-bg: #060a18;
      --doc-text: rgba(255,255,255,0.92);
      --doc-text-secondary: rgba(255,255,255,0.75);
      --doc-text-muted: rgba(255,255,255,0.55);
      --doc-border: rgba(255,255,255,0.12);
      --doc-card-bg: rgba(255,255,255,0.04);
      --doc-gold: #c4a050;
      --doc-gold-bg: rgba(196,160,80,0.12);
    }
  }
  body { background: var(--doc-bg); color: var(--doc-text); }
`;

export default async function InstallAppPage() {
  const logoUrl = await getLogoUrl();

  return (
    <div style={{ minHeight: "100vh", background: "var(--doc-bg)", color: "var(--doc-text)", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "40px 20px" }}>
      <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Fintella" style={{ maxHeight: 96, margin: "0 auto 16px", display: "block" }} />
          ) : (
            <div style={{ width: 88, height: 88, margin: "0 auto 16px", borderRadius: 18, background: "linear-gradient(135deg,#c4a050,#e8c060)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 48, fontWeight: 700 }}>F</div>
          )}
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 8px" }}>Install the Fintella App</h1>
          <p style={{ color: "var(--doc-text-secondary)", margin: 0, fontSize: 15 }}>
            Add Fintella to your home screen or desktop for instant access to deals, commissions, and partner tools.
          </p>
        </div>

        {/* iPhone */}
        <section style={{ border: "1px solid var(--doc-border)", background: "var(--doc-gold-bg)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--doc-gold)", marginBottom: 4 }}>📱 iPhone (Safari)</div>
          <div style={{ color: "var(--doc-text-muted)", fontSize: 13, marginBottom: 16 }}>Safari is required — Chrome on iPhone cannot install web apps.</div>
          <ol style={{ paddingLeft: 22, margin: 0, lineHeight: 1.8, fontSize: 15 }}>
            <li>Open <strong style={{ color: "var(--doc-gold)" }}>https://fintella.partners</strong> in Safari.</li>
            <li>Tap the <strong>Share</strong> button at the bottom of the screen (square with an up-arrow).</li>
            <li>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
            <li>Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner.</li>
            <li>Open Fintella from your home screen — you&rsquo;re done.</li>
          </ol>
        </section>

        {/* Android */}
        <section style={{ border: "1px solid var(--doc-border)", background: "var(--doc-gold-bg)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--doc-gold)", marginBottom: 4 }}>🤖 Android (Chrome)</div>
          <div style={{ color: "var(--doc-text-muted)", fontSize: 13, marginBottom: 16 }}>Chrome is recommended. Other browsers may work but the install prompt may look different.</div>
          <ol style={{ paddingLeft: 22, margin: 0, lineHeight: 1.8, fontSize: 15 }}>
            <li>Open <strong style={{ color: "var(--doc-gold)" }}>https://fintella.partners</strong> in Chrome.</li>
            <li>Tap the menu icon (⋮) in the top-right.</li>
            <li>Tap <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
            <li>Tap <strong>&ldquo;Install&rdquo;</strong> or <strong>&ldquo;Add&rdquo;</strong> to confirm.</li>
            <li>Open Fintella from your app drawer — you&rsquo;re done.</li>
          </ol>
        </section>

        {/* Desktop */}
        <section style={{ border: "1px solid var(--doc-border)", background: "var(--doc-gold-bg)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--doc-gold)", marginBottom: 4 }}>💻 Desktop (Chrome, Edge, Brave)</div>
          <div style={{ color: "var(--doc-text-muted)", fontSize: 13, marginBottom: 16 }}>Installs Fintella as a standalone desktop app with its own window and taskbar/dock icon.</div>
          <ol style={{ paddingLeft: 22, margin: 0, lineHeight: 1.8, fontSize: 15 }}>
            <li>Open <strong style={{ color: "var(--doc-gold)" }}>https://fintella.partners</strong> in Chrome, Edge, or Brave.</li>
            <li>Look for the install icon (⊕ or a small monitor icon) in the right side of the address bar.</li>
            <li>Click it, then click <strong>&ldquo;Install&rdquo;</strong> in the popup.</li>
            <li>If you don&rsquo;t see the icon: open the browser menu (⋮) → <strong>&ldquo;Install Fintella…&rdquo;</strong> or <strong>&ldquo;Apps&rdquo; → &ldquo;Install this site as an app&rdquo;</strong>.</li>
            <li>Fintella will now launch in its own window and show up in your taskbar/dock.</li>
          </ol>
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "var(--doc-card-bg)", fontSize: 13, color: "var(--doc-text-secondary)" }}>
            <strong>Safari on Mac:</strong> Safari 17+ also supports installing web apps. Open Fintella in Safari, then from the <strong>File</strong> menu choose <strong>&ldquo;Add to Dock&hellip;&rdquo;</strong>.
          </div>
        </section>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 32, color: "var(--doc-text-muted)", fontSize: 13 }}>
          Need help? Email <a href="mailto:support@fintella.partners" style={{ color: "var(--doc-gold)" }}>support@fintella.partners</a>.
        </div>
      </div>
    </div>
  );
}
