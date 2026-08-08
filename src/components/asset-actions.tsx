"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Loader2, Printer, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import UnitSelect from "@/components/unit-select";
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
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetUnit, setTargetUnit] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function printLabel() {
    const doc = await generateSingleLabel({
      barcode: asset.barcode,
      name: asset.name,
      unitName: unitPath(asset.org_unit_id, units),
      categoryName,
    });
    savePdf(doc, `${asset.barcode}.pdf`);
  }

  async function move() {
    if (!targetUnit) {
      setError("Choose the unit to transfer this asset to.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc("move_asset", {
      p_asset_id: asset.id,
      p_to_unit_id: targetUnit,
      p_reason: reason.trim() || "No reason given",
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMoveOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete “${asset.name}” (${asset.barcode})? This cannot be undone.`)) return;
    setBusy(true);
    const { error: deleteError } = await createClient()
      .from("assets")
      .delete()
      .eq("id", asset.id);
    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/assets");
    router.refresh();
  }

  return (
    <>
      <button onClick={printLabel} className="btn-gold">
        <Printer className="h-4 w-4" /> Print label
      </button>

      <button onClick={() => setMoveOpen(true)} className="btn-ghost">
        <ArrowRightLeft className="h-4 w-4" /> Transfer to another unit
      </button>

      {isAdmin && (
        <button
          onClick={remove}
          disabled={busy}
          className="btn border border-[#B91C1C]/30 bg-white text-[#B91C1C] hover:bg-[#B91C1C]/8"
        >
          <Trash2 className="h-4 w-4" /> Delete asset
        </button>
      )}

      {error && !moveOpen && (
        <p className="text-sm text-[#B91C1C] sm:col-span-2">{error}</p>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div>
              <h2 className="text-lg font-bold text-nsuk-blue">Transfer asset</h2>
              <p className="text-sm text-neutral-600">
                Moving “{asset.name}” out of {unitPath(asset.org_unit_id, units)}. The transfer is
                recorded in the activity log.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="move-unit">
                New unit
              </label>
              <UnitSelect
                id="move-unit"
                units={units}
                value={targetUnit}
                onChange={setTargetUnit}
                placeholder="Select destination unit"
              />
              {!isAdmin && (
                <p className="mt-1 text-xs text-neutral-500">
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

            {error && <p className="text-sm text-[#B91C1C]">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMoveOpen(false)} className="btn-ghost">
                Cancel
              </button>
              <button onClick={move} className="btn-green" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
