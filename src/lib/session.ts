import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { descendantIds } from "./tree";
import type { Campus, OrgUnit, Profile } from "./types";

export type SessionContext = {
  profile: Profile;
  isAdmin: boolean;
  isAuditor: boolean;
  /** Units the user may act on: assigned units plus everything beneath them. */
  scopedUnitIds: string[];
  units: OrgUnit[];
  campuses: Campus[];
};

/**
 * Load the signed-in user's profile and unit scope.
 * Redirects to /login when there is no session, so app pages can assume one.
 */
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const load = () =>
    Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("org_units").select("*").order("name"),
      supabase.from("campuses").select("*").order("name"),
      supabase.from("user_units").select("org_unit_id").eq("user_id", user.id),
    ]);
  let results = await load();
  // A page that loads just as the sign-in is renewed can have one request
  // refused as signed out: on 4 Nov 2026 each "Unable to load unit
  // assignments" page fell in the same second as that person's renewal. The
  // renewed sign-in is in place by then, so ask once more before giving up.
  if (results.some((r) => r.error)) results = await load();
  // Still refused as signed out: the sign-in really has lapsed. Sign in again
  // rather than show an error page that a retry cannot fix.
  if (results.some((r) => r.status === 401)) redirect("/login");
  const [profileResult, unitResult, campusResult, assignmentResult] = results;

  // A failed reference/scope query is not an empty scope. Let the page's error
  // boundary offer a retry instead of rendering unknown units or missing data.
  for (const [label, result] of [
    ["profile", profileResult],
    ["organizational units", unitResult],
    ["campuses", campusResult],
    ["unit assignments", assignmentResult],
  ] as const) {
    if (result.error) throw new Error(`Unable to load ${label}. Please try again.`);
  }
  const profile = profileResult.data;
  const units = unitResult.data;
  const campuses = campusResult.data;
  const assigned = assignmentResult.data;

  if (!profile) redirect("/login?error=no-profile");

  const allUnits = (units ?? []) as OrgUnit[];
  const isAdmin = profile.role === "admin";
  const assignedIds = (assigned ?? []).map((r) => r.org_unit_id as string);

  return {
    profile: profile as Profile,
    isAdmin,
    isAuditor: profile.role === "auditor",
    scopedUnitIds: isAdmin
      ? allUnits.map((u) => u.id)
      : descendantIds(assignedIds, allUnits),
    units: allUnits,
    campuses: (campuses ?? []) as Campus[],
  };
}

/** Same as requireSession, but sends non-admins back to their dashboard. */
export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (!ctx.isAdmin) redirect("/dashboard");
  return ctx;
}

