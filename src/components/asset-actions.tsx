"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft, Loader2, Printer, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { removeUnusedAssetPhoto } from "@/lib/asset-photo";
import UnitSelect from "@/components/unit-select";
import LabelPaperSelect from "@/components/label-paper-select";
import Modal from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { generateSingleLabel, savePdf } from "@/lib/pdf";
import { unitPath } from "@/lib/tree";
import type { AssetWithRefs, OrgUnit } from "@/lib/types";

/**
 * Print label (anyone who can see the asset, since every account reads the
 * whole register), transfer to another unit (those who may edit it), and
 * delete (administrators).
 */
export default function AssetActions({
  asset,
  units,
  isAdmin,
  canEdit,
}: {
  asset: AssetWithRefs;
  units: OrgUnit[];
  isAdmin: boolean;
  canEdit: boolean;
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
      const doc = await generateSingleLabel({ barcode: asset.barcode });
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
      title: "Are you sure you want to delete this asset?",
      body: `“${asset.name}” (${asset.barcode}) will be removed from the register, along with its photo. The activity log and any accounting records keep a note of it, but the asset and its photo cannot be restored.`,
      confirmLabel: "Delete asset",
      typeToConfirm: "delete",
    });
    if (!ok) return;

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("assets").delete().eq("id", asset.id);
    if (error) {
      setBusy(false);
      toast.error("Could not delete the asset", error.message);
      return;
    }
    // The asset is gone; its photo and thumbnail go with it, so storage is
    // not left holding pictures of things no longer in the register.
    const photoRemoved = await removeUnusedAssetPhoto(
      supabase,
      asset.photo_url,
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
    );
    setBusy(false);
    toast.success("Asset deleted", asset.barcode);
    if (!photoRemoved) {
      toast.info("The asset's photo could not be removed", "It stays in storage; the asset itself is deleted.");
    }
    router.push("/assets");
    router.refresh();
  }

  return (
    <>
      <div className="space-y-2 sm:col-span-2">
        <LabelPaperSelect />
        <button onClick={printLabel} disabled={printing} className="btn-gold w-full">
          {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Print label
        </button>
      </div>

      {canEdit && (
        <button onClick={() => setMoveOpen(true)} className="btn-ghost">
          <ArrowRightLeft className="h-4 w-4" /> Transfer to another unit
        </button>
      )}

      {canEdit && isAdmin && (
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
