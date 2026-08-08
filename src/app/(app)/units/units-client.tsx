"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildTree, type UnitNode } from "@/lib/tree";
import { UNIT_TYPES, type Campus, type OrgUnit } from "@/lib/types";

type Draft = {
  id?: string;
  name: string;
  unit_type: string;
  campus_id: string;
  parent_id: string | null;
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
  const [term, setTerm] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const supabase = createClient();

    const payload = {
      name: draft.name.trim(),
      unit_type: draft.unit_type,
      campus_id: draft.campus_id,
      parent_id: draft.parent_id,
    };

    const { error: saveError } = draft.id
      ? await supabase.from("org_units").update(payload).eq("id", draft.id)
      : await supabase.from("org_units").insert(payload);

    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setDraft(null);
    router.refresh();
  }

  async function remove(node: UnitNode) {
    const count = assetCounts[node.id] ?? 0;
    if (count > 0) {
      alert(
        `“${node.name}” still holds ${count} asset${count === 1 ? "" : "s"}. Transfer or delete them first.`,
      );
      return;
    }
    if (
      !confirm(
        `Remove “${node.name}”${node.children.length ? ` and its ${node.children.length} sub-unit(s)` : ""}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusy(true);
    const { error: deleteError } = await createClient()
      .from("org_units")
      .delete()
      .eq("id", node.id);
    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  function renderNode(node: UnitNode) {
    if (!matches(node)) return null;
    const isCollapsed = collapsed.has(node.id) && !needle;
    const count = assetCounts[node.id] ?? 0;

    return (
      <li key={node.id}>
        <div
          className="flex items-center gap-2 border-b border-nsuk-line py-2.5"
          style={{ paddingLeft: `${node.depth * 16}px` }}
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
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-400 ${
              node.children.length ? "hover:bg-nsuk-cream" : "invisible"
            }`}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm ${
                node.depth === 0 ? "font-semibold text-nsuk-blue" : "text-nsuk-ink"
              }`}
            >
              {node.name}
            </p>
            <p className="truncate text-xs text-neutral-500">
              {node.unit_type}
              {node.code && ` · ${node.code}`}
              {count > 0 && ` · ${count} asset${count === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {count > 0 && (
              <Link href={`/assets?unit=${node.id}`} className="btn-ghost btn-sm">
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-green hover:bg-nsuk-cream"
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nsuk-blue hover:bg-nsuk-cream"
              aria-label={`Edit ${node.name}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(node)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#B91C1C] hover:bg-[#B91C1C]/8"
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
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400" />
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

      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}

      <ul className="-mb-2.5">{tree.map(renderNode)}</ul>

      {draft && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <h2 className="text-lg font-bold text-nsuk-blue">
              {draft.id ? "Edit unit" : draft.parent_id ? "Add sub-unit" : "Add top-level unit"}
            </h2>

            <div>
              <label className="label" htmlFor="unit-name">
                Name
              </label>
              <input
                id="unit-name"
                className="field"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                placeholder="e.g. Department of Statistics & Data Analytics"
              />
            </div>

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

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDraft(null)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={save} className="btn-green" disabled={busy || !draft.name.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
