"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fmtDate } from "@/lib/format";

type Lead = {
  id: string; firstName: string; lastName: string; email: string; phone: string | null;
  commissionRate: number; tier: string; referredByCode: string | null; notes: string | null;
  status: string; inviteId: string | null; createdAt: string; updatedAt: string;
};

type LeadTab = "all" | "referral" | "broker" | "bad_email" | "bad_phone";
type Stage = "all" | "new" | "contacted" | "call_booked" | "qualified" | "submitted" | "converted" | "lost";

const LEAD_TABS: { id: LeadTab; label: string }[] = [
  { id: "all", label: "All Leads" },
  { id: "referral", label: "Referral Partners" },
  { id: "broker", label: "Customs Brokers" },
  { id: "bad_email", label: "Bad/No Email" },
  { id: "bad_phone", label: "Bad/No Phone" },
];

const STAGES: { id: Stage; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "call_booked", label: "Call Booked" },
  { id: "qualified", label: "Qualified" },
  { id: "submitted", label: "Submitted" },
  { id: "converted", label: "Converted" },
  { id: "lost", label: "Lost" },
];

const STAGE_BADGES: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  call_booked: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  qualified: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  submitted: "bg-brand-gold/10 text-brand-gold border-brand-gold/20",
  converted: "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
  prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  invited: "bg-green-500/10 text-green-400 border-green-500/20",
  signed_up: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  skipped: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function isBrokerLead(lead: Lead): boolean {
  return (lead.notes || "").includes("CBP Broker Listing") || (lead.notes || "").includes("Filer Code:");
}

function isReferralLead(lead: Lead): boolean {
  return !isBrokerLead(lead);
}

// CBP CSV column headers
const CBP_HEADERS = ["Filer Code", "Permitted Broker Name", "City", "State", "Work Phone Number", "Work Phone Extension", "Email Address"];

