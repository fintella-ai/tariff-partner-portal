"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { FIRM_SHORT as DEFAULT_FIRM_SHORT, FIRM_SLOGAN as DEFAULT_FIRM_SLOGAN } from "@/lib/constants";
import { useDevice } from "@/lib/useDevice";

// ─── NAV STRUCTURE ───────────────────────────────────────────────────────────
// Main nav items (top section of sidebar)
const MAIN_NAV = [
  { id: "home", href: "/dashboard/home", icon: "\u{1F3E0}", label: "Home", shortLabel: "Home" },
  { id: "overview", href: "/dashboard/overview", icon: "\u{1F4CA}", label: "Overview", shortLabel: "Stats" },
  { id: "training", href: "/dashboard/training", icon: "\u{1F393}", label: "Partner Training", shortLabel: "Learn" },
  { id: "deals", href: "/dashboard/deals", icon: "\u{1F4BC}", label: "My Deals", shortLabel: "Deals" },
  { id: "downline", href: "/dashboard/downline", icon: "\u{1F465}", label: "Downline", shortLabel: "Team" },
  { id: "commissions", href: "/dashboard/commissions", icon: "\u{1F4B0}", label: "Commissions", shortLabel: "Earn" },
  { id: "submit-client", href: "/dashboard/submit-client", icon: "\u{1F4E9}", label: "Submit Client", shortLabel: "Submit" },
  { id: "referral-links", href: "/dashboard/referral-links", icon: "\u{1F517}", label: "Referral Links", shortLabel: "Links" },
  { id: "documents", href: "/dashboard/documents", icon: "\u{1F4C4}", label: "Documents", shortLabel: "Docs" },
  { id: "conference", href: "/dashboard/conference", icon: "\u{1F4F9}", label: "Live Weekly Call!", shortLabel: "Live" },
];

// Bottom section items (above user info)
const BOTTOM_NAV = [
  { id: "support", href: "/dashboard/support", icon: "\u{1F3AB}", label: "Support", shortLabel: "Help" },
];

