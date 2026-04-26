"use client";

/**
 * AdminPresenceBar — compact horizontal bar showing online admin avatars with
 * green/red presence dots. Polls /api/admin/presence every 30 seconds.
 *
 * Features:
 * - Initials circle with green (online) or gray (offline) indicator dot
 * - Blue dot for Live Chat availability
 * - Tooltip with name + status
 * - Online admins sorted first
 * - "X/Y online" count
 *
 * Renders nothing if no admins are loaded yet.
 */
import { useState, useEffect } from "react";

interface AdminStatus {
  id: string;
  name: string;
  role: string;
  online: boolean;
  availableForChat: boolean;
  availableForCall: boolean;
}

export default function AdminPresenceBar({ compact = false }: { compact?: boolean }) {
  const [admins, setAdmins] = useState<AdminStatus[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/admin/presence");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setAdmins(data.admins || []);
        }
      } catch {
        // Silent — presence is non-critical UX.
      }
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const online = admins.filter((a) => a.online);
  const offline = admins.filter((a) => !a.online);
  const sorted = [...online, ...offline];

  if (sorted.length === 0) return null;

  return (
    <div className={`flex items-center gap-1 sm:gap-2 ${compact ? "px-1 py-1" : "px-2 py-1.5"}`}>
      <span className="font-body text-[10px] sm:text-[13px] text-[var(--app-text-muted)] mr-1">
        Team:
      </span>
      {sorted.map((a) => {
        const initial = (a.name || "?").charAt(0).toUpperCase();
        const statusParts = [a.online ? "Online" : "Offline"];
        if (a.availableForChat && a.online) statusParts.push("Live Chat");
        if (a.availableForCall && a.online) statusParts.push("Live Call");
        const tooltip = `${a.name} — ${statusParts.join(" · ")}`;

        return (
          <div key={a.id} className="relative" title={tooltip}>
            <div
              className={`w-6 h-6 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-body text-[10px] sm:text-[16px] font-bold ${
                a.online
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-gray-500/10 text-gray-500 border border-gray-500/20"
              }`}
            >
              {initial}
            </div>
            {/* Online/offline indicator dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full border border-[var(--app-bg)] sm:border-2 ${
                a.online ? "bg-green-500" : "bg-gray-500"
              }`}
            />
            {/* Live Chat availability — blue dot top-right */}
            {a.availableForChat && a.online && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 sm:w-3.5 sm:h-3.5 rounded-full bg-blue-500 border border-[var(--app-bg)] sm:border-2" />
            )}
          </div>
        );
      })}
      <span className="font-body text-[10px] sm:text-[13px] text-[var(--app-text-muted)] ml-1">
        {online.length}/{sorted.length} online
      </span>
    </div>
  );
}
