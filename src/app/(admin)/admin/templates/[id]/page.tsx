"use client";
import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const type = searchParams.get("type") || "email";
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [status, setStatus] = useState("draft");
  const [category, setCategory] = useState("");

  useEffect(() => {
    fetch(`/api/admin/templates/${type}/${id}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((t) => { setTemplate(t); setName(t.name || ""); setSubject(t.subject || ""); setBodyHtml(t.bodyHtml || ""); setBodyText(t.bodyText || ""); setSmsBody(t.body || ""); setStatus(t.status || "draft"); setCategory(t.category || ""); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [id, type]);

  const save = async () => {
    setSaving(true);
    const body = type === "email" ? { name, subject, bodyHtml, bodyText, status, category } : { name, body: smsBody, status, category, characterCount: smsBody.length, segmentCount: smsBody.length <= 160 ? 1 : Math.ceil(smsBody.length / 153) };
    await fetch(`/api/admin/templates/${type}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setDirty(false); setSaving(false);
  };

  const archive = async () => { await fetch(`/api/admin/templates/${type}/${id}`, { method: "DELETE" }); router.push("/admin/templates"); };
  const mk = () => { if (!dirty) setDirty(true); };

  if (loading) return <div className="p-6 text-center text-zinc-400">Loading...</div>;
  if (!template) return <div className="p-6 text-center text-zinc-400">Template not found</div>;

  const vars = Array.from(new Set((type === "email" ? `${subject} ${bodyHtml} ${bodyText}` : smsBody).match(/\{(\w+)\}/g)?.map((v) => v.replace(/[{}]/g, "")) || []));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <button onClick={() => router.push("/admin/templates")} className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4">← Back to Templates</button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{name || "Untitled"}{template.aiGenerated ? " ✨" : ""}</h1>
        <div className="flex items-center gap-2">
          <button onClick={archive} className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Archive</button>
          <button onClick={save} disabled={!dirty || saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name</label><input type="text" value={name} onChange={(e) => { setName(e.target.value); mk(); }} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" /></div>
          {type === "email" && (<><div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Subject</label><input type="text" value={subject} onChange={(e) => { setSubject(e.target.value); mk(); }} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" /></div>
            <div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">HTML Body</label><textarea value={bodyHtml} onChange={(e) => { setBodyHtml(e.target.value); mk(); }} rows={12} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono resize-y" /></div>
            <div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Plain Text</label><textarea value={bodyText} onChange={(e) => { setBodyText(e.target.value); mk(); }} rows={6} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono resize-y" /></div></>)}
          {type === "sms" && (<div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">SMS Body</label><textarea value={smsBody} onChange={(e) => { setSmsBody(e.target.value); mk(); }} rows={4} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm resize-y" /><div className="mt-2 text-xs"><span className={smsBody.length > 160 ? "text-red-500" : "text-green-600"}>{smsBody.length} / 160</span></div></div>)}
        </div>
        <div className="space-y-4">
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900"><h3 className="text-sm font-semibold mb-3">Metadata</h3>
            <div className="space-y-3 text-sm"><div><label className="block text-xs text-zinc-500 mb-1">Status</label><select value={status} onChange={(e) => { setStatus(e.target.value); mk(); }} className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm"><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></div>
              <div><label className="block text-xs text-zinc-500 mb-1">Category</label><input type="text" value={category} onChange={(e) => { setCategory(e.target.value); mk(); }} className="w-full px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm" /></div>
              <div className="text-xs text-zinc-400"><p>Type: {type.toUpperCase()}</p><p>Created: {new Date(template.createdAt).toLocaleDateString()}</p><p>Updated: {new Date(template.updatedAt).toLocaleDateString()}</p>{template.version > 1 && <p>Version: {template.version}</p>}</div></div></div>
          {vars.length > 0 && (<div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900"><h3 className="text-sm font-semibold mb-2">Variables</h3><div className="flex flex-wrap gap-1.5">{vars.map((v) => <span key={v} className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-mono">{`{${v}}`}</span>)}</div></div>)}
        </div>
      </div>
    </div>
  );
}
