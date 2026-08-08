import Link from "next/link";
import { Upload } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AssetForm from "@/components/asset-form";
import type { AssetCategory } from "@/lib/types";

export const metadata = { title: "Add asset · NSUK Asset Register" };
export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  const { profile, isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();
  const { data: categories } = await supabase.from("asset_categories").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-nsuk-blue">Add an asset</h1>
          <p className="text-sm text-neutral-600">
            A barcode and QR code are generated the moment you save.
          </p>
        </div>
        <Link href="/assets/import" className="btn-ghost btn-sm shrink-0">
          <Upload className="h-4 w-4" /> CSV
        </Link>
      </header>

      {!isAdmin && scopedUnitIds.length === 0 ? (
        <p className="card text-sm text-neutral-600">
          You have not been assigned to a unit yet. Ask an administrator to assign you before
          recording assets.
        </p>
      ) : (
        <AssetForm
          units={units}
          categories={(categories ?? []) as AssetCategory[]}
          scopedUnitIds={scopedUnitIds}
          isAdmin={isAdmin}
          campusId={profile.campus_id}
        />
      )}
    </div>
  );
}
