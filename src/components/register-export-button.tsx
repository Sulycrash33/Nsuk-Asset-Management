"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { generateRegisterPdf, generateSchedulePdf, savePdf, type ScheduleGroup } from "@/lib/pdf";
import { topTierOf } from "@/lib/tree";
import type { AssetWithRefs, Campus, OrgUnit } from "@/lib/types";

type Mode = "register" | "tier" | "campus";

const LABELS: Record<Mode, string> = {
  register: "Register PDF (plain list)",
  tier: "Schedule by Faculty / School / Directorate",
  campus: "Schedule by Campus",
};

/** Downloads the printable asset register for whatever list is on screen. */
export default function RegisterExportButton({
  assets,
  unitName,
  campusName,
  generatedBy,
  units,
  campuses,
}: {
  assets: AssetWithRefs[];
  unitName: string;
  campusName: string | null;
  generatedBy: string;
  units: OrgUnit[];
  campuses: Campus[];
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToast();

  /** Bundle the rows on screen into the groups the schedule prints. */
  function group(mode: Exclude<Mode, "register">): ScheduleGroup[] {
    const byCampus = new Map(campuses.map((c) => [c.id, c.name]));
    const buckets = new Map<string, ScheduleGroup>();

    for (const asset of assets) {
      let title = "Unassigned";
      if (mode === "tier") {
        title = topTierOf(asset.org_unit_id, units)?.name ?? "Unassigned";
      } else {
        const unit = units.find((u) => u.id === asset.org_unit_id);
        title = (unit && byCampus.get(unit.campus_id)) || "Unassigned";
      }
      const bucket = buckets.get(title) ?? { title, assets: [] };
      bucket.assets.push(asset);
      buckets.set(title, bucket);
    }

    return [...buckets.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  async function download(mode: Mode) {
    setOpen(false);
    setBusy(true);
    try {
      const slug =
        unitName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "register";

      if (mode === "register") {
        const doc = await generateRegisterPdf(assets, { unitName, campusName, generatedBy });
        savePdf(doc, `nsuk-asset-register-${slug}.pdf`);
      } else {
        const groups = group(mode);
        const doc = await generateSchedulePdf(groups, {
          groupedBy: mode === "tier" ? "Faculty" : "Campus",
          scopeName: unitName,
          campusName,
          generatedBy,
        });
        savePdf(doc, `nsuk-asset-schedule-${mode}-${slug}.pdf`);
      }

      toast.success(
        "Exported",
        `${assets.length.toLocaleString()} asset${assets.length === 1 ? "" : "s"} for ${unitName}.`,
      );
    } catch {
      toast.error("Could not build the document", "Try again with fewer rows in view.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost btn-sm"
        disabled={busy || assets.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Print
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-nsuk-line bg-white shadow-[var(--shadow-e3)]"
          >
            {(Object.keys(LABELS) as Mode[]).map((mode) => (
              <button
                key={mode}
                role="menuitem"
                onClick={() => download(mode)}
                className="block w-full px-4 py-3 text-left text-sm text-nsuk-ink hover:bg-nsuk-blue-50"
              >
                {LABELS[mode]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
