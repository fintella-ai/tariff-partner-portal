"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"email" | "sms">("email");
  const [prompt, setPrompt] = useState("");
  const [styles, setStyles] = useState<any[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [templateName, setTemplateName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"draft" | "active">("draft");
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/admin/templates/variables").then((r) => r.json()).then((d) => { if (d.styles) setStyles(d.styles); }).catch(() => {}); }, []);

  const generate = async () => {
    setGenerating(true); setError("");
    try {
      const res = await fetch(`/api/admin/templates/generate/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, styleId: selectedStyle }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      setResult(data); setTemplateName(data.name || ""); setStep(2);
    } catch (e: any) { setError(e.message); } finally { setGenerating(false); }
  };

  const save = async () => {
    if (!result?.id) return; setSaving(true);
    try {
      await fetch(`/api/admin/templates/${mode}/${result.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateName, status: saveStatus }) });
      router.push(`/admin/templates/${result.id}?type=${mode}`);
    } catch { setError("Failed to save"); } finally { setSaving(false); }
  };

  const steps = ["Describe", "Style", "Review", "Save"];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">AI Template Generator</h1>
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (<div key={s} className="flex items-center gap-2"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${i < step ? "bg-green-500 text-white" : i === step ? "bg-blue-600 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500"}`}>{i < step ? "✓" : i + 1}</div><span className={`text-sm hidden sm:inline ${i === step ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>{s}</span>{i < 3 && <div className="w-8 h-px bg-zinc-300 dark:bg-zinc-600" />}</div>))}
      </div>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>}

      {step === 0 && (<div className="space-y-4">
        <div className="flex gap-2 mb-4">{(["email", "sms"] as const).map((m) => (<button key={m} onClick={() => setMode(m)} className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === m ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"}`}>{m.toUpperCase()}</button>))}</div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={mode === "email" ? "Create a welcome email for new partners explaining the tariff refund process..." : "Create an SMS for commission payment confirmation..."} rows={6} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm resize-none" />
        <div className="flex justify-end"><button onClick={() => setStep(1)} disabled={!prompt.trim()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">Next →</button></div>
      </div>)}

      {step === 1 && (<div className="space-y-4">
        <p className="text-sm text-zinc-500 mb-2">Choose a communication style:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {styles.map((s: any) => (<button key={s.id} onClick={() => setSelectedStyle(s.id)} className={`text-left p-4 rounded-xl border-2 ${selectedStyle === s.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}><div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.name}</span>{selectedStyle === s.id && <span className="text-blue-500">✓</span>}</div><p className="text-xs text-zinc-500">{s.description}</p></button>))}
        </div>
        <div className="flex justify-between">
          <button onClick={() => setStep(0)} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">← Back</button>
          <button onClick={generate} disabled={!selectedStyle || generating} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">{generating ? "Generating..." : "Generate ✨"}</button>
        </div>
      </div>)}

      {step === 2 && result && (<div className="space-y-4">
        {mode === "email" ? (<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-500">Preview</div><div className="p-4"><p className="text-sm font-semibold mb-2">Subject: {result.subject}</p><div className="text-sm prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: result.bodyHtml }} /></div></div>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-500">Plain Text</div><pre className="p-4 text-sm whitespace-pre-wrap overflow-auto max-h-96">{result.bodyText}</pre></div>
        </div>) : (<div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4"><pre className="text-sm whitespace-pre-wrap">{result.body}</pre><div className="mt-3 text-xs text-zinc-500">{result.characterCount} chars · {result.segmentCount} segment{result.segmentCount !== 1 ? "s" : ""}</div></div>)}
        {result.detectedVariables?.length > 0 && <div className="flex flex-wrap gap-1.5"><span className="text-xs text-zinc-500 mr-1">Variables:</span>{result.detectedVariables.map((v: string) => <span key={v} className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-mono">{`{{${v}}}`}</span>)}</div>}
        {result.grammarNotes?.length > 0 && <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-3 bg-amber-50 dark:bg-amber-900/20"><p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Grammar corrections:</p><ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">{result.grammarNotes.map((n: string, i: number) => <li key={i}>• {n}</li>)}</ul></div>}
        <div className="flex justify-between"><button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">← Back</button><button onClick={() => setStep(3)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">Next →</button></div>
      </div>)}

      {step === 3 && (<div className="space-y-4 max-w-md">
        <div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Template Name</label><input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm" /></div>
        <div><label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Status</label><div className="flex gap-3">{(["draft", "active"] as const).map((s) => (<button key={s} onClick={() => setSaveStatus(s)} className={`flex-1 px-4 py-3 rounded-xl border-2 text-sm font-medium ${saveStatus === s ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"}`}>{s === "draft" ? "Save as Draft" : "Mark Active"}</button>))}</div></div>
        <div className="flex justify-between pt-4"><button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800">← Back</button><button onClick={save} disabled={!templateName.trim() || saving} className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : "Save Template ✓"}</button></div>
      </div>)}
    </div>
  );
}
