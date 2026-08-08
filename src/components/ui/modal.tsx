"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centred dialog from `sm` up. Handles Escape, scroll
 * lock, backdrop dismissal and initial focus so every dialog behaves alike.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first control so keyboard and screen-reader users land inside.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 cursor-default bg-nsuk-ink/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-sheet-up relative flex max-h-[92dvh] w-full ${width} flex-col overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-e3)] sm:rounded-2xl`}
      >
        {/* Grab handle reads as "drag me" on a phone. */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-nsuk-line sm:hidden" />

        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-lg leading-tight font-bold text-nsuk-blue">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-nsuk-line text-nsuk-muted transition hover:bg-nsuk-cream hover:text-nsuk-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 pb-2">{children}</div>

        {footer && (
          <div className="border-t border-nsuk-line bg-nsuk-cream/60 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
