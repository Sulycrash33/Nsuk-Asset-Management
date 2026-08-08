import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AssetForm from "@/components/asset-form";
import type { Asset, AssetCategory } from "@/lib/types";

export const metadata = { title: "Edit asset · NSUK Asset Register" };
export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile, isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  const [{ data: asset }, { data: categories }] = await Promise.all([
    supabase.from("assets").select("*").eq("id", id).maybeSingle(),
    supabase.from("asset_categories").select("*").order("name"),
  ]);

  if (!asset) notFound();
  if (!isAdmin && !scopedUnitIds.includes(asset.org_unit_id)) redirect(`/assets/${id}`);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href={`/assets/${id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-nsuk-blue"
      >
        <ArrowLeft className="h-4 w-4" /> Back to asset
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Edit asset</h1>
        <p className="font-mono text-sm text-neutral-600">{asset.barcode}</p>
      </header>

      <AssetForm
        units={units}
        categories={(categories ?? []) as AssetCategory[]}
        asset={asset as Asset}
        scopedUnitIds={scopedUnitIds}
        isAdmin={isAdmin}
        campusId={profile.campus_id}
      />
    </div>
  );
}
