import { requireSession } from "@/lib/session";
import AppShell from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, scopedUnitIds, units, campuses } = await requireSession();

  const scopeLabel = isAdmin
    ? "University-wide"
    : scopedUnitIds.length === 0
      ? "No unit assigned"
      : units
          .filter((u) => scopedUnitIds.includes(u.id) && !scopedUnitIds.includes(u.parent_id ?? ""))
          .map((u) => u.name)
          .join(", ") || "Assigned units";

  const campusName = campuses.find((c) => c.id === profile.campus_id)?.name ?? null;

  return (
    <AppShell
      name={profile.name || profile.email}
      email={profile.email}
      isAdmin={isAdmin}
      scopeLabel={scopeLabel}
      campusName={campusName}
    >
      {children}
    </AppShell>
  );
}
