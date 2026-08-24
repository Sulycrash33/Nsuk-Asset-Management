import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Pencil, QrCode } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QrImage } from "@/components/barcode-image";
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

const DOT: Record<AssetLog["action"], string> = {
  created: "bg-nsuk-green",
  edited: "bg-nsuk-blue",
  moved: "bg-nsuk-gold",
  deleted: "bg-nsuk-danger",
};

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { isAdmin, scopedUnitIds, units } = await requireSession();
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
        ? new Date(record.acquisition_date).toLocaleDateString("en-NG", { dateStyle: "medium" })
        : "—",
    ],
    ["Recorded", new Date(record.created_at).toLocaleString("en-NG")],
    ["Last updated", new Date(record.updated_at).toLocaleString("en-NG")],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/assets"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nsuk-blue transition hover:gap-2.5"
      >
        <ArrowLeft className="h-4 w-4" /> Back to assets
      </Link>

      <article className="panel overflow-hidden">
        {record.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.photo_url}
            alt={record.name}
            className="h-56 w-full object-cover sm:h-64"
          />
        )}

        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-bold text-nsuk-blue sm:text-2xl">
                {record.name}
              </h1>
              <p className="mt-1 font-mono text-sm text-nsuk-muted">{record.barcode}</p>
            </div>
            <span className={`chip ${CONDITION_STYLES[record.condition]}`}>{record.condition}</span>
          </div>

          <dl className="grid gap-x-6 gap-y-3.5 border-t border-nsuk-line pt-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold tracking-wide text-nsuk-faint uppercase">
                  {label}
                </dt>
                <dd className="mt-0.5 text-sm text-nsuk-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {record.notes && (
            <div className="rounded-xl bg-nsuk-cream p-3">
              <p className="text-xs font-semibold tracking-wide text-nsuk-faint uppercase">Notes</p>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-nsuk-ink">
                {record.notes}
              </p>
            </div>
          )}
        </div>
      </article>

      <section className="card">
        <h2 className="section-title flex items-center gap-2">
          <QrCode className="h-4 w-4" /> Label
        </h2>
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-nsuk-cream p-4">
          <QrImage value={record.qr_payload} size={148} />
          <p className="font-mono text-sm font-bold tracking-wider">{record.barcode}</p>
        </div>
      </section>

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

      <section className="card">
        <h2 className="section-title flex items-center gap-2">
          <History className="h-4 w-4" /> Activity
        </h2>

        {(logs ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-nsuk-faint">No activity recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-0">
            {(logs ?? []).map((log: AssetLog, i, all) => (
              <li key={log.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Timeline rail */}
                {i < all.length - 1 && (
                  <span className="absolute top-4 bottom-0 left-[5px] w-px bg-nsuk-line" />
                )}
                <span
                  className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${DOT[log.action]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-nsuk-ink">
                    <span className="font-semibold capitalize">{log.action}</span> by{" "}
                    {actorName(log.performed_by)}
                  </p>
                  {log.action === "moved" && (
                    <p className="mt-0.5 text-xs text-nsuk-muted">
                      {log.from_unit_id ? unitPath(log.from_unit_id, units) : "?"} →{" "}
                      {log.to_unit_id ? unitPath(log.to_unit_id, units) : "?"}
                    </p>
                  )}
                  {log.note && <p className="mt-0.5 text-xs text-nsuk-muted">{log.note}</p>}
                  <p className="mt-0.5 text-xs text-nsuk-faint">
                    {new Date(log.created_at).toLocaleString("en-NG")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
