"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function UnsubscribePage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [status, setStatus] = useState<"loading" | "done" | "error" | "idle">(email ? "loading" : "idle");
  const [inputEmail, setInputEmail] = useState(email);

  useEffect(() => {
    if (email) {
      fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
        .then((r) => setStatus(r.ok ? "done" : "error"))
        .catch(() => setStatus("error"));
    }
  }, [email]);

  async function handleManual() {
    if (!inputEmail.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inputEmail.trim() }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#060a14] text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <Link href="/" className="font-display text-2xl mb-8 block" style={{ color: "#c4a050" }}>Fintella</Link>

        {status === "done" ? (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="font-display text-xl mb-2">You&apos;ve Been Unsubscribed</h1>
            <p className="text-sm text-white/50 mb-6">
              {email || inputEmail} has been removed from our mailing list. You won&apos;t receive any more emails from us.
            </p>
            <p className="text-xs text-white/30">If this was a mistake, contact us at support@fintella.partners</p>
          </>
        ) : status === "loading" ? (
          <>
            <div className="text-5xl mb-4">⏳</div>
            <h1 className="font-display text-xl mb-2">Processing...</h1>
            <p className="text-sm text-white/50">Removing your email from our list.</p>
          </>
        ) : status === "error" ? (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="font-display text-xl mb-2">Something Went Wrong</h1>
            <p className="text-sm text-white/50 mb-4">Please try again or email support@fintella.partners to be removed.</p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">📧</div>
            <h1 className="font-display text-xl mb-2">Unsubscribe</h1>
            <p className="text-sm text-white/50 mb-6">Enter your email to unsubscribe from Fintella communications.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c4a050]/40"
              />
              <button
                onClick={handleManual}
                className="px-4 py-3 rounded-xl font-semibold text-sm text-black"
                style={{ background: "#c4a050" }}
              >
                Unsubscribe
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
