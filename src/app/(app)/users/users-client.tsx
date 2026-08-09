"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
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
    campus_id: (campuses.find((c) => c.name.startsWith("Keffi")) ?? campuses[0])?.id ?? "",
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
  const visible = needle ? ordered.filter((u) => u.name.toLowerCase().includes(needle)) : ordered;

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
  // Which field the current error belongs to, so it can be marked in place.
  const [problemField, setProblemField] = useState<string | null>(null);

  const [form, setForm] = useState<NewUser>(() => blankUser(campuses));
  const [access, setAccess] = useState<"invite" | "password">("invite");
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [editRole, setEditRole] = useState<Role>("staff");

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((u) => u !== id) : [...list, id];

  /**
   * Names the first field that is not filled in, and brings it into view. The
   * form is longer than a phone screen, so a message about a field nobody can
   * see is worse than no message at all.
   */
  function firstProblem(): { id: string; message: string } | null {
    if (!form.name.trim()) {
      return { id: "new-name", message: "Enter the person's full name." };
    }
    if (!form.email.trim()) {
      return { id: "new-email", message: "Enter their email address." };
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return { id: "new-email", message: "That email address does not look right." };
    }
    if (access === "password" && form.password.length < 8) {
      return {
        id: "new-password",
        message: "The password must be at least 8 characters.",
      };
    }
    return null;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();

    const problem = firstProblem();
    if (problem) {
      setFormError(problem.message);
      setProblemField(problem.id);
      // Deferred by a frame, and the field is focused rather than merely
      // scrolled to. On a phone, pressing the button dismisses the keyboard,
      // which resizes the viewport and re-scrolls the page a moment later;
      // scrolling immediately is undone by that. Focusing also makes the phone
      // bring the field into view itself, which is more reliable than asking.
      requestAnimationFrame(() => {
        const field = document.getElementById(problem.id);
        field?.focus();
        field?.scrollIntoView({ block: "center" });
      });
      return;
    }

    setBusy(true);
    setFormError(null);
    setProblemField(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        campus_id: form.role === "admin" ? null : form.campus_id,
        invite: access === "invite",
        // Sent so the invitation link points back at whichever address this
        // site is being used on, rather than a domain baked in at build time.
        origin: window.location.origin,
      }),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setFormError(result.error ?? "Could not create the account.");
      return;
    }

    if (result.invited) {
      toast.success(`Invitation sent to ${form.email}`, "They choose their own password.");
    } else if (result.needsEmailConfirmation) {
      toast.info(
        `${form.name} was created`,
        "They must confirm their email address before they can sign in.",
      );
    } else {
      toast.success(`${form.name} can now sign in`, form.email);
    }

    setCreating(false);
    setForm(blankUser(campuses));
    setAccess("invite");
    router.refresh();
  }

  async function saveAssignment() {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    const supabase = createClient();

    const { error: roleError } = await supabase
      .from("profiles")
      .update({
        role: editRole,
        // A promotion to administrator makes every campus theirs, so the old
        // single-campus stamp is cleared.
        ...(editRole === "admin" ? { campus_id: null } : {}),
      })
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

  /**
   * Set a password on someone else's account. Accounts here are handed over in
   * person rather than by email, so "Forgotten password" cannot reach anyone;
   * without this an administrator has no way to help someone locked out.
   */
  async function resetPassword() {
    if (!editing || newPassword.length < 8) return;

    const ok = await confirm({
      title: `Set a new password for ${editing.name || editing.email}?`,
      body: "Their current password stops working immediately. Give them the new one and ask them to change it from My account.",
      confirmLabel: "Set password",
    });
    if (!ok) return;

    setBusy(true);
    setFormError(null);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing.id, password: newPassword }),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setFormError(result.error ?? "Could not set the password.");
      return;
    }
    toast.success("Password set", `Give it to ${editing.name || editing.email} yourself.`);
    setNewPassword("");
  }

  async function deleteUser(user: Profile) {
    const ok = await confirm({
      title: "Delete this account?",
      body: `${user.name || user.email} will lose access immediately. This cannot be undone. Assets they recorded remain in the register.`,
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
                      ? assigned.map((id) => unitPath(id, units).split(" › ").pop()).join(", ")
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
                    setNewPassword("");
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
        description="Their role and units are set here, so the account is right from their first sign-in."
        tall
        footer={
          <div className="space-y-2">
            {/* Kept beside the button rather than at the end of the form, which
                on a phone is scrolled well out of sight. */}
            {formError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {formError}
              </p>
            )}
            <button type="submit" form="new-user-form" className="btn-green w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
              {access === "invite" ? "Send invitation" : "Create account"}
            </button>
          </div>
        }
      >
        {/* noValidate: the browser anchors "Please fill in this field" to the
            offending input, which in a scrolling sheet is usually out of sight,
            so the warning appears to belong to whichever field happens to be on
            screen. createUser checks the fields itself and brings the right one
            into view. */}
        <form id="new-user-form" onSubmit={createUser} noValidate className="space-y-4 pb-2">
          <div>
            <label className="label" htmlFor="new-name">
              Full name
            </label>
            <input
              id="new-name"
              className={`field ${problemField === "new-name" ? "border-nsuk-danger" : ""}`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              placeholder="e.g. Aisha Bello"
            />
            {/* Repeated at the field as well as beside the button. Scrolling on
                a phone is unreliable enough that the message should be findable
                wherever the person ends up looking. */}
            {problemField === "new-name" && <p className="hint text-nsuk-danger">{formError}</p>}
          </div>

          <div>
            <label className="label" htmlFor="new-email">
              Email
            </label>
            <input
              id="new-email"
              type="email"
              className={`field ${problemField === "new-email" ? "border-nsuk-danger" : ""}`}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              placeholder="name@nsuk.edu.ng"
            />
          </div>

          {/* Inviting is the normal route: no password is invented, sent or
              known by anyone but the person themselves. Setting one by hand
              stays available for when email cannot reach them. */}
          <div>
            <span className="label">How they get in</span>
            <div
              role="radiogroup"
              aria-label="How they get in"
              className="grid gap-1 rounded-xl bg-nsuk-cream p-1 sm:grid-cols-2"
            >
              {(
                [
                  ["invite", "Send an invitation", Mail],
                  ["password", "Set a password", KeyRound],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={access === value}
                  onClick={() => setAccess(value)}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    access === value
                      ? "bg-nsuk-blue text-white shadow-[var(--shadow-e2)]"
                      : "text-nsuk-blue hover:bg-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <p className="hint">
              {access === "invite"
                ? "They receive an email and choose their own password. You never see it."
                : "You choose the password and pass it on yourself. Use this if email cannot reach them."}
            </p>
          </div>

          {access === "password" && (
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
          )}

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
            {form.role === "staff" && (
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
            )}
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
              Administrators have access to every campus and every unit in the University. No campus
              or unit assignment is required.
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
                  You cannot change your own role. This prevents the University from losing
                  administrative access.
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

            <div className="rounded-xl border border-nsuk-line bg-nsuk-cream p-3">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-nsuk-blue" />
                <div>
                  <p className="text-sm font-semibold text-nsuk-ink">Set a new password</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-nsuk-muted">
                    For when someone is locked out. Their old password stops working at once, and
                    they can change this one themselves from My account.
                  </p>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  className="field font-mono"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  aria-label={`New password for ${editing.name || editing.email}`}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={busy || newPassword.length < 8}
                  className="btn-ghost shrink-0"
                >
                  Set
                </button>
              </div>
            </div>

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
