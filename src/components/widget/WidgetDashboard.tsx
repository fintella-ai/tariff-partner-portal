"use client";

import { useState, useEffect } from "react";

interface Stats {
  totalReferrals: number;
  pendingReferrals: number;
  convertedReferrals: number;
  totalCommissionsEarned: number;
  pendingCommissions: number;
  recentReferrals: {
    clientCompanyName: string;
    status: string;
    createdAt: string;
    estimatedImportValue: string | null;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  converted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function WidgetDashboard({
  token,
  onReferClick,
}: {
  token: string;
  onReferClick: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/widget/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return <div className="p-4 text-center text-sm text-gray-500">Failed to load stats</div>;
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">Referred</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{fmt(stats.totalCommissionsEarned)}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">Earned</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600">{fmt(stats.pendingCommissions)}</div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mt-1">Pending</div>
        </div>
      </div>

      <button
        onClick={onReferClick}
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm"
      >
        Refer a Client →
      </button>

      {stats.recentReferrals.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Recent Referrals
          </h3>
          <div className="space-y-1.5">
            {stats.recentReferrals.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{r.clientCompanyName}</div>
                  <div className="text-[10px] text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.estimatedImportValue ? ` · ${r.estimatedImportValue}` : ""}
                  </div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ml-2 ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
