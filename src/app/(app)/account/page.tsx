import Link from "next/link";
import { Boxes, ClipboardCheck, Coins } from "lucide-react";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatNaira } from "@/lib/types";
import { unitPath } from "@/lib/tree";
import PasswordForm from "./password-form";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const ACTION_WORDS: Record<string, string> = {
  created: "Recorded",
  edited: "Edited",
  moved: "Transferred",
  deleted: "Removed",
};

export default async function AccountPage() {
  const { profile, isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  // Counted in the database rather than by reading every asset back.
  const [{ data: work }, { count: verifications }, { data: recent }] = await Promise.all([
    supabase.rpc("work_recorded"),
    supabase
      .from("verification_sessions")
      .select("id", { count: "exact", head: true })
      .eq("started_by", profile.id),
    supabase
      .from("asset_logs")
      .select("id,action,asset_name,asset_barcode,created_at")
      .eq("performed_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const mine = ((work ?? []) as { user_id: string; assets: number; total_value: number }[]).find(
    (row) => row.user_id === profile.id,
  );

  const recorded = Number(mine?.assets ?? 0);
  const recordedValue = Number(mine?.total_value ?? 0);

  const myUnits = isAdmin
    ? []
    : units
        .filter((u) => scopedUnitIds.includes(u.id) && !scopedUnitIds.includes(u.parent_id ?? ""))
        .map((u) => unitPath(u.id, units) || u.name);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-nsuk-blue">My account</h1>
        <p className="mt-1 text-sm text-nsuk-muted">
          Your details, what you have recorded, and where you change your password.
        </p>
      </div>

      <dl className="card grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="label mb-0">Name</dt>
          <dd className="text-sm text-nsuk-ink">{profile.name || "Not recorded"}</dd>
        </div>
        <div>
          <dt className="label mb-0">Email address</dt>
          <dd className="text-sm break-all text-nsuk-ink">{profile.email}</dd>
        </div>
        <div>
          <dt className="label mb-0">Role</dt>
          <dd className="text-sm text-nsuk-ink">{isAdmin ? "Administrator" : "Staff"}</dd>
        </div>
        <div>
          <dt className="label mb-0">Covers</dt>
          <dd className="text-sm text-nsuk-ink">
            {isAdmin
              ? "Every campus and unit"
              : myUnits.length > 0
                ? myUnits.join(", ")
                : "No unit assigned yet"}
          </dd>
        </div>
      </dl>

      {/* ---- What this person has put into the register ---- */}
      <section className="card">
        <h2 className="section-title">Your work</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            {
              label: "Assets recorded",
              value: recorded.toLocaleString(),
              icon: <Boxes className="h-4 w-4" />,
              tone: "text-nsuk-blue",
            },
            {
              label: "Value recorded",
              value: formatNaira(recordedValue),
              icon: <Coins className="h-4 w-4" />,
              tone: "text-nsuk-green",
            },
            {
              label: "Verifications",
              value: (verifications ?? 0).toLocaleString(),
              icon: <ClipboardCheck className="h-4 w-4" />,
              tone: "text-nsuk-gold-deep",
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-nsuk-cream px-3 py-2">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-nsuk-faint uppercase">
                {stat.icon}
                {stat.label}
              </dt>
              <dd className={`tabular mt-1 text-xl leading-none font-bold ${stat.tone}`}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        {recorded === 0 && (
          <p className="mt-3 text-sm text-nsuk-muted">
            Nothing recorded yet.{" "}
            <Link href="/assets/new" className="font-semibold text-nsuk-blue hover:underline">
              Add the first asset
            </Link>
            .
          </p>
        )}
      </section>

      {/* ---- Their own history, so a person can retrace their steps ---- */}
      <section className="card">
        <h2 className="section-title">Recent activity</h2>
        {(recent ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-nsuk-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-nsuk-line-soft">
            {(
              recent as {
                id: string;
                action: string;
                asset_name: string;
                asset_barcode: string;
                created_at: string;
              }[]
            ).map((log) => (
              <li key={log.id} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-nsuk-ink">
                  <span className="font-semibold">{ACTION_WORDS[log.action] ?? log.action}</span>{" "}
                  {log.asset_name}
                </span>
                <span className="shrink-0 text-xs text-nsuk-faint">
                  {new Date(log.created_at).toLocaleDateString("en-NG", { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PasswordForm email={profile.email} />
    </div>
  );
}
