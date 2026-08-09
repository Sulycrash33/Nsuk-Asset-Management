import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import VerifyClient from "./verify-client";
import { buildTree, flattenTree } from "@/lib/tree";

export const metadata = { title: "Verification" };
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const { isAdmin, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  // Only units the person can actually verify, so the picker never offers a
  // room they will be refused on.
  const allowed = isAdmin ? units : units.filter((u) => scopedUnitIds.includes(u.id));
  const ordered = flattenTree(buildTree(allowed));

  const { data: open } = await supabase
    .from("verification_sessions")
    .select("id,org_unit_id,started_at")
    .is("closed_at", null)
    .order("started_at", { ascending: false });

  const { data: recent } = await supabase
    .from("verification_sessions")
    .select("id,org_unit_id,started_at,closed_at")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(10);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Physical verification</h1>
        <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">
          Walk a unit and scan what is there. The system reports what was found, what is missing,
          and anything sitting in the wrong place.
        </p>
      </header>

      <VerifyClient units={ordered} openSessions={open ?? []} recentSessions={recent ?? []} />
    </div>
  );
}
