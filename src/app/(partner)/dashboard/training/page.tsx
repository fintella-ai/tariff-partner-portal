"use client";

import { useState, useEffect, useCallback } from "react";
import { useDevice } from "@/lib/useDevice";
import VideoModal from "@/components/ui/VideoModal";
import Accordion from "@/components/ui/Accordion";
import type { AccordionItem } from "@/components/ui/Accordion";

/* -------------------------------------------------------------------------- */
/*  Interfaces                                                                */
/* -------------------------------------------------------------------------- */

interface Module {
  id: string;
  title: string;
  description: string | null;
  category: string;
  duration: string | null;
  videoUrl: string | null;
  content: string | null;
  completed: boolean;
  completedAt: string | null;
}

interface Resource {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: string | null;
  // moduleId is populated when the resource is attached to a specific
  // training module. Used to surface attached resources inline on the
  // module card (Modules tab) in addition to the Resources tab.
  moduleId: string | null;
}

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

interface GlossaryEntry {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
  category: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** Top-level section tabs. */
type Section = "modules" | "resources" | "faq" | "glossary";

/** Module category filter options. */
const MODULE_CATEGORIES = ["All", "Onboarding", "Sales", "Product Knowledge", "Tools"];

/** FAQ category filter options. */
const FAQ_CATEGORIES = ["All", "General", "Commissions", "Leads", "Technical"];

/* -------------------------------------------------------------------------- */
/*  Demo / Fallback Data                                                      */
/* -------------------------------------------------------------------------- */

const DEMO_MODULES: Module[] = [
  { id: "m1", title: "Welcome to Fintella — Getting Started", description: "Overview of the partner program, how commissions work, and your first steps.", category: "Onboarding", duration: "12 min", videoUrl: null, content: "This introductory module walks you through the Fintella partner program from end to end. You will learn how the commission tiers work (L1, L2, L3), what resources are available in the partner portal, and the exact steps to submit your first lead. By the end, you will have a clear roadmap for getting your first client signed up.", completed: true, completedAt: "2025-12-01T10:00:00Z" },
  { id: "m2", title: "Understanding IEEPA Tariff Recovery", description: "Deep dive into the IEEPA tariff recovery process and how clients qualify for refunds.", category: "Product Knowledge", duration: "18 min", videoUrl: null, content: "Learn the legal and procedural basis for IEEPA tariff recovery claims. We cover which tariff codes qualify, the documentation importers need to provide, and the typical timeline from filing to refund. This module includes real-world examples of successful recoveries.", completed: true, completedAt: "2025-12-02T14:30:00Z" },
  { id: "m3", title: "How to Submit a Lead", description: "Step-by-step walkthrough of the lead submission process and what happens after.", category: "Onboarding", duration: "8 min", videoUrl: null, content: "Follow along as we walk through the lead submission form field by field. You will see exactly what information is required, what is optional, and how to set expectations with your client about next steps. We also cover the lead status lifecycle so you always know where things stand.", completed: false, completedAt: null },
  { id: "m4", title: "Identifying Qualified Importers", description: "Learn how to spot importers who may qualify for tariff refunds in your network.", category: "Sales", duration: "15 min", videoUrl: null, content: "Not every importer qualifies for tariff recovery. This module teaches you the key qualification criteria: minimum import volume, applicable tariff codes, documentation readiness, and common disqualifiers. Includes a quick-assessment framework you can use during initial conversations.", completed: false, completedAt: null },
  { id: "m5", title: "Building Your Downline Network", description: "Strategies for recruiting CPAs, trade advisors, and attorneys as referral partners.", category: "Sales", duration: "20 min", videoUrl: null, content: "Expand your earning potential by building a referral network. Learn how to identify and approach CPAs, customs brokers, trade compliance consultants, and attorneys who serve importers. Includes outreach templates, pitch frameworks, and tips for maintaining long-term referral relationships.", completed: false, completedAt: null },
  { id: "m6", title: "Using the Partner Portal", description: "Full walkthrough of all portal features — deals, commissions, documents, and more.", category: "Tools", duration: "10 min", videoUrl: null, content: "A comprehensive tour of every section of the partner portal. You will learn how to track your deals, view commission statements, upload documents, access training resources, and manage your profile settings. Designed to help you get the most out of the platform from day one.", completed: false, completedAt: null },
  { id: "m7", title: "Section 301 Duties — What You Need to Know", description: "Understanding Section 301 tariffs on Chinese imports and recovery opportunities.", category: "Product Knowledge", duration: "22 min", videoUrl: null, content: "Section 301 tariffs affect a broad range of Chinese imports. This module covers the four tranches of Section 301 duties, which HTS codes are impacted, the exclusion process, and how importers can recover overpaid duties. Includes a quick-reference table for the most common product categories.", completed: false, completedAt: null },
  { id: "m8", title: "Commission Structure Explained", description: "L1, L2, and L3 commissions — when you get paid and how to maximize earnings.", category: "Onboarding", duration: "10 min", videoUrl: null, content: "Understand exactly how you earn. This module breaks down the three commission levels: L1 (direct referral), L2 (downline referral), and L3 (second-level downline). You will learn the percentage rates, payment triggers, payout schedules, and strategies for maximizing your total earnings.", completed: false, completedAt: null },
];

const DEMO_RESOURCES: Resource[] = [
  { id: "tr-quickstart", title: "IEEPA Tariff Recovery — Partner Quick Start Guide", description: "Everything you need to know to get started as a Fintella partner.", fileUrl: "#", fileType: "pdf", fileSize: "2.4 MB", moduleId: null },
  { id: "tr-checklist", title: "Qualified Importer Checklist", description: "Use this checklist to quickly assess if a potential client qualifies.", fileUrl: "#", fileType: "checklist", fileSize: "340 KB", moduleId: null },
  { id: "tr-ratecard", title: "Commission Rate Card", description: "Overview of L1, L2, and L3 commission rates and payment schedules.", fileUrl: "#", fileType: "pdf", fileSize: "180 KB", moduleId: null },
  { id: "tr-script", title: "Client Conversation Script", description: "Talking points for your first conversation with a potential client.", fileUrl: "#", fileType: "guide", fileSize: "520 KB", moduleId: null },
  { id: "tr-section301", title: "Section 301 Duties — Reference Sheet", description: "Quick reference for Section 301 tariff categories and recovery eligibility.", fileUrl: "#", fileType: "pdf", fileSize: "890 KB", moduleId: null },
];

const DEMO_FAQS: FAQItem[] = [
  { id: "faq-1", question: "What is the Fintella partner program?", answer: "Fintella (Financial Intelligence Network) is a partner program that allows CPAs, attorneys, trade advisors, and other professionals to earn commissions by referring importers who qualify for tariff recovery services. Partners earn on direct referrals (L1) and on referrals from their recruited downline partners (L2 and L3).", category: "General" },
  { id: "faq-2", question: "How do I submit a lead?", answer: "Navigate to the Leads section of your partner portal and click 'Submit New Lead.' Fill in the importer's company name, contact information, and estimated annual import volume. You will receive a confirmation email and can track the lead's status in real time from your dashboard.", category: "Leads" },
  { id: "faq-3", question: "What are the commission rates?", answer: "L1 (direct referral) commissions range from 8-12% of the recovery fee depending on deal volume. L2 (first-level downline) commissions are 3-5%, and L3 (second-level downline) commissions are 1-2%. Exact rates are detailed on the Commission Rate Card available in the Resources section.", category: "Commissions" },
  { id: "faq-4", question: "When do I get paid?", answer: "Commissions are paid within 30 days of the client's recovery fee being collected. You will receive an email notification when a commission is processed, and payments are deposited directly to the bank account on file. You can view pending and completed payouts in the Commissions tab.", category: "Commissions" },
  { id: "faq-5", question: "What makes an importer qualified?", answer: "A qualified importer typically has annual imports exceeding $500K subject to IEEPA, Section 301, or other recoverable tariffs. They must have paid duties within the applicable lookback period and be able to provide entry summaries, commercial invoices, and bills of lading for their shipments.", category: "Leads" },
  { id: "faq-6", question: "How do I track my leads and deals?", answer: "Your partner portal dashboard shows all submitted leads, their current status, and associated deal values. Use the Deals section for detailed information on each opportunity, including stage progression, estimated recovery amounts, and expected commission payouts.", category: "Technical" },
  { id: "faq-7", question: "Can I recruit other partners into my network?", answer: "Yes. You can invite CPAs, attorneys, customs brokers, and other professionals to join as partners under your referral link. When they submit leads, you earn L2 commissions on their deals. If they recruit partners of their own, you earn L3 commissions on those deals as well.", category: "General" },
  { id: "faq-8", question: "What documents does the client need to provide?", answer: "Clients typically need to provide: customs entry summaries (CF 7501), commercial invoices, bills of lading, and a power of attorney form. The exact requirements depend on the tariff recovery type. Our team guides the client through document collection after a lead is converted to a deal.", category: "Leads" },
  { id: "faq-9", question: "How do I reset my portal password?", answer: "Click 'Forgot Password' on the login page and enter your registered email address. You will receive a password reset link within a few minutes. If you do not receive the email, check your spam folder or contact support at support@fintella.partners.", category: "Technical" },
  { id: "faq-10", question: "Is there a minimum payout threshold?", answer: "There is no minimum payout threshold. All earned commissions are paid out on the standard 30-day schedule regardless of amount. However, commissions under $10 may be rolled into the next payment cycle at the partner's discretion.", category: "Commissions" },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Return an emoji icon for a given resource file type. */
function fileTypeIcon(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "pdf":
      return "\u{1F4C4}";
    case "checklist":
      return "\u2705";
    case "guide":
      return "\u{1F4D6}";
    case "template":
      return "\u{1F4CB}";
    default:
      return "\u{1F4C4}";
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function TrainingPage() {
  const device = useDevice();

  /* ---- Top-level section ---- */
  const [activeSection, setActiveSection] = useState<Section>("modules");

  /* ---- Loading state ---- */
  const [loading, setLoading] = useState(true);

  /* ---- Modules state ---- */
  const [modules, setModules] = useState<Module[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  /* ---- Resources state ---- */
  const [resources, setResources] = useState<Resource[]>([]);
  // Inline document viewer — when non-null, renders a fullscreen overlay
  // with an iframe embed of the resource so the partner can read without
  // leaving the portal.
  const [viewingResource, setViewingResource] = useState<Resource | null>(null);

  /* ---- FAQ state ---- */
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [activeFaqCategory, setActiveFaqCategory] = useState("All");

  /* ---- Glossary state (Phase 2b) ---- */
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [glossarySearch, setGlossarySearch] = useState("");

  /* ---- Video modal state ---- */
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: "",
    title: "",
  });

  /* -------------------------------------------------------------------------- */
  /*  Data Fetching                                                             */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [modulesRes, resourcesRes, faqRes, glossaryRes] = await Promise.allSettled([
          fetch("/api/training/modules"),
          fetch("/api/training/resources"),
          fetch("/api/training/faq"),
          fetch("/api/training/glossary"),
        ]);

        if (cancelled) return;

        // Modules
        if (modulesRes.status === "fulfilled" && modulesRes.value.ok) {
          const data = await modulesRes.value.json();
          setModules(data.modules ?? DEMO_MODULES);
        } else {
          setModules(DEMO_MODULES);
        }

        // Resources
        if (resourcesRes.status === "fulfilled" && resourcesRes.value.ok) {
          const data = await resourcesRes.value.json();
          setResources(data.resources ?? DEMO_RESOURCES);
        } else {
          setResources(DEMO_RESOURCES);
        }

        // FAQs
        if (faqRes.status === "fulfilled" && faqRes.value.ok) {
          const data = await faqRes.value.json();
          setFaqs(data.faqs ?? DEMO_FAQS);
        } else {
          setFaqs(DEMO_FAQS);
        }

        // Glossary (Phase 2b) — no demo fallback; empty state shows if none exist
        if (glossaryRes.status === "fulfilled" && glossaryRes.value.ok) {
          const data = await glossaryRes.value.json();
          setGlossary(data.entries ?? []);
        } else {
          setGlossary([]);
        }
      } catch {
        // Complete failure — use all demo data
        if (!cancelled) {
          setModules(DEMO_MODULES);
          setResources(DEMO_RESOURCES);
          setFaqs(DEMO_FAQS);
          setGlossary([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // ESC closes the inline document viewer. Only binds when the viewer is
  // open to avoid a global listener in steady state.
  useEffect(() => {
    if (!viewingResource) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewingResource(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingResource]);

  /* -------------------------------------------------------------------------- */
  /*  Handlers                                                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Optimistic toggle for module completion. Updates local state immediately
   * and POSTs to the API for persistence. Reverts on error.
   */
  const toggleComplete = useCallback(async (id: string) => {
    const target = modules.find((m) => m.id === id);
    if (!target) return;

    const newCompleted = !target.completed;
    const newCompletedAt = newCompleted ? new Date().toISOString() : null;

    // Optimistic update
    setModules((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, completed: newCompleted, completedAt: newCompletedAt } : m
      )
    );

    // Persist to API
    try {
      const res = await fetch("/api/training/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId: id, completed: newCompleted }),
      });

      if (!res.ok) throw new Error("Failed to persist progress");
    } catch {
      // Revert on failure
      setModules((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, completed: target.completed, completedAt: target.completedAt } : m
        )
      );
    }
  }, [modules]);

  /** Toggle the expanded/collapsed state of a module card. */
  const toggleExpand = useCallback((id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /** Open the video modal for a given module. */
  const openVideo = useCallback((url: string, title: string) => {
    setVideoModal({ isOpen: true, url, title });
  }, []);

  /** Close the video modal. */
  const closeVideo = useCallback(() => {
    setVideoModal({ isOpen: false, url: "", title: "" });
  }, []);

  /* -------------------------------------------------------------------------- */
  /*  Derived values                                                            */
  /* -------------------------------------------------------------------------- */

  const filteredModules =
    activeCategory === "All" ? modules : modules.filter((m) => m.category === activeCategory);

  const completedCount = modules.filter((m) => m.completed).length;
  const progress = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  const filteredFaqs =
    activeFaqCategory === "All" ? faqs : faqs.filter((f) => f.category === activeFaqCategory);

  const accordionItems: AccordionItem[] = filteredFaqs.map((f) => ({
    id: f.id,
    title: f.question,
    content: f.answer,
  }));

  /* -------------------------------------------------------------------------- */
  /*  Render                                                                    */
  /* -------------------------------------------------------------------------- */

  return (
    <div>
      {/* Page Header */}
      <h2 className={`font-display ${device.isMobile ? "text-lg" : "text-[22px]"} font-bold mb-1.5`}>
        Partner Training
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">
        Complete these modules to master the Fintella partner program and maximize your earnings.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/*  Section Tabs                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {([
          { key: "modules" as Section, label: "Modules" },
          { key: "resources" as Section, label: "Resources" },
          { key: "faq" as Section, label: "FAQ" },
          { key: "glossary" as Section, label: "Glossary" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`font-body text-[12px] tracking-wider uppercase px-5 py-2.5 rounded-lg border transition-colors whitespace-nowrap ${
              activeSection === tab.key
                ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Loading State                                                      */}
      {/* ------------------------------------------------------------------ */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="font-body text-sm text-[var(--app-text-muted)]">Loading training content...</div>
        </div>
      )}

      {/* ================================================================== */}
      {/*  MODULES SECTION                                                    */}
      {/* ================================================================== */}
      {!loading && activeSection === "modules" && (
        <>
          {/* Progress Bar */}
          <div className={`card ${device.cardPadding} mb-6`}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-body text-sm font-semibold text-[var(--app-text)]">Your Progress</div>
              <div className="font-body text-sm text-brand-gold font-semibold">{progress}%</div>
            </div>
            <div className="w-full h-2.5 bg-[var(--app-card-bg)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-gold to-[#e8c060] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-2">
              {completedCount} of {modules.length} modules completed
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
            {MODULE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`font-body text-[11px] tracking-wider uppercase px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Module List */}
          <div className={`flex flex-col ${device.gap}`}>
            {filteredModules.map((m) => {
              const isExpanded = expandedModules.has(m.id);
              const moduleResources = resources.filter((r) => r.moduleId === m.id);
              const hasExpandable = !!m.content || moduleResources.length > 0;

              return (
                <div
                  key={m.id}
                  className={`card p-5 sm:p-6 transition-all ${m.completed ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleComplete(m.id)}
                      className={`w-6 h-6 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center transition-colors ${
                        m.completed
                          ? "bg-green-500/20 border-green-500/40 text-green-400"
                          : "border-[var(--app-border)] hover:border-brand-gold/40"
                      }`}
                      aria-label={m.completed ? "Mark incomplete" : "Mark complete"}
                    >
                      {m.completed && <span className="text-xs">{"\u2713"}</span>}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        {m.videoUrl ? (
                          <button
                            onClick={() => openVideo(m.videoUrl!, m.title)}
                            className={`font-body text-[17px] font-semibold text-left leading-snug ${
                              m.completed ? "text-[var(--app-text-secondary)] line-through" : "text-[var(--app-text)]"
                            } hover:text-brand-gold transition-colors`}
                            title="Play video"
                          >
                            {m.title}
                          </button>
                        ) : (
                          <div
                            className={`font-body text-[17px] font-semibold leading-snug ${
                              m.completed ? "text-[var(--app-text-secondary)] line-through" : "text-[var(--app-text)]"
                            }`}
                          >
                            {m.title}
                          </div>
                        )}
                        <span className="font-body text-[10px] text-[var(--app-text-faint)] shrink-0 bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-2 py-0.5 uppercase tracking-wider">
                          {m.category}
                        </span>
                      </div>

                      <p className="font-body text-[13px] text-[var(--app-text-muted)] mt-1.5 leading-relaxed">
                        {m.description}
                      </p>

                      {/* Action row: duration, prominent Watch Video, details toggle */}
                      <div className="flex items-center flex-wrap gap-3 mt-4">
                        {m.duration && (
                          <span className="font-body text-[12px] text-[var(--app-text-faint)] inline-flex items-center gap-1">
                            {"\u23F1"} {m.duration}
                          </span>
                        )}

                        {m.videoUrl ? (
                          <button
                            onClick={() => openVideo(m.videoUrl!, m.title)}
                            className="font-body text-[14px] font-semibold text-brand-gold bg-brand-gold/10 border border-brand-gold/30 rounded-lg px-4 py-2 hover:bg-brand-gold/20 hover:border-brand-gold/50 transition-colors inline-flex items-center gap-2"
                          >
                            <span className="text-[16px]">{"\u25B6"}</span>
                            Watch Video
                          </button>
                        ) : (
                          <span className="font-body text-[13px] text-[var(--app-text-faint)] italic">
                            {"\u25B6"} Video coming soon
                          </span>
                        )}

                        {hasExpandable && (
                          <button
                            onClick={() => toggleExpand(m.id)}
                            className="font-body text-[12px] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition-colors ml-auto flex items-center gap-1"
                          >
                            {isExpanded ? "Hide Details" : `Details${moduleResources.length > 0 ? ` (${moduleResources.length} resource${moduleResources.length === 1 ? "" : "s"})` : ""}`}
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Expanded content + attached resources */}
                      {isExpanded && (m.content || moduleResources.length > 0) && (
                        <div className="mt-4 pt-4 border-t border-[var(--app-border)] space-y-4">
                          {m.content && (
                            <p className="font-body text-[13px] text-[var(--app-text-muted)] leading-relaxed whitespace-pre-line">
                              {m.content}
                            </p>
                          )}
                          {moduleResources.length > 0 && (
                            <div>
                              <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-2">
                                Attached Resources ({moduleResources.length})
                              </div>
                              <div className="flex flex-col gap-2">
                                {moduleResources.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex items-start gap-3 p-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)]"
                                  >
                                    <span className="text-xl shrink-0 mt-0.5">{fileTypeIcon(r.fileType)}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-body text-[13px] font-medium text-[var(--app-text)]">{r.title}</div>
                                      {r.description && (
                                        <div className="font-body text-[11px] text-[var(--app-text-muted)] mt-0.5">{r.description}</div>
                                      )}
                                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {r.fileSize && (
                                          <span className="text-[10px] text-[var(--app-text-faint)] bg-[var(--app-input-bg)] rounded px-2 py-0.5">
                                            {r.fileSize}
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setViewingResource(r)}
                                          disabled={!r.fileUrl || r.fileUrl === "#"}
                                          className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1 hover:bg-brand-gold/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                          title={!r.fileUrl || r.fileUrl === "#" ? "Preview unavailable" : "Open embedded viewer"}
                                        >
                                          View
                                        </button>
                                        <a
                                          href={r.fileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1 hover:bg-brand-gold/10 transition-colors"
                                        >
                                          Download
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/*  RESOURCES SECTION                                                  */}
      {/* ================================================================== */}
      {!loading && activeSection === "resources" && (
        <div className={`grid ${device.isMobile ? "grid-cols-1 gap-3" : "grid-cols-2 gap-4"}`}>
          {resources.map((r) => (
            <div key={r.id} className={`card ${device.cardPadding}`}>
              <div className="flex items-start gap-3">
                {/* File type icon */}
                <span className="text-2xl shrink-0 mt-0.5">{fileTypeIcon(r.fileType)}</span>

                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-medium text-[var(--app-text)]">{r.title}</div>
                  {r.description && (
                    <p className="font-body text-[12px] text-[var(--app-text-muted)] mt-1">{r.description}</p>
                  )}

                  {/* Bottom row: file size + view / download buttons */}
                  <div className="flex items-center justify-between mt-3 gap-2">
                    {r.fileSize ? (
                      <span className="text-[10px] text-[var(--app-text-faint)] bg-[var(--app-input-bg)] rounded px-2 py-0.5">
                        {r.fileSize}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingResource(r)}
                        disabled={!r.fileUrl || r.fileUrl === "#"}
                        className="font-body text-[11px] text-brand-gold/80 hover:text-brand-gold border border-brand-gold/30 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={!r.fileUrl || r.fileUrl === "#" ? "Preview unavailable — no file attached" : "Open embedded viewer in this page"}
                      >
                        View
                      </button>
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================== */}
      {/*  FAQ SECTION                                                        */}
      {/* ================================================================== */}
      {!loading && activeSection === "faq" && (
        <>
          {/* FAQ Category Tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
            {FAQ_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveFaqCategory(cat)}
                className={`font-body text-[11px] tracking-wider uppercase px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                  activeFaqCategory === cat
                    ? "bg-brand-gold/10 border-brand-gold/30 text-brand-gold"
                    : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* FAQ Accordion */}
          <Accordion items={accordionItems} />
        </>
      )}

      {/* ================================================================== */}
      {/*  GLOSSARY SECTION (Phase 2b)                                        */}
      {/* ================================================================== */}
      {!loading && activeSection === "glossary" && (
        <>
          <div className="mb-4">
            <input
              type="search"
              value={glossarySearch}
              onChange={(e) => setGlossarySearch(e.target.value)}
              placeholder="Search terms, aliases, or definitions…"
              className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-4 py-3 font-body text-sm text-[var(--app-text)] outline-none focus:border-brand-gold/40 placeholder:text-[var(--app-text-muted)]"
            />
          </div>
          {glossary.length === 0 ? (
            <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📖</div>
              <div className="font-display text-base font-bold text-[var(--app-text)] mb-1">Glossary coming soon</div>
              <div className="font-body text-[12px] text-[var(--app-text-muted)]">
                Your admin team is building out definitions for tariff refund terminology. Check back soon.
              </div>
            </div>
          ) : (() => {
            const q = glossarySearch.trim().toLowerCase();
            const filtered = q
              ? glossary.filter((g) => {
                  const inTerm = g.term.toLowerCase().includes(q);
                  const inAlias = (g.aliases ?? []).some((a) => a.toLowerCase().includes(q));
                  const inDef = g.definition.toLowerCase().includes(q);
                  return inTerm || inAlias || inDef;
                })
              : glossary;
            if (filtered.length === 0) {
              return (
                <div className="font-body text-[13px] text-[var(--app-text-muted)] italic text-center py-8">
                  No terms match &ldquo;{glossarySearch}&rdquo;.
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((g) => (
                  <div
                    key={g.id}
                    className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-4"
                  >
                    <div className="flex items-start gap-3 mb-1 flex-wrap">
                      <div className="font-display text-base font-bold text-[var(--app-text)]">
                        {g.term}
                      </div>
                      {g.category && (
                        <span className="font-body text-[10px] uppercase tracking-wider text-[var(--app-text-muted)] bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded px-2 py-0.5">
                          {g.category}
                        </span>
                      )}
                    </div>
                    {g.aliases && g.aliases.length > 0 && (
                      <div className="font-body text-[11px] text-[var(--app-text-muted)] mb-2">
                        aka: {g.aliases.join(", ")}
                      </div>
                    )}
                    <div className="font-body text-[13px] text-[var(--app-text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {g.definition}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  Video Modal                                                        */}
      {/* ------------------------------------------------------------------ */}
      <VideoModal
        isOpen={videoModal.isOpen}
        onClose={closeVideo}
        videoUrl={videoModal.url}
        title={videoModal.title}
      />

      {/* ------------------------------------------------------------------ */}
      {/*  Inline Document Viewer — opens when a Resource card's "View" is   */}
      {/*  clicked. ESC or the × button closes. Opaque panel per the modal    */}
      {/*  opacity rule (var(--app-bg-secondary) on the frame, bg-black/80    */}
      {/*  on the backdrop).                                                  */}
      {/* ------------------------------------------------------------------ */}
      {viewingResource && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Viewing ${viewingResource.title}`}
        >
          <div className="relative w-full max-w-5xl h-[92vh] bg-[var(--app-bg-secondary)] border border-[var(--app-border)] rounded-xl overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--app-border)]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg shrink-0">{fileTypeIcon(viewingResource.fileType)}</span>
                <div className="min-w-0">
                  <div className="font-body text-sm font-semibold text-[var(--app-text)] truncate">{viewingResource.title}</div>
                  {viewingResource.fileSize && (
                    <div className="font-body text-[10px] text-[var(--app-text-muted)]">{viewingResource.fileSize}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewingResource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[11px] text-brand-gold/70 hover:text-brand-gold border border-brand-gold/20 rounded-lg px-3 py-1.5 hover:bg-brand-gold/10 transition-colors"
                  title="Open in new tab"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setViewingResource(null)}
                  aria-label="Close viewer"
                  className="font-body text-[20px] leading-none text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors w-8 h-8 rounded-lg hover:bg-[var(--app-hover)] flex items-center justify-center"
                  title="Close (Esc)"
                >
                  ×
                </button>
              </div>
            </div>
            {/* Embed */}
            <div className="flex-1 bg-[var(--app-bg)]">
              <iframe
                key={viewingResource.id}
                src={viewingResource.fileUrl}
                title={viewingResource.title}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
