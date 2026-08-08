"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import UnitSelect from "@/components/unit-select";
import { generateLabelSheet, savePdf, type LabelInput } from "@/lib/pdf";
import { unitPath } from "@/lib/tree";
import type { AssetWithRefs, OrgUnit } from "@/lib/types";

export default function LabelsClient({
  assets,
  units,
  restrictTo,
  truncated,
}: {
  assets: AssetWithRefs[];
  units: OrgUnit[];
  restrictTo?: string[];
  truncated: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(needle) ||
        a.barcode.toLowerCase().includes(needle) ||
        (a.location ?? "").toLowerCase().includes(needle),
    );
  }, [assets, term]);

  const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((a) => next.delete(a.id));
      else visible.forEach((a) => next.add(a.id));
      return next;
    });
  }

  async function print() {
    setBusy(true);
    try {
      const labels: LabelInput[] = assets
        .filter((a) => selected.has(a.id))
        .map((a) => ({
          barcode: a.barcode,
          name: a.name,
          unitName: unitPath(a.org_unit_id, units) || a.org_units?.name || "",
          categoryName: a.asset_categories?.name ?? null,
        }));
      const doc = await generateLabelSheet(labels);
      savePdf(doc, `nsuk-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="labels-unit">
            Filter by unit
          </label>
          <UnitSelect
            id="labels-unit"
            units={units}
            value={params.get("unit")}
            onChange={(id) => router.push(`/labels?unit=${id}`)}
            restrictTo={restrictTo}
            placeholder="Any unit"
          />
        </div>
        <div>
          <label className="label" htmlFor="labels-search">
            Search this list
          </label>
          <input
            id="labels-search"
            className="field"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Name, barcode or room"
          />
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-nsuk-line pb-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-nsuk-blue">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="h-5 w-5 accent-[#1A3C6E]"
            />
            Select all {visible.length.toLocaleString()} shown
          </label>
          <span className="text-sm text-neutral-600">
            {selected.size.toLocaleString()} selected
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">
            No assets to label in this view.
          </p>
        ) : (
          <ul className="max-h-[26rem] divide-y divide-nsuk-line overflow-y-auto">
            {visible.map((asset) => (
              <li key={asset.id}>
                <label className="flex cursor-pointer items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(asset.id)}
                    onChange={() => toggle(asset.id)}
                    className="h-5 w-5 shrink-0 accent-[#1A3C6E]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-nsuk-ink">
                      {asset.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-nsuk-blue">
                      {asset.barcode}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {asset.org_units?.name ?? ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {truncated && (
          <p className="pt-3 text-xs text-neutral-500">
            Showing the 500 most recent assets. Filter by unit to reach older records.
          </p>
        )}
      </div>

      <button onClick={print} className="btn-gold w-full" disabled={busy || selected.size === 0}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        Download {selected.size.toLocaleString()} label
        {selected.size === 1 ? "" : "s"} (PDF)
      </button>
    </div>
  );
}