export default function InternalLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadTab, setLeadTab] = useState<LeadTab>("all");
  const [stage, setStage] = useState<Stage>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [validatingEmails, setValidatingEmails] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [bulkEmailing, setBulkEmailing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(tone: "ok" | "err", msg: string) {
    setBanner({ tone, msg });
    setTimeout(() => setBanner(null), 4000);
  }

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/leads");
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads ?? []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  async function updateLead(id: string, updates: Record<string, any>) {
    const res = await fetch(`/api/admin/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) { fetchLeads(); flash("ok", "Lead updated"); }
    else flash("err", "Failed to update");
    setEditingId(null);
  }

  async function sendInvite(id: string) {
    const res = await fetch(`/api/admin/leads/${id}/invite`, { method: "POST" });
    if (res.ok) { fetchLeads(); flash("ok", "Invite sent!"); }
    else {
      const data = await res.json().catch(() => ({ error: "Failed" }));
      flash("err", data.error || "Failed to send invite");
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    const res = await fetch(`/api/admin/leads/${id}`, { method: "DELETE" });
    if (res.ok) { fetchLeads(); flash("ok", "Lead removed"); }
  }

  async function sendBrokerEmail(id: string) {
    setSendingEmailId(id);
    try {
      const res = await fetch("/api/admin/leads/send-broker-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id }),
      });
      const data = await res.json();
      if (res.ok) { fetchLeads(); flash("ok", `Email sent (${data.status})`); }
      else flash("err", data.error || "Failed to send");
    } catch { flash("err", "Network error"); }
    finally { setSendingEmailId(null); }
  }

  async function bulkSendBrokerEmails() {
    const emailable = filtered.filter((l) =>
      !l.email.includes("@import.placeholder") &&
      l.status === "prospect" &&
      isBrokerLead(l) &&
      (l.notes || "").includes("Email Verdict: Valid")
    );
    if (emailable.length === 0) { flash("err", "No new broker leads with verified emails. Run 'Validate Emails' first."); return; }
    if (!confirm(`Send recruitment email to ${emailable.length} verified brokers? This will move them all to "Contacted".`)) return;
    setBulkEmailing(true);
    let sent = 0;
    let failed = 0;
    for (const lead of emailable) {
      try {
        const res = await fetch("/api/admin/leads/send-broker-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id }),
        });
        if (res.ok) sent++;
        else failed++;
      } catch { failed++; }
    }
    fetchLeads();
    flash("ok", `Bulk email: ${sent} sent, ${failed} failed`);
    setBulkEmailing(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setImportData(rows);
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  function parseCSV(text: string): any[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const values = parseCSVLine(line);
      const row: any = {};
      headers.forEach((h, i) => { row[h] = (values[i] || "").trim(); });
      return row;
    });
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  async function runImport() {
    if (importData.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importData, leadType: "customs_broker" }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) {
        fetchLeads();
        flash("ok", `Imported ${data.imported} brokers`);
      }
    } catch {
      flash("err", "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function hasBadEmail(l: Lead): boolean {
    return l.email.includes("@import.placeholder") || (l.notes || "").includes("Email Verdict: Invalid") || (l.notes || "").includes("Email Verdict: Risky");
  }
  function hasBadPhone(l: Lead): boolean {
    return !l.phone || (l.notes || "").includes("Phone Type: unknown");
  }

  const typeFiltered = leads.filter((l) => {
    if (leadTab === "broker") return isBrokerLead(l) && !hasBadEmail(l) && !hasBadPhone(l);
    if (leadTab === "referral") return isReferralLead(l);
    if (leadTab === "bad_email") return hasBadEmail(l);
    if (leadTab === "bad_phone") return !l.phone || hasBadPhone(l);
    return true;
  });

  const q = search.toLowerCase().trim();
  const filtered = typeFiltered
    .filter((l) => stage === "all" || l.status === stage)
    .filter((l) => !q || `${l.firstName} ${l.lastName} ${l.email} ${l.phone || ""} ${l.notes || ""}`.toLowerCase().includes(q));

  const stats = {
    total: typeFiltered.length,
    new: typeFiltered.filter((l) => l.status === "prospect").length,
    contacted: typeFiltered.filter((l) => l.status === "contacted").length,
    qualified: typeFiltered.filter((l) => l.status === "qualified").length,
    invited: typeFiltered.filter((l) => l.status === "invited").length,
    converted: typeFiltered.filter((l) => l.status === "signed_up").length,
  };
  const conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

  const validImportRows = importData.filter((r) => {
    const phone = (r["Work Phone Number"] || r.phone || "").trim();
    const email = (r["Email Address"] || r.email || "").trim();
    return phone || email;
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[22px] font-bold mb-1">Internal Lead Pipeline</h2>
          <p className="font-body text-[13px] text-[var(--app-text-muted)]">
            Direct leads from ads and outreach — your internal funnel before opening to partners.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                const res = await fetch("/api/cron/cbp-broker-sync");
                const data = await res.json();
                flash("ok", `CBP sync: ${data.synced} new brokers imported`);
                fetchLeads();
              } catch { flash("err", "Sync failed"); }
              finally { setSyncing(false); }
            }}
            disabled={syncing}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "🔄 Sync CBP"}
          </button>
          <button
            onClick={async () => {
              setLookingUp(true);
              try {
                const res = await fetch("/api/admin/leads/lookup-phones", { method: "POST" });
                const data = await res.json();
                flash("ok", `Phone lookup: ${data.looked_up} classified${data.demo ? " (demo mode)" : ""}`);
                fetchLeads();
              } catch { flash("err", "Lookup failed"); }
              finally { setLookingUp(false); }
            }}
            disabled={lookingUp}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition disabled:opacity-50"
          >
            {lookingUp ? "Looking up..." : "📞 Phone Types"}
          </button>
          <button
            onClick={async () => {
              setValidatingEmails(true);
              try {
                const res = await fetch("/api/admin/leads/validate-emails", { method: "POST" });
                const data = await res.json();
                flash("ok", `Email validation: ${data.validated} checked`);
                fetchLeads();
              } catch { flash("err", "Validation failed"); }
              finally { setValidatingEmails(false); }
            }}
            disabled={validatingEmails}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition disabled:opacity-50"
          >
            {validatingEmails ? "Validating..." : "✉️ Validate Emails"}
          </button>
          <button
            onClick={bulkSendBrokerEmails}
            disabled={bulkEmailing}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition disabled:opacity-50"
          >
            {bulkEmailing ? "Sending..." : "📧 Email All New"}
          </button>
          <button
            onClick={() => { setImportOpen(true); setImportData([]); setImportResult(null); }}
            className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition"
          >
            📥 Import CSV
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/recover`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${copiedLink ? "text-green-400 border-green-500/30 bg-green-500/10" : "border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)]"}`}
          >
            {copiedLink ? "Copied ✓" : "🔗 Copy Funnel"}
          </button>
          <a
            href="/recover"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90"
          >
            /recover ↗
          </a>
        </div>
      </div>

      {banner && (
        <div className={`p-3 rounded-lg border text-sm mb-4 ${banner.tone === "ok" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
          {banner.msg}
        </div>
      )}

      {/* Lead type tabs */}
      <div className="flex gap-1 border-b border-[var(--app-border)] mb-6">
        {LEAD_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setLeadTab(t.id); setStage("all"); }}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition border-b-2 ${
              leadTab === t.id
                ? "border-[var(--brand-gold)] text-[var(--app-text)]"
                : "border-transparent text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] text-[var(--app-text-faint)]">
              ({leads.filter((l) => {
                if (t.id === "broker") return isBrokerLead(l) && !hasBadEmail(l) && !hasBadPhone(l);
                if (t.id === "referral") return isReferralLead(l);
                if (t.id === "bad_email") return hasBadEmail(l);
                if (t.id === "bad_phone") return !l.phone || hasBadPhone(l);
                return true;
              }).length})
            </span>
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-[var(--app-text)]">{stats.total}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Total</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-blue-400">{stats.new}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">New</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-purple-400">{stats.contacted}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Contacted</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-yellow-400">{stats.qualified}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Qualified</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-green-400">{stats.invited}</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Invited</div>
        </div>
        <div className="card p-3 text-center">
          <div className="font-display text-xl font-bold text-brand-gold">{conversionRate}%</div>
          <div className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">Conversion</div>
        </div>
      </div>

      {/* Search + Stage Filter */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads..."
          className="flex-1 min-w-[200px] theme-input rounded-lg px-4 py-2.5 text-sm"
        />
        <div className="flex gap-1 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStage(s.id)}
              className={`font-body text-[11px] px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                stage === s.id ? "bg-brand-gold/15 text-brand-gold font-semibold" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead List */}
      {loading ? (
        <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading leads...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-3">{leadTab === "broker" ? "🚢" : leadTab === "bad_email" ? "✉️" : leadTab === "bad_phone" ? "📞" : "📊"}</div>
          <h3 className="text-lg font-semibold mb-1">
            {leadTab === "broker" ? "No customs broker leads yet" : leadTab === "referral" ? "No referral partner leads yet" : leadTab === "bad_email" ? "No leads with bad/missing emails" : leadTab === "bad_phone" ? "No leads with bad/missing phones" : "No internal leads yet"}
          </h3>
          <p className="text-sm text-[var(--app-text-muted)]">
            {leadTab === "broker"
              ? "Import the CBP broker listing CSV to start building your customs broker pipeline."
              : leadTab === "bad_email" ? "Leads with invalid, risky, or missing emails will appear here after validation."
              : leadTab === "bad_phone" ? "Leads with no phone number or unknown phone types will appear here."
              : "Leads from /recover and direct outreach will appear here."
            }
          </p>
          {leadTab === "broker" && (
            <button
              onClick={() => { setImportOpen(true); setImportData([]); setImportResult(null); }}
              className="mt-4 px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90"
            >
              📥 Import CBP Broker CSV
            </button>
          )}
        </div>
      ) : (leadTab === "broker" || leadTab === "bad_email" || leadTab === "bad_phone") ? (
        /* ── BROKER TABLE VIEW ── */
        <div className="overflow-x-auto border border-[var(--app-border)] rounded-xl">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--app-input-bg)] sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Filer Code</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Broker Name</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Location</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Phone</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Type</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Email</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Email Status</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Lead Status</th>
                <th className="px-3 py-2.5 text-left text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const notes = lead.notes || "";
                const filerMatch = notes.match(/Filer Code: (\w+)/);
                const locationMatch = notes.match(/Location: (.+)/);
                const phoneType = notes.includes("Phone Type: mobile") ? "mobile" : notes.includes("Phone Type: landline") ? "landline" : notes.includes("Phone Type: voip") ? "voip" : null;
                const emailVerdict = notes.includes("Email Verdict: Valid") ? "Valid" : notes.includes("Email Verdict: Risky") ? "Risky" : notes.includes("Email Verdict: Invalid") ? "Invalid" : null;
                const realEmail = !lead.email.includes("@import.placeholder") ? lead.email : "";

                return (
                  <tr key={lead.id} className="border-t border-[var(--app-border)] hover:bg-[var(--app-input-bg)] transition">
                    <td className="px-3 py-2.5 font-mono text-blue-400 whitespace-nowrap">{filerMatch?.[1] || "—"}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{lead.firstName} {lead.lastName}</td>
                    <td className="px-3 py-2.5 text-[var(--app-text-muted)] whitespace-nowrap">{locationMatch?.[1] || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{lead.phone || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {phoneType ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                          phoneType === "mobile" ? "bg-green-500/15 text-green-400" :
                          phoneType === "landline" ? "bg-gray-500/15 text-gray-400" :
                          "bg-blue-500/15 text-blue-400"
                        }`}>
                          {phoneType === "mobile" ? "📱 Mobile" : phoneType === "landline" ? "☎️ Land" : "🌐 VoIP"}
                        </span>
                      ) : <span className="text-[var(--app-text-faint)]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{realEmail || <span className="text-[var(--app-text-faint)]">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {emailVerdict ? (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${
                          emailVerdict === "Valid" ? "bg-green-500/15 text-green-400" :
                          emailVerdict === "Risky" ? "bg-yellow-500/15 text-yellow-400" :
                          "bg-red-500/15 text-red-400"
                        }`}>
                          {emailVerdict === "Valid" ? "✅ Valid" : emailVerdict === "Risky" ? "⚠️ Risky" : "❌ Invalid"}
                        </span>
                      ) : <span className="text-[var(--app-text-faint)]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <select
                        value={lead.status}
                        onChange={(e) => updateLead(lead.id, { status: e.target.value })}
                        className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase border appearance-none cursor-pointer ${STAGE_BADGES[lead.status] || STAGE_BADGES.new}`}
                      >
                        <option value="prospect">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="call_booked">Call Booked</option>
                        <option value="qualified">Qualified</option>
                        <option value="invited">Invited</option>
                        <option value="signed_up">Converted</option>
                        <option value="skipped">Lost</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        {realEmail && lead.status === "prospect" && (lead.notes || "").includes("Email Verdict: Valid") && (
                          <button
                            onClick={() => sendBrokerEmail(lead.id)}
                            disabled={sendingEmailId === lead.id}
                            className="text-[10px] px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition disabled:opacity-50"
                            title="Send recruitment email"
                          >
                            {sendingEmailId === lead.id ? "..." : "Email"}
                          </button>
                        )}
                        {lead.status !== "invited" && lead.status !== "signed_up" && (
                          <button
                            onClick={() => sendInvite(lead.id)}
                            className="text-[10px] px-2 py-1 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition"
                            title="Send partner invite"
                          >
                            Invite
                          </button>
                        )}
                        <button
                          onClick={() => deleteLead(lead.id)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                          title="Delete lead"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── CARD VIEW (Referral Partners / All) ── */
        <div className="space-y-2">
          {filtered.map((lead) => {
            const isExpanded = expandedId === lead.id;
            const isEditing = editingId === lead.id;
            const isBroker = isBrokerLead(lead);
            const source = isBroker ? "🚢 CBP Import" : (lead.notes || "").includes("/recover") ? "🌐 Website" : (lead.notes || "").includes("/partners") ? "🤝 Partner Page" : (lead.notes || "").includes("Direct") ? "📞 Direct" : "📋 Manual";
            const dutyMatch = (lead.notes || "").match(/Est\. duties: \$([\d,]+)/);
            const refundMatch = (lead.notes || "").match(/Est\. refund: \$([\d,]+)/);
            const filerMatch = (lead.notes || "").match(/Filer Code: (\w+)/);
            const locationMatch = (lead.notes || "").match(/Location: (.+)/);

            return (
              <div key={lead.id} className="card overflow-hidden">
                <div
                  className="px-5 py-4 cursor-pointer hover:bg-[var(--app-input-bg)] transition"
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isBroker ? "bg-blue-500/20 text-blue-400" : "bg-brand-gold/20 text-brand-gold"}`}>
                        {lead.firstName[0]}{lead.lastName?.[0] || ""}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{lead.firstName} {lead.lastName}</div>
                        <div className="text-[12px] text-[var(--app-text-muted)] truncate">
                          {lead.email.includes("@import.placeholder") ? "" : lead.email}
                          {lead.phone ? `${lead.email.includes("@import.placeholder") ? "" : " · "}${lead.phone}` : ""}
                          {locationMatch ? ` · ${locationMatch[1]}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--app-text-faint)]">{source}</span>
                      {filerMatch && <span className="text-[10px] text-blue-400 font-mono">{filerMatch[1]}</span>}
                      {dutyMatch && <span className="text-[11px] text-yellow-400 font-semibold">${dutyMatch[1]}</span>}
                      <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold tracking-wider uppercase border ${STAGE_BADGES[lead.status] || STAGE_BADGES.new}`}>
                        {lead.status === "signed_up" ? "Converted" : lead.status}
                      </span>
                      <span className="text-[11px] text-[var(--app-text-faint)]">{fmtDate(lead.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-[var(--app-border)] pt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-[12px]">
                      <div><span className="text-[var(--app-text-muted)]">Rate:</span> {Math.round(lead.commissionRate * 100)}%</div>
                      <div><span className="text-[var(--app-text-muted)]">Tier:</span> {lead.tier.toUpperCase()}</div>
                      {dutyMatch && <div><span className="text-[var(--app-text-muted)]">Est. Duties:</span> ${dutyMatch[1]}</div>}
                      {refundMatch && <div><span className="text-[var(--app-text-muted)]">Est. Refund:</span> ${refundMatch[1]}</div>}
                    </div>
                    {lead.notes && (
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] mb-4 whitespace-pre-wrap bg-[var(--app-input-bg)] rounded-lg p-3">{lead.notes}</div>
                    )}

                    {isEditing ? (
                      <div className="flex gap-2 flex-wrap mb-3">
                        <select value={editStage} onChange={(e) => setEditStage(e.target.value)} className="theme-input rounded-lg px-3 py-2 text-sm">
                          <option value="prospect">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="call_booked">Call Booked</option>
                          <option value="qualified">Qualified</option>
                          <option value="skipped">Lost</option>
                        </select>
                        <input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="flex-1 theme-input rounded-lg px-3 py-2 text-sm" placeholder="Add note..." />
                        <button onClick={() => updateLead(lead.id, { status: editStage, notes: editNotes || lead.notes })} className="font-body text-[12px] px-4 py-2 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition">Save</button>
                        <button onClick={() => setEditingId(null)} className="font-body text-[11px] px-3 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)]">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => { setEditingId(lead.id); setEditStage(lead.status); setEditNotes(lead.notes || ""); }}
                          className="font-body text-[11px] px-3 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-input-bg)] transition"
                        >
                          ✏️ Update Stage
                        </button>
                        {lead.status === "prospect" && (
                          <button
                            onClick={() => updateLead(lead.id, { status: "contacted" })}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition"
                          >
                            Mark Contacted
                          </button>
                        )}
                        {(lead.status === "prospect" || lead.status === "contacted") && (
                          <button
                            onClick={() => updateLead(lead.id, { status: "qualified" })}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition"
                          >
                            Mark Qualified
                          </button>
                        )}
                        {lead.status !== "invited" && lead.status !== "signed_up" && (
                          <button
                            onClick={() => sendInvite(lead.id)}
                            className="font-body text-[11px] px-3 py-2 rounded-lg bg-brand-gold/20 text-brand-gold border border-brand-gold/30 hover:bg-brand-gold/30 transition"
                          >
                            Send Partner Invite
                          </button>
                        )}
                        <button
                          onClick={() => deleteLead(lead.id)}
                          className="font-body text-[11px] px-3 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import CSV Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Import Customs Broker CSV</h3>
              <button onClick={() => setImportOpen(false)} className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] text-lg">✕</button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
              <strong>CBP Broker Listing Format</strong> — download the CSV from{" "}
              <a href="https://www.cbp.gov/about/contact/brokers-listing" target="_blank" rel="noopener noreferrer" className="underline">cbp.gov</a>{" "}
              and upload it here. Expected columns:
              <div className="font-mono text-[11px] mt-1 text-blue-300">
                {CBP_HEADERS.join(", ")}
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400">
              Rows without a phone number or email will be skipped. Duplicate emails are automatically detected.
            </div>

            <div className="mb-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="block w-full text-sm theme-input rounded-lg px-3 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-gold/15 file:text-brand-gold file:text-xs file:font-semibold file:px-3 file:py-1.5"
              />
            </div>

            {importData.length > 0 && (
              <div className="mb-4">
                <div className="text-sm mb-2">
                  <strong>{importData.length}</strong> rows parsed · <strong className="text-green-400">{validImportRows.length}</strong> have phone or email · <strong className="text-red-400">{importData.length - validImportRows.length}</strong> will be skipped
                </div>

                {/* Preview table */}
                <div className="overflow-x-auto border border-[var(--app-border)] rounded-lg max-h-[300px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-[var(--app-input-bg)] sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">Filer Code</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">Broker Name</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">City</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">State</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">Phone</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">Type</th>
                        <th className="px-2 py-1.5 text-left text-[var(--app-text-muted)]">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importData.slice(0, 50).map((row, i) => {
                        const phone = (row["Work Phone Number"] || row.phone || "").trim();
                        const email = (row["Email Address"] || row.email || "").trim();
                        const hasContact = phone || email;
                        return (
                          <tr key={i} className={`border-t border-[var(--app-border)] ${hasContact ? "" : "opacity-40"}`}>
                            <td className="px-2 py-1.5 font-mono">{row["Filer Code"] || row.filerCode || ""}</td>
                            <td className="px-2 py-1.5">{row["Permitted Broker Name"] || row.name || ""}</td>
                            <td className="px-2 py-1.5">{row["City"] || row.city || ""}</td>
                            <td className="px-2 py-1.5">{row["State"] || row.state || ""}</td>
                            <td className="px-2 py-1.5">{phone || <span className="text-red-400">—</span>}</td>
                            <td className="px-2 py-1.5 text-[var(--app-text-faint)]">{phone ? "—" : ""}</td>
                            <td className="px-2 py-1.5">{email || <span className="text-red-400">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {importData.length > 50 && (
                    <div className="text-center py-2 text-[11px] text-[var(--app-text-muted)]">
                      Showing first 50 of {importData.length} rows
                    </div>
                  )}
                </div>
              </div>
            )}

            {importResult && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
                <div className="text-green-400 font-semibold mb-1">Import Complete</div>
                <div className="text-[12px] text-[var(--app-text-secondary)] space-y-0.5">
                  <div>✅ Imported: <strong>{importResult.imported}</strong></div>
                  <div>⏭️ Skipped (no contact): <strong>{importResult.skipped}</strong></div>
                  <div>🔁 Duplicates: <strong>{importResult.duplicates}</strong></div>
                  {importResult.errors?.length > 0 && (
                    <div className="text-red-400">❌ Errors: {importResult.errors.join(", ")}</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setImportOpen(false)} className="px-4 py-2 rounded-lg border border-[var(--app-border)] text-sm text-[var(--app-text-muted)]">
                {importResult ? "Close" : "Cancel"}
              </button>
              {!importResult && (
                <button
                  onClick={runImport}
                  disabled={importing || validImportRows.length === 0}
                  className="px-4 py-2 rounded-lg bg-[var(--brand-gold)] text-[var(--app-button-gold-text)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? "Importing..." : `Import ${validImportRows.length} Brokers`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
