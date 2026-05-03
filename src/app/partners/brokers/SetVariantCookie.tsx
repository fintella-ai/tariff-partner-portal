"use client";

import { useEffect } from "react";

export function SetVariantCookie({ variant }: { variant: string }) {
  useEffect(() => {
    if (!document.cookie.includes("broker_variant=")) {
      document.cookie = `broker_variant=${variant};path=/;max-age=${30 * 24 * 60 * 60};samesite=lax`;
    }
  }, [variant]);
  return null;
}
