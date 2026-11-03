import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import LabelsClient from "./labels-client";
import { descendantIds } from "@/lib/tree";
import { filterId } from "@/lib/asset-query";
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

  const { isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("assets")
    .select(ASSET_WITH_REFS, { count: "exact" })
    .order("created_at", { ascending: false }).order("id")
    .limit(MAX_ROWS);

  // Row level security limits a non-administrator to their units and the
  // assets they recorded themselves, which is exactly what they may label.
  if (unit) query = query.in("org_unit_id", descendantIds([unit], units));

  const { data: assets, count, error } = await query;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Print labels</h1>
        <p className="text-sm text-nsuk-muted">
          Select the assets to be tagged, then download one QR label per page for your
          Xprinter XP-365B using 60 × 40 mm stickers.
        </p>
      </header>

      {error && <p role="alert" className="card text-nsuk-danger">Could not load labels. Refresh to try again.</p>}
      <LabelsClient
        assets={(assets ?? []) as AssetWithRefs[]}
        units={units}
        restrictTo={isAdmin ? undefined : scopedUnitIds}
        key={unit ?? "all"}
        truncated={(count ?? 0) > MAX_ROWS}
      />
    </div>
  );
}
