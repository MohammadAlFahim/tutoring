"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (production only) so the app is installable and
 * has an offline fallback. Disabled in development to avoid interfering with
 * hot-module reloading.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal — the app works without it.
      });
    }
  }, []);
  return null;
}
