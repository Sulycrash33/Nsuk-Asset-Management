import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { unitPath } from "@/lib/tree";
import type { AssetLog, Profile } from "@/lib/types";

export const metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const ACTIONS = ["created", "edited", "moved", "deleted"] as const;
const PAGE_SIZE = 150;

const DOT: Record<string, string> = {
  created: "bg-nsuk-green",
  edited: "bg-nsuk-blue",
  moved: "bg-nsuk-gold",
  deleted: "bg-nsuk-danger",
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const action = typeof params.action === "string" ? params.action : undefined;

  const { units } = await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("asset_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (action && (ACTIONS as readonly string[]).includes(action)) {
    query = query.eq("action", action);
  }

  const { data: logs } = await query;
  const rows = (logs ?? []) as AssetLog[];

  const actorIds = [...new Set(rows.map((l) => l.performed_by).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id,name,email").in("id", actorIds)
    : { data: [] as Pick<Profile, "id" | "name" | "email">[] };

  const actorName = (uid: string | null) => {
    if (!uid) return "System";
    const a = (actors ?? []).find((p) => p.id === uid);
    return a?.name || a?.email || "Unknown user";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Activity log</h1>
        <p className="text-sm text-nsuk-muted">
          Every asset created, edited, transferred or deleted across the University.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/activity"
          className={`chip ${!action ? "border-nsuk-blue bg-nsuk-blue text-white" : "border-nsuk-line bg-white text-nsuk-ink/80"}`}
        >
          All
        </Link>
        {ACTIONS.map((a) => (
          <Link
            key={a}
            href={`/activity?action=${a}`}
            className={`chip capitalize ${
              action === a
                ? "border-nsuk-blue bg-nsuk-blue text-white"
                : "border-nsuk-line bg-white text-nsuk-ink/80"
            }`}
          >
            {a}
          </Link>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-nsuk-faint">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-nsuk-line">
            {rows.map((log) => (
              <li key={log.id} className="flex gap-3 py-3">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${DOT[log.action]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-nsuk-ink">
                    <span className="font-semibold capitalize">{log.action}</span>{" "}
                    {log.asset_id ? (
                      <Link
                        href={`/assets/${log.asset_id}`}
                        className="font-medium text-nsuk-blue underline"
                      >
                        {log.asset_name || log.asset_barcode || "asset"}
                      </Link>
                    ) : (
                      <span className="font-medium">{log.asset_name || "asset"}</span>
                    )}{" "}
                    by {actorName(log.performed_by)}
                  </p>
                  {log.action === "moved" && (
                    <p className="text-xs text-nsuk-muted">
                      {log.from_unit_id ? unitPath(log.from_unit_id, units) : "?"} →{" "}
                      {log.to_unit_id ? unitPath(log.to_unit_id, units) : "?"}
                      {log.note && `. ${log.note}`}
                    </p>
                  )}
                  <p className="text-xs text-nsuk-faint">
                    {log.asset_barcode && (
                      <span className="font-mono">{log.asset_barcode} · </span>
                    )}
                    {new Date(log.created_at).toLocaleString("en-NG")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {rows.length === PAGE_SIZE && (
          <p className="pt-3 text-xs text-nsuk-faint">
            Showing the {PAGE_SIZE} most recent entries.
          </p>
        )}
      </div>
    </div>
  );
}
