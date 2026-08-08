"use client";

import { useEffect, useRef, useState } from "react";
import { formatNaira } from "@/lib/types";

/**
 * Counts up to `value` on mount. Static for anyone who prefers reduced motion,
 * and for values large enough that animating would just look busy.
 */
function useCountUp(value: number, duration = 900) {
  const [display, setDisplay] = useState(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Ease-out cubic so the number decelerates into place.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return display;
}

/**
 * Named formats rather than a callback. The cards are rendered from server
 * components, and a function cannot cross the server/client boundary — React
 * elements can, which is why `icon` is a node rather than a component.
 */
const FORMATTERS = {
  count: (n: number) => Math.round(n).toLocaleString(),
  naira: (n: number) => formatNaira(n),
} as const;

export default function StatCard({
  label,
  value,
  format = "count",
  icon,
  tone = "blue",
  caption,
}: {
  label: string;
  value: number;
  /** How the animating number is rendered. */
  format?: keyof typeof FORMATTERS;
  icon?: React.ReactNode;
  tone?: "blue" | "green" | "gold";
  caption?: string;
}) {
  const animated = useCountUp(value);

  const toneClass = {
    blue: "text-nsuk-blue",
    green: "text-nsuk-green",
    gold: "text-nsuk-gold-deep",
  }[tone];

  const iconBg = {
    blue: "bg-nsuk-blue-50 text-nsuk-blue",
    green: "bg-nsuk-green-50 text-nsuk-green",
    gold: "bg-nsuk-gold-50 text-nsuk-gold-deep",
  }[tone];

  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-nsuk-muted uppercase">{label}</p>
          <p className={`tabular mt-2 text-3xl leading-none font-bold ${toneClass}`}>
            {FORMATTERS[format](animated)}
          </p>
          {caption && <p className="mt-1.5 text-xs text-nsuk-faint">{caption}</p>}
        </div>
        {icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
