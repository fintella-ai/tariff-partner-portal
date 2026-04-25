"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { isStarSuperAdminEmail } from "@/lib/starSuperAdmin";

// ─── Service data ──────────────────────────────────────────────────────────

type ServiceStatus = "active" | "trial" | "idle" | "pending";

interface Service {
  name: string;
  plan: string;
  cost: string;
  status: ServiceStatus;
  note?: string;
}

interface Category {
  title: string;
  icon: string;
  services: Service[];
}

const CATEGORIES: Category[] = [
  {
    title: "Hosting & Infrastructure",
    icon: "🏗️",
    services: [
      { name: "Vercel (Fintella Portal)", plan: "Pro", cost: "$20/mo", status: "active" },
      { name: "Vercel (Fintella OS)", plan: "Pro Trial", cost: "$0/mo", status: "trial", note: "Check expiry" },
      { name: "Neon Postgres", plan: "Pro", cost: "$19/mo", status: "active" },
      { name: "Contabo VPS", plan: "Tier 2", cost: "$23/mo", status: "idle", note: "Planned for MinIO" },
      { name: "GitHub", plan: "Free", cost: "$0/mo", status: "active" },
      { name: "Cloudflare", plan: "Free", cost: "$0/mo", status: "active" },
    ],
  },
  {
    title: "Integrations",
    icon: "🔌",
    services: [
      { name: "SignWell", plan: "Paid", cost: "~$30/mo", status: "active", note: "E-signatures" },
      { name: "SendGrid", plan: "Upgraded", cost: "$79/mo", status: "active", note: "Transactional email" },
      { name: "Twilio SMS", plan: "Pending", cost: "$0/mo", status: "pending", note: "Waiting on A2P 10DLC approval" },
      { name: "Twilio Voice", plan: "Usage-based", cost: "~$5/mo", status: "active" },
      { name: "Anthropic Claude API", plan: "Usage-based", cost: "~$30–50/mo", status: "active", note: "PartnerOS AI" },
      { name: "Sentry", plan: "Free", cost: "$0/mo", status: "active", note: "Error monitoring" },
      { name: "Google OAuth", plan: "Free", cost: "$0/mo", status: "active" },
    ],
  },
  {
    title: "AI & Tools",
    icon: "🤖",
    services: [
      { name: "Claude Code (Anthropic)", plan: "Max / Team", cost: "~$100–200/mo", status: "active", note: "Development AI" },
      { name: "HeyGen", plan: "Creator", cost: "$29/mo", status: "active", note: "AI avatar videos" },
    ],
  },
  {
    title: "Domains",
    icon: "🌐",
    services: [
      { name: "fintella.partners", plan: "Annual", cost: "~$30/yr", status: "active" },
      { name: "trln.partners", plan: "Annual", cost: "~$30/yr", status: "active", note: "Unused, staging" },
    ],
  },
];

// ─── Status badge styles ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<ServiceStatus, { label: string; bg: string; text: string }> = {
  active:  { label: "Active",  bg: "bg-green-500/10 border-green-500/20",  text: "text-green-400" },
  trial:   { label: "Trial",   bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400" },
  idle:    { label: "Idle",    bg: "bg-gray-500/10 border-gray-500/20",    text: "text-gray-400" },
  pending: { label: "Pending", bg: "bg-blue-500/10 border-blue-500/20",    text: "text-blue-400" },
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const user = session?.user as any;
  const role = user?.role || "";
  const isStar = isStarSuperAdminEmail(user?.email);

  // Gate: super_admin only
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="font-body theme-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (role !== "super_admin") {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="font-display text-lg font-bold mb-2">Access Restricted</h2>
          <p className="font-body text-sm theme-text-muted">
            Billing & Subscriptions is only available to Super Admins.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          Billing & Subscriptions
        </h1>
        <p className="font-body text-sm theme-text-muted mt-1">
          Overview of all active services, subscriptions, and monthly costs.
        </p>
      </div>

      {/* Total monthly cost card */}
      <div
        className="card p-6 sm:p-8"
        style={{ borderColor: "var(--app-brand-gold, #c4a050)", borderWidth: "1px" }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-body text-xs theme-text-muted tracking-[2px] uppercase mb-1">
              Estimated Monthly Total
            </div>
            <div className="font-display text-3xl sm:text-4xl font-bold text-brand-gold">
              ~$435 &ndash; $535
              <span className="font-body text-sm font-normal theme-text-muted ml-2">/mo</span>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1">
            <div className="font-body text-xs theme-text-muted">
              + ~$60/yr in domain renewals
            </div>
            <div className="font-body text-xs theme-text-muted">
              Excludes usage-based variance
            </div>
          </div>
        </div>
      </div>

      {/* Category sections */}
      {CATEGORIES.map((cat) => (
        <div key={cat.title}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{cat.icon}</span>
            <h2 className="font-display text-lg font-semibold">{cat.title}</h2>
          </div>

          <div className="card overflow-hidden">
            {/* Table header */}
            <div
              className="hidden sm:grid sm:grid-cols-[1fr_140px_120px_120px] gap-4 px-5 py-3 font-body text-[11px] theme-text-muted tracking-[1px] uppercase"
              style={{ borderBottom: "1px solid var(--app-border)" }}
            >
              <div>Service</div>
              <div>Plan</div>
              <div>Cost</div>
              <div>Status</div>
            </div>

            {/* Rows */}
            {cat.services.map((svc, idx) => (
              <div
                key={svc.name}
                className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_120px] gap-1 sm:gap-4 px-5 py-4 items-start sm:items-center"
                style={
                  idx < cat.services.length - 1
                    ? { borderBottom: "1px solid var(--app-border)" }
                    : undefined
                }
              >
                {/* Service name + note */}
                <div>
                  <div className="font-body text-sm font-medium">{svc.name}</div>
                  {svc.note && (
                    <div className="font-body text-xs theme-text-muted mt-0.5">{svc.note}</div>
                  )}
                </div>

                {/* Plan — with label on mobile */}
                <div className="flex items-center gap-2 sm:block">
                  <span className="font-body text-[11px] theme-text-muted sm:hidden">Plan:</span>
                  <span className="font-body text-sm theme-text-secondary">{svc.plan}</span>
                </div>

                {/* Cost — with label on mobile */}
                <div className="flex items-center gap-2 sm:block">
                  <span className="font-body text-[11px] theme-text-muted sm:hidden">Cost:</span>
                  <span className="font-body text-sm font-medium">{svc.cost}</span>
                </div>

                {/* Status badge */}
                <div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${STATUS_CONFIG[svc.status].bg} ${STATUS_CONFIG[svc.status].text}`}
                  >
                    {STATUS_CONFIG[svc.status].label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer note */}
      <div
        className="card p-4 flex items-start gap-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <span className="text-lg shrink-0">ℹ️</span>
        <p className="font-body text-xs theme-text-muted leading-relaxed">
          Costs are estimates. Log into each service dashboard for exact billing.
          Usage-based services (Twilio Voice, Anthropic API, Claude Code) may vary month to month.
        </p>
      </div>
    </div>
  );
}
