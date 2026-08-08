import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import BarcodeImage, { QrImage } from "@/components/barcode-image";
import AssetActions from "@/components/asset-actions";
import { unitPath } from "@/lib/tree";
import {
  CONDITION_STYLES,
  formatNaira,
  type AssetLog,
  type AssetWithRefs,
  type Profile,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { isAdmin, scopedUnitIds, units, profile } = await requireSession();
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("assets")
    .select("*, asset_categories(name), org_units(name,code)")
    .eq("id", id)
    .maybeSingle();

  if (!asset) notFound();
  const record = asset as AssetWithRefs;

  const { data: logs } = await supabase
    .from("asset_logs")
    .select("*")
    .eq("asset_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const actorIds = [...new Set((logs ?? []).map((l) => l.performed_by).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", actorIds)
    : { data: [] as Pick<Profile, "id" | "name" | "email">[] };
  const actorName = (uid: string | null) => {
    if (!uid) return "System";
    const a = (actors ?? []).find((p) => p.id === uid);
    return a?.name || a?.email || "Unknown user";
  };

  const canEdit = isAdmin || scopedUnitIds.includes(record.org_unit_id);

  const details: [string, string][] = [
    ["Category", record.asset_categories?.name ?? "—"],
    ["Unit", unitPath(record.org_unit_id, units) || record.org_units?.name || "—"],
    ["Room / location", record.location ?? "—"],
    ["Value", formatNaira(record.value)],
    ["Serial number", record.serial_number ?? "—"],
    [
      "Acquired",
      record.acquisition_date
        ? new Date(record.acquisition_date).toLocaleDateString("en-NG")
        : "—",
    ],
    ["Recorded", new Date(record.created_at).toLocaleString("en-NG")],
    ["Last updated", new Date(record.updated_at).toLocaleString("en-NG")],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/assets" className="inline-flex items-center gap-1 text-sm font-semibold text-nsuk-blue">
        <ArrowLeft className="h-4 w-4" /> Back to assets
      </Link>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-nsuk-blue">{record.name}</h1>
            <p className="font-mono text-sm text-neutral-600">{record.barcode}</p>
          </div>
          <span className={`chip ${CONDITION_STYLES[record.condition]}`}>{record.condition}</span>
        </div>

        {record.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.photo_url}
            alt={record.name}
            className="h-56 w-full rounded-xl object-cover"
          />
        )}

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                {label}
              </dt>
              <dd className="text-sm text-nsuk-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {record.notes && (
          <div>
            <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-nsuk-ink">{record.notes}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-nsuk-blue">Label</h2>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="text-center">
            <BarcodeImage value={record.barcode} />
            <p className="mt-1 font-mono text-sm font-bold tracking-wider">{record.barcode}</p>
          </div>
          <QrImage value={record.qr_payload} />
        </div>
      </div>

      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/assets/${record.id}/edit`} className="btn-primary">
            <Pencil className="h-4 w-4" /> Edit asset
          </Link>
          <AssetActions
            asset={record}
            units={units}
            isAdmin={isAdmin}
            categoryName={record.asset_categories?.name ?? null}
          />
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-nsuk-blue">Activity</h2>
        <ul className="mt-3 space-y-3">
          {(logs ?? []).map((log: AssetLog) => (
            <li key={log.id} className="flex gap-3 text-sm">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  log.action === "created"
                    ? "bg-nsuk-green"
                    : log.action === "moved"
                      ? "bg-nsuk-gold"
                      : log.action === "deleted"
                        ? "bg-[#B91C1C]"
                        : "bg-nsuk-blue"
                }`}
              />
              <div className="min-w-0">
                <p className="text-nsuk-ink">
                  <span className="font-semibold capitalize">{log.action}</span> by{" "}
                  {actorName(log.performed_by)}
                  {log.action === "moved" && (
                    <>
                      {" — "}
                      {log.from_unit_id ? unitPath(log.from_unit_id, units) : "?"} →{" "}
                      {log.to_unit_id ? unitPath(log.to_unit_id, units) : "?"}
                    </>
                  )}
                </p>
                {log.note && <p className="text-xs text-neutral-600">{log.note}</p>}
                <p className="text-xs text-neutral-500">
                  {new Date(log.created_at).toLocaleString("en-NG")}
                </p>
              </div>
            </li>
          ))}
          {(logs ?? []).length === 0 && (
            <li className="text-sm text-neutral-500">No activity recorded yet.</li>
          )}
        </ul>
      </div>

      <p className="text-center text-xs text-neutral-400">Viewing as {profile.name || profile.email}</p>
    </div>
  );
}
