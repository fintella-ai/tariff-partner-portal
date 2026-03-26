"use client";

import { useState } from "react";
import { useDevice } from "@/lib/useDevice";

interface Module {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  videoUrl?: string;
  completed: boolean;
}

const CATEGORIES = ["All", "Onboarding", "Sales", "Product Knowledge", "Tools"];

const DEMO_MODULES: Module[] = [
  { id: "m1", title: "Welcome to TRRLN — Getting Started", description: "Overview of the partner program, how commissions work, and your first steps.", category: "Onboarding", duration: "12 min", completed: true },
  { id: "m2", title: "Understanding IEEPA Tariff Recovery", description: "Deep dive into the IEEPA tariff recovery process and how clients qualify for refunds.", category: "Product Knowledge", duration: "18 min", completed: true },
  { id: "m3", title: "How to Submit a Lead", description: "Step-by-step walkthrough of the lead submission process and what happens after.", category: "Onboarding", duration: "8 min", completed: false },
  { id: "m4", title: "Identifying Qualified Importers", description: "Learn how to spot importers who may qualify for tariff refunds in your network.", category: "Sales", duration: "15 min", completed: false },
  { id: "m5", title: "Building Your Downline Network", description: "Strategies for recruiting CPAs, trade advisors, and attorneys as referral partners.", category: "Sales", duration: "20 min", completed: false },
  { id: "m6", title: "Using the Partner Portal", description: "Full walkthrough of all portal features — deals, commissions, documents, and more.", category: "Tools", duration: "10 min", completed: false },
  { id: "m7", title: "Section 301 Duties — What You Need to Know", description: "Understanding Section 301 tariffs on Chinese imports and recovery opportunities.", category: "Product Knowledge", duration: "22 min", completed: false },
  { id: "m8", title: "Commission Structure Explained", description: "L1, L2, and L3 commissions — when you get paid and how to maximize earnings.", category: "Onboarding", duration: "10 min", completed: false },
];

export default function TrainingPage() {
  const device = useDevice();
  const [activeCategory, setActiveCategory] = useState("All");
  const [modules, setModules] = useState(DEMO_MODULES);

  const filtered = activeCategory === "All" ? modules : modules.filter((m) => m.category === activeCategory);
  const completedCount = modules.filter((m) => m.completed).length;
  const progress = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  function toggleComplete(id: string) {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, completed: !m.completed } : m))
    );
  }

  return (
    <div>
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Partner Training
      </h2>
      <p className="font-body text-[13px] text-white/40 mb-6">
        Complete these modules to master the TRRLN partner program and maximize your earnings.
      </p>

      {/* Progress Bar */}
      <div className={`card ${device.cardPadding} mb-6`}>
        <div className="flex justify-between items-center mb-2">
          <div className="font-body text-sm font-semibold text-white">Your Progress</div>
          <div className="font-body text-sm text-brand-gold font-semibold">{progress}%</div>
        </div>
        <div className="w-full h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-gold to-[#e8c060] rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="font-body text-[11px] text-white/30 mt-2">
          {completedCount} of {modules.length} modules completed
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`font-body text-[11px] tracking-wider uppercase px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
              activeCategory === cat
                ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                : "border-white/10 text-white/40 hover:text-white/60 hover:border-white/20"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Module List */}
      <div className={`flex flex-col ${device.gap}`}>
        {filtered.map((m) => (
          <div
            key={m.id}
            className={`card ${device.cardPadding} transition-all ${m.completed ? "opacity-70" : ""}`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <button
                onClick={() => toggleComplete(m.id)}
                className={`w-6 h-6 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                  m.completed
                    ? "bg-green-500/20 border-green-500/40 text-green-400"
                    : "border-white/20 hover:border-brand-gold/40"
                }`}
              >
                {m.completed && <span className="text-xs">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className={`font-body text-sm font-medium ${m.completed ? "text-white/50 line-through" : "text-white"}`}>
                    {m.title}
                  </div>
                  <span className="font-body text-[10px] text-white/25 shrink-0 bg-white/5 border border-white/[0.06] rounded px-2 py-0.5">
                    {m.category}
                  </span>
                </div>
                <p className="font-body text-[12px] text-white/40 mt-1 leading-relaxed">
                  {m.description}
                </p>
                <div className="flex items-center gap-3 mt-2.5">
                  <span className="font-body text-[10px] text-white/25">⏱ {m.duration}</span>
                  <button className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold transition-colors">
                    ▶ Watch Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
