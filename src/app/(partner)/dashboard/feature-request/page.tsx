"use client";

import { useState, useEffect } from "react";
import { useDevice } from "@/lib/useDevice";

interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "Submitted" },
  in_review: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", label: "In Review" },
  in_progress: { bg: "bg-yellow-500/10 border-yellow-500/20", text: "text-yellow-400", label: "In Progress" },
  completed: { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400", label: "Completed" },
  rejected: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "Not Planned" },
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-[var(--app-text-muted)]",
  normal: "text-blue-400",
  high: "text-yellow-400",
  urgent: "text-red-400",
};

const CATEGORIES = [
  { value: "feature", label: "New Feature" },
  { value: "ui", label: "UI / UX Improvement" },
  { value: "bug", label: "Bug Report" },
  { value: "integration", label: "Integration Request" },
  { value: "other", label: "Other" },
];

export default function FeatureRequestPage() {
  const device = useDevice();
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("feature");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await fetch("/api/feature-requests");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadRequests(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/feature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, priority, category }),
      });
      if (res.ok) {
        setSuccess(true);
        setTitle("");
        setDescription("");
        setPriority("normal");
        setCategory("feature");
        loadRequests();
        setTimeout(() => {
          setSuccess(false);
          setShowForm(false);
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit request.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      {/* Header + CTA */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-[1px] uppercase mb-1">
            Feedback & Ideas
          </div>
          <h2 className={`font-display ${device.isMobile ? "text-xl" : "text-2xl"} font-bold mb-1`}>
            Feature Requests
          </h2>
          <p className="font-body text-[12px] text-[var(--app-text-muted)]">
            Help shape the portal — submit ideas, improvements, or report issues.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="font-body text-[12px] font-semibold tracking-wider bg-brand-gold/15 border border-brand-gold/30 text-brand-gold rounded-lg px-4 py-2.5 hover:bg-brand-gold/25 transition-all min-h-[44px]"
          >
            ✨ New Request
          </button>
        )}
      </div>

      {/* New Request Form */}
      {showForm && (
        <div className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold">Submit a New Request</h3>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="text-[var(--app-text-muted)] hover:text-[var(--app-text)] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--app-input-bg)] transition-colors"
            >
              ✕
            </button>
          </div>

          {success ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
              <div className="text-green-400 font-body text-sm font-semibold mb-1">✓ Request Submitted</div>
              <div className="text-[var(--app-text-muted)] font-body text-[12px]">Thank you! We&apos;ll review it shortly.</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase mb-1.5">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Add CSV export to commissions"
                  maxLength={120}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors"
                />
              </div>

              <div>
                <label className="block font-body text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase mb-1.5">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the feature, what problem it solves, and how you imagine it working..."
                  rows={5}
                  className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/30 transition-colors resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/30"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-body text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-[var(--app-input-bg)] border border-[var(--app-border)] rounded-lg px-3 py-2.5 font-body text-[13px] text-[var(--app-text)] outline-none focus:border-brand-gold/30"
                  >
                    <option value="low">Low — nice to have</option>
                    <option value="normal">Normal</option>
                    <option value="high">High — important</option>
                    <option value="urgent">Urgent — blocking work</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 font-body text-[12px]">{error}</div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-brand-gold/20 border border-brand-gold/30 text-brand-gold rounded-lg py-3 font-body text-sm font-semibold hover:bg-brand-gold/30 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(""); }}
                  className="border border-[var(--app-border)] rounded-lg py-3 px-5 font-body text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Requests List */}
      <div>
        <div className="font-body text-[11px] text-[var(--app-text-muted)] tracking-wider uppercase mb-3">Your Submissions</div>
        {loading ? (
          <div className="text-center py-12 font-body text-sm text-[var(--app-text-muted)]">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="bg-[var(--app-card-bg)] border border-dashed border-[var(--app-border)] rounded-xl p-10 text-center">
            <div className="text-4xl mb-2">💡</div>
            <div className="font-body text-sm text-[var(--app-text-secondary)] mb-1">No requests yet</div>
            <div className="font-body text-[12px] text-[var(--app-text-muted)]">Got an idea? Click &ldquo;New Request&rdquo; to share it.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {requests.map((req) => {
              const statusStyle = STATUS_STYLES[req.status] || STATUS_STYLES.submitted;
              return (
                <div key={req.id} className="bg-[var(--app-card-bg)] border border-[var(--app-border)] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-[14px] font-semibold text-[var(--app-text)] mb-1">{req.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-body text-[10px] ${statusStyle.bg} border ${statusStyle.text} rounded-full px-2 py-0.5`}>
                          {statusStyle.label}
                        </span>
                        {req.category && (
                          <span className="font-body text-[10px] text-[var(--app-text-muted)] uppercase tracking-wider">
                            {CATEGORIES.find((c) => c.value === req.category)?.label || req.category}
                          </span>
                        )}
                        <span className={`font-body text-[10px] uppercase tracking-wider ${PRIORITY_STYLES[req.priority] || ""}`}>
                          · {req.priority}
                        </span>
                      </div>
                    </div>
                    <div className="font-body text-[10px] text-[var(--app-text-muted)] whitespace-nowrap">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="font-body text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {req.description}
                  </div>
                  {req.adminNotes && (
                    <div className="mt-3 pt-3 border-t border-[var(--app-border)]">
                      <div className="font-body text-[10px] text-brand-gold tracking-wider uppercase mb-1">Admin Response</div>
                      <div className="font-body text-[12px] text-[var(--app-text-secondary)] whitespace-pre-wrap">{req.adminNotes}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
