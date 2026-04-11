"use client";

import { useState } from "react";

type Ticket = {
  id: string;
  partnerName: string;
  partnerCode: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
  lastReply: string;
  messages: number;
};

const tickets: Ticket[] = [
  {
    id: "TK-1001",
    partnerName: "Summit Legal Group",
    partnerCode: "SLG-001",
    subject: "Commission payout discrepancy for March",
    category: "Billing",
    status: "open",
    priority: "high",
    createdAt: "2026-03-18",
    lastReply: "2026-03-24",
    messages: 3,
  },
  {
    id: "TK-1002",
    partnerName: "Apex Trade Advisors",
    partnerCode: "ATA-012",
    subject: "Unable to access partner dashboard",
    category: "Technical",
    status: "in_progress",
    priority: "urgent",
    createdAt: "2026-03-20",
    lastReply: "2026-03-25",
    messages: 5,
  },
  {
    id: "TK-1003",
    partnerName: "Redstone Recovery LLC",
    partnerCode: "RRL-045",
    subject: "W9 upload keeps failing",
    category: "Documents",
    status: "open",
    priority: "normal",
    createdAt: "2026-03-22",
    lastReply: "2026-03-23",
    messages: 2,
  },
  {
    id: "TK-1004",
    partnerName: "Pinnacle Partners",
    partnerCode: "PP-008",
    subject: "Request to update banking info",
    category: "Account",
    status: "resolved",
    priority: "normal",
    createdAt: "2026-03-10",
    lastReply: "2026-03-15",
    messages: 4,
  },
  {
    id: "TK-1005",
    partnerName: "Liberty Tariff Solutions",
    partnerCode: "LTS-023",
    subject: "Question about L2 tier requirements",
    category: "General",
    status: "open",
    priority: "low",
    createdAt: "2026-03-24",
    lastReply: "2026-03-24",
    messages: 1,
  },
];

const tabs = ["All", "Open", "In Progress", "Resolved"] as const;
type Tab = (typeof tabs)[number];

const priorityBadge: Record<Ticket["priority"], string> = {
  low: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]",
  normal: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-red-500/20 text-red-400",
};

const statusBadge: Record<Ticket["status"], string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]",
};

const statusLabel: Record<Ticket["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function SupportTicketsPage() {
  const [tab, setTab] = useState<Tab>("All");

  const filtered = tickets.filter((t) => {
    if (tab === "All") return true;
    if (tab === "Open") return t.status === "open";
    if (tab === "In Progress") return t.status === "in_progress";
    if (tab === "Resolved") return t.status === "resolved";
    return true;
  });

  const total = tickets.length;
  const open = tickets.filter((t) => t.status === "open").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved").length;

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-2">
        Support Tickets
      </h2>
      <p className="font-body text-sm text-[var(--app-text-muted)] mb-6">
        Manage and respond to partner support tickets.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Tickets", value: total },
          { label: "Open", value: open },
          { label: "In Progress", value: inProgress },
          { label: "Resolved", value: resolved },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <div className="font-body text-xs text-[var(--app-text-muted)] mb-1">
              {s.label}
            </div>
            <div className="font-display text-xl font-bold text-brand-gold">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              tab === t
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm">
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-text-muted)] text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="border-b border-[var(--app-border-subtle)] hover:bg-[var(--app-card-bg)] transition"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--app-text)]">{t.subject}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">
                    {t.id} &middot; {t.messages} messages
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-[var(--app-text)]">{t.partnerName}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">{t.partnerCode}</div>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">{t.category}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full capitalize ${priorityBadge[t.priority]}`}
                  >
                    {t.priority}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs px-2 py-0.5 rounded-full ${statusBadge[t.status]}`}
                  >
                    {statusLabel[t.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--app-text-secondary)]">
                  {fmtDate(t.lastReply)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button className="text-xs text-brand-gold hover:underline">
                      View
                    </button>
                    <button className="text-xs text-brand-gold hover:underline">
                      Respond
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {filtered.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-body text-sm font-medium text-[var(--app-text)]">
                  {t.subject}
                </div>
                <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5">
                  {t.id} &middot; {t.messages} messages
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${priorityBadge[t.priority]}`}
              >
                {t.priority}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
              <span>{t.partnerName}</span>
              <span>&middot;</span>
              <span>{t.category}</span>
              <span>&middot;</span>
              <span>{fmtDate(t.lastReply)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[t.status]}`}
              >
                {statusLabel[t.status]}
              </span>
              <div className="flex gap-3">
                <button className="text-xs text-brand-gold hover:underline">
                  View
                </button>
                <button className="text-xs text-brand-gold hover:underline">
                  Respond
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
