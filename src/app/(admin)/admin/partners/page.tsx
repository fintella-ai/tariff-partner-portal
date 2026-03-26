"use client";

import { useState, useEffect } from "react";
import { fmt$, fmtDate } from "@/lib/format";

interface Partner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  partnerCode: string;
  status: "Active" | "Pending" | "Blocked";
  signupDate: string;
  totalDeals: number;
  totalL1Commission: number;
  totalL2Commission: number;
  downlineCount: number;
}

const DEMO_PARTNERS: Partner[] = [
  {
    id: "100001",
    firstName: "Sarah",
    lastName: "Mitchell",
    email: "sarah.mitchell@lawfirm.com",
    partnerCode: "TRRLN-SM2024",
    status: "Active",
    signupDate: "2025-09-12",
    totalDeals: 34,
    totalL1Commission: 42500,
    totalL2Commission: 8750,
    downlineCount: 5,
  },
  {
    id: "100002",
    firstName: "James",
    lastName: "Robertson",
    email: "j.robertson@tradelaw.io",
    partnerCode: "TRRLN-JR2024",
    status: "Active",
    signupDate: "2025-10-03",
    totalDeals: 21,
    totalL1Commission: 26200,
    totalL2Commission: 3100,
    downlineCount: 2,
  },
  {
    id: "100003",
    firstName: "Diana",
    lastName: "Chen",
    email: "dchen@importrelief.com",
    partnerCode: "TRRLN-DC2025",
    status: "Pending",
    signupDate: "2026-01-18",
    totalDeals: 0,
    totalL1Commission: 0,
    totalL2Commission: 0,
    downlineCount: 0,
  },
  {
    id: "100004",
    firstName: "Marcus",
    lastName: "Williams",
    email: "marcus.w@tariffcounsel.com",
    partnerCode: "TRRLN-MW2024",
    status: "Blocked",
    signupDate: "2025-08-05",
    totalDeals: 7,
    totalL1Commission: 8400,
    totalL2Commission: 0,
    downlineCount: 1,
  },
  {
    id: "100005",
    firstName: "Priya",
    lastName: "Nair",
    email: "priya@dutyrecovery.co",
    partnerCode: "TRRLN-PN2025",
    status: "Active",
    signupDate: "2026-02-10",
    totalDeals: 12,
    totalL1Commission: 15600,
    totalL2Commission: 2200,
    downlineCount: 3,
  },
];

const statusColor: Record<Partner["status"], string> = {
  Active: "bg-green-500/20 text-green-400",
  Pending: "bg-yellow-500/20 text-yellow-400",
  Blocked: "bg-red-500/20 text-red-400",
};

export default function PartnerManagementPage() {
  const [partners, setPartners] = useState<Partner[]>(DEMO_PARTNERS);
  const [search, setSearch] = useState("");
  const [filtered, setFiltered] = useState<Partner[]>(DEMO_PARTNERS);

  useEffect(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      setFiltered(partners);
      return;
    }
    setFiltered(
      partners.filter(
        (p) =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.partnerCode.toLowerCase().includes(q),
      ),
    );
  }, [search, partners]);

  const stats = {
    total: partners.length,
    active: partners.filter((p) => p.status === "Active").length,
    pending: partners.filter((p) => p.status === "Pending").length,
    blocked: partners.filter((p) => p.status === "Blocked").length,
  };

  function toggleBlock(id: string) {
    setPartners((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status: p.status === "Blocked" ? "Active" : "Blocked" as Partner["status"] }
          : p,
      ),
    );
  }

  function hubspotUrl(id: string) {
    return `https://app.hubspot.com/contacts/PORTAL_ID/contact/${id}`;
  }

  return (
    <div>
      <h2 className="font-display text-xl sm:text-2xl font-bold mb-1">
        Partner Management
      </h2>
      <p className="font-body text-sm text-white/40 mb-6">
        Manage partners, review activity, and control account status.
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by name, email, or partner code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 font-body text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-gold/60 transition"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Partners", value: stats.total, accent: "text-white" },
          { label: "Active", value: stats.active, accent: "text-green-400" },
          { label: "Pending", value: stats.pending, accent: "text-yellow-400" },
          { label: "Blocked", value: stats.blocked, accent: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="font-body text-xs text-white/40 mb-1">{s.label}</p>
            <p className={`font-display text-2xl font-bold ${s.accent}`}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block card overflow-x-auto">
        <table className="w-full text-left font-body text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Deals</th>
              <th className="px-4 py-3 text-right">L1 Earned</th>
              <th className="px-4 py-3 text-right">L2 Earned</th>
              <th className="px-4 py-3 text-right">Downline</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="border-b border-white/5 hover:bg-white/[0.03] transition"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-white">
                    {p.firstName} {p.lastName}
                  </div>
                  <div className="text-xs text-white/40">{p.email}</div>
                </td>
                <td className="px-4 py-3 text-white/70 font-mono text-xs">
                  {p.partnerCode}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[p.status]}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-white/70">
                  {p.totalDeals}
                </td>
                <td className="px-4 py-3 text-right text-brand-gold font-medium">
                  {fmt$(p.totalL1Commission)}
                </td>
                <td className="px-4 py-3 text-right text-white/70">
                  {fmt$(p.totalL2Commission)}
                </td>
                <td className="px-4 py-3 text-right text-white/70">
                  {p.downlineCount}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={hubspotUrl(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
                    >
                      View
                    </a>
                    <button
                      onClick={() => toggleBlock(p.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                        p.status === "Blocked"
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      }`}
                    >
                      {p.status === "Blocked" ? "Unblock" : "Block"}
                    </button>
                    <a
                      href={hubspotUrl(p.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in HubSpot"
                      className="text-white/30 hover:text-brand-gold transition"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-white/30"
                >
                  No partners match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-4">
        {filtered.map((p) => (
          <div key={p.id} className="card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-white">
                  {p.firstName} {p.lastName}
                </p>
                <p className="text-xs text-white/40">{p.email}</p>
                <p className="text-xs text-white/50 font-mono mt-0.5">
                  {p.partnerCode}
                </p>
              </div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[p.status]}`}
              >
                {p.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-white/40">Deals</p>
                <p className="text-white/70">{p.totalDeals}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">Downline</p>
                <p className="text-white/70">{p.downlineCount}</p>
              </div>
              <div>
                <p className="text-xs text-white/40">L1 Earned</p>
                <p className="text-brand-gold font-medium">
                  {fmt$(p.totalL1Commission)}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/40">L2 Earned</p>
                <p className="text-white/70">{fmt$(p.totalL2Commission)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <a
                href={hubspotUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center px-3 py-2 rounded-md text-xs font-medium bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
              >
                View in HubSpot
              </a>
              <button
                onClick={() => toggleBlock(p.id)}
                className={`flex-1 text-center px-3 py-2 rounded-md text-xs font-medium transition ${
                  p.status === "Blocked"
                    ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                }`}
              >
                {p.status === "Blocked" ? "Unblock" : "Block"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card p-12 text-center text-white/30 font-body text-sm">
            No partners match your search.
          </div>
        )}
      </div>
    </div>
  );
}
