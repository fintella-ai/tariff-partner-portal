"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function TemplatesPage() {
  const [tab, setTab] = useState<"email" | "sms">("email");
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (statusFilter !== "all") p.set("status", statusFilter);
    fetch(`/api/admin/templates/${tab}?${p}`).then((r) => r.json()).then((d) => setTemplates(d.templates || [])).catch(() => setTemplates([])).finally(() => setLoading(false));
  }, [tab, search, statusFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Templates</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage email and SMS communication templates</p>
        </div>
        <Link href="/admin/templates/generate" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Generate with AI</Link>
      </div>
      <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-700">
        {(["email", "sms"] as const).map((t) => (<button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500"}`}>{t === "email" ? "Email Templates" : "SMS Templates"}</button>))}
      </div>
      <div className="flex gap-3 mb-6">
        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm">
          <option value="all">All</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
        </select>
      </div>
      {loading ? (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map((i) => <div key={i} className="h-32 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />)}</div>)
      : templates.length === 0 ? (<div className="text-center py-16 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl"><p className="text-zinc-500 mb-3">No templates found</p><Link href="/admin/templates/generate" className="text-blue-600 text-sm font-medium">Generate your first template</Link></div>)
      : (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Link key={t.id} href={`/admin/templates/${t.id}?type=${tab}`} className="block border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{t.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${t.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : t.status === "archived" ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>{t.status}</span>
              </div>
              {t.subject && <p className="text-xs text-zinc-500 line-clamp-1 mb-2">{t.subject}</p>}
              <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-400">
                {t.aiGenerated && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">AI</span>}
                {t.variableKeys?.length > 0 && <span>{t.variableKeys.length} vars</span>}
                <span className="ml-auto">{new Date(t.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>)}
    </div>
  );
}
