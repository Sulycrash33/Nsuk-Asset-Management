"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Loader2, Printer, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import UnitSelect from "@/components/unit-select";
import Modal from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { generateSingleLabel, savePdf } from "@/lib/pdf";
import { unitPath } from "@/lib/tree";
import type { AssetWithRefs, OrgUnit } from "@/lib/types";

/** Print label, transfer to another unit, and (admins) delete. */
export default function AssetActions({
  asset,
  units,
  isAdmin,
  categoryName,
}: {
  asset: AssetWithRefs;
  units: OrgUnit[];
  isAdmin: boolean;
  categoryName: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [moveOpen, setMoveOpen] = useState(false);
  const [targetUnit, setTargetUnit] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function printLabel() {
    setPrinting(true);
    try {
      const doc = await generateSingleLabel({
        barcode: asset.barcode,
        name: asset.name,
        unitName: unitPath(asset.org_unit_id, units),
        categoryName,
      });
      savePdf(doc, `${asset.barcode}.pdf`);
      toast.success("Label ready", `${asset.barcode}.pdf has been downloaded.`);
    } catch {
      toast.error("Could not generate the label", "Try again, or print from the Labels screen.");
    } finally {
      setPrinting(false);
    }
  }

  async function move() {
    if (!targetUnit) {
      setMoveError("Choose the unit to transfer this asset to.");
      return;
    }
    setBusy(true);
    setMoveError(null);

    const { error } = await createClient().rpc("move_asset", {
      p_asset_id: asset.id,
      p_to_unit_id: targetUnit,
      p_reason: reason.trim() || "No reason given",
    });
    setBusy(false);

    if (error) {
      setMoveError(error.message);
      return;
    }

    setMoveOpen(false);
    toast.success("Asset transferred", `Now held by ${unitPath(targetUnit, units)}.`);
    setTargetUnit(null);
    setReason("");
    router.refresh();
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete this asset?",
      body: `“${asset.name}” (${asset.barcode}) will be removed from the register. The activity log keeps a record of the deletion, but the asset itself cannot be restored.`,
      confirmLabel: "Delete asset",
    });
    if (!ok) return;

    setBusy(true);
    const { error } = await createClient().from("assets").delete().eq("id", asset.id);
    setBusy(false);

    if (error) {
      toast.error("Could not delete the asset", error.message);
      return;
    }
    toast.success("Asset deleted", asset.barcode);
    router.push("/assets");
    router.refresh();
  }

  return (
    <>
      <button onClick={printLabel} disabled={printing} className="btn-gold">
        {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        Print label
      </button>

      <button onClick={() => setMoveOpen(true)} className="btn-ghost">
        <ArrowRightLeft className="h-4 w-4" /> Transfer to another unit
      </button>

      {isAdmin && (
        <button onClick={remove} disabled={busy} className="btn-danger">
          <Trash2 className="h-4 w-4" /> Delete asset
        </button>
      )}

      <Modal
        open={moveOpen}
        onClose={() => {
          setMoveOpen(false);
          setMoveError(null);
        }}
        title="Transfer asset"
        description={`Moving “${asset.name}” out of ${unitPath(asset.org_unit_id, units)}. The transfer is recorded in the activity log.`}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMoveOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={move} className="btn-green" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Transfer
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <div>
            <label className="label" htmlFor="move-unit">
              New unit
            </label>
            <UnitSelect
              id="move-unit"
              units={units}
              value={targetUnit}
              onChange={(id) => {
                setTargetUnit(id);
                setMoveError(null);
              }}
              placeholder="Select destination unit"
            />
            {!isAdmin && (
              <p className="hint">
                Once transferred out of your unit you will no longer be able to edit this asset.
              </p>
            )}
          </div>

          <div>
            <label className="label" htmlFor="move-reason">
              Reason
            </label>
            <input
              id="move-reason"
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Reassigned to the Bursary front desk"
            />
          </div>

          {moveError && (
            <p className="rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
              {moveError}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
