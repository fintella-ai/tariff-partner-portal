"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback, Suspense } from "react";
import WidgetDashboard from "@/components/widget/WidgetDashboard";
import WidgetCalculator from "@/components/widget/WidgetCalculator";
import WidgetReferralForm from "@/components/widget/WidgetReferralForm";
import WidgetHowItWorks from "@/components/widget/WidgetHowItWorks";

interface AuthData {
  token: string;
  partnerName: string;
  partnerCode: string;
  commissionRate: number;
}

type Tab = "dashboard" | "calc" | "refer" | "how";

function WidgetContent() {
  const searchParams = useSearchParams();
  const apiKey = searchParams.get("apiKey");
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [referralPrefill, setReferralPrefill] = useState<{
    estimatedImportValue?: string;
    importDateRange?: string;
  } | null>(null);

  const handleCalcToReferral = (data: { estimatedImportValue: string; importDateRange: string }) => {
    setReferralPrefill(data);
    setTab("refer");
  };

  const authenticate = useCallback(async () => {
    if (!apiKey) {
      setError("No API key provided");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/widget/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.error || "Authentication failed");
        setLoading(false);
        return;
      }
      setAuth({
        token: data.token,
        partnerName: data.partnerName,
        partnerCode: data.partnerCode,
        commissionRate: data.commissionRate,
      });
    } catch {
      setError("Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    authenticate();
  }, [authenticate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Widget Not Authorized</h2>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!auth) return null;

  const rate = Math.round(auth.commissionRate * 100);

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "calc", label: "Calculator" },
    { id: "refer", label: "Refer" },
    { id: "how", label: "Info" },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold text-lg">F</span>
          <span className="font-semibold text-sm">{auth.partnerName}</span>
        </div>
        <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
          {rate}% commission
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === t.id
                ? "text-amber-600 border-b-2 border-amber-500 bg-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "dashboard" && (
          <WidgetDashboard token={auth.token} onReferClick={() => setTab("refer")} />
        )}
        {tab === "calc" && (
          <WidgetCalculator
            token={auth.token}
            commissionRate={rate}
            onSubmitAsReferral={handleCalcToReferral}
          />
        )}
        {tab === "refer" && (
          <WidgetReferralForm
            token={auth.token}
            commissionRate={rate}
            prefill={referralPrefill}
            onPrefillConsumed={() => setReferralPrefill(null)}
          />
        )}
        {tab === "how" && <WidgetHowItWorks commissionRate={rate} />}
      </div>
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
        </div>
      }
    >
      <WidgetContent />
    </Suspense>
  );
}
