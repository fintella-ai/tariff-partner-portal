"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function AutoTriggersPage() {
  const [triggers, setTriggers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [styles, setStyles] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ workflowTag: "", templateType: "email", styleId: "" });

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/templates/auto-trigger").then(r => r.json()),
      fetch("/api/admin/templates/variables").then(r => r.json()),
    ]).then(([data, vars]) => {
      setTriggers(data.triggers || []); setPending(data.pendingReview || []);
      setWorkflows(vars.workflows || []); setStyles(vars.styles || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const addTrigger = async () => {
    const res = await fetch("/api/admin/templates/auto-trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { const t = await res.json(); setTriggers(p => [...p, t]); setShowAdd(false); }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/admin/templates/auto-trigger/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    if (res.ok) { const t = await res.json(); setTriggers(p => p.map(x => x.id === id ? t : x)); }
  };

  const checkNow = async (workflowTag: string) => {
    const res = await fetch("/api/admin/templates/auto-trigger/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowTag }) });
    const data = await res.json();
    if (data.id) setPending(p => [data, ...p]);
  };

  const review = async (id: string, action: string) => {
    await fetch(`/api/admin/templates/auto-trigger/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setPending(p => p.filter(x => x.id !== id));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1"><Link href="/admin/templates" className="hover:text-zinc-700">Templates</Link><span>/</span><span>Auto-Triggers</span></div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">AI Auto-Trigger</h1>
          <p className="text-sm text-zinc-500 mt-1">Automatically generate templates when workflows fire without active templates</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Add Trigger</button>
      </div>

      {showAdd && (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 bg-white dark:bg-zinc-900 mb-6">
          <h2 className="text-lg font-semibold mb-4">Configure Auto-Trigger</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium mb-1">Workflow</label><select value={form.workflowTag} onChange={e => setForm(p => ({...p, workflowTag: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="">Select...</option>{workflows.map(w => <option key={w.tag} value={w.tag}>{w.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">Type</label><select value={form.templateType} onChange={e => setForm(p => ({...p, templateType: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="email">Email</option><option value="sms">SMS</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Style</label><select value={form.styleId} onChange={e => setForm(p => ({...p, styleId: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="">Best performing</option>{styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="flex gap-2 mt-4"><button onClick={addTrigger} disabled={!form.workflowTag} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">Save Trigger</button><button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button></div>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-zinc-400">Loading...</div> : (
        <>
          <div className="space-y-3 mb-8">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Active Triggers</h2>
            {triggers.length === 0 ? <p className="text-sm text-zinc-400 py-4">No triggers configured</p> : triggers.map(t => (
              <div key={t.id} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 flex items-center gap-4">
                <button onClick={() => toggleEnabled(t.id, !t.enabled)} className={`w-10 h-6 rounded-full relative transition-colors ${t.enabled ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${t.enabled ? "left-5" : "left-1"}`} /></button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold">{t.workflowTag}</span><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.templateType === "email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{t.templateType}</span></div>
                  <p className="text-xs text-zinc-400 mt-0.5">{t.generatedCount} generated · {t.approvedCount} approved · {t.rejectedCount} rejected{t.lastTriggeredAt ? ` · Last: ${new Date(t.lastTriggeredAt).toLocaleDateString()}` : ""}</p>
                </div>
                <button onClick={() => checkNow(t.workflowTag)} className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium hover:bg-amber-200">Generate Now</button>
              </div>
            ))}
          </div>

          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Pending Review ({pending.length})</h2>
              {pending.map(p => (
                <div key={p.id} className="border border-amber-200 dark:border-amber-800 rounded-xl p-5 bg-amber-50 dark:bg-amber-900/10">
                  <div className="flex items-start justify-between mb-3">
                    <div><h3 className="text-sm font-semibold">{p.name}</h3><p className="text-xs text-zinc-500">{p.workflowTag} · {p.templateType} · {new Date(p.createdAt).toLocaleString()}</p></div>
                    <div className="flex gap-2">
                      <button onClick={() => review(p.id, "approved")} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium">Approve & Deploy</button>
                      <button onClick={() => review(p.id, "rejected")} className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium">Reject</button>
                    </div>
                  </div>
                  {p.subject && <p className="text-xs font-medium text-zinc-700 mb-1">Subject: {p.subject}</p>}
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 rounded-lg p-3 max-h-32 overflow-auto whitespace-pre-wrap">{p.bodyHtml || p.smsBody || ""}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
