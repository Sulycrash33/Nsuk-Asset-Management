import Link from "next/link";
import { Boxes, ChevronRight, Plus, SearchX } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AssetFilters from "@/components/asset-filters";
import RegisterExportButton from "@/components/register-export-button";
import EmptyState from "@/components/ui/empty-state";
import { CONDITION_STYLES, formatNaira, type AssetWithRefs, type AssetCategory } from "@/lib/types";
import { unitPath } from "@/lib/tree";

export const metadata = { title: "Assets" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };

  const { isAdmin, scopedUnitIds, units, campuses, profile } = await requireSession();
  const supabase = await createClient();

  const { data: categories } = await supabase.from("asset_categories").select("*").order("name");

  const q = one("q");
  const unit = one("unit");
  const category = one("category");
  const condition = one("condition");
  const filtered = Boolean(q || unit || category || condition);

  let query = supabase
    .from("assets")
    .select("*, asset_categories(name), org_units(name,code)")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (!isAdmin) query = query.in("org_unit_id", scopedUnitIds.length ? scopedUnitIds : ["-"]);
  if (unit) query = query.eq("org_unit_id", unit);
  if (category) query = query.eq("category_id", category);
  if (condition) query = query.eq("condition", condition);
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    query = query.or(
      `name.ilike.%${term}%,barcode.ilike.%${term}%,serial_number.ilike.%${term}%,location.ilike.%${term}%`,
    );
  }

  const { data: assets, error } = await query;
  const rows = (assets ?? []) as AssetWithRefs[];
  const totalValue = rows.reduce((sum, a) => sum + Number(a.value ?? 0), 0);

  const scopeName = unit
    ? unitPath(unit, units)
    : isAdmin
      ? "All units"
      : units
          .filter((u) => scopedUnitIds.includes(u.id) && !scopedUnitIds.includes(u.parent_id ?? ""))
          .map((u) => u.name)
          .join(", ") || "My units";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-nsuk-blue">Assets</h1>
          <p className="text-sm text-nsuk-muted">
            <span className="tabular font-semibold text-nsuk-ink">
              {rows.length.toLocaleString()}
            </span>{" "}
            shown ·{" "}
            <span className="tabular font-semibold text-nsuk-green">
              {formatNaira(totalValue)}
            </span>
            {rows.length === PAGE_SIZE && " · refine the filters to narrow this list"}
          </p>
        </div>
        <div className="flex gap-2">
          <RegisterExportButton
            assets={rows}
            unitName={scopeName}
            campusName={campuses.find((c) => c.id === profile.campus_id)?.name ?? null}
            generatedBy={profile.name || profile.email}
          />
          <Link href="/assets/new" className="btn-green btn-sm">
            <Plus className="h-4 w-4" /> Add
          </Link>
        </div>
      </header>

      <AssetFilters
        units={units}
        categories={(categories ?? []) as AssetCategory[]}
        restrictTo={isAdmin ? undefined : scopedUnitIds}
      />

      {error && (
        <p className="card text-sm text-nsuk-danger">Could not load assets: {error.message}</p>
      )}

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No assets match these filters"
            body="Try a different unit, category or condition — or clear the filters to see everything in your scope."
            action={
              <Link href="/assets" className="btn-ghost">
                Clear all filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Boxes}
            title="No assets recorded yet"
            body="Record the first item and the system will issue its barcode and QR code straight away."
            action={
              <Link href="/assets/new" className="btn-green">
                <Plus className="h-4 w-4" /> Record an asset
              </Link>
            }
          />
        )
      ) : (
        <ul className="stagger space-y-2">
          {rows.map((asset) => (
            <li key={asset.id}>
              <Link
                href={`/assets/${asset.id}`}
                className="card card-interactive flex items-center gap-3"
              >
                {asset.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.photo_url}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-nsuk-blue-50 text-xs font-bold text-nsuk-blue">
                    {(asset.asset_categories?.name ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-nsuk-ink">{asset.name}</p>
                  <p className="truncate font-mono text-xs text-nsuk-blue">{asset.barcode}</p>
                  <p className="truncate text-xs text-nsuk-faint">
                    {asset.org_units?.name ?? "—"}
                    {asset.location ? ` · ${asset.location}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`chip ${CONDITION_STYLES[asset.condition]}`}>
                    {asset.condition}
                  </span>
                  <p className="tabular mt-1 text-xs font-semibold text-nsuk-muted">
                    {formatNaira(asset.value)}
                  </p>
                </div>

                <ChevronRight className="hidden h-4 w-4 shrink-0 text-nsuk-faint sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
