"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { buildTree, type UnitNode } from "@/lib/tree";
import { UNIT_TYPES, type Campus, type OrgUnit } from "@/lib/types";

type Draft = {
  id?: string;
  name: string;
  unit_type: string;
  campus_id: string;
  parent_id: string | null;
};

const TYPE_TONE: Record<string, string> = {
  Faculty: "border-nsuk-blue/25 bg-nsuk-blue-50 text-nsuk-blue",
  Department: "border-nsuk-line bg-nsuk-cream text-nsuk-muted",
  Directorate: "border-nsuk-green/25 bg-nsuk-green-50 text-nsuk-green",
  Office: "border-nsuk-line bg-nsuk-cream text-nsuk-muted",
  Clinic: "border-nsuk-gold/40 bg-nsuk-gold-50 text-nsuk-gold-deep",
  Other: "border-nsuk-line bg-nsuk-cream text-nsuk-muted",
};

export default function UnitsClient({
  units,
  campuses,
  assetCounts,
}: {
  units: OrgUnit[];
  campuses: Campus[];
  assetCounts: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [term, setTerm] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(units), [units]);
  const needle = term.trim().toLowerCase();

  function matches(node: UnitNode): boolean {
    if (!needle) return true;
    if (node.name.toLowerCase().includes(needle)) return true;
    return node.children.some(matches);
  }

  async function save() {
    if (!draft || !draft.name.trim()) return;
    setBusy(true);
    setDraftError(null);
    const supabase = createClient();

    const payload = {
      name: draft.name.trim(),
      unit_type: draft.unit_type,
      campus_id: draft.campus_id,
      parent_id: draft.parent_id,
    };

    const { error } = draft.id
      ? await supabase.from("org_units").update(payload).eq("id", draft.id)
      : await supabase.from("org_units").insert(payload);

    setBusy(false);
    if (error) {
      setDraftError(error.message);
      return;
    }

    toast.success(draft.id ? "Unit updated" : "Unit added", payload.name);
    setDraft(null);
    router.refresh();
  }

  async function remove(node: UnitNode) {
    const count = assetCounts[node.id] ?? 0;
    if (count > 0) {
      toast.error(
        "Unit still holds assets",
        `“${node.name}” has ${count} asset${count === 1 ? "" : "s"}. Transfer or delete them first.`,
      );
      return;
    }

    const ok = await confirm({
      title: `Remove “${node.name}”?`,
      body: node.children.length
        ? `This also removes its ${node.children.length} sub-unit${node.children.length === 1 ? "" : "s"}. This cannot be undone.`
        : "This cannot be undone.",
      confirmLabel: "Remove unit",
    });
    if (!ok) return;

    setBusy(true);
    const { error } = await createClient().from("org_units").delete().eq("id", node.id);
    setBusy(false);

    if (error) {
      toast.error("Could not remove the unit", error.message);
      return;
    }
    toast.success("Unit removed", node.name);
    router.refresh();
  }

  function renderNode(node: UnitNode) {
    if (!matches(node)) return null;
    const isCollapsed = collapsed.has(node.id) && !needle;
    const count = assetCounts[node.id] ?? 0;

    return (
      <li key={node.id}>
        <div
          className="group flex items-center gap-2 rounded-xl px-1 py-2 transition hover:bg-nsuk-cream"
          style={{ paddingLeft: `${4 + node.depth * 18}px` }}
        >
          <button
            type="button"
            onClick={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-nsuk-faint transition ${
              node.children.length ? "hover:bg-white hover:text-nsuk-blue" : "invisible"
            }`}
            aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={`truncate text-sm ${
                  node.depth === 0 ? "font-semibold text-nsuk-blue" : "text-nsuk-ink"
                }`}
              >
                {node.name}
              </p>
              <span className={`chip ${TYPE_TONE[node.unit_type] ?? TYPE_TONE.Other}`}>
                {node.unit_type}
              </span>
            </div>
            <p className="truncate text-xs text-nsuk-faint">
              {node.code && <span className="font-mono">{node.code}</span>}
              {count > 0 && ` · ${count} asset${count === 1 ? "" : "s"}`}
              {node.children.length > 0 && ` · ${node.children.length} sub-unit${node.children.length === 1 ? "" : "s"}`}
            </p>
          </div>

          {/* Always visible on touch; revealed on hover for pointer users. */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
            {count > 0 && (
              <Link href={`/assets?unit=${node.id}`} className="btn-ghost btn-sm hidden sm:inline-flex">
                View
              </Link>
            )}
            <button
              onClick={() =>
                setDraft({
                  name: "",
                  unit_type: "Department",
                  campus_id: node.campus_id,
                  parent_id: node.id,
                })
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-green transition hover:bg-nsuk-green-50"
              aria-label={`Add a sub-unit under ${node.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                setDraft({
                  id: node.id,
                  name: node.name,
                  unit_type: node.unit_type,
                  campus_id: node.campus_id,
                  parent_id: node.parent_id,
                })
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-blue transition hover:bg-nsuk-blue-50"
              aria-label={`Edit ${node.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(node)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-danger transition hover:bg-nsuk-danger-soft"
              aria-label={`Remove ${node.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!isCollapsed && node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-nsuk-faint" />
          <input
            className="field pl-10"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find a unit"
            aria-label="Find a unit"
          />
        </div>
        <button
          onClick={() =>
            setDraft({
              name: "",
              unit_type: "Faculty",
              campus_id: campuses[0]?.id ?? "",
              parent_id: null,
            })
          }
          className="btn-green shrink-0"
        >
          <Plus className="h-4 w-4" /> Top-level unit
        </button>
      </div>

      <ul className="-mx-1">{tree.map(renderNode)}</ul>

      <Modal
        open={draft !== null}
        onClose={() => {
          setDraft(null);
          setDraftError(null);
        }}
        title={draft?.id ? "Edit unit" : draft?.parent_id ? "Add sub-unit" : "Add top-level unit"}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDraft(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} className="btn-green" disabled={busy || !draft?.name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4 pb-2">
            <div>
              <label className="label" htmlFor="unit-name">
                Name
              </label>
              <input
                id="unit-name"
                className="field"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Department of Statistics & Data Analytics"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="unit-type">
                  Unit type
                </label>
                <select
                  id="unit-type"
                  className="field"
                  value={draft.unit_type}
                  onChange={(e) => setDraft({ ...draft, unit_type: e.target.value })}
                >
                  {UNIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="hint">Used for reporting only. It does not change any behaviour.</p>
              </div>

              <div>
                <label className="label" htmlFor="unit-campus">
                  Campus
                </label>
                <select
                  id="unit-campus"
                  className="field"
                  value={draft.campus_id}
                  onChange={(e) => setDraft({ ...draft, campus_id: e.target.value })}
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {draftError && (
              <p className="rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
                {draftError}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
