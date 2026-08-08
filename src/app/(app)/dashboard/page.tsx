import Link from "next/link";
import { Boxes, Building2, Plus, Printer, ScanLine, TriangleAlert, Upload } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CONDITIONS, CONDITION_STYLES, formatNaira, type Condition } from "@/lib/types";
import { unitPath } from "@/lib/tree";

export const metadata = { title: "Dashboard · NSUK Asset Register" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { profile, isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  // RLS already limits rows to the caller's scope; the explicit filter keeps the
  // query cheap for staff assigned to a small part of a large tree.
  let query = supabase.from("assets").select("id,value,condition,org_unit_id,created_at");
  if (!isAdmin) query = query.in("org_unit_id", scopedUnitIds.length ? scopedUnitIds : ["-"]);
  const { data: assets } = await query;

  const rows = assets ?? [];
  const totalValue = rows.reduce((sum, a) => sum + Number(a.value ?? 0), 0);

  const byCondition = Object.fromEntries(
    CONDITIONS.map((c) => [c, rows.filter((a) => a.condition === c).length]),
  ) as Record<Condition, number>;

  const perUnit = new Map<string, { count: number; value: number }>();
  for (const a of rows) {
    const entry = perUnit.get(a.org_unit_id) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number(a.value ?? 0);
    perUnit.set(a.org_unit_id, entry);
  }
  const topUnits = [...perUnit.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  const attention = byCondition.Faulty + byCondition["Under Repair"] + byCondition.Missing;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">
          Welcome, {(profile.name || profile.email).split(" ")[0]}
        </h1>
        <p className="text-sm text-neutral-600">
          {isAdmin
            ? "University-wide asset position across every campus and unit."
            : "Asset position for the units assigned to you."}
        </p>
      </header>

      {/* Primary actions sit above the fold — this is the field workflow. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/scan" className="btn-gold flex-col !items-start gap-1 !px-4 py-4 text-left">
          <ScanLine className="h-5 w-5" />
          <span>Scan asset</span>
        </Link>
        <Link href="/assets/new" className="btn-green flex-col !items-start gap-1 !px-4 py-4 text-left">
          <Plus className="h-5 w-5" />
          <span>Add asset</span>
        </Link>
        <Link href="/assets/import" className="btn-ghost flex-col !items-start gap-1 !px-4 py-4 text-left">
          <Upload className="h-5 w-5" />
          <span>Bulk import</span>
        </Link>
        <Link href="/labels" className="btn-ghost flex-col !items-start gap-1 !px-4 py-4 text-left">
          <Printer className="h-5 w-5" />
          <span>Print labels</span>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-2 text-neutral-500">
            <Boxes className="h-4 w-4" />
            <p className="text-xs font-semibold tracking-wide uppercase">Total assets</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-nsuk-blue">{rows.length.toLocaleString()}</p>
        </div>
        <div className="card">
          <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Total recorded value
          </p>
          <p className="mt-2 text-3xl font-bold text-nsuk-green">{formatNaira(totalValue)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 text-neutral-500">
            <TriangleAlert className="h-4 w-4" />
            <p className="text-xs font-semibold tracking-wide uppercase">Needs attention</p>
          </div>
          <p className="mt-2 text-3xl font-bold text-nsuk-gold-dark">{attention.toLocaleString()}</p>
          <p className="text-xs text-neutral-500">Faulty, under repair or missing</p>
        </div>
      </div>

      <section className="card">
        <h2 className="font-semibold text-nsuk-blue">Condition breakdown</h2>
        <div className="mt-4 space-y-3">
          {CONDITIONS.map((condition) => {
            const count = byCondition[condition];
            const pct = rows.length ? (count / rows.length) * 100 : 0;
            return (
              <Link
                key={condition}
                href={`/assets?condition=${encodeURIComponent(condition)}`}
                className="block"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className={`chip ${CONDITION_STYLES[condition]}`}>{condition}</span>
                  <span className="font-semibold text-nsuk-ink">
                    {count.toLocaleString()}{" "}
                    <span className="font-normal text-neutral-500">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-nsuk-cream">
                  <div
                    className="h-full rounded-full bg-nsuk-blue"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-nsuk-blue" />
          <h2 className="font-semibold text-nsuk-blue">
            {isAdmin ? "Units with the most assets" : "Your units"}
          </h2>
        </div>
        {topUnits.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No assets recorded yet.{" "}
            <Link href="/assets/new" className="font-semibold text-nsuk-green underline">
              Add the first one
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-nsuk-line">
            {topUnits.map(([unitId, stat]) => (
              <li key={unitId}>
                <Link
                  href={`/assets?unit=${unitId}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-nsuk-ink">
                    {unitPath(unitId, units) || "Unknown unit"}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-nsuk-blue">
                      {stat.count.toLocaleString()}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {formatNaira(stat.value)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
