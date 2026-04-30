"use client";

import Link from "next/link";

export default function UpgradeGate({
  feature,
  message,
  children,
  allowed,
}: {
  feature: string;
  message: string;
  children: React.ReactNode;
  allowed: boolean;
}) {
  if (allowed) return <>{children}</>;

  return (
    <div className="relative">
      <div className="opacity-30 pointer-events-none select-none blur-[1px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="rounded-xl border p-6 text-center max-w-sm mx-4"
          style={{
            background: "var(--app-card-bg)",
            borderColor: "var(--brand-gold)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
          }}
        >
          <div className="text-3xl mb-3">💎</div>
          <h4 className="font-body text-sm font-semibold text-[var(--app-text)] mb-2">
            Pro Feature
          </h4>
          <p className="font-body text-[12px] text-[var(--app-text-muted)] mb-4">
            {message}
          </p>
          <Link
            href="/dashboard/pricing"
            className="inline-flex items-center gap-2 h-9 px-5 rounded-lg font-body text-[12px] font-semibold transition-all"
            style={{
              background: "var(--brand-gold)",
              color: "#000",
              boxShadow: "0 4px 14px rgba(176,140,48,0.3)",
            }}
          >
            Upgrade to Pro
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
