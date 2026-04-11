"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function ImpersonateContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState("Validating...");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) { setError("No impersonation token provided."); return; }

    (async () => {
      try {
        // Validate and consume the token
        const res = await fetch(`/api/admin/impersonate?token=${token}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "Invalid token");
          return;
        }

        const { partnerCode, email } = await res.json();
        setStatus(`Signing in as ${partnerCode}...`);

        // Sign in as the partner using the partner-login provider
        const result = await signIn("partner-login", {
          email,
          partnerCode,
          redirect: false,
        });

        if (result?.error) {
          setError("Failed to sign in as partner.");
          return;
        }

        // Redirect to partner dashboard
        window.location.href = "/dashboard/home";
      } catch {
        setError("Failed to impersonate partner.");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="text-center">
        {error ? (
          <>
            <div className="text-red-400 text-4xl mb-4">!</div>
            <div className="font-body text-sm text-red-400 mb-4">{error}</div>
            <a href="/login" className="font-body text-sm text-brand-gold hover:underline">Go to login</a>
          </>
        ) : (
          <>
            <div className="spinner mx-auto mb-4" />
            <div className="font-body text-sm theme-text-muted">{status}</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}><div className="spinner mx-auto" /></div>}>
      <ImpersonateContent />
    </Suspense>
  );
}
