"use client";

/**
 * AdminHeartbeatPinger — mounts invisibly from the admin layout and POSTs to
 * /api/admin/heartbeat every 60 seconds while the tab is visible. When the
 * tab is hidden (Page Visibility API), we pause to avoid pointless writes.
 * Phase 3c.4a of the PartnerOS AI roadmap (spec §5.3).
 *
 * Fires once immediately on mount so a fresh admin tab-open immediately
 * shows as online without waiting for the first 60s tick.
 *
 * Renders nothing — purely a side-effect component.
 */
import { useEffect } from "react";

const PING_INTERVAL_MS = 60_000;

export default function AdminHeartbeatPinger() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function ping() {
      if (cancelled) return;
      try {
        await fetch("/api/admin/heartbeat", { method: "POST" });
      } catch {
        // Silent — a missed heartbeat is self-healing; next tick retries.
      }
    }

    function start() {
      if (timer) return;
      ping();
      timer = setInterval(ping, PING_INTERVAL_MS);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
