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
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /**
   * Fills the phone screen instead of hugging the content. Long forms otherwise
   * open as a short sheet with a cramped scrolling window inside it, which
   * hides most of the form and wastes the screen.
   */
  tall?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Callers pass an inline arrow, so onClose is a different function on every
  // render. Held in a ref, it can be called from the effect without the effect
  // depending on it. When it was a dependency the effect re-ran on every
  // keystroke and moved focus to the top of the dialog, which on a phone closed
  // the keyboard after each character typed.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first control so keyboard and screen-reader users land inside.
    // Runs once per opening, never again while the dialog stays open.
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    // The overlay scrolls. Viewport units do not mean the same thing on every
    // phone, and in desktop-site mode they can resolve taller than the screen,
    // which left the dialog overflowing with its title and first fields above
    // the top edge and no way to reach them. Whatever the height maths does,
    // scrolling the overlay always gets to the top of the dialog.
    <div className="no-print fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 cursor-default bg-nsuk-ink/45 backdrop-blur-[2px]"
      />

      <div className="relative flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`animate-sheet-up relative flex max-h-[92dvh] w-full ${width} ${
            tall ? "h-[92dvh] sm:h-auto" : ""
          } flex-col overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-e3)] sm:rounded-2xl`}
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
    </div>
  );
}
