import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Building2,
  Coins,
  Plus,
  Printer,
  ScanLine,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/ui/stat-card";
import ConditionDonut from "@/components/condition-donut";
import EmptyState from "@/components/ui/empty-state";
import { CONDITIONS, formatNaira, type Condition } from "@/lib/types";
import { unitPath } from "@/lib/tree";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Shape returned by the `dashboard_stats()` database function. */
type DashboardStats = {
  total_assets?: number;
  total_value?: number;
  by_condition?: Partial<Record<Condition, number>>;
  top_units?: { org_unit_id: string; count: number; value: number }[];
};

const ACTIONS = [
  {
    href: "/scan",
    label: "Scan asset",
    hint: "Camera or scanner",
    icon: ScanLine,
    cls: "btn-gold",
  },
  { href: "/assets/new", label: "Add asset", hint: "One at a time", icon: Plus, cls: "btn-green" },
  {
    href: "/assets/import",
    label: "Bulk import",
    hint: "Upload a CSV",
    icon: Upload,
    cls: "btn-ghost",
  },
  {
    href: "/labels",
    label: "Print labels",
    hint: "A4 label sheet",
    icon: Printer,
    cls: "btn-ghost",
  },
];

export default async function DashboardPage() {
  // No unit filter is passed: dashboard_stats() runs as the caller, so row
  // level security narrows the figures to a staff member's own units.
  const { profile, isAdmin, units } = await requireSession();
  const supabase = await createClient();

  // Every figure on this page is aggregated in the database and comes back as a
  // few hundred bytes. Reading the asset rows to add them up in JavaScript made
  // the page slower with every item recorded, which is the wrong way round for
  // a register meant to hold the whole University.
  const { data: stats } = await supabase.rpc("dashboard_stats");
  const summary = (stats ?? {}) as DashboardStats;

  const totalAssets = Number(summary.total_assets ?? 0);
  const totalValue = Number(summary.total_value ?? 0);

  const byCondition = Object.fromEntries(
    CONDITIONS.map((c) => [c, Number(summary.by_condition?.[c] ?? 0)]),
  ) as Record<Condition, number>;

  const topUnits = (summary.top_units ?? []).map(
    (u) => [u.org_unit_id, { count: Number(u.count), value: Number(u.value) }] as const,
  );
  const busiest = topUnits[0]?.[1].count ?? 1;

  const attention = byCondition.Faulty + byCondition["Under Repair"] + byCondition.Missing;
  const firstName = (profile.name || profile.email).split(/[\s@]/)[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ---- Greeting banner ---- */}
      <header className="relative overflow-hidden rounded-2xl bg-nsuk-blue px-5 py-6 text-white shadow-[var(--shadow-e2)] sm:px-7 sm:py-8">
        <div
          aria-hidden
          className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-nsuk-blue-light/40 blur-2xl"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-nsuk-gold" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-wide text-nsuk-gold uppercase">
            {isAdmin ? "University-wide register" : "Your units"}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold sm:text-3xl">Welcome, {firstName}</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/75">
            {isAdmin
              ? "Every asset recorded across all campuses, faculties and administrative units."
              : "Everything recorded in the units assigned to you, including their sub-units."}
          </p>
        </div>
      </header>

      {/* ---- Primary actions: the field workflow, above the fold ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`${action.cls} h-auto flex-col !items-start gap-1 !px-4 py-4 text-left`}
          >
            <action.icon className="h-5 w-5" />
            <span className="text-base">{action.label}</span>
            <span className="text-xs font-normal opacity-70">{action.hint}</span>
          </Link>
        ))}
      </div>

      {/* ---- Headline numbers ---- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total assets"
          value={totalAssets}
          format="count"
          icon={<Boxes className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="Recorded value"
          value={totalValue}
          format="naira"
          icon={<Coins className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          label="Needs attention"
          value={attention}
          format="count"
          icon={<TriangleAlert className="h-5 w-5" />}
          tone="gold"
          caption="Faulty, under repair or missing"
        />
      </div>

      {/* ---- Condition + units ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="section-title">Condition breakdown</h2>
          {totalAssets === 0 ? (
            <p className="py-8 text-center text-sm text-nsuk-muted">
              No assets recorded yet. The breakdown appears once items are entered.
            </p>
          ) : (
            <div className="mt-4">
              <ConditionDonut counts={byCondition} total={totalAssets} />
            </div>
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {isAdmin ? "Busiest units" : "Your units"}
            </h2>
            <Link
              href="/assets"
              className="inline-flex items-center gap-1 text-xs font-semibold text-nsuk-blue hover:underline"
            >
              All assets <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {topUnits.length === 0 ? (
            <p className="py-8 text-center text-sm text-nsuk-muted">No assets recorded yet.</p>
          ) : (
            <ul className="stagger mt-3 space-y-1">
              {topUnits.map(([unitId, stat]) => (
                <li key={unitId}>
                  <Link
                    href={`/assets?unit=${unitId}`}
                    className="block rounded-xl px-2 py-2 transition hover:bg-nsuk-cream"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-nsuk-ink">
                        {unitPath(unitId, units) || "Unknown unit"}
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold text-nsuk-blue">
                        {stat.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-nsuk-line-soft">
                        <div
                          className="h-full rounded-full bg-nsuk-blue transition-all duration-500"
                          style={{ width: `${(stat.count / busiest) * 100}%` }}
                        />
                      </div>
                      <span className="tabular shrink-0 text-xs text-nsuk-faint">
                        {formatNaira(stat.value)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {totalAssets === 0 && (
        <EmptyState
          icon={Boxes}
          title="The register is empty"
          body="Record the first asset and the system will issue its asset code immediately. A full store room may also be imported from a spreadsheet."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/assets/new" className="btn-green">
                <Plus className="h-4 w-4" /> Add an asset
              </Link>
              <Link href="/assets/import" className="btn-ghost">
                <Upload className="h-4 w-4" /> Import a CSV
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
