import Link from "next/link";
import { signedAssetPhotos } from "@/lib/asset-photo";
import BulkAssetActions from "@/components/bulk-asset-actions";
import { Boxes, ChevronRight, Plus, SearchX } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AssetFilters from "@/components/asset-filters";
import RegisterExportButton from "@/components/register-export-button";
import EmptyState from "@/components/ui/empty-state";
import {
  ASSET_WITH_REFS_AND_CAMPUS,
  CONDITION_STYLES,
  formatNaira,
  type AssetWithRefs,
  type AssetCategory,
} from "@/lib/types";
import { registerQuery, registerPage, summaryArgs } from "@/lib/asset-query";
import { registerScope } from "@/lib/register-scope";
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

  const session = await requireSession();
  const { isAdmin, scopedUnitIds, units, campuses, profile } = session;
  const supabase = await createClient();

  const { data: categories } = await supabase.from("asset_categories").select("*").order("name");

  const q = one("q");
  const unit = one("unit");
  const campus = one("campus");
  const category = one("category");
  const condition = one("condition");
  const from = one("from");
  const to = one("to");
  const filtered = Boolean(q || unit || campus || category || condition || from || to);

  const filters = registerScope(params, session);
  const page = registerPage(one("page"));
  const [{ data: assets, count, error }, summary] = await Promise.all([
    registerQuery(supabase, ASSET_WITH_REFS_AND_CAMPUS, filters).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.rpc("register_summary", summaryArgs(filters)),
  ]);
  const rows = (assets ?? []) as unknown as AssetWithRefs[];
  const photoSources = await signedAssetPhotos(supabase, rows, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const total = count ?? 0;
  const totalValue = summary.error ? null : Number(summary.data?.total_value ?? 0);
  const pageHref = (next: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "page") search.set(key, value);
    search.set("page", String(next)); return `/assets?${search}`;
  };
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string" && key !== "page") exportParams.set(key, value);

  const campusName = campus ? (campuses.find((c) => c.id === campus)?.name ?? null) : null;

  const scopeName = unit
    ? unitPath(unit, units)
    : campusName
      ? campusName
      : isAdmin
      ? "All units"
        : units
            .filter(
              (u) => scopedUnitIds.includes(u.id) && !scopedUnitIds.includes(u.parent_id ?? ""),
            )
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
            shown of {total.toLocaleString()} matching ·{" "}
            <span className="tabular font-semibold text-nsuk-green">
              {totalValue === null ? "Total value unavailable" : formatNaira(totalValue)}
            </span>
            
          </p>
        </div>
        <div className="flex gap-2">
          <RegisterExportButton
            assetCount={total}
            exportQuery={exportParams.toString()}
            unitName={scopeName}
            campusName={
              campusName ??
              (isAdmin
                ? "All campuses"
                : (campuses.find((c) => c.id === profile.campus_id)?.name ?? null))
            }
            generatedBy={profile.name || profile.email}
            units={units}
            campuses={campuses}
          />
          <Link href="/assets/new" className="btn-green btn-sm">
            <Plus className="h-4 w-4" /> Add
          </Link>
        </div>
      </header>

      <AssetFilters
        units={units}
        categories={(categories ?? []) as AssetCategory[]}
        campuses={campuses}
        restrictTo={isAdmin ? undefined : scopedUnitIds}
      />

      {error && (
        <p className="card text-sm text-nsuk-danger">Could not load assets: {error.message}</p>
      )}

      {summary.error && <p role="alert" className="card text-sm text-nsuk-danger">Could not calculate the total value. Refresh to try again.</p>}
      {total > PAGE_SIZE && <nav aria-label="Asset pages" className="flex items-center justify-between gap-3">
        {page > 1 ? <Link className="btn-ghost btn-sm" href={pageHref(page - 1)}>Previous</Link> : <span />}
        <span className="text-sm text-nsuk-muted">Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        {page * PAGE_SIZE < total ? <Link className="btn-ghost btn-sm" href={pageHref(page + 1)}>Next</Link> : <span />}
      </nav>}
      {error ? null : rows.length === 0 && total > 0 ? <p className="card">This page is empty. <Link href={pageHref(1)} className="text-nsuk-blue underline">Return to page 1</Link>.</p> : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No assets match these filters"
            body="Try a different campus, unit, category, condition or date range, or clear the filters to see everything within your scope."
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
            body="Record the first item and the system will issue its asset code straight away."
            action={
              <Link href="/assets/new" className="btn-green">
                <Plus className="h-4 w-4" /> Record an asset
              </Link>
            }
          />
        )
      ) : (
        <BulkAssetActions key={`${page}:${exportParams}`} units={units} restrictTo={isAdmin ? undefined : scopedUnitIds}>
        <ul className="stagger space-y-2">
          {rows.map((asset) => (
            <li key={asset.id} className="flex items-center gap-3">
              <label className="flex h-11 w-11 shrink-0 items-center justify-center"><input type="checkbox" name="asset" value={asset.id} aria-label={`Select ${asset.name}`} className="h-5 w-5 accent-[#1A3C6E]" /></label>
              <Link
                href={`/assets/${asset.id}`}
                className="card card-interactive flex min-w-0 flex-1 items-center gap-3"
              >
                {photoSources.get(asset.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoSources.get(asset.id)!}
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
        </BulkAssetActions>
      )}
    </div>
  );
}
