import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import UnitsClient from "./units-client";
import CatalogueClient from "./catalogue-client";
import type { AssetCategory } from "@/lib/types";

export const metadata = { title: "Org units · NSUK Asset Register" };
export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const { units, campuses } = await requireAdmin();
  const supabase = await createClient();

  const [{ data: categories }, { data: counts }] = await Promise.all([
    supabase.from("asset_categories").select("*").order("name"),
    supabase.from("assets").select("org_unit_id"),
  ]);

  const assetCounts: Record<string, number> = {};
  for (const row of counts ?? []) {
    assetCounts[row.org_unit_id] = (assetCounts[row.org_unit_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Organisational units</h1>
        <p className="text-sm text-neutral-600">
          Faculties, departments, directorates and offices — nested as deeply as the University
          needs. Every unit uses the same structure.
        </p>
      </header>

      <UnitsClient units={units} campuses={campuses} assetCounts={assetCounts} />

      <CatalogueClient campuses={campuses} categories={(categories ?? []) as AssetCategory[]} />
    </div>
  );
}
