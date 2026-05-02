"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function MarketplacePage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"browse" | "pending">("browse");
  const [sort, setSort] = useState("downloads");

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/templates/marketplace?sort=${sort}`).then(r => r.json()),
      fetch("/api/admin/templates/marketplace?status=pending").then(r => r.json()),
    ]).then(([approved, pend]) => { setTemplates(approved); setPending(pend); }).catch(() => {}).finally(() => setLoading(false));
  }, [sort]);

  const review = async (id: string, status: string) => {
    await fetch(`/api/admin/templates/marketplace/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setPending(p => p.filter(t => t.id !== id));
    if (status === "approved") { const r = await fetch(`/api/admin/templates/marketplace/${id}`).then(r => r.json()); setTemplates(p => [r, ...p]); }
  };

  const download = async (id: string) => {
    await fetch(`/api/admin/templates/marketplace/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "download" }) });
    setTemplates(p => p.map(t => t.id === id ? { ...t, downloads: t.downloads + 1 } : t));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1"><Link href="/admin/templates" className="hover:text-zinc-700">Templates</Link><span>/</span><span>Marketplace</span></div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Template Marketplace</h1>
          <p className="text-sm text-zinc-500 mt-1">Browse and share top-performing templates across the partner network</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-700">
        <button onClick={() => setTab("browse")} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === "browse" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500"}`}>Browse ({templates.length})</button>
        <button onClick={() => setTab("pending")} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === "pending" ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500"}`}>Pending Review ({pending.length})</button>
      </div>

      {tab === "browse" && (
        <>
          <div className="flex gap-2 mb-4">
            {["downloads", "rating", "conversion", "newest"].map(s => (
              <button key={s} onClick={() => setSort(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${sort === s ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>{s === "downloads" ? "Most Popular" : s === "rating" ? "Highest Rated" : s === "conversion" ? "Best Converting" : "Newest"}</button>
            ))}
          </div>
          {loading ? <div className="text-center py-12 text-zinc-400">Loading...</div> : templates.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl"><p className="text-zinc-500">No shared templates yet</p></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <div key={t.id} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{t.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${t.templateType === "email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{t.templateType}</span>
                  </div>
                  {t.description && <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{t.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-zinc-400 mb-3">
                    <span>{"★".repeat(Math.round(t.rating))}{"☆".repeat(5 - Math.round(t.rating))} ({t.ratingCount})</span>
                    <span>{t.downloads} downloads</span>
                    {t.conversionRate && <span>{(t.conversionRate * 100).toFixed(1)}% conv</span>}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">by {t.sharedByName}</span>
                    <button onClick={() => download(t.id)} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium">Use Template</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "pending" && (
        <div className="space-y-4">
          {pending.length === 0 ? <div className="text-center py-12 text-zinc-400">No templates pending review</div> : pending.map(t => (
            <div key={t.id} className="border border-amber-200 dark:border-amber-800 rounded-xl p-5 bg-amber-50 dark:bg-amber-900/10">
              <div className="flex items-start justify-between mb-3">
                <div><h3 className="text-base font-semibold">{t.name}</h3><p className="text-xs text-zinc-500">Shared by {t.sharedByName} ({t.sharedByCode}) · {t.templateType}</p></div>
                <div className="flex gap-2">
                  <button onClick={() => review(t.id, "approved")} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium">Approve</button>
                  <button onClick={() => review(t.id, "rejected")} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">Reject</button>
                </div>
              </div>
              <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap">{t.bodyPreview}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
