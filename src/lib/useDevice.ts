"use client";

import { useState, useEffect } from "react";

export interface DeviceInfo {
  // Screen
  width: number;
  height: number;
  pixelRatio: number;
  isLandscape: boolean;

  // Device type
  type: "mobile" | "tablet" | "desktop";
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;

  // OS
  os: "ios" | "android" | "windows" | "macos" | "linux" | "chromeos" | "unknown";
  osVersion: string;

  // Brand / platform hints
  brand: "apple" | "samsung" | "google" | "microsoft" | "unknown";
  browser: "chrome" | "safari" | "firefox" | "edge" | "samsung" | "unknown";

  // Derived design tokens — use these for responsive spacing
  padding: string;          // page-level padding
  gap: string;              // grid gaps
  cardPadding: string;      // inner card padding
  headingSize: string;      // main heading size class
  fontSize: string;         // base body font size
  borderRadius: string;     // card border radius
  safeAreaBottom: string;   // bottom safe area (notch phones)
}

function detectOS(ua: string): { os: DeviceInfo["os"]; osVersion: string } {
  // iOS
  const iosMatch = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+[_\.]\d+)/i);
  if (iosMatch) return { os: "ios", osVersion: iosMatch[1].replace("_", ".") };

  // macOS
  const macMatch = ua.match(/Mac OS X (\d+[_\.]\d+)/i);
  if (macMatch) return { os: "macos", osVersion: macMatch[1].replace("_", ".") };

  // Android
  const androidMatch = ua.match(/Android (\d+\.?\d*)/i);
  if (androidMatch) return { os: "android", osVersion: androidMatch[1] };

  // Windows
  const winMatch = ua.match(/Windows NT (\d+\.?\d*)/i);
  if (winMatch) {
    const ver = winMatch[1];
    const friendly = ver === "10.0" ? "10/11" : ver;
    return { os: "windows", osVersion: friendly };
  }

  // Chrome OS
  if (/CrOS/i.test(ua)) return { os: "chromeos", osVersion: "" };

  // Linux
  if (/Linux/i.test(ua)) return { os: "linux", osVersion: "" };

  return { os: "unknown", osVersion: "" };
}

function detectBrand(ua: string, os: DeviceInfo["os"]): DeviceInfo["brand"] {
  if (os === "ios" || os === "macos") return "apple";
  if (/SM-|Samsung/i.test(ua)) return "samsung";
  if (/Pixel|Nexus/i.test(ua)) return "google";
  if (os === "windows") return "microsoft";
  return "unknown";
}

function detectBrowser(ua: string): DeviceInfo["browser"] {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "safari";
  if (/Firefox/i.test(ua)) return "firefox";
  return "unknown";
}

function getDeviceType(w: number, isTouchDevice: boolean): DeviceInfo["type"] {
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

function getDesignTokens(type: DeviceInfo["type"], os: DeviceInfo["os"], brand: DeviceInfo["brand"]) {
  // iOS/Apple devices get slightly more generous spacing (matches HIG)
  const isApple = brand === "apple";

  if (type === "mobile") {
    return {
      padding: isApple ? "px-5 py-4" : "px-4 py-3",
      gap: "gap-3",
      cardPadding: isApple ? "p-5" : "p-4",
      headingSize: "text-xl",
      fontSize: "text-sm",
      borderRadius: isApple ? "rounded-2xl" : "rounded-xl",
      safeAreaBottom: os === "ios" ? "pb-[env(safe-area-inset-bottom)]" : "pb-0",
    };
  }

  if (type === "tablet") {
    return {
      padding: "px-6 py-5",
      gap: "gap-4",
      cardPadding: "p-5",
      headingSize: "text-2xl",
      fontSize: "text-sm",
      borderRadius: "rounded-xl",
      safeAreaBottom: os === "ios" ? "pb-[env(safe-area-inset-bottom)]" : "pb-0",
    };
  }

  // Desktop
  return {
    padding: "px-14 py-9",
    gap: "gap-5",
    cardPadding: "p-6",
    headingSize: "text-[28px]",
    fontSize: "text-[14px]",
    borderRadius: "rounded-xl",
    safeAreaBottom: "pb-0",
  };
}

const DEFAULT_DEVICE: DeviceInfo = {
  width: 1280,
  height: 800,
  pixelRatio: 1,
  isLandscape: true,
  type: "desktop",
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isTouchDevice: false,
  os: "unknown",
  osVersion: "",
  brand: "unknown",
  browser: "unknown",
  padding: "px-14 py-9",
  gap: "gap-5",
  cardPadding: "p-6",
  headingSize: "text-[28px]",
  fontSize: "text-[14px]",
  borderRadius: "rounded-xl",
  safeAreaBottom: "pb-0",
};

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(DEFAULT_DEVICE);

  useEffect(() => {
    function detect() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isLandscape = w > h;
      const ua = navigator.userAgent;

      const type = getDeviceType(w, isTouchDevice);
      const { os, osVersion } = detectOS(ua);
      const brand = detectBrand(ua, os);
      const browser = detectBrowser(ua);
      const tokens = getDesignTokens(type, os, brand);

      setDevice({
        width: w,
        height: h,
        pixelRatio,
        isLandscape,
        type,
        isMobile: type === "mobile",
        isTablet: type === "tablet",
        isDesktop: type === "desktop",
        isTouchDevice,
        os,
        osVersion,
        brand,
        browser,
        ...tokens,
      });
    }

    detect();
    window.addEventListener("resize", detect);
    window.addEventListener("orientationchange", () => setTimeout(detect, 150));
    return () => {
      window.removeEventListener("resize", detect);
      window.removeEventListener("orientationchange", () => setTimeout(detect, 150));
    };
  }, []);

  return device;
}
