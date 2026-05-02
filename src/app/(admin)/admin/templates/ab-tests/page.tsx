"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function AbTestsPage() {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", workflowTag: "", templateType: "email", templateIdA: "", templateIdB: "" });
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/admin/templates/ab-test").then(r => r.json()).then(setTests).catch(() => []).finally(() => setLoading(false));
    fetch("/api/admin/templates/email").then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  const create = async () => {
    const res = await fetch("/api/admin/templates/ab-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { const t = await res.json(); setTests(p => [t, ...p]); setShowCreate(false); setForm({ name: "", workflowTag: "", templateType: "email", templateIdA: "", templateIdB: "" }); }
  };

  const updateTest = async (id: string, data: any) => {
    const res = await fetch(`/api/admin/templates/ab-test/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { const t = await res.json(); setTests(p => p.map(x => x.id === id ? t : x)); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1"><Link href="/admin/templates" className="hover:text-zinc-700">Templates</Link><span>/</span><span>A/B Tests</span></div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Template A/B Testing</h1>
          <p className="text-sm text-zinc-500 mt-1">Compare template variants to optimize open rates, clicks, and conversions</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">New A/B Test</button>
      </div>

      {showCreate && (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-6 bg-white dark:bg-zinc-900 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create A/B Test</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Test Name</label><input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm" placeholder="Welcome Email Style Test" /></div>
            <div><label className="block text-sm font-medium mb-1">Workflow Tag</label><input value={form.workflowTag} onChange={e => setForm(p => ({...p, workflowTag: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm" placeholder="welcome" /></div>
            <div><label className="block text-sm font-medium mb-1">Variant A (Template)</label><select value={form.templateIdA} onChange={e => setForm(p => ({...p, templateIdA: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="">Select...</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1">Variant B (Template)</label><select value={form.templateIdB} onChange={e => setForm(p => ({...p, templateIdB: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="">Select...</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          </div>
          <div className="flex gap-2 mt-4"><button onClick={create} disabled={!form.name || !form.templateIdA || !form.templateIdB} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">Create Test</button><button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button></div>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-zinc-400">Loading...</div> : tests.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl"><p className="text-zinc-500 mb-3">No A/B tests yet</p><button onClick={() => setShowCreate(true)} className="text-blue-600 text-sm font-medium">Create your first test</button></div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => (
            <div key={test.id} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 bg-white dark:bg-zinc-900">
              <div className="flex items-center justify-between mb-4">
                <div><h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{test.name}</h3><p className="text-xs text-zinc-500 mt-0.5">Workflow: {test.workflowTag} · {test.templateType.toUpperCase()} · {test.sampleSize} sends</p></div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${test.status === "running" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : test.status === "completed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-zinc-100 text-zinc-500"}`}>{test.status}</span>
                  {test.status === "running" && <button onClick={() => updateTest(test.id, { status: "paused" })} className="text-xs text-zinc-500 hover:text-zinc-700">Pause</button>}
                  {test.status === "paused" && <button onClick={() => updateTest(test.id, { status: "running" })} className="text-xs text-blue-600">Resume</button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(test.variants || []).map((v: any) => (
                  <div key={v.id} className={`border rounded-lg p-4 ${test.winnerVariant === v.variant ? "border-green-400 bg-green-50 dark:bg-green-900/10" : "border-zinc-200 dark:border-zinc-700"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold">Variant {v.variant}</span>
                      {test.winnerVariant === v.variant && <span className="px-2 py-0.5 rounded-full bg-green-500 text-white text-[10px] font-bold">WINNER</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div><p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{v.sends > 0 ? ((v.opens/v.sends)*100).toFixed(1) : "0.0"}%</p><p className="text-[10px] text-zinc-500 uppercase">Open Rate</p></div>
                      <div><p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{v.sends > 0 ? ((v.clicks/v.sends)*100).toFixed(1) : "0.0"}%</p><p className="text-[10px] text-zinc-500 uppercase">Click Rate</p></div>
                      <div><p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{v.sends > 0 ? ((v.conversions/v.sends)*100).toFixed(1) : "0.0"}%</p><p className="text-[10px] text-zinc-500 uppercase">Conversion</p></div>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2 text-center">{v.sends} sends</p>
                  </div>
                ))}
              </div>
              {test.status === "running" && test.sampleSize >= 100 && !test.winnerVariant && (
                <div className="mt-4 flex gap-2">{(test.variants || []).map((v: any) => <button key={v.id} onClick={() => updateTest(test.id, { status: "completed", winnerVariant: v.variant })} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white">Declare {v.variant} Winner</button>)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
