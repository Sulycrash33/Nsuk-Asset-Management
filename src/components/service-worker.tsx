"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once the page is idle, so it never competes
 * with first paint. Failure is silent on purpose: the system works perfectly
 * well without it, just not without a signal.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
