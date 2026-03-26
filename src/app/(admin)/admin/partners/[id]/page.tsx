"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { fmt$, fmtDate } from "@/lib/format";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Demo data                                                          */
/* ------------------------------------------------------------------ */

const DEMO_PARTNER = {
  id: "100004",
  firstName: "Marcus",
  lastName: "Williams",
  email: "marcus.w@tariffcounsel.com",
  partnerCode: "TRRLN-MW2024",
  status: "Active" as "Active" | "Pending" | "Blocked",
  signupDate: "2025-03-01",
  totalDeals: 7,
  totalL1Commission: 8400,
  totalL2Commission: 1250,
  downlineCount: 3,
  hubspotContactId: "100004",
};

interface Note {
  id: string;
  author: string;
  date: string;
  text: string;
  pinned: boolean;
}

const INITIAL_NOTES: Note[] = [
  {
    id: "n1",
    author: "Admin User",
    date: "2025-03-05",
    text: "Initial onboarding call completed. Partner is experienced CPA with strong importer network.",
    pinned: true,
  },
  {
    id: "n2",
    author: "Admin User",
    date: "2025-03-12",
    text: "Requested custom L1 rate of 22% \u2014 approved by management.",
    pinned: false,
  },
  {
    id: "n3",
    author: "Admin User",
    date: "2025-03-18",
    text: "Partner referred 2 new sub-partners this week. Very active.",
    pinned: false,
  },
];

const DEMO_DEALS = [
  {
    id: "deal-501",
    name: "Acme Imports \u2014 HTS Reclassification",
    stage: "Won",
    estRefund: 45000,
    commission: 4500,
    status: "Paid",
  },
  {
    id: "deal-502",
    name: "GlobalTrade Co \u2014 Duty Drawback",
    stage: "In Progress",
    estRefund: 28000,
    commission: 2800,
    status: "Pending",
  },
  {
    id: "deal-503",
    name: "Pacifica Logistics \u2014 FTZ Review",
    stage: "Qualification",
    estRefund: 12000,
    commission: 1100,
    status: "Unpaid",
  },
];

const DEMO_DOWNLINE = [
  {
    id: "dl-1",
    name: "Elena Vasquez",
    code: "TRRLN-EV2025",
    status: "Active" as const,
    joinDate: "2025-03-20",
  },
  {
    id: "dl-2",
    name: "Kevin Tran",
    code: "TRRLN-KT2025",
    status: "Pending" as const,
    joinDate: "2025-04-02",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusColor: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400",
  Pending: "bg-yellow-500/20 text-yellow-400",
  Blocked: "bg-red-500/20 text-red-400",
};

const stageColor: Record<string, string> = {
  Won: "bg-green-500/20 text-green-400",
  "In Progress": "bg-blue-500/20 text-blue-400",
  Qualification: "bg-yellow-500/20 text-yellow-400",
};

const dealStatusColor: Record<string, string> = {
  Paid: "bg-green-500/20 text-green-400",
  Pending: "bg-yellow-500/20 text-yellow-400",
  Unpaid: "bg-red-500/20 text-red-400",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function hubspotContact(id: string) {
  return `https://app.hubspot.com/contacts/PORTAL_ID/contact/${id}`;
}

function hubspotDeal(dealId: string) {
  return `https://app.hubspot.com/contacts/PORTAL_ID/deal/${dealId}`;
}

/* ------------------------------------------------------------------ */
/*  External-link icon (reused)                                        */
/* ------------------------------------------------------------------ */

function ExternalLinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
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
  );
}

function PinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M16 2a1 1 0 00-.72.3l-3.5 3.5L8.5 7.06 6.22 9.34a1 1 0 000 1.42l2.12 2.12L3 18.22V21h2.78l5.34-5.34 2.12 2.12a1 1 0 001.42 0l2.28-2.28 1.26-3.28 3.5-3.5A1 1 0 0022 8V3a1 1 0 00-1-1h-5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PartnerDetailPage() {
  const { id } = useParams();
  const [partner, setPartner] = useState(DEMO_PARTNER);
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [newNote, setNewNote] = useState("");
  const [l1Rate, setL1Rate] = useState("20");
  const [l2Rate, setL2Rate] = useState("5");
  const [l3Rate, setL3Rate] = useState("0");

  // Sort notes: pinned first, then newest first
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  function handleAddNote() {
    if (!newNote.trim()) return;
    const note: Note = {
      id: `n${Date.now()}`,
      author: "Admin User",
      date: new Date().toISOString().split("T")[0],
      text: newNote.trim(),
      pinned: false,
    };
    setNotes((prev) => [note, ...prev]);
    setNewNote("");
  }

  function toggleBlock() {
    setPartner((prev) => ({
      ...prev,
      status: prev.status === "Blocked" ? "Active" : ("Blocked" as typeof prev.status),
    }));
  }

  const fullName = `${partner.firstName} ${partner.lastName}`;

  return (
    <div className="space-y-8">
      {/* ── Back button ─────────────────────────────────────────── */}
      <Link
        href="/admin/partners"
        className="inline-flex items-center gap-1.5 font-body text-sm text-white/50 hover:text-brand-gold transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Partners
      </Link>

      {/* ── 1. Partner Header ───────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl font-bold text-white">
                {fullName}
              </h2>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[partner.status]}`}
              >
                {partner.status}
              </span>
            </div>
            <p className="font-body text-sm text-white/50">{partner.email}</p>
            <div className="flex items-center gap-4 font-body text-xs text-white/40">
              <span>
                Code:{" "}
                <span className="font-mono text-white/60">{partner.partnerCode}</span>
              </span>
              <span>Signed up: {fmtDate(partner.signupDate)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={hubspotContact(partner.hubspotContactId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-gold/20 text-brand-gold hover:bg-brand-gold/30 transition"
            >
              Open in HubSpot
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={toggleBlock}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                partner.status === "Blocked"
                  ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
            >
              {partner.status === "Blocked" ? "Unblock" : "Block"}
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Quick Stats Row ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Deals", value: String(partner.totalDeals), accent: "text-white" },
          { label: "L1 Commission", value: fmt$(partner.totalL1Commission), accent: "text-brand-gold" },
          { label: "L2 Commission", value: fmt$(partner.totalL2Commission), accent: "text-brand-gold" },
          { label: "Downline Partners", value: String(partner.downlineCount), accent: "text-white" },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="font-body text-xs text-white/40 mb-1">{s.label}</p>
            <p className={`font-display text-2xl font-bold ${s.accent}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── 3. Admin Notes ──────────────────────────────────────── */}
      <div className="card p-6 space-y-5">
        <h3 className="font-display text-lg font-semibold text-white">
          Admin Notes
        </h3>

        {/* Add note form */}
        <div className="space-y-2">
          <textarea
            rows={3}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note about this partner..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 font-body text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-gold/60 transition resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-gold text-black hover:bg-brand-gold/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Note
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="space-y-3">
          {sortedNotes.map((note) => (
            <div
              key={note.id}
              className={`rounded-lg p-4 border ${
                note.pinned
                  ? "border-brand-gold/50 bg-brand-gold/5"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <span className="font-display text-xs font-bold text-white/70">
                    {initials(note.author)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-body text-sm font-medium text-white">
                      {note.author}
                    </span>
                    <span className="font-body text-xs text-white/30">
                      {fmtDate(note.date)}
                    </span>
                    {note.pinned && (
                      <span className="inline-flex items-center gap-1 text-brand-gold text-xs">
                        <PinIcon className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                  </div>
                  <p className="font-body text-sm text-white/70 leading-relaxed">
                    {note.text}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. Commission Overrides ─────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold text-white">
          Commission Overrides
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "L1 Rate", value: l1Rate, setter: setL1Rate },
            { label: "L2 Rate", value: l2Rate, setter: setL2Rate },
            { label: "L3 Rate", value: l3Rate, setter: setL3Rate },
          ].map((r) => (
            <div key={r.label} className="space-y-1.5">
              <label className="font-body text-xs text-white/40">{r.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={r.value}
                  onChange={(e) => r.setter(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-body text-sm text-white focus:outline-none focus:border-brand-gold/60 transition"
                />
                <span className="font-body text-sm text-white/40">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="font-body text-xs text-white/30">
          Changes are not saved automatically. Override editing is for display purposes only in this demo.
        </p>
      </div>

      {/* ── 5. Partner's Deals ──────────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold text-white">
          Partner&apos;s Deals
        </h3>

        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Deal Name</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3 text-right">Est. Refund</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_DEALS.map((deal) => (
                <tr
                  key={deal.id}
                  className="border-b border-white/5 hover:bg-white/[0.03] transition"
                >
                  <td className="px-4 py-3 text-white">{deal.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColor[deal.stage] || "bg-white/10 text-white/60"}`}
                    >
                      {deal.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">
                    {fmt$(deal.estRefund)}
                  </td>
                  <td className="px-4 py-3 text-right text-brand-gold font-medium">
                    {fmt$(deal.commission)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${dealStatusColor[deal.status] || "bg-white/10 text-white/60"}`}
                    >
                      {deal.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={hubspotDeal(deal.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-white/40 hover:text-brand-gold transition text-xs"
                    >
                      HubSpot
                      <ExternalLinkIcon className="h-3.5 w-3.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {DEMO_DEALS.map((deal) => (
            <div key={deal.id} className="border border-white/10 rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-body text-sm text-white font-medium">{deal.name}</p>
                <a
                  href={hubspotDeal(deal.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-brand-gold transition flex-shrink-0"
                >
                  <ExternalLinkIcon className="h-4 w-4" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${stageColor[deal.stage] || "bg-white/10 text-white/60"}`}
                >
                  {deal.stage}
                </span>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${dealStatusColor[deal.status] || "bg-white/10 text-white/60"}`}
                >
                  {deal.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-white/40">Est. Refund: </span>
                  <span className="text-white/70">{fmt$(deal.estRefund)}</span>
                </div>
                <div>
                  <span className="text-white/40">Commission: </span>
                  <span className="text-brand-gold font-medium">{fmt$(deal.commission)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 6. Partner's Downline ───────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold text-white">
          Partner&apos;s Downline
        </h3>
        <div className="space-y-3">
          {DEMO_DOWNLINE.map((dl) => (
            <div
              key={dl.id}
              className="flex items-center justify-between border border-white/10 rounded-lg p-4"
            >
              <div className="space-y-0.5">
                <p className="font-body text-sm font-medium text-white">{dl.name}</p>
                <p className="font-body text-xs text-white/40 font-mono">{dl.code}</p>
              </div>
              <div className="text-right space-y-0.5">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[dl.status]}`}
                >
                  {dl.status}
                </span>
                <p className="font-body text-xs text-white/40">
                  Joined {fmtDate(dl.joinDate)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 7. Documents & Agreement ────────────────────────────── */}
      <div className="card p-6 space-y-4">
        <h3 className="font-display text-lg font-semibold text-white">
          Documents &amp; Agreement
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-sm text-white">Partner Agreement</p>
                <p className="font-body text-xs text-white/40 mt-0.5">
                  Signed &mdash; {fmtDate("2025-03-01")}
                </p>
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                Signed
              </span>
            </div>
          </div>
          <div className="border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-body text-sm text-white">W-9 Form</p>
                <p className="font-body text-xs text-white/40 mt-0.5">
                  Received on file
                </p>
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                Uploaded
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
