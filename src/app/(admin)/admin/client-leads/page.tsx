"use client";

import { Suspense } from "react";
import ClientSubmissionsTab from "../internal-leads/ClientSubmissionsTab";

export default function ClientLeadsPage() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold">Client Leads</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1">
            Direct client submissions from /recover and marketing — tracks deal stages and conversion KPIs.
          </p>
        </div>
        <a
          href="/recover"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 self-start"
        >
          /recover ↗
        </a>
      </div>
      <Suspense>
        <ClientSubmissionsTab />
      </Suspense>
    </div>
  );
}
