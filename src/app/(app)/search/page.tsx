import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { unitPath } from "@/lib/tree";
import { CONDITION_STYLES, formatNaira, type AssetWithRefs } from "@/lib/types";

export const metadata = { title: "Global search · NSUK Asset Register" };
export const dynamic = "force-dynamic";

export default async function GlobalSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const { units } = await requireAdmin();
  const supabase = await createClient();

  let rows: AssetWithRefs[] = [];
  if (q) {
    const term = q.replace(/[%,()]/g, " ").trim();
    const { data } = await supabase
      .from("assets")
      .select("*, asset_categories(name), org_units(name,code)")
      .or(`barcode.ilike.%${term}%,serial_number.ilike.%${term}%,name.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(100);
    rows = (data ?? []) as AssetWithRefs[];
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Global search</h1>
        <p className="text-sm text-neutral-600">
          Search every asset in the University by barcode, serial number or name — regardless of
          which unit holds it.
        </p>
      </header>

      <form className="relative" action="/search">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          name="q"
          defaultValue={q}
          className="field pl-10"
          placeholder="NSUK-CS-0001, LG-AC-99213, “projector”…"
          aria-label="Search all assets"
          autoFocus
        />
      </form>

      {q && (
        <p className="text-sm text-neutral-600">
          {rows.length.toLocaleString()} result{rows.length === 1 ? "" : "s"} for “{q}”
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((asset) => (
          <li key={asset.id}>
            <Link href={`/assets/${asset.id}`} className="card flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-nsuk-ink">{asset.name}</p>
                <p className="truncate font-mono text-xs text-nsuk-blue">{asset.barcode}</p>
                <p className="truncate text-xs text-neutral-500">
                  {unitPath(asset.org_unit_id, units)}
                  {asset.serial_number ? ` · SN ${asset.serial_number}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className={`chip ${CONDITION_STYLES[asset.condition]}`}>
                  {asset.condition}
                </span>
                <p className="mt-1 text-xs font-semibold text-neutral-600">
                  {formatNaira(asset.value)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {q && rows.length === 0 && (
        <p className="card text-center text-sm text-neutral-600">
          Nothing matched “{q}”.
        </p>
      )}
    </div>
  );
}
