import Link from "next/link";
import type { ReactNode } from "react";
import { Calculator } from "lucide-react";
import { depreciationGaps, type AssetDepreciation } from "@/lib/accounting";
import { formatNaira, type Asset } from "@/lib/types";

function formatDay(date: string) {
  // A calendar day, not an instant: read it in UTC so no time zone shifts it.
  return new Date(date).toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "UTC" });
}

/** An asset's depreciation today. Shown to administrators only. */
export default function DepreciationPanel({
  record,
  depreciation,
}: {
  record: Asset;
  depreciation: AssetDepreciation | null;
}) {
  let body: ReactNode;
  if (!depreciation) {
    const gaps = depreciationGaps(record);
    body = (
      <p className="mt-3 text-sm text-nsuk-muted">
        Not depreciated yet.{" "}
        {gaps.length
          ? `It starts automatically once the record has ${gaps.join(", ")}.`
          : "Record it on the Asset accounting page."}
      </p>
    );
  } else if (depreciation.status === "Not yet in use") {
    body = (
      <p className="mt-3 text-sm text-nsuk-muted">
        Depreciation starts on {formatDay(depreciation.starts)}.
      </p>
    );
  } else {
    const d = depreciation;
    const rows: [string, string][] = [
      ["Purchase cost", formatNaira(d.original_cost)],
      ...(d.gross_amount !== d.original_cost
        ? ([["Revalued amount", formatNaira(d.gross_amount)]] as [string, string][])
        : []),
      ["Annual depreciation", formatNaira(d.annual_charge)],
      ["Depreciation from", formatDay(d.starts)],
      [`Depreciation in ${d.as_of.slice(0, 4)} so far`, formatNaira(d.year_depreciation)],
      ["Accumulated depreciation", formatNaira(d.accumulated_depreciation)],
      ...(d.impairment > 0
        ? ([["Impairment", formatNaira(d.impairment)]] as [string, string][])
        : []),
    ];
    body = (
      <>
        <dl className="mt-4 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold tracking-wide text-nsuk-faint uppercase">
                {label}
              </dt>
              <dd className="tabular mt-0.5 text-sm text-nsuk-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-nsuk-cream p-3">
          <span className="text-sm font-semibold text-nsuk-ink">Book value today</span>
          <span className="tabular text-lg font-bold text-nsuk-blue">
            {formatNaira(d.carrying_amount)}
          </span>
        </div>
      </>
    );
  }
  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Depreciation
        </h2>
        <Link href="/accounting" className="text-xs font-semibold text-nsuk-blue">
          Asset accounting →
        </Link>
      </div>
      {body}
    </section>
  );
}
