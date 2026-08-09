import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import UsersClient from "./users-client";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Staff accounts" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const { units, campuses, profile } = await requireAdmin();
  const supabase = await createClient();

  const [{ data: profiles }, { data: assignments }, { data: work }] = await Promise.all([
    supabase.from("profiles").select("*").order("name"),
    supabase.from("user_units").select("user_id,org_unit_id"),
    // Counted in the database, so this stays cheap as the register grows.
    supabase.rpc("work_recorded"),
  ]);

  const unitsByUser: Record<string, string[]> = {};
  for (const row of assignments ?? []) {
    (unitsByUser[row.user_id] ??= []).push(row.org_unit_id);
  }

  const recordedByUser: Record<string, number> = {};
  for (const row of (work ?? []) as { user_id: string; assets: number }[]) {
    recordedByUser[row.user_id] = Number(row.assets);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Staff accounts</h1>
        <p className="text-sm text-nsuk-muted">
          Create accounts and assign each person to the units they are responsible for. Staff see
          only their own units. Assigning a faculty also covers its departments.
        </p>
      </header>

      <UsersClient
        profiles={(profiles ?? []) as Profile[]}
        unitsByUser={unitsByUser}
        recordedByUser={recordedByUser}
        units={units}
        campuses={campuses}
        currentUserId={profile.id}
      />
    </div>
  );
}
