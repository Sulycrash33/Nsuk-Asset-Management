"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { completeEmailSession, expiredCallbackPath, safeAppPath } from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase/client";

export default function CompleteEmail() {
  const router = useRouter();
  const destination = safeAppPath(useSearchParams().get("next"), "/reset-password?welcome=1");
  const completion = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Reuse the same exchange during React's development effect replay.
    completion.current ??= completeEmailSession(window.location.hash, {
      clearFragment: () => window.history.replaceState(null, "", window.location.pathname + window.location.search),
      setSession: (tokens) => createClient().auth.setSession(tokens),
    });
    void completion.current.then((valid) => {
      if (!cancelled) { router.replace(valid ? destination : expiredCallbackPath(destination)); router.refresh(); }
    });
    return () => { cancelled = true; };
  }, [destination, router]);
  return <p role="status">Checking your email link…</p>;
}

