"use client";

import { useState, useEffect, useCallback } from "react";

interface WidgetKey {
  id: string;
  apiKeyHint: string;
  platform: string;
  origin: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

const PORTAL_URL = typeof window !== "undefined" ? window.location.origin : "https://fintella.partners";

const PLATFORMS = [
  { value: "cargowise", label: "CargoWise" },
  { value: "magaya", label: "Magaya" },
  { value: "generic", label: "Generic / Other" },
];

export default function WidgetSetupPage() {
  const [keys, setKeys] = useState<WidgetKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [platform, setPlatform] = useState("cargowise");
  const [origin, setOrigin] = useState("");
  const [newKey, setNewKey] = useState<{ apiKey: string; embedCode: string; widgetUrl: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [installTab, setInstallTab] = useState<"cargowise" | "magaya" | "generic">("cargowise");

  const loadKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/widget/embed-key");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const generate = async () => {
    setGenerating(true);
    setNewKey(null);
    try {
      const res = await fetch("/api/widget/embed-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, origin: origin.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKey({ apiKey: data.apiKey, embedCode: data.embedCode, widgetUrl: data.widgetUrl });
        loadKeys();
      }
    } catch {}
    setGenerating(false);
  };

  const deactivate = async (id: string) => {
    await fetch(`/api/widget/embed-key/${id}`, { method: "DELETE" });
    loadKeys();
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--app-text)]">TMS Widget Setup</h1>
        <p className="text-sm text-[var(--app-text-muted)] mt-1">
          Embed a referral widget directly inside CargoWise, Magaya, or any browser-based TMS.
        </p>
      </div>

      {/* Existing keys */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--app-text)] mb-3">Your Widget API Keys</h2>
        {loading ? (
          <div className="text-sm text-[var(--app-text-muted)]">Loading...</div>
        ) : keys.length === 0 ? (
          <div className="bg-[var(--app-bg-secondary)] rounded-lg p-6 text-center text-sm text-[var(--app-text-muted)]">
            No API keys yet. Generate one below to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="text-left py-2 px-2 text-xs text-[var(--app-text-muted)]">Key</th>
                  <th className="text-left py-2 px-2 text-xs text-[var(--app-text-muted)]">Platform</th>
                  <th className="text-left py-2 px-2 text-xs text-[var(--app-text-muted)]">Status</th>
                  <th className="text-left py-2 px-2 text-xs text-[var(--app-text-muted)]">Last Seen</th>
                  <th className="text-right py-2 px-2 text-xs text-[var(--app-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-[var(--app-border)]">
                    <td className="py-2 px-2 font-mono text-xs">{k.apiKeyHint}</td>
                    <td className="py-2 px-2 capitalize">{k.platform}</td>
                    <td className="py-2 px-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${k.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {k.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-xs text-[var(--app-text-muted)]">
                      {k.lastSeenAt ? new Date(k.lastSeenAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {k.isActive && (
                        <button onClick={() => deactivate(k.id)} className="text-xs text-red-500 hover:text-red-700">
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Generate new key */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--app-text)] mb-3">Generate New Embed Key</h2>
        <div className="bg-[var(--app-bg-secondary)] rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--app-text)] mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full border border-[var(--app-border)] rounded-md px-3 py-2 text-sm bg-[var(--app-bg)] text-[var(--app-text)]"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--app-text)] mb-1">
              Allowed Origin <span className="text-[var(--app-text-muted)]">(optional)</span>
            </label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="https://app.cargowise.com"
              className="w-full border border-[var(--app-border)] rounded-md px-3 py-2 text-sm bg-[var(--app-bg)] text-[var(--app-text)]"
            />
            <p className="text-[10px] text-[var(--app-text-muted)] mt-1">
              If set, widget API requests from other origins will be blocked.
            </p>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
          >
            {generating ? "Generating..." : "Generate API Key"}
          </button>
        </div>

        {newKey && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-green-800">Key Generated Successfully</h3>
            <p className="text-xs text-green-700">Copy this key now — it won&apos;t be shown again.</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-green-800">API Key:</label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 bg-white border border-green-300 rounded px-2 py-1 text-xs font-mono break-all">{newKey.apiKey}</code>
                  <button onClick={() => copy(newKey.apiKey, "key")} className="px-2 py-1 bg-green-600 text-white rounded text-xs shrink-0">
                    {copied === "key" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-green-800">Embed Code:</label>
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 bg-white border border-green-300 rounded px-2 py-1 text-xs font-mono break-all">{newKey.embedCode}</code>
                  <button onClick={() => copy(newKey.embedCode, "embed")} className="px-2 py-1 bg-green-600 text-white rounded text-xs shrink-0">
                    {copied === "embed" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Installation instructions */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--app-text)] mb-3">Installation Instructions</h2>
        <div className="flex gap-1 mb-3">
          {(["cargowise", "magaya", "generic"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setInstallTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                installTab === t ? "bg-amber-100 text-amber-700" : "bg-[var(--app-bg-secondary)] text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
              }`}
            >
              {t === "cargowise" ? "CargoWise" : t === "magaya" ? "Magaya" : "Generic"}
            </button>
          ))}
        </div>
        <div className="bg-[var(--app-bg-secondary)] rounded-lg p-4 text-sm space-y-2 text-[var(--app-text)]">
          {installTab === "cargowise" && (
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>In CargoWise, go to <strong>System → Custom Panels</strong></li>
              <li>Click <strong>Create new Web Panel</strong></li>
              <li>Set the URL to: <code className="bg-[var(--app-bg)] px-1 rounded text-xs">{PORTAL_URL}/widget?apiKey=YOUR_KEY</code></li>
              <li>Set dimensions: <strong>420px wide × 600px tall</strong></li>
              <li>Add the panel to your <strong>Shipment</strong> or <strong>Client</strong> screen layout</li>
              <li>Save and refresh — the widget should load immediately</li>
            </ol>
          )}
          {installTab === "magaya" && (
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>In Magaya, go to <strong>Tools → Custom Web Views</strong></li>
              <li>Click <strong>Add new Web View</strong></li>
              <li>Paste this URL: <code className="bg-[var(--app-bg)] px-1 rounded text-xs">{PORTAL_URL}/widget?apiKey=YOUR_KEY</code></li>
              <li>Set to show in: <strong>Client/Shipper detail view</strong></li>
              <li>Save — the widget appears in the Client detail panel</li>
            </ol>
          )}
          {installTab === "generic" && (
            <div className="space-y-2">
              <p>Copy and paste this HTML wherever you want the widget to appear:</p>
              <code className="block bg-[var(--app-bg)] border border-[var(--app-border)] rounded p-2 text-xs font-mono whitespace-pre-wrap">
                {`<iframe\n  src="${PORTAL_URL}/widget?apiKey=YOUR_KEY"\n  width="420"\n  height="600"\n  style="border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15)"\n  allow="clipboard-write"\n></iframe>`}
              </code>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
