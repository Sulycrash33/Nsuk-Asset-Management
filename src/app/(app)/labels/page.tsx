import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import LabelsClient from "./labels-client";
import { descendantIds } from "@/lib/tree";
import { EMPTY_UNIT_ID, filterId } from "@/lib/asset-query";
import { ASSET_WITH_REFS, type AssetWithRefs } from "@/lib/types";

export const metadata = { title: "Print labels" };
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unit = filterId(typeof params.unit === "string" ? params.unit : undefined);

  const { isAdmin, scopedUnitIds, units, campuses } = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("assets")
    .select(ASSET_WITH_REFS, { count: "exact" })
    .order("created_at", { ascending: false }).order("id")
    .limit(MAX_ROWS);

  if (!isAdmin) query = query.in("org_unit_id", scopedUnitIds.length ? scopedUnitIds : [EMPTY_UNIT_ID]);
  if (unit) query = query.in("org_unit_id", descendantIds([unit], units));

  const { data: assets, count, error } = await query;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Print labels</h1>
        <p className="text-sm text-nsuk-muted">
          Select the assets to be tagged, then download an A4 sheet of QR labels, twelve
          to a page.
        </p>
      </header>

      {error && <p role="alert" className="card text-nsuk-danger">Could not load labels. Refresh to try again.</p>}
      <LabelsClient
        assets={(assets ?? []) as AssetWithRefs[]}
        units={units}
        campuses={campuses}
        restrictTo={isAdmin ? undefined : scopedUnitIds}
        key={unit ?? "all"}
        truncated={(count ?? 0) > MAX_ROWS}
      />
    </div>
  );
}
