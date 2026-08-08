"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Loader2, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildTree, flattenTree, unitPath } from "@/lib/tree";
import type { Campus, OrgUnit, Profile, Role } from "@/lib/types";

type NewUser = {
  name: string;
  email: string;
  password: string;
  role: Role;
  campus_id: string;
  unit_ids: string[];
};

export default function UsersClient({
  profiles,
  unitsByUser,
  units,
  campuses,
  currentUserId,
}: {
  profiles: Profile[];
  unitsByUser: Record<string, string[]>;
  units: OrgUnit[];
  campuses: Campus[];
  currentUserId: string;
}) {
  const router = useRouter();
  const ordered = useMemo(() => flattenTree(buildTree(units)), [units]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<NewUser>({
    name: "",
    email: "",
    password: "",
    role: "staff",
    campus_id: campuses[0]?.id ?? "",
    unit_ids: [],
  });
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<Role>("staff");

  function toggleUnit(list: string[], id: string) {
    return list.includes(id) ? list.filter((u) => u !== id) : [...list, id];
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Could not create the account.");
      return;
    }
    setNotice(
      result.needsEmailConfirmation
        ? `${form.name} was created but must confirm their email address before signing in.`
        : `${form.name} can now sign in.`,
    );
    setCreating(false);
    setForm({
      name: "",
      email: "",
      password: "",
      role: "staff",
      campus_id: campuses[0]?.id ?? "",
      unit_ids: [],
    });
    router.refresh();
  }

  async function saveAssignment() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role: editRole })
      .eq("id", editing.id);
    if (roleError) {
      setBusy(false);
      setError(roleError.message);
      return;
    }

    await supabase.from("user_units").delete().eq("user_id", editing.id);
    if (editUnits.length) {
      const { error: insertError } = await supabase
        .from("user_units")
        .insert(editUnits.map((org_unit_id) => ({ user_id: editing.id, org_unit_id })));
      if (insertError) {
        setBusy(false);
        setError(insertError.message);
        return;
      }
    }

    setBusy(false);
    setEditing(null);
    router.refresh();
  }

  async function deleteUser(user: Profile) {
    if (!confirm(`Delete the account for ${user.name || user.email}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Could not delete the account.");
      return;
    }
    router.refresh();
  }

  const UnitPicker = ({
    selected,
    onToggle,
  }: {
    selected: string[];
    onToggle: (id: string) => void;
  }) => (
    <div className="max-h-56 overflow-y-auto rounded-xl border border-nsuk-line">
      {ordered.map((u) => (
        <label
          key={u.id}
          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-nsuk-cream"
          style={{ paddingLeft: `${12 + u.depth * 14}px` }}
        >
          <input
            type="checkbox"
            checked={selected.includes(u.id)}
            onChange={() => onToggle(u.id)}
            className="h-4.5 w-4.5 accent-[#1A3C6E]"
          />
          <span className={u.depth === 0 ? "font-semibold text-nsuk-blue" : ""}>{u.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-xl border border-nsuk-green/30 bg-nsuk-green/10 p-3 text-sm text-nsuk-green-dark">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/8 p-3 text-sm text-[#B91C1C]">
          {error}
        </p>
      )}

      <button onClick={() => setCreating(true)} className="btn-green w-full sm:w-auto">
        <Plus className="h-4 w-4" /> Create an account
      </button>

      <ul className="space-y-2">
        {profiles.map((user) => {
          const assigned = unitsByUser[user.id] ?? [];
          return (
            <li key={user.id} className="card flex items-center gap-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  user.role === "admin"
                    ? "bg-nsuk-blue text-white"
                    : "bg-nsuk-cream text-nsuk-blue"
                }`}
              >
                {user.role === "admin" ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-nsuk-ink">
                  {user.name || user.email}
                  {user.id === currentUserId && (
                    <span className="ml-2 text-xs font-normal text-neutral-500">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-neutral-500">{user.email}</p>
                <p className="truncate text-xs text-nsuk-green">
                  {user.role === "admin"
                    ? "University-wide administrator"
                    : assigned.length
                      ? assigned.map((id) => unitPath(id, units).split(" › ").pop()).join(", ")
                      : "No unit assigned"}
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => {
                    setEditing(user);
                    setEditUnits(assigned);
                    setEditRole(user.role);
                    setError(null);
                  }}
                  className="btn-ghost btn-sm"
                >
                  Manage
                </button>
                {user.id !== currentUserId && (
                  <button
                    onClick={() => deleteUser(user)}
                    disabled={busy}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-[#B91C1C] hover:bg-[#B91C1C]/8"
                    aria-label={`Delete ${user.name || user.email}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {creating && (
        <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-4">
          <form
            onSubmit={createUser}
            className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-nsuk-blue">New account</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-nsuk-line"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="label" htmlFor="new-name">
                Full name
              </label>
              <input
                id="new-name"
                className="field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="new-email">
                Email
              </label>
              <input
                id="new-email"
                type="email"
                className="field"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="new-password">
                Temporary password
              </label>
              <input
                id="new-password"
                className="field"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={8}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="new-role">
                  Role
                </label>
                <select
                  id="new-role"
                  className="field"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="new-campus">
                  Campus
                </label>
                <select
                  id="new-campus"
                  className="field"
                  value={form.campus_id}
                  onChange={(e) => setForm({ ...form, campus_id: e.target.value })}
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.role === "staff" && (
              <div>
                <span className="label">Assigned units</span>
                <UnitPicker
                  selected={form.unit_ids}
                  onToggle={(id) => setForm({ ...form, unit_ids: toggleUnit(form.unit_ids, id) })}
                />
              </div>
            )}

            <button type="submit" className="btn-green w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
            </button>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-nsuk-blue">
                  {editing.name || editing.email}
                </h2>
                <p className="text-xs text-neutral-500">{editing.email}</p>
              </div>
              <button
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-nsuk-line"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="label" htmlFor="edit-role">
                Role
              </label>
              <select
                id="edit-role"
                className="field"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as Role)}
                disabled={editing.id === currentUserId}
              >
                <option value="staff">Staff</option>
                <option value="admin">Administrator</option>
              </select>
              {editing.id === currentUserId && (
                <p className="mt-1 text-xs text-neutral-500">
                  You cannot change your own role.
                </p>
              )}
            </div>

            {editRole === "staff" && (
              <div>
                <span className="label">Assigned units</span>
                <UnitPicker
                  selected={editUnits}
                  onToggle={(id) => setEditUnits((prev) => toggleUnit(prev, id))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(null)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={saveAssignment} className="btn-green" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
