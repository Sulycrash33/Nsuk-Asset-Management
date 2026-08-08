"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildTree, flattenTree, unitPath } from "@/lib/tree";
import type { Campus, OrgUnit } from "@/lib/types";

/**
 * Typeahead over the org tree. Indentation shows nesting, and administrators can
 * create a missing unit inline rather than leaving the form to go and add it.
 */
export default function UnitSelect({
  units,
  value,
  onChange,
  allowCreate = false,
  campuses = [],
  campusId,
  onUnitCreated,
  placeholder = "Select a unit",
  restrictTo,
  id,
}: {
  units: OrgUnit[];
  value: string | null;
  onChange: (unitId: string) => void;
  allowCreate?: boolean;
  /** Campuses a newly created unit can belong to. */
  campuses?: Campus[];
  /** Preselected campus for inline creation. Administrators have none. */
  campusId?: string | null;
  onUnitCreated?: (unit: OrgUnit) => void;
  placeholder?: string;
  /** When given, only these unit ids are selectable (staff scoping). */
  restrictTo?: string[];
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // An administrator has no campus of their own, so inline creation asks which
  // campus the new unit belongs to rather than guessing.
  const [newUnitCampus, setNewUnitCampus] = useState(
    () =>
      campusId ??
      campuses.find((c) => c.name.startsWith("Keffi"))?.id ??
      campuses[0]?.id ??
      "",
  );

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

  async function createUnit() {
    const name = term.trim();
    if (!name) return;
    if (!newUnitCampus) {
      setError("Add a campus first. Every unit must belong to one.");
      return;
    }
    setCreating(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("org_units")
      .insert({ name, campus_id: newUnitCampus, parent_id: null, unit_type: "Other" })
      .select("*")
      .single();
    setCreating(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create the unit.");
      return;
    }
    onUnitCreated?.(data as OrgUnit);
    onChange(data.id);
    setTerm("");
    setOpen(false);
  }

  return (
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

          {allowCreate && term.trim() && !exactExists && (
            <div className="border-t border-nsuk-line p-2">
              {campuses.length > 1 && (
                <label className="mb-2 flex items-center gap-2 px-1 text-xs text-nsuk-muted">
                  <span className="shrink-0">Campus</span>
                  <select
                    value={newUnitCampus}
                    onChange={(e) => setNewUnitCampus(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-nsuk-line bg-white px-2 py-1.5 text-sm outline-none focus:border-nsuk-blue"
                  >
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                onClick={createUnit}
                disabled={creating}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-semibold text-nsuk-green hover:bg-nsuk-cream disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">Add new unit “{term.trim()}”</span>
              </button>
            </div>
          )}

          {error && <p className="px-3 py-2 text-xs text-nsuk-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
