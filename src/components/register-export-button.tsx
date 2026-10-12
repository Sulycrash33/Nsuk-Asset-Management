"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { generateRegisterPdf, generateSchedulePdf, savePdf, type ScheduleGroup } from "@/lib/pdf";
import { collectRegister } from "@/lib/register-export";
import { topTierOf } from "@/lib/tree";
import type { AssetWithRefs, Campus, OrgUnit } from "@/lib/types";

type Mode = "register" | "tier" | "campus" | "excel";

const LABELS: Record<Mode, string> = {
  excel: "Excel workbook (all matching assets)",
  register: "Register PDF (plain list)",
  tier: "Schedule by Faculty / School / Directorate",
  campus: "Schedule by Campus",
};

/** Downloads every asset matching the current filters. */
export default function RegisterExportButton({
  assetCount,
  exportQuery,
  unitName,
  campusName,
  generatedBy,
  units,
  campuses,
}: {
  assetCount: number;
  exportQuery: string;
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
  function group(mode: "tier" | "campus", assets: AssetWithRefs[]): ScheduleGroup[] {
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
      const assets = await collectRegister<AssetWithRefs>(async (offset) => {
        const response = await fetch(`/api/assets/register?${exportQuery}&offset=${offset}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load all matching assets.");
        return response.json();
      });
      const slug =
        unitName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "register";

      if (mode === "excel") {
        const XLSX = await import("xlsx");
        const sheet = XLSX.utils.json_to_sheet(assets.map(a => ({
          "Asset code": a.barcode, Name: a.name, Category: a.asset_categories?.name ?? "",
          Unit: units.find(u => u.id === a.org_unit_id)?.name ?? "",
          Campus: campuses.find(c => c.id === units.find(u => u.id === a.org_unit_id)?.campus_id)?.name ?? "",
          Location: a.location ?? "", Condition: a.condition, "Value (NGN)": Number(a.value),
          "Serial number": a.serial_number ?? "", "Acquisition date": a.acquisition_date ?? "", Notes: a.notes ?? "",
        })));
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Assets");
        XLSX.writeFile(book, `nsuk-asset-register-${slug}.xlsx`);
      } else if (mode === "register") {
        const doc = await generateRegisterPdf(assets, { unitName, campusName, generatedBy });
        savePdf(doc, `nsuk-asset-register-${slug}.pdf`);
      } else {
        const groups = group(mode, assets);
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
      toast.error("Could not build the document", "The full register could not be confirmed. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost btn-sm"
        disabled={busy || assetCount === 0}
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
