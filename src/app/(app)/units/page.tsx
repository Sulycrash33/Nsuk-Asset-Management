import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import UnitsClient from "./units-client";
import CatalogueClient from "./catalogue-client";
import type { AssetCategory } from "@/lib/types";

export const metadata = { title: "Org units" };
export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const { units, campuses } = await requireAdmin();
  const supabase = await createClient();

  // Counted in the database. Reading every asset row to tally them in
  // JavaScript is affordable for a store room and not for a University.
  const [{ data: categories }, { data: counts }] = await Promise.all([
    supabase.from("asset_categories").select("*").order("name"),
    supabase.rpc("unit_asset_counts"),
  ]);

  const assetCounts: Record<string, number> = {};
  for (const row of (counts ?? []) as { org_unit_id: string; count: number }[]) {
    assetCounts[row.org_unit_id] = Number(row.count);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Organisational units</h1>
        <p className="text-sm text-nsuk-muted">
          Faculties, departments, directorates and offices, nested as deeply as the University
          needs. Every unit uses the same structure.
        </p>
      </header>

      <UnitsClient units={units} campuses={campuses} assetCounts={assetCounts} />

      <CatalogueClient campuses={campuses} categories={(categories ?? []) as AssetCategory[]} />
    </div>
  );
}
