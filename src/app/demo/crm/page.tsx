"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ENTRIES = [
  { id: "ENT-2025-0847", client: "Pacific Rim Imports LLC", origin: "CN", hts: "8542.31.0000", value: "$847,200", duty: "$254,160", date: "2025-06-14", status: "Liquidated" },
  { id: "ENT-2025-0848", client: "Pacific Rim Imports LLC", origin: "CN", hts: "8471.30.0100", value: "$1,245,000", duty: "$373,500", date: "2025-06-14", status: "Liquidated" },
  { id: "ENT-2025-0912", client: "Meridian Supply Co", origin: "VN", hts: "6110.20.2075", value: "$312,500", duty: "$143,750", date: "2025-07-02", status: "Liquidated" },
  { id: "ENT-2025-0913", client: "Meridian Supply Co", origin: "VN", hts: "6204.62.4020", value: "$189,300", duty: "$87,078", date: "2025-07-02", status: "Unliquidated" },
  { id: "ENT-2025-1044", client: "Golden Gate Trading", origin: "TW", hts: "8517.62.0090", value: "$567,800", duty: "$181,696", date: "2025-08-19", status: "Liquidated" },
  { id: "ENT-2025-1045", client: "Golden Gate Trading", origin: "TW", hts: "8504.40.9540", value: "$234,100", duty: "$74,912", date: "2025-08-19", status: "Liquidated" },
  { id: "ENT-2025-1102", client: "Brightpath Logistics", origin: "IN", hts: "3926.90.9990", value: "$156,700", duty: "$40,742", date: "2025-09-05", status: "Liquidated" },
  { id: "ENT-2025-1188", client: "Atlas Freight Solutions", origin: "KR", hts: "8708.29.5060", value: "$892,400", duty: "$223,100", date: "2025-09-22", status: "Liquidated" },
  { id: "ENT-2025-1234", client: "Summit Import Group", origin: "TH", hts: "4011.10.1010", value: "$445,000", duty: "$160,200", date: "2025-10-11", status: "Unliquidated" },
  { id: "ENT-2025-1301", client: "Coastal Trade Partners", origin: "BD", hts: "6109.10.0040", value: "$278,900", duty: "$103,193", date: "2025-10-28", status: "Liquidated" },
];

const SIDEBAR_ITEMS = [
  { icon: "📊", label: "Dashboard", active: false },
  { icon: "📦", label: "Shipments", active: false },
  { icon: "📋", label: "Entries", active: true },
  { icon: "🏢", label: "Clients", active: false },
  { icon: "📄", label: "Documents", active: false },
  { icon: "💰", label: "Billing", active: false },
  { icon: "📈", label: "Reports", active: false },
  { icon: "⚙️", label: "Settings", active: false },
  { icon: "🔌", label: "Fintella", active: false, highlight: true },
];

type CrmTab = "entries" | "fintella";

