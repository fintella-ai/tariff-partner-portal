"use client";

import { useCallback, useEffect, useState } from "react";

interface FaqCandidate {
  id: string;
  conversationId: string;
  partnerCode: string;
  question: string;
  answer: string;
  suggestedCategory: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdFaqId: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "commissions", label: "Commissions" },
  { value: "leads", label: "Leads" },
  { value: "technical", label: "Technical" },
  { value: "tariff_refunds", label: "Tariff Refunds" },
];

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "dismissed", label: "Dismissed" },
];

export default function FaqCandidatesPage() {
  const [tab, setTab] = useState("pending");
  const [candidates, setCandidates] = useState<FaqCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editState, setEditState] = useState<
    Record<string, { question: string; answer: string; category: string }>
  >({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {}
  );

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/faq-candidates?status=${tab}&page=${page}`
      );
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.candidates);
        setTotal(data.total);
        setPages(data.pages);
        // Initialize edit state for each candidate
        const edits: Record<
          string,
          { question: string; answer: string; category: string }
        > = {};
        for (const c of data.candidates) {
          edits[c.id] = {
            question: c.question,
            answer: c.answer,
            category: c.suggestedCategory || "general",
          };
        }
        setEditState(edits);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  async function handleAction(
    id: string,
    action: "approve" | "dismiss"
  ) {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      const edit = editState[id];
      const res = await fetch(`/api/admin/faq-candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "approve" && edit
            ? {
                question: edit.question,
                answer: edit.answer,
                category: edit.category,
              }
            : {}),
        }),
      });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
        setTotal((t) => t - 1);
      }
    } catch {
      // silent
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  }

  function updateEdit(
    id: string,
    field: "question" | "answer" | "category",
    value: string
  ) {
    setEditState((s) => ({
      ...s,
      [id]: { ...s[id], [field]: value },
    }));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold" style={{ color: "var(--app-text)" }}>
          FAQ Candidates
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          AI conversations that produced good Q&A pairs. Review, edit, and
          approve to publish as FAQs.
        </p>
      </div>

      {/* Stats */}
      <div
        className="rounded-lg border px-4 py-3 mb-6 text-sm font-body"
        style={{
          background: "var(--app-card-bg)",
          borderColor: "var(--app-border)",
          color: "var(--app-text)",
        }}
      >
        {tab === "pending" ? (
          <span>
            <strong className="text-brand-gold">{total}</strong> pending
            candidate{total !== 1 ? "s" : ""} awaiting review
          </span>
        ) : (
          <span>
            {total} {tab} candidate{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className="px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors"
            style={{
              background:
                tab === t.value
                  ? "var(--app-accent, #c8a45a)"
                  : "var(--app-card-bg)",
              color:
                tab === t.value ? "#fff" : "var(--app-text-muted)",
              borderColor: "var(--app-border)",
              border: tab === t.value ? "none" : "1px solid var(--app-border)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="text-center py-12 text-sm font-body"
          style={{ color: "var(--app-text-muted)" }}
        >
          Loading candidates...
        </div>
      )}

      {/* Empty state */}
      {!loading && candidates.length === 0 && (
        <div
          className="rounded-lg border text-center py-12"
          style={{
            background: "var(--app-card-bg)",
            borderColor: "var(--app-border)",
            color: "var(--app-text-muted)",
          }}
        >
          <p className="text-sm font-body">
            No {tab} FAQ candidates found.
          </p>
        </div>
      )}

      {/* Candidate cards */}
      <div className="space-y-4">
        {candidates.map((c) => {
          const edit = editState[c.id];
          const isActioning = actionLoading[c.id];
          const isPending = tab === "pending";

          return (
            <div
              key={c.id}
              className="rounded-lg border p-5"
              style={{
                background: "var(--app-card-bg)",
                borderColor: "var(--app-border)",
              }}
            >
              {/* Header: partner code + timestamp */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-xs font-body font-medium px-2 py-0.5 rounded"
                  style={{
                    background: "var(--app-bg-secondary, #1a1a2e)",
                    color: "var(--app-text-muted)",
                  }}
                >
                  Partner: {c.partnerCode}
                </span>
                <span
                  className="text-xs font-body"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {new Date(c.createdAt).toLocaleDateString()} at{" "}
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              </div>

              {/* Category selector */}
              <div className="mb-3">
                <label
                  className="text-xs font-body font-medium mb-1 block"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Category
                </label>
                {isPending && edit ? (
                  <select
                    value={edit.category}
                    onChange={(e) =>
                      updateEdit(c.id, "category", e.target.value)
                    }
                    className="text-sm font-body rounded-md border px-3 py-1.5 w-full max-w-xs"
                    style={{
                      background: "var(--app-bg-secondary, #0d0d1a)",
                      borderColor: "var(--app-border)",
                      color: "var(--app-text)",
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className="text-sm font-body"
                    style={{ color: "var(--app-text)" }}
                  >
                    {CATEGORIES.find(
                      (cat) =>
                        cat.value === (c.suggestedCategory || "general")
                    )?.label || c.suggestedCategory}
                  </span>
                )}
              </div>

              {/* Question */}
              <div className="mb-3">
                <label
                  className="text-xs font-body font-medium mb-1 block"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Question
                </label>
                {isPending && edit ? (
                  <textarea
                    value={edit.question}
                    onChange={(e) =>
                      updateEdit(c.id, "question", e.target.value)
                    }
                    rows={2}
                    className="w-full text-sm font-body rounded-md border px-3 py-2 resize-y"
                    style={{
                      background: "var(--app-bg-secondary, #0d0d1a)",
                      borderColor: "var(--app-border)",
                      color: "var(--app-text)",
                    }}
                  />
                ) : (
                  <p
                    className="text-sm font-body"
                    style={{ color: "var(--app-text)" }}
                  >
                    {c.question}
                  </p>
                )}
              </div>

              {/* Answer */}
              <div className="mb-4">
                <label
                  className="text-xs font-body font-medium mb-1 block"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Answer
                </label>
                {isPending && edit ? (
                  <textarea
                    value={edit.answer}
                    onChange={(e) =>
                      updateEdit(c.id, "answer", e.target.value)
                    }
                    rows={4}
                    className="w-full text-sm font-body rounded-md border px-3 py-2 resize-y"
                    style={{
                      background: "var(--app-bg-secondary, #0d0d1a)",
                      borderColor: "var(--app-border)",
                      color: "var(--app-text)",
                    }}
                  />
                ) : (
                  <p
                    className="text-sm font-body whitespace-pre-wrap"
                    style={{ color: "var(--app-text)" }}
                  >
                    {c.answer}
                  </p>
                )}
              </div>

              {/* Approved metadata */}
              {c.status === "approved" && c.approvedBy && (
                <div
                  className="text-xs font-body mb-3"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Approved by {c.approvedBy} on{" "}
                  {c.approvedAt
                    ? new Date(c.approvedAt).toLocaleDateString()
                    : "N/A"}
                </div>
              )}

              {/* Actions */}
              {isPending && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(c.id, "approve")}
                    disabled={isActioning}
                    className="px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors disabled:opacity-50"
                    style={{
                      background: "#22c55e",
                      color: "#fff",
                    }}
                  >
                    {isActioning ? "..." : "Approve → Create FAQ"}
                  </button>
                  <button
                    onClick={() => handleAction(c.id, "dismiss")}
                    disabled={isActioning}
                    className="px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors disabled:opacity-50"
                    style={{
                      background: "var(--app-bg-secondary, #1a1a2e)",
                      color: "var(--app-text-muted)",
                      border: "1px solid var(--app-border)",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-md text-sm font-body border disabled:opacity-40 transition-colors"
            style={{
              background: "var(--app-card-bg)",
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Previous
          </button>
          <span
            className="text-sm font-body"
            style={{ color: "var(--app-text-muted)" }}
          >
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            className="px-3 py-1.5 rounded-md text-sm font-body border disabled:opacity-40 transition-colors"
            style={{
              background: "var(--app-card-bg)",
              borderColor: "var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
