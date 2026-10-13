import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import VerifyClient from "./verify-client";
import { buildTree, flattenTree } from "@/lib/tree";

export const metadata = { title: "Verification" };
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const { profile, isAdmin, isAuditor, scopedUnitIds, units } = await requireSession();
  const supabase = await createClient();

  // Only units the person can actually verify, so the picker never offers a
  // room they will be refused on.
  const allowed = isAdmin ? units : units.filter((u) => scopedUnitIds.includes(u.id));
  const ordered = flattenTree(buildTree(allowed));

  const [openResult, recentResult] = await Promise.all([
    supabase
      .from("verification_sessions")
      .select("id,org_unit_id,started_at")
      .is("closed_at", null)
      .order("started_at", { ascending: false }),
    supabase
      .from("verification_sessions")
      .select("id,org_unit_id,started_at,closed_at")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(10),
  ]);

  if (openResult.error || recentResult.error) {
    throw new Error("Unable to load verification exercises. Please try again.");
  }
  const open = openResult.data;
  const recent = recentResult.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Physical verification</h1>
        <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">
          Walk a unit and scan what is there. The system reports what was found, what is missing,
          and anything sitting in the wrong place.
        </p>
      </header>

      <VerifyClient key={profile.role} readOnly={isAuditor} ownerId={profile.id} units={ordered} openSessions={isAuditor ? [] : open ?? []} recentSessions={recent ?? []} />
    </div>
  );
}

