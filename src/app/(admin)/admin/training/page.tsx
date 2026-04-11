"use client";

import { useState, useEffect, useCallback } from "react";

// ─── TYPES ──────────────────────────────────────────────────────────────────

type ViewTab = "modules" | "progress" | "resources" | "faq";

type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  content: string | null;
  videoUrl: string | null;
  duration: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type TrainingResource = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  fileSize: string | null;
  moduleId: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type FAQ = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type ModuleStat = {
  moduleId: string;
  moduleTitle: string;
  started: number;
  completed: number;
  totalPartners: number;
  completionPercentage: number;
};

type ProgressStats = {
  totalPartnersStarted: number;
  totalModules: number;
  avgCompletion: number;
  fullyCompleted: number;
  moduleStats: ModuleStat[];
};

// ─── DEMO FALLBACK DATA ────────────────────────────────────────────────────

const DEMO_MODULES: TrainingModule[] = [
  { id: "dm-1", title: "Welcome to TRLN", description: "Introduction to the Tariff Relief & Recovery Legal Network and how the partner program works.", category: "onboarding", content: null, videoUrl: "https://example.com/videos/welcome", duration: "12 min", sortOrder: 1, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-2", title: "Understanding Tariff Relief", description: "Deep dive into tariff relief programs, eligibility criteria, and the legal framework.", category: "product", content: null, videoUrl: "https://example.com/videos/tariff-relief", duration: "18 min", sortOrder: 2, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-3", title: "Partner Portal Walkthrough", description: "How to navigate the partner portal, submit leads, track deals, and monitor commissions.", category: "tools", content: null, videoUrl: "https://example.com/videos/portal-walkthrough", duration: "15 min", sortOrder: 3, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-4", title: "Lead Qualification Process", description: "Learn how to identify and qualify potential clients for tariff relief services.", category: "sales", content: null, videoUrl: "https://example.com/videos/lead-qualification", duration: "20 min", sortOrder: 4, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-5", title: "Commission Structure & Tiers", description: "Detailed breakdown of commission tiers, payout schedules, and how to maximize earnings.", category: "sales", content: null, videoUrl: "https://example.com/videos/commissions", duration: "10 min", sortOrder: 5, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-6", title: "Client Onboarding Best Practices", description: "Step-by-step guide to helping your referred clients through the onboarding process.", category: "onboarding", content: null, videoUrl: "https://example.com/videos/client-onboarding", duration: "14 min", sortOrder: 6, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-7", title: "Using the CRM Tools", description: "How to leverage CRM integrations and deal tracking to manage your pipeline effectively.", category: "tools", content: null, videoUrl: null, duration: "16 min", sortOrder: 7, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dm-8", title: "Advanced Sales Strategies", description: "Advanced techniques for closing deals and upselling tariff relief services.", category: "sales", content: null, videoUrl: null, duration: "22 min", sortOrder: 8, published: false, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
];

const DEMO_RESOURCES: TrainingResource[] = [
  { id: "dr-1", title: "Partner Quick-Start Guide", description: "One-page overview to get started as a TRLN partner.", fileUrl: "/docs/quick-start.pdf", fileType: "pdf", fileSize: "1.2 MB", moduleId: null, sortOrder: 1, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dr-2", title: "Lead Qualification Checklist", description: "Checklist for qualifying tariff relief leads.", fileUrl: "/docs/lead-checklist.pdf", fileType: "checklist", fileSize: "340 KB", moduleId: null, sortOrder: 2, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dr-3", title: "Commission Rate Card", description: "Current commission rates and tier thresholds.", fileUrl: "/docs/rate-card.pdf", fileType: "pdf", fileSize: "280 KB", moduleId: null, sortOrder: 3, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dr-4", title: "Client Intake Template", description: "Template for gathering initial client information.", fileUrl: "/docs/intake-template.docx", fileType: "template", fileSize: "95 KB", moduleId: null, sortOrder: 4, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "dr-5", title: "Tariff Relief Program Guide", description: "Comprehensive guide to tariff relief programs and eligibility.", fileUrl: "/docs/program-guide.pdf", fileType: "guide", fileSize: "3.8 MB", moduleId: null, sortOrder: 5, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
];

const DEMO_FAQS: FAQ[] = [
  { id: "df-1", question: "How do I submit a new lead?", answer: "Navigate to the Leads section in your partner portal and click 'Submit New Lead'. Fill in the client details and submit.", category: "general", sortOrder: 1, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-2", question: "When are commissions paid out?", answer: "Commissions are processed on the 15th of each month for the previous month's closed deals.", category: "commissions", sortOrder: 2, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-3", question: "What are the commission tiers?", answer: "L1: 10% base, L2: 15% (5+ deals/quarter), L3: 20% (by invitation, high-volume partners).", category: "commissions", sortOrder: 3, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-4", question: "How do I track my deal status?", answer: "Visit the Deals section in your portal to see real-time status updates for all your referred clients.", category: "leads", sortOrder: 4, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-5", question: "What qualifies a business for tariff relief?", answer: "Businesses that have been impacted by tariff increases on imported goods may qualify. Key factors include industry sector, import volume, and tariff classification.", category: "general", sortOrder: 5, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-6", question: "How long does the filing process take?", answer: "Typical processing time is 6-12 months from initial filing to resolution.", category: "general", sortOrder: 6, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-7", question: "Can I refer clients from any state?", answer: "Yes, the tariff relief programs are federal programs and we accept clients from all 50 states.", category: "leads", sortOrder: 7, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-8", question: "How do I reset my portal password?", answer: "Partners log in using their email and partner code, so there is no password to reset. Contact support if you need help accessing your account.", category: "technical", sortOrder: 8, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-9", question: "What documents does my client need to provide?", answer: "Required documents include import records, tariff payment receipts, business tax returns, and customs documentation.", category: "general", sortOrder: 9, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
  { id: "df-10", question: "Is there a minimum deal size?", answer: "There is no minimum, but tariff relief claims under $25,000 may not be cost-effective for the client.", category: "leads", sortOrder: 10, published: true, createdAt: "2026-03-01", updatedAt: "2026-03-01" },
];

const DEMO_PROGRESS: ProgressStats = {
  totalPartnersStarted: 24,
  totalModules: 7,
  avgCompletion: 58,
  fullyCompleted: 8,
  moduleStats: [
    { moduleId: "dm-1", moduleTitle: "Welcome to TRLN", started: 24, completed: 22, totalPartners: 24, completionPercentage: 92 },
    { moduleId: "dm-2", moduleTitle: "Understanding Tariff Relief", started: 20, completed: 18, totalPartners: 24, completionPercentage: 75 },
    { moduleId: "dm-3", moduleTitle: "Partner Portal Walkthrough", started: 19, completed: 17, totalPartners: 24, completionPercentage: 71 },
    { moduleId: "dm-4", moduleTitle: "Lead Qualification Process", started: 16, completed: 14, totalPartners: 24, completionPercentage: 58 },
    { moduleId: "dm-5", moduleTitle: "Commission Structure & Tiers", started: 15, completed: 13, totalPartners: 24, completionPercentage: 54 },
    { moduleId: "dm-6", moduleTitle: "Client Onboarding Best Practices", started: 12, completed: 10, totalPartners: 24, completionPercentage: 42 },
    { moduleId: "dm-7", moduleTitle: "Using the CRM Tools", started: 10, completed: 8, totalPartners: 24, completionPercentage: 33 },
  ],
};

// ─── CATEGORY OPTIONS ───────────────────────────────────────────────────────

const MODULE_CATEGORIES = ["onboarding", "sales", "product", "tools"] as const;
const RESOURCE_FILE_TYPES = ["pdf", "checklist", "template", "guide"] as const;
const FAQ_CATEGORIES = ["general", "commissions", "leads", "technical"] as const;

const categoryBadge: Record<string, string> = {
  onboarding: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  sales: "bg-green-500/10 text-green-400 border border-green-500/20",
  product: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  tools: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  general: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  commissions: "bg-green-500/10 text-green-400 border border-green-500/20",
  leads: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  technical: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
  pdf: "bg-red-500/10 text-red-400 border border-red-500/20",
  checklist: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  template: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
  guide: "bg-green-500/10 text-green-400 border border-green-500/20",
};

// ─── VIEW TABS ──────────────────────────────────────────────────────────────

const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: "modules", label: "Modules" },
  { id: "progress", label: "Progress" },
  { id: "resources", label: "Resources" },
  { id: "faq", label: "FAQ" },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function AdminTrainingPage() {
  // Active view tab
  const [view, setView] = useState<ViewTab>("modules");

  // Data state
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [progressStats, setProgressStats] = useState<ProgressStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states for add/edit
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Module form fields
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("onboarding");
  const [formVideoUrl, setFormVideoUrl] = useState("");
  const [formDuration, setFormDuration] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formPublished, setFormPublished] = useState(true);

  // Resource form fields
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formFileType, setFormFileType] = useState("pdf");
  const [formFileSize, setFormFileSize] = useState("");
  const [formModuleId, setFormModuleId] = useState("");

  // FAQ form fields
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");

  // ─── DATA FETCHING ──────────────────────────────────────────────────────

  /** Fetch modules from admin API with demo fallback */
  const fetchModules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/training/modules");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setModules(data.modules || []);
    } catch {
      setModules(DEMO_MODULES);
    }
  }, []);

  /** Fetch resources from admin API with demo fallback */
  const fetchResources = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/training/resources");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setResources(data.resources || []);
    } catch {
      setResources(DEMO_RESOURCES);
    }
  }, []);

  /** Fetch FAQs from admin API with demo fallback */
  const fetchFaqs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/training/faq");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setFaqs(data.faqs || []);
    } catch {
      setFaqs(DEMO_FAQS);
    }
  }, []);

  /** Fetch progress stats from admin API with demo fallback */
  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/training/progress");
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setProgressStats(data);
    } catch {
      setProgressStats(DEMO_PROGRESS);
    }
  }, []);

  /** Load data based on current view */
  useEffect(() => {
    setLoading(true);
    const load = async () => {
      switch (view) {
        case "modules":
          await fetchModules();
          break;
        case "progress":
          await fetchProgress();
          break;
        case "resources":
          await fetchResources();
          // Also fetch modules for the module-select dropdown
          await fetchModules();
          break;
        case "faq":
          await fetchFaqs();
          break;
      }
      setLoading(false);
    };
    load();
  }, [view, fetchModules, fetchResources, fetchFaqs, fetchProgress]);

  // ─── FORM HELPERS ─────────────────────────────────────────────────────────

  /** Reset all form fields and close the form */
  const resetForm = () => {
    setShowForm(false);
    setEditingItem(null);
    setFormTitle("");
    setFormDescription("");
    setFormCategory("onboarding");
    setFormVideoUrl("");
    setFormDuration("");
    setFormContent("");
    setFormSortOrder(0);
    setFormPublished(true);
    setFormFileUrl("");
    setFormFileType("pdf");
    setFormFileSize("");
    setFormModuleId("");
    setFormQuestion("");
    setFormAnswer("");
  };

  /** Open the add form with blank fields */
  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  /** Open the edit form pre-filled with item data */
  const openEditForm = (item: any) => {
    setEditingItem(item);
    setShowForm(true);

    if (view === "modules") {
      setFormTitle(item.title || "");
      setFormDescription(item.description || "");
      setFormCategory(item.category || "onboarding");
      setFormVideoUrl(item.videoUrl || "");
      setFormDuration(item.duration || "");
      setFormContent(item.content || "");
      setFormSortOrder(item.sortOrder || 0);
      setFormPublished(item.published ?? true);
    } else if (view === "resources") {
      setFormTitle(item.title || "");
      setFormDescription(item.description || "");
      setFormFileUrl(item.fileUrl || "");
      setFormFileType(item.fileType || "pdf");
      setFormFileSize(item.fileSize || "");
      setFormModuleId(item.moduleId || "");
      setFormSortOrder(item.sortOrder || 0);
      setFormPublished(item.published ?? true);
    } else if (view === "faq") {
      setFormQuestion(item.question || "");
      setFormAnswer(item.answer || "");
      setFormCategory(item.category || "general");
      setFormSortOrder(item.sortOrder || 0);
      setFormPublished(item.published ?? true);
    }
  };

  // ─── CRUD OPERATIONS ──────────────────────────────────────────────────────

  /** Save module (create or update) */
  const saveModule = async () => {
    const body = {
      title: formTitle,
      description: formDescription || null,
      category: formCategory,
      videoUrl: formVideoUrl || null,
      duration: formDuration || null,
      content: formContent || null,
      sortOrder: formSortOrder,
      published: formPublished,
    };

    try {
      if (editingItem) {
        await fetch(`/api/admin/training/modules/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/training/modules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await fetchModules();
    } catch {
      // Silently fail — demo mode will keep showing existing data
    }
  };

  /** Save resource (create or update) */
  const saveResource = async () => {
    const body = {
      title: formTitle,
      description: formDescription || null,
      fileUrl: formFileUrl,
      fileType: formFileType,
      fileSize: formFileSize || null,
      moduleId: formModuleId || null,
      sortOrder: formSortOrder,
      published: formPublished,
    };

    try {
      if (editingItem) {
        await fetch(`/api/admin/training/resources/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/training/resources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await fetchResources();
    } catch {
      // Silently fail
    }
  };

  /** Save FAQ (create or update) */
  const saveFaq = async () => {
    const body = {
      question: formQuestion,
      answer: formAnswer,
      category: formCategory,
      sortOrder: formSortOrder,
      published: formPublished,
    };

    try {
      if (editingItem) {
        await fetch(`/api/admin/training/faq/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetch("/api/admin/training/faq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      resetForm();
      await fetchFaqs();
    } catch {
      // Silently fail
    }
  };

  /** Handle save based on current view */
  const handleSave = () => {
    if (view === "modules") saveModule();
    else if (view === "resources") saveResource();
    else if (view === "faq") saveFaq();
  };

  /** Toggle published status for any item type */
  const togglePublish = async (item: any) => {
    const endpoint =
      view === "modules"
        ? `/api/admin/training/modules/${item.id}`
        : view === "resources"
        ? `/api/admin/training/resources/${item.id}`
        : `/api/admin/training/faq/${item.id}`;

    try {
      await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !item.published }),
      });

      if (view === "modules") await fetchModules();
      else if (view === "resources") await fetchResources();
      else await fetchFaqs();
    } catch {
      // Silently fail
    }
  };

  /** Delete an item with confirmation */
  const handleDelete = async (item: any) => {
    const label =
      view === "modules"
        ? item.title
        : view === "resources"
        ? item.title
        : item.question;

    if (!confirm(`Are you sure you want to delete "${label}"?`)) return;

    const endpoint =
      view === "modules"
        ? `/api/admin/training/modules/${item.id}`
        : view === "resources"
        ? `/api/admin/training/resources/${item.id}`
        : `/api/admin/training/faq/${item.id}`;

    try {
      await fetch(endpoint, { method: "DELETE" });
      if (view === "modules") await fetchModules();
      else if (view === "resources") await fetchResources();
      else await fetchFaqs();
    } catch {
      // Silently fail
    }
  };

  // ─── COMPUTED STATS ───────────────────────────────────────────────────────

  const moduleStats = {
    total: modules.length,
    published: modules.filter((m) => m.published).length,
    unpublished: modules.filter((m) => !m.published).length,
    categories: new Set(modules.map((m) => m.category)).size,
  };

  const resourceStats = {
    total: resources.length,
    published: resources.filter((r) => r.published).length,
    fileTypes: new Set(resources.map((r) => r.fileType)).size,
  };

  const faqStats = {
    total: faqs.length,
    published: faqs.filter((f) => f.published).length,
    categories: new Set(faqs.map((f) => f.category)).size,
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page Header */}
      <h2 className="font-display text-[22px] font-bold mb-1.5">
        Training Management
      </h2>
      <p className="font-body text-[13px] text-[var(--app-text-muted)] mb-6">
        Manage training modules, resources, FAQs, and monitor partner progress.
      </p>

      {/* View Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setView(tab.id);
              resetForm();
            }}
            className={`font-body text-sm px-4 py-1.5 rounded-full whitespace-nowrap transition ${
              view === tab.id
                ? "bg-brand-gold/20 text-brand-gold"
                : "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="font-body text-sm text-[var(--app-text-muted)]">Loading...</div>
        </div>
      )}

      {/* ═══ MODULES VIEW ═══ */}
      {!loading && view === "modules" && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Modules", value: moduleStats.total },
              { label: "Published", value: moduleStats.published },
              { label: "Unpublished", value: moduleStats.unpublished },
              { label: "Categories", value: moduleStats.categories },
            ].map((s) => (
              <div key={s.label} className="card p-4 sm:p-5">
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
                  {s.label}
                </div>
                <div className="font-display text-xl font-bold text-brand-gold">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Add Button */}
          {!showForm && (
            <div className="flex justify-end mb-4">
              <button
                onClick={openAddForm}
                className="btn-gold font-body text-sm px-4 py-2 rounded-lg"
              >
                + Add Module
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="card p-4 sm:p-6 mb-6">
              <h3 className="font-display text-base font-bold mb-4">
                {editingItem ? "Edit Module" : "Add New Module"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Title */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="Module title"
                  />
                </div>
                {/* Category */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  >
                    {MODULE_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-[#1a1a2e]">
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Video URL */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Video URL
                  </label>
                  <input
                    type="text"
                    value={formVideoUrl}
                    onChange={(e) => setFormVideoUrl(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
                {/* Duration */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="e.g., 12 min"
                  />
                </div>
                {/* Sort Order */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  />
                </div>
                {/* Published */}
                <div className="flex items-center gap-3 pt-6">
                  <label className="font-body text-[13px] text-[var(--app-text-secondary)]">Published</label>
                  <button
                    type="button"
                    onClick={() => setFormPublished(!formPublished)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formPublished ? "bg-brand-gold" : "bg-[var(--app-input-bg)]"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formPublished ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
              {/* Description */}
              <div className="mt-4">
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none resize-none"
                  placeholder="Brief description of the module"
                />
              </div>
              {/* Content */}
              <div className="mt-4">
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                  Content (Markdown)
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={4}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none resize-none"
                  placeholder="Module content in markdown..."
                />
              </div>
              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSave}
                  className="btn-gold font-body text-sm px-5 py-2 rounded-lg"
                >
                  {editingItem ? "Update Module" : "Create Module"}
                </button>
                <button
                  onClick={resetForm}
                  className="font-body text-sm px-5 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Title
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Category
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Duration
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Published
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Sort
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <tr
                    key={mod.id}
                    className="border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition"
                  >
                    <td className="px-4 sm:px-6 py-3">
                      <div className="font-medium text-[var(--app-text)]">{mod.title}</div>
                      {mod.description && (
                        <div className="text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-1">
                          {mod.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full capitalize ${
                          categoryBadge[mod.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                        }`}
                      >
                        {mod.category}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[var(--app-text-secondary)]">
                      {mod.duration || "—"}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${
                          mod.published
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {mod.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[var(--app-text-secondary)]">
                      {mod.sortOrder}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditForm(mod)}
                          className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => togglePublish(mod)}
                          className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                        >
                          {mod.published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          onClick={() => handleDelete(mod)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {modules.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 sm:px-6 py-8 text-center text-[var(--app-text-muted)] text-sm"
                    >
                      No modules found. Click &ldquo;Add Module&rdquo; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col gap-3">
            {modules.map((mod) => (
              <div key={mod.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-body text-sm font-medium text-[var(--app-text)]">
                      {mod.title}
                    </div>
                    {mod.description && (
                      <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-2">
                        {mod.description}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ml-2 ${
                      categoryBadge[mod.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {mod.category}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
                  {mod.duration && <span>{mod.duration}</span>}
                  <span>&middot;</span>
                  <span>Sort: {mod.sortOrder}</span>
                  <span>&middot;</span>
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                      mod.published
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {mod.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => openEditForm(mod)}
                    className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePublish(mod)}
                    className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    {mod.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => handleDelete(mod)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ PROGRESS VIEW ═══ */}
      {!loading && view === "progress" && progressStats && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Partners Started Training", value: progressStats.totalPartnersStarted },
              { label: "Average Completion", value: `${progressStats.avgCompletion}%` },
              { label: "Fully Completed", value: progressStats.fullyCompleted },
            ].map((s) => (
              <div key={s.label} className="card p-4 sm:p-5">
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
                  {s.label}
                </div>
                <div className="font-display text-xl font-bold text-brand-gold">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Per-Module Progress */}
          <div className="card p-4 sm:p-6">
            <h3 className="font-display text-base font-bold mb-4">
              Per-Module Completion
            </h3>
            <div className="space-y-4">
              {[...progressStats.moduleStats]
                .sort((a, b) => b.completionPercentage - a.completionPercentage)
                .map((stat) => (
                  <div key={stat.moduleId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-body text-[13px] text-[var(--app-text)]">
                        {stat.moduleTitle}
                      </span>
                      <span className="font-body text-[12px] text-[var(--app-text-secondary)]">
                        {stat.completed}/{stat.totalPartners} completed ({stat.completionPercentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-brand-gold/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-gold to-[#e8c060] transition-all duration-500"
                        style={{ width: `${stat.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              {progressStats.moduleStats.length === 0 && (
                <div className="text-center text-[var(--app-text-muted)] text-sm py-8">
                  No training progress data available yet.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══ RESOURCES VIEW ═══ */}
      {!loading && view === "resources" && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Resources", value: resourceStats.total },
              { label: "Published", value: resourceStats.published },
              { label: "File Types", value: resourceStats.fileTypes },
            ].map((s) => (
              <div key={s.label} className="card p-4 sm:p-5">
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
                  {s.label}
                </div>
                <div className="font-display text-xl font-bold text-brand-gold">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Add Button */}
          {!showForm && (
            <div className="flex justify-end mb-4">
              <button
                onClick={openAddForm}
                className="btn-gold font-body text-sm px-4 py-2 rounded-lg"
              >
                + Add Resource
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="card p-4 sm:p-6 mb-6">
              <h3 className="font-display text-base font-bold mb-4">
                {editingItem ? "Edit Resource" : "Add New Resource"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Title */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="Resource title"
                  />
                </div>
                {/* File Type */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    File Type
                  </label>
                  <select
                    value={formFileType}
                    onChange={(e) => setFormFileType(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  >
                    {RESOURCE_FILE_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-[#1a1a2e]">
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* File URL */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    File URL
                  </label>
                  <input
                    type="text"
                    value={formFileUrl}
                    onChange={(e) => setFormFileUrl(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="/docs/file.pdf"
                  />
                </div>
                {/* File Size */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    File Size
                  </label>
                  <input
                    type="text"
                    value={formFileSize}
                    onChange={(e) => setFormFileSize(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="e.g., 1.2 MB"
                  />
                </div>
                {/* Module (optional) */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Module (optional)
                  </label>
                  <select
                    value={formModuleId}
                    onChange={(e) => setFormModuleId(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  >
                    <option value="" className="bg-[#1a1a2e]">
                      None (General Resource)
                    </option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#1a1a2e]">
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Sort Order */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  />
                </div>
              </div>
              {/* Description */}
              <div className="mt-4">
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none resize-none"
                  placeholder="Brief description of the resource"
                />
              </div>
              {/* Published Toggle */}
              <div className="flex items-center gap-3 mt-4">
                <label className="font-body text-[13px] text-[var(--app-text-secondary)]">Published</label>
                <button
                  type="button"
                  onClick={() => setFormPublished(!formPublished)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formPublished ? "bg-brand-gold" : "bg-[var(--app-input-bg)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formPublished ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSave}
                  className="btn-gold font-body text-sm px-5 py-2 rounded-lg"
                >
                  {editingItem ? "Update Resource" : "Create Resource"}
                </button>
                <button
                  onClick={resetForm}
                  className="font-body text-sm px-5 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Title
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Type
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    File Size
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Published
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {resources.map((res) => (
                  <tr
                    key={res.id}
                    className="border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition"
                  >
                    <td className="px-4 sm:px-6 py-3">
                      <div className="font-medium text-[var(--app-text)]">{res.title}</div>
                      {res.description && (
                        <div className="text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-1">
                          {res.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full capitalize ${
                          categoryBadge[res.fileType] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                        }`}
                      >
                        {res.fileType}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[var(--app-text-secondary)]">
                      {res.fileSize || "—"}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${
                          res.published
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {res.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditForm(res)}
                          className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => togglePublish(res)}
                          className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                        >
                          {res.published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          onClick={() => handleDelete(res)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {resources.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 sm:px-6 py-8 text-center text-[var(--app-text-muted)] text-sm"
                    >
                      No resources found. Click &ldquo;Add Resource&rdquo; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col gap-3">
            {resources.map((res) => (
              <div key={res.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-body text-sm font-medium text-[var(--app-text)]">
                      {res.title}
                    </div>
                    {res.description && (
                      <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-2">
                        {res.description}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ml-2 ${
                      categoryBadge[res.fileType] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {res.fileType}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
                  {res.fileSize && <span>{res.fileSize}</span>}
                  <span>&middot;</span>
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                      res.published
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {res.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => openEditForm(res)}
                    className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePublish(res)}
                    className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    {res.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => handleDelete(res)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ FAQ VIEW ═══ */}
      {!loading && view === "faq" && (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total FAQs", value: faqStats.total },
              { label: "Published", value: faqStats.published },
              { label: "Categories", value: faqStats.categories },
            ].map((s) => (
              <div key={s.label} className="card p-4 sm:p-5">
                <div className="font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1">
                  {s.label}
                </div>
                <div className="font-display text-xl font-bold text-brand-gold">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Add Button */}
          {!showForm && (
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  resetForm();
                  setFormCategory("general");
                  setShowForm(true);
                }}
                className="btn-gold font-body text-sm px-4 py-2 rounded-lg"
              >
                + Add FAQ
              </button>
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="card p-4 sm:p-6 mb-6">
              <h3 className="font-display text-base font-bold mb-4">
                {editingItem ? "Edit FAQ" : "Add New FAQ"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Question */}
                <div className="sm:col-span-2">
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Question
                  </label>
                  <input
                    type="text"
                    value={formQuestion}
                    onChange={(e) => setFormQuestion(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                    placeholder="Enter the question"
                  />
                </div>
                {/* Category */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  >
                    {FAQ_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-[#1a1a2e]">
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Sort Order */}
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none"
                  />
                </div>
              </div>
              {/* Answer */}
              <div className="mt-4">
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider mb-1.5">
                  Answer (Markdown supported)
                </label>
                <textarea
                  value={formAnswer}
                  onChange={(e) => setFormAnswer(e.target.value)}
                  rows={4}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 text-[var(--app-text)] font-body text-[13px] focus:border-brand-gold/50 focus:outline-none resize-none"
                  placeholder="Enter the answer..."
                />
              </div>
              {/* Published Toggle */}
              <div className="flex items-center gap-3 mt-4">
                <label className="font-body text-[13px] text-[var(--app-text-secondary)]">Published</label>
                <button
                  type="button"
                  onClick={() => setFormPublished(!formPublished)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formPublished ? "bg-brand-gold" : "bg-[var(--app-input-bg)]"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formPublished ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {/* Actions */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSave}
                  className="btn-gold font-body text-sm px-5 py-2 rounded-lg"
                >
                  {editingItem ? "Update FAQ" : "Create FAQ"}
                </button>
                <button
                  onClick={resetForm}
                  className="font-body text-sm px-5 py-2 rounded-lg border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:text-[var(--app-text-secondary)] hover:border-[var(--app-border)] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Desktop Table */}
          <div className="hidden md:block card overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)]">
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Question
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Category
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Published
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Sort
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-[11px] text-[var(--app-text-muted)] uppercase tracking-wider font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq) => (
                  <tr
                    key={faq.id}
                    className="border-b border-[var(--app-border)] hover:bg-[var(--app-card-bg)] transition"
                  >
                    <td className="px-4 sm:px-6 py-3 max-w-xs">
                      <div className="font-medium text-[var(--app-text)] truncate">
                        {faq.question}
                      </div>
                      <div className="text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-1">
                        {faq.answer}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full capitalize ${
                          categoryBadge[faq.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                        }`}
                      >
                        {faq.category}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <span
                        className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${
                          faq.published
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {faq.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-[var(--app-text-secondary)]">
                      {faq.sortOrder}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => openEditForm(faq)}
                          className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => togglePublish(faq)}
                          className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                        >
                          {faq.published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          onClick={() => handleDelete(faq)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {faqs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 sm:px-6 py-8 text-center text-[var(--app-text-muted)] text-sm"
                    >
                      No FAQs found. Click &ldquo;Add FAQ&rdquo; to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col gap-3">
            {faqs.map((faq) => (
              <div key={faq.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-medium text-[var(--app-text)] line-clamp-2">
                      {faq.question}
                    </div>
                    <div className="font-body text-xs text-[var(--app-text-muted)] mt-0.5 line-clamp-2">
                      {faq.answer}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ml-2 ${
                      categoryBadge[faq.category] || "bg-[var(--app-input-bg)] text-[var(--app-text-secondary)]"
                    }`}
                  >
                    {faq.category}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-secondary)] mb-3">
                  <span>Sort: {faq.sortOrder}</span>
                  <span>&middot;</span>
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                      faq.published
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {faq.published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => openEditForm(faq)}
                    className="text-xs text-brand-gold/60 hover:text-brand-gold transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => togglePublish(faq)}
                    className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)] transition"
                  >
                    {faq.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => handleDelete(faq)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
