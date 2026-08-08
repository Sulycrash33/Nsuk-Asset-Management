"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { generateRegisterPdf, savePdf } from "@/lib/pdf";
import type { AssetWithRefs } from "@/lib/types";

/** Downloads the printable asset register for whatever list is on screen. */
export default function RegisterExportButton({
  assets,
  unitName,
  campusName,
  generatedBy,
}: {
  assets: AssetWithRefs[];
  unitName: string;
  campusName: string | null;
  generatedBy: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function download() {
    setBusy(true);
    try {
      const doc = generateRegisterPdf(assets, { unitName, campusName, generatedBy });
      const slug = unitName.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "register";
      savePdf(doc, `nsuk-asset-register-${slug}.pdf`);
      toast.success(
        "Register exported",
        `${assets.length.toLocaleString()} asset${assets.length === 1 ? "" : "s"} for ${unitName}.`,
      );
    } catch {
      toast.error("Could not build the register", "Try again with fewer rows in view.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={download} className="btn-ghost btn-sm" disabled={busy || assets.length === 0}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      Register PDF
    </button>
  );
}
