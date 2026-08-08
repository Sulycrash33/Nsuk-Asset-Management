import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { descendantIds } from "./tree";
import type { Campus, OrgUnit, Profile } from "./types";

export type SessionContext = {
  profile: Profile;
  isAdmin: boolean;
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

  const [{ data: profile }, { data: units }, { data: campuses }, { data: assigned }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("org_units").select("*").order("name"),
      supabase.from("campuses").select("*").order("name"),
      supabase.from("user_units").select("org_unit_id").eq("user_id", user.id),
    ]);

  if (!profile) redirect("/login?error=no-profile");

  const allUnits = (units ?? []) as OrgUnit[];
  const isAdmin = profile.role === "admin";
  const assignedIds = (assigned ?? []).map((r) => r.org_unit_id as string);

  return {
    profile: profile as Profile,
    isAdmin,
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
