import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import LabelsClient from "./labels-client";
import type { AssetWithRefs } from "@/lib/types";

export const metadata = { title: "Print labels" };
export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unit = typeof params.unit === "string" ? params.unit : undefined;

  const { isAdmin, scopedUnitIds, units, campuses } = await requireSession();
  const supabase = await createClient();

  let query = supabase
    .from("assets")
    .select("*, asset_categories(name), org_units(name,code)")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (!isAdmin) query = query.in("org_unit_id", scopedUnitIds.length ? scopedUnitIds : ["-"]);
  if (unit) query = query.eq("org_unit_id", unit);

  const { data: assets } = await query;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Print labels</h1>
        <p className="text-sm text-nsuk-muted">
          Select the assets to be tagged, then download an A4 sheet of barcode and QR labels, twelve
          to a page.
        </p>
      </header>

      <LabelsClient
        assets={(assets ?? []) as AssetWithRefs[]}
        units={units}
        campuses={campuses}
        restrictTo={isAdmin ? undefined : scopedUnitIds}
        truncated={(assets ?? []).length === MAX_ROWS}
      />
    </div>
  );
}
