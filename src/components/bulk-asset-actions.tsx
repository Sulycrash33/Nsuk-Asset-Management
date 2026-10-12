"use client";
import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CONDITIONS, type OrgUnit } from "@/lib/types";
import UnitSelect from "@/components/unit-select";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
export default function BulkAssetActions({ children, units, restrictTo, readOnly = false }: { children: ReactNode; units: OrgUnit[]; restrictTo?: string[]; readOnly?: boolean }) {
  const form = useRef<HTMLFormElement>(null), router = useRouter(), confirm = useConfirm(), toast = useToast();
  const [selected, setSelected] = useState(0), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("condition"), [condition, setCondition] = useState<string>("Working");
  const [unit, setUnit] = useState<string | null>(null), [reason, setReason] = useState("");
  function selectShown() {
    const boxes = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="asset"]') ?? [])];
    const next = boxes.some(box => !box.checked); boxes.forEach(box => { box.checked = next; });
    setSelected(next ? boxes.length : 0);
  }
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || readOnly) return;
    const ids = new FormData(event.currentTarget).getAll("asset").map(String);
    if (!ids.length || (mode === "transfer" && (!unit || !reason.trim()))) return;
    setBusy(true);
    try {
    const accepted = await confirm({ title: `Change ${ids.length} selected assets?`, body: mode === "condition" ? `Set their condition to ${condition}. Each asset keeps its recorded history.` : `Transfer these assets to the selected unit. Reason: ${reason.trim()}`, confirmLabel: "Apply change", tone: "default" });
    if (!accepted) return;
      const { data, error } = await createClient().rpc("bulk_update_assets", { p_asset_ids: ids, p_condition: mode === "condition" ? condition : null, p_org_unit_id: mode === "transfer" ? unit : null, p_reason: mode === "transfer" ? reason.trim() : null });
      if (error) throw new Error(error.message);
      if (data !== ids.length) throw new Error("The update could not be confirmed. Refresh the list before retrying.");
      for (const box of form.current?.querySelectorAll<HTMLInputElement>('input[name="asset"]') ?? []) box.checked = false;
      setSelected(0); toast.success(`${data} assets updated`); router.refresh();
    } catch (error) { toast.error("Bulk change failed", error instanceof Error ? error.message : "Refresh and try again."); }
    finally { setBusy(false); }
  }
  if (readOnly) return <div>{children}</div>;
  return <form ref={form} onSubmit={apply} onChange={() => setSelected(form.current?.querySelectorAll('input[name="asset"]:checked').length ?? 0)} className="space-y-3">
    <fieldset disabled={busy} className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3"><button type="button" className="btn-ghost btn-sm" onClick={selectShown}>Select / clear this page</button><span className="text-sm text-nsuk-muted">{selected} selected (up to 100)</span></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><label className="label" htmlFor="bulk-mode">Bulk change</label><select id="bulk-mode" className="field" value={mode} onChange={e => setMode(e.target.value)}><option value="condition">Set condition</option><option value="transfer">Transfer unit</option></select></div>
      {mode === "condition" ? <div><label className="label" htmlFor="bulk-condition">Condition</label><select id="bulk-condition" className="field" value={condition} onChange={e => setCondition(e.target.value)}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div> : <div><label className="label" htmlFor="bulk-unit">Destination unit</label><UnitSelect id="bulk-unit" units={units} value={unit} onChange={setUnit} restrictTo={restrictTo} /></div>}</div>
      {mode === "transfer" && <div><label className="label" htmlFor="bulk-reason">Transfer reason</label><input id="bulk-reason" className="field" value={reason} onChange={e => setReason(e.target.value)} /></div>}
      <button className="btn-primary btn-sm" disabled={!selected || (mode === "transfer" && (!unit || !reason.trim()))}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply to selected assets</button>
    </fieldset>
    <fieldset disabled={busy}>{children}</fieldset>
  </form>;
}
