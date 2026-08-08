"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
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

function blankUser(campuses: Campus[]): NewUser {
  return {
    name: "",
    email: "",
    password: "",
    role: "staff",
    campus_id: campuses[0]?.id ?? "",
    unit_ids: [],
  };
}

/** Checklist over the org tree, used when assigning a staff member's units. */
function UnitPicker({
  ordered,
  selected,
  onToggle,
}: {
  ordered: ReturnType<typeof flattenTree>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [term, setTerm] = useState("");
  const needle = term.trim().toLowerCase();
  const visible = needle
    ? ordered.filter((u) => u.name.toLowerCase().includes(needle))
    : ordered;

  return (
    <div className="overflow-hidden rounded-xl border border-nsuk-line">
      <div className="flex items-center gap-2 border-b border-nsuk-line px-3">
        <Search className="h-4 w-4 shrink-0 text-nsuk-faint" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Filter units"
          aria-label="Filter units"
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-nsuk-faint"
        />
        {selected.length > 0 && (
          <span className="chip shrink-0 border-nsuk-green/25 bg-nsuk-green-50 text-nsuk-green">
            {selected.length}
          </span>
        )}
      </div>

      <div className="scroll-slim max-h-56 overflow-y-auto">
        {visible.map((u) => (
          <label
            key={u.id}
            className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-nsuk-cream"
            style={{ paddingLeft: `${12 + (needle ? 0 : u.depth * 14)}px` }}
          >
            <input
              type="checkbox"
              checked={selected.includes(u.id)}
              onChange={() => onToggle(u.id)}
              className="h-4.5 w-4.5 accent-[#1A3C6E]"
            />
            <span className={u.depth === 0 ? "font-semibold text-nsuk-blue" : "text-nsuk-ink"}>
              {u.name}
            </span>
          </label>
        ))}
        {visible.length === 0 && (
          <p className="px-3 py-4 text-sm text-nsuk-faint">No unit matches “{term.trim()}”.</p>
        )}
      </div>

      <p className="border-t border-nsuk-line bg-nsuk-cream px-3 py-2 text-xs text-nsuk-muted">
        Assigning a faculty automatically covers every department beneath it.
      </p>
    </div>
  );
}

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
  const toast = useToast();
  const confirm = useConfirm();
  const ordered = useMemo(() => flattenTree(buildTree(units)), [units]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<NewUser>(() => blankUser(campuses));
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [editRole, setEditRole] = useState<Role>("staff");

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((u) => u !== id) : [...list, id];

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setFormError(result.error ?? "Could not create the account.");
      return;
    }

    if (result.needsEmailConfirmation) {
      toast.info(
        `${form.name} was created`,
        "They must confirm their email address before they can sign in.",
      );
    } else {
      toast.success(`${form.name} can now sign in`, form.email);
    }

    setCreating(false);
    setForm(blankUser(campuses));
    router.refresh();
  }

  async function saveAssignment() {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    const supabase = createClient();

    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role: editRole })
      .eq("id", editing.id);
    if (roleError) {
      setBusy(false);
      setFormError(roleError.message);
      return;
    }

    await supabase.from("user_units").delete().eq("user_id", editing.id);
    if (editUnits.length) {
      const { error } = await supabase
        .from("user_units")
        .insert(editUnits.map((org_unit_id) => ({ user_id: editing.id, org_unit_id })));
      if (error) {
        setBusy(false);
        setFormError(error.message);
        return;
      }
    }

    setBusy(false);
    toast.success("Account updated", editing.name || editing.email);
    setEditing(null);
    router.refresh();
  }

  async function deleteUser(user: Profile) {
    const ok = await confirm({
      title: "Delete this account?",
      body: `${user.name || user.email} will lose access immediately. This cannot be undone — the assets they recorded stay in the register.`,
      confirmLabel: "Delete account",
    });
    if (!ok) return;

    setBusy(true);
    const response = await fetch(`/api/admin/users?id=${user.id}`, { method: "DELETE" });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      toast.error("Could not delete the account", result.error);
      return;
    }
    toast.success("Account deleted", user.name || user.email);
    router.refresh();
  }

  const admins = profiles.filter((p) => p.role === "admin").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-nsuk-muted">
          <span className="font-semibold text-nsuk-ink">{profiles.length}</span> account
          {profiles.length === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-nsuk-ink">{admins}</span> administrator
          {admins === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => {
            setForm(blankUser(campuses));
            setFormError(null);
            setCreating(true);
          }}
          className="btn-green"
        >
          <Plus className="h-4 w-4" /> Create an account
        </button>
      </div>

      <ul className="stagger space-y-2">
        {profiles.map((user) => {
          const assigned = unitsByUser[user.id] ?? [];
          const isSelf = user.id === currentUserId;
          return (
            <li key={user.id} className="card flex items-center gap-3">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  user.role === "admin"
                    ? "bg-nsuk-blue text-white"
                    : "bg-nsuk-blue-50 text-nsuk-blue"
                }`}
              >
                {user.role === "admin" ? (
                  <ShieldCheck className="h-5 w-5" />
                ) : (
                  <UserRound className="h-5 w-5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-semibold text-nsuk-ink">
                  {user.name || user.email}
                  {isSelf && (
                    <span className="chip border-nsuk-gold/40 bg-nsuk-gold-50 text-nsuk-gold-deep">
                      you
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-nsuk-faint">{user.email}</p>
                <p className="truncate text-xs text-nsuk-green">
                  {user.role === "admin"
                    ? "University-wide administrator"
                    : assigned.length
                      ? assigned
                          .map((id) => unitPath(id, units).split(" › ").pop())
                          .join(", ")
                      : "No unit assigned"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => {
                    setEditing(user);
                    setEditUnits(assigned);
                    setEditRole(user.role);
                    setFormError(null);
                  }}
                  className="btn-ghost btn-sm"
                >
                  Manage
                </button>
                {!isSelf && (
                  <button
                    onClick={() => deleteUser(user)}
                    disabled={busy}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-danger transition hover:bg-nsuk-danger-soft"
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

      {/* ---- Create ---- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New account"
        description="The person signs in with this email and password. Ask them to change the password after their first sign-in."
        footer={
          <button
            type="submit"
            form="new-user-form"
            className="btn-green w-full"
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account
          </button>
        }
      >
        <form id="new-user-form" onSubmit={createUser} className="space-y-4 pb-2">
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
              placeholder="e.g. Aisha Bello"
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
              placeholder="name@nsuk.edu.ng"
            />
          </div>

          <div>
            <label className="label" htmlFor="new-password">
              Temporary password
            </label>
            <input
              id="new-password"
              className="field font-mono"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          {form.role === "staff" ? (
            <div>
              <span className="label">Assigned units</span>
              <UnitPicker
                ordered={ordered}
                selected={form.unit_ids}
                onToggle={(id) => setForm({ ...form, unit_ids: toggle(form.unit_ids, id) })}
              />
            </div>
          ) : (
            <p className="rounded-xl border border-nsuk-gold/30 bg-nsuk-gold-50 p-3 text-sm text-nsuk-gold-deep">
              Administrators see and manage every unit in the University — no assignment needed.
            </p>
          )}

          {formError && (
            <p className="rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      {/* ---- Manage ---- */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.name || editing?.email || "Account"}
        description={editing?.email}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={saveAssignment} className="btn-green" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4 pb-2">
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
                <p className="hint">
                  You cannot change your own role — this stops the University locking itself out.
                </p>
              )}
            </div>

            {editRole === "staff" && (
              <div>
                <span className="label">Assigned units</span>
                <UnitPicker
                  ordered={ordered}
                  selected={editUnits}
                  onToggle={(id) => setEditUnits((prev) => toggle(prev, id))}
                />
              </div>
            )}

            {formError && (
              <p className="rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
