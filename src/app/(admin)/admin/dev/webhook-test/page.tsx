"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The webhook test harness has moved into the main Development page
 * under the "Webhook Test" tab. Redirect automatically.
 */
export default function WebhookTestRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin/dev"); }, [router]);
  return (
    <div className="card p-12 text-center">
      <div className="font-body text-sm theme-text-muted">Redirecting to Development → Webhook Test…</div>
    </div>
  );
}