// Mobile bottom bar items (subset)
const MOBILE_BAR = [
  { id: "home", href: "/dashboard/home", icon: "\u{1F3E0}", shortLabel: "Home" },
  { id: "deals", href: "/dashboard/deals", icon: "\u{1F4BC}", shortLabel: "Deals" },
  { id: "overview", href: "/dashboard/overview", icon: "\u{1F4CA}", shortLabel: "Stats" },
  { id: "commissions", href: "/dashboard/commissions", icon: "\u{1F4B0}", shortLabel: "Earn" },
  { id: "more", href: "#more", icon: "\u{2261}", shortLabel: "More" },
];

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: { id: string; href: string; icon: string; label: string };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg font-body text-[13px] transition-all min-h-[44px] ${
        isActive
          ? "bg-brand-gold/10 text-brand-gold"
          : "text-white/60 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="text-base leading-none">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const device = useDevice();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [firmShort, setFirmShort] = useState(DEFAULT_FIRM_SHORT);
  const [firmSlogan, setFirmSlogan] = useState(DEFAULT_FIRM_SLOGAN);
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<string[]>([]);

  // Fetch portal settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(({ settings }) => {
        if (settings.firmShort) setFirmShort(settings.firmShort);
        if (settings.firmSlogan) setFirmSlogan(settings.firmSlogan);
        try { setHiddenNavItems(JSON.parse(settings.hiddenNavItems || "[]")); } catch {}
        try {
          const order = JSON.parse(settings.navOrder || "[]");
          if (order.length > 0) setNavOrder(order);
        } catch {}
      })
      .catch(() => {});
  }, []);

  const user = session?.user as any;
  const partnerCode = user?.partnerCode || "DEMO";

  const clientRefUrl = `https://frostlawaz.com/referral?RR_WCID=5D5FFDC6-E177-4FF9-99BD-7CFECDB92D54&RR_WCID_TTL=396&REFERRALCODE=${partnerCode}&utm_campaign=Tariff+Refunds`;
  const partnerRefUrl = `https://trln.com/partner?ref=${partnerCode}`;

  function copyAndNotify(url: string, label: string) {
    navigator.clipboard.writeText(url);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  function navigate(href: string) {
    if (href === "#more") {
      setSidebarOpen(true);
      return;
    }
    router.push(href);
    if (!device.isDesktop) setSidebarOpen(false);
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  // ─── SIDEBAR CONTENT ────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="pl-2 mb-6">
        <div className="font-display text-sm font-bold text-brand-gold tracking-[1px]">
          {firmShort}
        </div>
        <div className="font-body text-[10px] text-white/30 mt-1 italic leading-tight">
          {firmSlogan}
        </div>
      </div>

      {/* Main Nav */}
      <div className="flex flex-col gap-0.5">
        {(navOrder.length > 0
          ? navOrder.map((id) => MAIN_NAV.find((n) => n.id === id)).filter(Boolean) as typeof MAIN_NAV
          : MAIN_NAV
        ).filter((item) => !hiddenNavItems.includes(item.id)).map((item) => (
          <NavButton
            key={item.id}
            item={item}
            isActive={isActive(item.href)}
            onClick={() => navigate(item.href)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-[24px]" />

      {/* User Info + Account Settings + Sign Out */}
      <div className="px-2 pt-3 border-t border-white/[0.06] text-center">
        <div className="font-body text-xs text-white/50 mb-0.5">
          {user?.name || "Partner"}
        </div>
        <div className="font-body text-[11px] text-white/30 tracking-[1px] mb-3">
          {partnerCode}
        </div>
        <button
          onClick={() => navigate("/dashboard/settings")}
          className={`w-full font-body text-[11px] border rounded px-3 py-2 mb-2 transition-colors ${
            isActive("/dashboard/settings")
              ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
              : "text-white/40 border-white/10 hover:text-white/60 hover:border-white/20"
          }`}
        >
          Account Settings
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full font-body text-[11px] text-white/40 border border-white/10 rounded px-3 py-2 hover:text-white/60 hover:border-white/20 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ paddingBottom: device.isMobile ? 72 : 0 }}>
      {/* ── DESKTOP SIDEBAR ── */}
      {device.isDesktop && (
        <div className="w-[250px] bg-black/30 border-r border-brand-gold/10 p-4 flex flex-col shrink-0 sticky top-0 h-screen overflow-y-auto">
          {sidebarContent}
        </div>
      )}

      {/* ── TABLET/MOBILE SIDEBAR OVERLAY ── */}
      {!device.isDesktop && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[998] backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div
            className="fixed left-0 top-0 bottom-0 w-[280px] max-w-[85vw] bg-[#060a18] border-r border-brand-gold/15 z-[999] overflow-y-auto p-5"
            style={{ animation: "slideIn .25s ease" }}
          >
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── TABLET HAMBURGER ── */}
      {device.isTablet && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-4 left-4 z-[901] bg-brand-dark/90 border border-brand-gold/20 rounded-lg w-11 h-11 flex items-center justify-center cursor-pointer text-brand-gold text-xl backdrop-blur-lg"
        >
          ☰
        </button>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      {device.isMobile && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-brand-dark/[0.97] border-t border-brand-gold/15 flex z-[900] backdrop-blur-xl"
          style={{ paddingBottom: device.os === "ios" ? "env(safe-area-inset-bottom, 0)" : 0 }}
        >
          {MOBILE_BAR.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.href)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 font-body text-[10px] transition-colors ${
                isActive(item.href) ? "text-brand-gold" : "text-white/45"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span>{item.shortLabel}</span>
            </button>
          ))}
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <div
        className={`flex-1 overflow-y-auto ${device.padding}`}
        style={{ paddingTop: device.isTablet ? 72 : undefined }}
      >
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          {device.isMobile && (
            <div className="flex justify-between items-center mb-3">
              <div className="font-display text-[13px] font-semibold text-brand-gold tracking-[1px]">
                {firmShort}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/dashboard/support")}
                  className={`font-body text-lg font-bold border rounded px-3 py-1.5 tracking-wider min-h-[32px] transition-colors ${
                    isActive("/dashboard/support")
                      ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
                      : "text-white/40 border-white/10 hover:text-white/60"
                  }`}
                >
                  🎫 Support
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="font-body text-[10px] text-white/40 border border-white/10 rounded px-3 py-1.5 tracking-wider min-h-[32px]"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Mobile: Referral link buttons right at top */}
          {device.isMobile && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => copyAndNotify(clientRefUrl, "client")}
                className={`flex-1 font-body text-[11px] font-semibold tracking-wider border rounded-lg px-3 py-2.5 transition-all text-center ${
                  copiedLink === "client"
                    ? "bg-green-500/15 border-green-500/30 text-green-400"
                    : "bg-brand-gold/[0.06] border-brand-gold/20 text-brand-gold"
                }`}
              >
                {copiedLink === "client" ? "✓ Copied!" : "💼 Share Client Link"}
              </button>
              <button
                onClick={() => copyAndNotify(partnerRefUrl, "partner")}
                className={`flex-1 font-body text-[11px] font-semibold tracking-wider border rounded-lg px-3 py-2.5 transition-all text-center ${
                  copiedLink === "partner"
                    ? "bg-green-500/15 border-green-500/30 text-green-400"
                    : "bg-purple-500/[0.06] border-purple-500/20 text-purple-400"
                }`}
              >
                {copiedLink === "partner" ? "✓ Copied!" : "👥 Share Partner Link"}
              </button>
            </div>
          )}

          <div className="flex justify-between items-start">
            <div>
              <div className="font-body text-[11px] text-white/40 tracking-[1px] uppercase mb-1">
                Welcome back
              </div>
              <h1 className={`font-display ${device.headingSize} font-bold mb-1`}>
                {user?.name || "Partner"}
              </h1>
              <div className="flex gap-2 sm:gap-4 items-center flex-wrap">
                <span className="font-body text-[11px] text-white/40 tracking-[1px]">
                  Code: <strong className="text-brand-gold">{partnerCode}</strong>
                </span>
                <span className="font-body text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5">
                  Active
                </span>
                {!device.isMobile && (
                  <span className="font-body text-[10px] text-white/25">
                    {device.os !== "unknown" && `${device.os.toUpperCase()}`}
                    {device.width > 0 && ` · ${device.width}×${device.height}`}
                  </span>
                )}
              </div>
            </div>
            {/* Desktop: Support + Referral links in top right */}
            {!device.isDesktop ? null : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => copyAndNotify(clientRefUrl, "client")}
                  className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2.5 transition-all flex items-center gap-1.5 ${
                    copiedLink === "client"
                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                      : "bg-brand-gold/[0.06] border-brand-gold/20 text-brand-gold hover:bg-brand-gold/10"
                  }`}
                >
                  {copiedLink === "client" ? "✓ Copied!" : "💼 Client Link"}
                </button>
                <button
                  onClick={() => copyAndNotify(partnerRefUrl, "partner")}
                  className={`font-body text-[12px] font-semibold tracking-wider border rounded-lg px-4 py-2.5 transition-all flex items-center gap-1.5 ${
                    copiedLink === "partner"
                      ? "bg-green-500/15 border-green-500/30 text-green-400"
                      : "bg-purple-500/[0.06] border-purple-500/20 text-purple-400 hover:bg-purple-500/10"
                  }`}
                >
                  {copiedLink === "partner" ? "✓ Copied!" : "👥 Partner Link"}
                </button>
                <button
                  onClick={() => navigate("/dashboard/support")}
                  className={`font-body text-lg font-bold tracking-[1px] border rounded-lg px-5 py-2.5 transition-colors flex items-center gap-2 ${
                    isActive("/dashboard/support")
                      ? "text-brand-gold border-brand-gold/30 bg-brand-gold/10"
                      : "text-white/50 border-white/10 hover:text-white/70 hover:border-white/20"
                  }`}
                >
                  🎫 Support
                </button>
              </div>
            )}
          </div>
        </div>

        {children}
      </div>

      {/* ── LIVE CHAT BUTTON ── */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className={`fixed z-[950] bg-gradient-to-br from-brand-gold to-[#e8c060] text-brand-dark rounded-full shadow-lg shadow-brand-gold/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
          device.isMobile
            ? "bottom-[88px] right-4 w-12 h-12 text-xl"
            : "bottom-6 right-6 w-14 h-14 text-2xl"
        }`}
        title="Chat with support"
      >
        {chatOpen ? "✕" : "💬"}
      </button>

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <div
          className={`fixed z-[951] bg-[#0c1228] border border-brand-gold/20 shadow-2xl shadow-black/40 flex flex-col ${
            device.isMobile
              ? "inset-0 rounded-none"
              : "bottom-24 right-6 w-[380px] h-[520px] rounded-2xl"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
            <div>
              <div className="font-body text-sm font-semibold text-white">Support Chat</div>
              <div className="font-body text-[11px] text-brand-gold/70">AI Assistant</div>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="text-white/40 hover:text-white text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            <div className="bg-brand-gold/10 border border-brand-gold/15 rounded-xl rounded-tl-sm px-4 py-3 max-w-[85%]">
              <div className="font-body text-[13px] text-white/80 leading-relaxed">
                Hi! I&apos;m your {firmShort} support assistant. How can I help you today?
              </div>
              <div className="font-body text-[10px] text-white/30 mt-1.5">Just now</div>
            </div>
          </div>
          <div className="p-4 border-t border-white/[0.08]">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your question..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-body text-[13px] outline-none focus:border-brand-gold/30 transition-colors placeholder:text-white/30"
              />
              <button className="bg-brand-gold/20 text-brand-gold border border-brand-gold/30 rounded-xl px-4 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors">
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
