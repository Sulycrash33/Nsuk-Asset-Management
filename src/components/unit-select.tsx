"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildTree, flattenTree, unitPath } from "@/lib/tree";
import Modal from "@/components/ui/modal";
import { UNIT_TYPES, type OrgUnit } from "@/lib/types";

/** Kinds a new unit can be. Faculties and schools are the top of the tree. */
const NEW_UNIT_TYPES = UNIT_TYPES.filter((t) => t !== "Faculty" && t !== "School");

/**
 * Typeahead over the org tree. Indentation shows nesting. With `allowCreate`,
 * the last option in the list adds a missing unit beneath a parent the person
 * picks, through `add_org_unit`, which any signed-in account may call and which
 * chooses a short code no other unit in that tree uses.
 */
export default function UnitSelect({
  units,
  value,
  onChange,
  allowCreate = false,
  onUnitCreated,
  placeholder = "Select a unit",
  restrictTo,
  id,
}: {
  units: OrgUnit[];
  value: string | null;
  onChange: (unitId: string) => void;
  allowCreate?: boolean;
  onUnitCreated?: (unit: OrgUnit) => void;
  placeholder?: string;
  /** When given, only these unit ids are selectable (staff scoping). */
  restrictTo?: string[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string | null>(null);
  const [newType, setNewType] = useState<string>("Department");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const ordered = useMemo(() => flattenTree(buildTree(units)), [units]);
  const allowed = useMemo(
    () => (restrictTo ? new Set(restrictTo) : null),
    [restrictTo],
  );

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return ordered.filter((u) => {
      if (allowed && !allowed.has(u.id)) return false;
      if (!needle) return true;
      return (
        u.name.toLowerCase().includes(needle) ||
        (u.code ?? "").toLowerCase().includes(needle) ||
        unitPath(u.id, units).toLowerCase().includes(needle)
      );
    });
  }, [ordered, term, allowed, units]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selectedLabel = value ? unitPath(value, units) : "";
  const exactExists = matches.some((u) => u.name.toLowerCase() === term.trim().toLowerCase());

  function startAdding() {
    setNewName(term.trim());
    // A unit is usually missing next to the one already chosen.
    setNewParent(value ? (units.find((u) => u.id === value)?.parent_id ?? value) : null);
    setNewType("Department");
    setError(null);
    setOpen(false);
    setAdding(true);
  }

  async function createUnit() {
    const name = newName.trim();
    if (!name) {
      setError("Type the unit's name.");
      return;
    }
    if (!newParent) {
      setError("Choose the faculty, directorate or office it belongs under.");
      return;
    }
    setCreating(true);
    setError(null);
    const { data, error: rpcError } = await createClient()
      .rpc("add_org_unit", { p_name: name, p_parent_id: newParent, p_unit_type: newType })
      .single();
    setCreating(false);

    if (rpcError || !data) {
      setError(rpcError?.message ?? "Could not add the unit.");
      return;
    }
    const unit = data as OrgUnit;
    onUnitCreated?.(unit);
    onChange(unit.id);
    setTerm("");
    setAdding(false);
  }

  return (
    <>
    <div ref={boxRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center justify-between gap-2 text-left"
      >
        <span className={selectedLabel ? "truncate text-nsuk-ink" : "truncate text-nsuk-faint"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-nsuk-faint" />
      </button>

      {open && (
        <div className="animate-pop-in absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-nsuk-line bg-white shadow-[var(--shadow-e3)]">
          <div className="flex items-center gap-2 border-b border-nsuk-line px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-nsuk-faint" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search faculties, departments, offices…"
              className="w-full bg-transparent py-1.5 text-base outline-none"
            />
          </div>

          <ul className="scroll-slim max-h-72 overflow-y-auto py-1">
            {matches.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(u.id);
                    setOpen(false);
                    setTerm("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-nsuk-cream"
                  style={{ paddingLeft: `${12 + u.depth * 14}px` }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className={u.depth === 0 ? "font-semibold text-nsuk-blue" : ""}>
                      {u.name}
                    </span>
                    <span className="ml-2 text-xs text-nsuk-faint">{u.unit_type}</span>
                  </span>
                  {value === u.id && <Check className="h-4 w-4 shrink-0 text-nsuk-green" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-4 text-sm text-nsuk-faint">No matching unit.</li>
            )}
          </ul>

          {allowCreate && (
            <div className="border-t border-nsuk-line p-1">
              <button
                type="button"
                onClick={startAdding}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-semibold text-nsuk-green hover:bg-nsuk-cream"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {term.trim() && !exactExists ? `Add “${term.trim()}” as a new unit` : "Add a unit"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>

    {allowCreate && (
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a unit"
        description="It goes under the unit you choose, and its asset codes are built from both, so pick the right one."
        tall
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={createUnit} className="btn-green" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} Add unit
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <div>
            <label className="label" htmlFor={`${id ?? "unit"}-new-name`}>
              Unit name *
            </label>
            <input
              id={`${id ?? "unit"}-new-name`}
              className="field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              // The picker sits inside the asset form; Enter must add the
              // unit, not save the asset.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createUnit();
                }
              }}
              placeholder="e.g. Store Office"
              maxLength={120}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id ?? "unit"}-new-parent`}>
              Belongs under *
            </label>
            <UnitSelect
              id={`${id ?? "unit"}-new-parent`}
              units={units}
              value={newParent}
              onChange={setNewParent}
              placeholder="Select the faculty, directorate or office"
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id ?? "unit"}-new-type`}>
              Type
            </label>
            <select
              id={`${id ?? "unit"}-new-type`}
              className="field"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            >
              {NEW_UNIT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-nsuk-danger">{error}</p>}
        </div>
      </Modal>
    )}
    </>
  );
}
