"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; title: string; body?: string };

type ToastApi = {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Toast feedback for actions that finish away from the user's eye line. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE = {
  success: {
    icon: CheckCircle2,
    ring: "border-nsuk-green/30",
    accent: "bg-nsuk-green",
    iconColor: "text-nsuk-green",
  },
  error: {
    icon: AlertCircle,
    ring: "border-nsuk-danger/30",
    accent: "bg-nsuk-danger",
    iconColor: "text-nsuk-danger",
  },
  info: {
    icon: Info,
    ring: "border-nsuk-blue/25",
    accent: "bg-nsuk-blue",
    iconColor: "text-nsuk-blue",
  },
} as const;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, tone, title, body }]);
      // Errors linger — they usually need reading and acting on.
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push("success", title, body),
      error: (title, body) => push("error", title, body),
      info: (title, body) => push("info", title, body),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Above the mobile tab bar on phones, bottom-right on desktop. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end"
      >
        {toasts.map((toast) => {
          const tone = TONE[toast.tone];
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className={`animate-sheet-up pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-2xl border ${tone.ring} bg-white p-3 pl-0 shadow-[var(--shadow-e3)]`}
            >
              <span className={`h-full w-1 self-stretch rounded-r ${tone.accent}`} />
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-nsuk-ink">{toast.title}</p>
                {toast.body && (
                  <p className="mt-0.5 text-xs leading-relaxed break-words text-nsuk-muted">
                    {toast.body}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nsuk-faint transition hover:bg-nsuk-cream hover:text-nsuk-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