function CrmDemoInner() {
  const searchParams = useSearchParams();
  const widgetKey = searchParams.get("key") || "demo";
  const [activeTab, setActiveTab] = useState<CrmTab>("entries");
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  function toggleEntry(id: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedEntries.size === ENTRIES.length) setSelectedEntries(new Set());
    else setSelectedEntries(new Set(ENTRIES.map((e) => e.id)));
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#1a1d23", color: "#c8ccd4", fontFamily: "Segoe UI, -apple-system, sans-serif", fontSize: "13px" }}>
      {/* CRM Sidebar */}
      <div style={{ width: 220, background: "#12141a", borderRight: "1px solid #2a2d35", display: "flex", flexDirection: "column" }}>
        {/* Logo area */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a2d35" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4a9eff", letterSpacing: 1 }}>CargoWise</div>
          <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>Enterprise TMS v24.3</div>
        </div>

        {/* User */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2d35", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2a4a7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "#4a9eff" }}>JS</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#e0e4ea" }}>J. Smith</div>
            <div style={{ fontSize: 10, color: "#666" }}>ABC Customs Brokerage</div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                if (item.label === "Fintella") setActiveTab("fintella");
                else if (item.label === "Entries") setActiveTab("entries");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 20px",
                border: "none",
                background: (item.label === "Entries" && activeTab === "entries") || (item.label === "Fintella" && activeTab === "fintella")
                  ? "rgba(74,158,255,0.1)" : "transparent",
                color: item.highlight ? "#c4a050" : (item.active || (item.label === "Entries" && activeTab === "entries")) ? "#4a9eff" : "#888",
                cursor: "pointer",
                fontSize: 13,
                textAlign: "left",
                borderLeft: (item.label === "Entries" && activeTab === "entries") || (item.label === "Fintella" && activeTab === "fintella")
                  ? "3px solid #4a9eff" : "3px solid transparent",
              }}
            >
              <span style={{ fontSize: 16, width: 20 }}>{item.icon}</span>
              <span style={{ fontWeight: item.highlight ? 600 : 400 }}>{item.label}</span>
              {item.highlight && (
                <span style={{ marginLeft: "auto", fontSize: 9, padding: "2px 6px", borderRadius: 8, background: "rgba(196,160,80,0.15)", color: "#c4a050", fontWeight: 600 }}>NEW</span>
              )}
            </button>
          ))}
        </div>

        {/* Bottom */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #2a2d35", fontSize: 10, color: "#555" }}>
          ABC-1234567 · Port: LAX
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ height: 48, background: "#15171d", borderBottom: "1px solid #2a2d35", display: "flex", alignItems: "center", padding: "0 20px", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e0e4ea" }}>
              {activeTab === "entries" ? "Entry Management" : "Fintella — Tariff Recovery"}
            </span>
            {activeTab === "entries" && (
              <div style={{ display: "flex", gap: 4 }}>
                {["All Entries", "Pending", "Liquidated", "Filed"].map((tab) => (
                  <button key={tab} style={{ padding: "4px 12px", fontSize: 11, border: "1px solid #2a2d35", borderRadius: 4, background: tab === "All Entries" ? "#2a4a7a" : "transparent", color: tab === "All Entries" ? "#4a9eff" : "#888", cursor: "pointer" }}>
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: "#666" }}>🔔 3</span>
            <span style={{ fontSize: 11, color: "#666" }}>📧 12</span>
          </div>
        </div>

        {/* Content area */}
        {activeTab === "entries" ? (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="Search entries..."
                  style={{ width: 280, height: 32, background: "#22252d", border: "1px solid #2a2d35", borderRadius: 4, padding: "0 10px", color: "#c8ccd4", fontSize: 12 }}
                />
                <button style={{ height: 32, padding: "0 12px", background: "#22252d", border: "1px solid #2a2d35", borderRadius: 4, color: "#888", fontSize: 12, cursor: "pointer" }}>
                  Filter ▼
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedEntries.size > 0 && (
                  <button
                    onClick={() => setActiveTab("fintella")}
                    style={{ height: 32, padding: "0 16px", background: "rgba(196,160,80,0.15)", border: "1px solid rgba(196,160,80,0.3)", borderRadius: 4, color: "#c4a050", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    🧮 Check IEEPA Refund ({selectedEntries.size})
                  </button>
                )}
                <button style={{ height: 32, padding: "0 12px", background: "#22252d", border: "1px solid #2a2d35", borderRadius: 4, color: "#888", fontSize: 12, cursor: "pointer" }}>
                  Export CSV
                </button>
                <button style={{ height: 32, padding: "0 12px", background: "#2a4a7a", border: "none", borderRadius: 4, color: "#4a9eff", fontSize: 12, cursor: "pointer" }}>
                  + New Entry
                </button>
              </div>
            </div>

            {/* Entries table */}
            <div style={{ background: "#1e2128", border: "1px solid #2a2d35", borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#15171d" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", width: 40 }}>
                      <input type="checkbox" checked={selectedEntries.size === ENTRIES.length} onChange={selectAll} />
                    </th>
                    {["Entry #", "Client", "Origin", "HTS Code", "Entered Value", "Duty Paid", "Entry Date", "Status"].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "#666", letterSpacing: 0.5, textTransform: "uppercase" as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ENTRIES.map((entry, i) => (
                    <tr
                      key={entry.id}
                      style={{ borderTop: "1px solid #2a2d35", background: selectedEntries.has(entry.id) ? "rgba(74,158,255,0.05)" : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <input type="checkbox" checked={selectedEntries.has(entry.id)} onChange={() => toggleEntry(entry.id)} />
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#4a9eff" }}>{entry.id}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 500, color: "#e0e4ea" }}>{entry.client}</td>
                      <td style={{ padding: "8px 12px" }}>{entry.origin}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11 }}>{entry.hts}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{entry.value}</td>
                      <td style={{ padding: "8px 12px", color: "#f59e0b" }}>{entry.duty}</td>
                      <td style={{ padding: "8px 12px", fontSize: 11 }}>{entry.date}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 10,
                          background: entry.status === "Liquidated" ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
                          color: entry.status === "Liquidated" ? "#22c55e" : "#eab308",
                          fontWeight: 500,
                        }}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#666" }}>Showing 10 of 847 entries</span>
              <div style={{ display: "flex", gap: 4 }}>
                {["← Prev", "1", "2", "3", "...", "85", "Next →"].map((p) => (
                  <button key={p} style={{ padding: "4px 10px", fontSize: 11, border: "1px solid #2a2d35", borderRadius: 3, background: p === "1" ? "#2a4a7a" : "transparent", color: p === "1" ? "#4a9eff" : "#666", cursor: "pointer" }}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Fintella Widget Tab */
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 20px", background: "#15171d", borderBottom: "1px solid #2a2d35", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#c4a050", fontWeight: 600, letterSpacing: 1 }}>FINTELLA PARTNER WIDGET</span>
              <span style={{ fontSize: 10, color: "#666" }}>— Tariff Recovery & Refund Calculator</span>
              <button
                onClick={() => setActiveTab("entries")}
                style={{ marginLeft: "auto", fontSize: 11, padding: "4px 12px", border: "1px solid #2a2d35", borderRadius: 4, background: "transparent", color: "#888", cursor: "pointer" }}
              >
                ← Back to Entries
              </button>
            </div>
            <iframe
              src={`/widget?key=${widgetKey}`}
              style={{ flex: 1, border: "none", background: "#0a0a0a" }}
              title="Fintella Widget"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmDemoPage() {
  return (
    <Suspense fallback={<div style={{ background: "#1a1d23", height: "100vh" }} />}>
      <CrmDemoInner />
    </Suspense>
  );
}
