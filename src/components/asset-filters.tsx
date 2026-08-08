"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import UnitSelect from "@/components/unit-select";
import { CONDITIONS, type AssetCategory, type OrgUnit } from "@/lib/types";

/** Search + filter bar. Filters live in the URL so views stay shareable. */
export default function AssetFilters({
  units,
  categories,
  restrictTo,
}: {
  units: OrgUnit[];
  categories: AssetCategory[];
  restrictTo?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(
    Boolean(params.get("unit") || params.get("category") || params.get("condition")),
  );

  useEffect(() => {
    setTerm(params.get("q") ?? "");
  }, [params]);

  function apply(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.push(`?${search.toString()}`);
  }

  const activeCount = ["unit", "category", "condition"].filter((k) => params.get(k)).length;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: term.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="field pl-10"
            placeholder="Search name, barcode, serial, room…"
            inputMode="search"
            aria-label="Search assets"
          />
        </form>
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          className="btn-ghost relative shrink-0 !px-4"
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-nsuk-gold text-[11px] font-bold text-nsuk-ink">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="card grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="filter-unit">
              Unit
            </label>
            <UnitSelect
              id="filter-unit"
              units={units}
              value={params.get("unit")}
              onChange={(id) => apply({ unit: id })}
              restrictTo={restrictTo}
              placeholder="Any unit"
            />
          </div>
          <div>
            <label className="label" htmlFor="filter-category">
              Category
            </label>
            <select
              id="filter-category"
              className="field"
              value={params.get("category") ?? ""}
              onChange={(e) => apply({ category: e.target.value || null })}
            >
              <option value="">Any category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="filter-condition">
              Condition
            </label>
            <select
              id="filter-condition"
              className="field"
              value={params.get("condition") ?? ""}
              onChange={(e) => apply({ condition: e.target.value || null })}
            >
              <option value="">Any condition</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {(activeCount > 0 || params.get("q")) && (
            <button
              type="button"
              onClick={() => apply({ unit: null, category: null, condition: null, q: null })}
              className="btn-ghost btn-sm justify-self-start sm:col-span-3"
            >
              <X className="h-4 w-4" /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
