import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import ImportClient from "./import-client";
import type { AssetCategory } from "@/lib/types";

export const metadata = { title: "Bulk import" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();
  const { data: categories } = await supabase.from("asset_categories").select("*").order("name");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Bulk import</h1>
        <p className="text-sm text-nsuk-muted">
          Upload a list of assets — a spreadsheet, a CSV, a Word table or a printed PDF schedule. Asset codes are generated on import, then you can print the
          whole batch of labels at once.
        </p>
      </header>

      <ImportClient
        units={units}
        categories={(categories ?? []) as AssetCategory[]}
        scopedUnitIds={scopedUnitIds}
        isAdmin={isAdmin}
      />
    </div>
  );
}
