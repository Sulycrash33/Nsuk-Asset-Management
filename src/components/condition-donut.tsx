"use client";

import Link from "next/link";
import { useState } from "react";
import { CONDITIONS, type Condition } from "@/lib/types";

/** Slice colours: green healthy, amber in-progress, orange faulty, red missing. */
const SLICE: Record<Condition, string> = {
  Working: "#1F7A3D",
  "Under Repair": "#F2B705",
  Faulty: "#C2410C",
  Missing: "#B91C1C",
};

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Condition split as a donut plus a readable legend. Drawn with stroke offsets
 * rather than a chart library — it is four numbers, and the page stays light
 * for field use on a phone.
 */
export default function ConditionDonut({
  counts,
  total,
}: {
  counts: Record<Condition, number>;
  total: number;
}) {
  const [active, setActive] = useState<Condition | null>(null);

  let offset = 0;
  const arcs = CONDITIONS.map((condition) => {
    const count = counts[condition];
    const fraction = total > 0 ? count / total : 0;
    const arc = {
      condition,
      count,
      fraction,
      dash: fraction * CIRCUMFERENCE,
      offset,
    };
    offset += fraction * CIRCUMFERENCE;
    return arc;
  }).filter((a) => a.count > 0);

  const focus = active ? arcs.find((a) => a.condition === active) : null;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Condition breakdown">
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            fill="none"
            stroke="var(--color-nsuk-line-soft)"
            strokeWidth="16"
          />
          {arcs.map((arc) => (
            <circle
              key={arc.condition}
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              stroke={SLICE[arc.condition]}
              strokeWidth={active === arc.condition ? 20 : 16}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
              className="transition-[stroke-width,opacity] duration-200"
              opacity={active && active !== arc.condition ? 0.35 : 1}
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl leading-none font-bold text-nsuk-blue">
            {focus ? focus.count.toLocaleString() : total.toLocaleString()}
          </span>
          <span className="mt-1 max-w-24 text-center text-[10px] leading-tight font-semibold tracking-wide text-nsuk-muted uppercase">
            {focus ? focus.condition : "Total assets"}
          </span>
        </div>
      </div>

      <ul className="w-full flex-1 space-y-1.5">
        {CONDITIONS.map((condition) => {
          const count = counts[condition];
          const pct = total ? (count / total) * 100 : 0;
          return (
            <li key={condition}>
              <Link
                href={`/assets?condition=${encodeURIComponent(condition)}`}
                onMouseEnter={() => setActive(condition)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(condition)}
                onBlur={() => setActive(null)}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-nsuk-cream"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: SLICE[condition] }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-nsuk-ink">{condition}</span>
                <span className="tabular shrink-0 text-sm font-semibold text-nsuk-ink">
                  {count.toLocaleString()}
                </span>
                <span className="tabular w-11 shrink-0 text-right text-xs text-nsuk-faint">
                  {pct.toFixed(0)}%
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
