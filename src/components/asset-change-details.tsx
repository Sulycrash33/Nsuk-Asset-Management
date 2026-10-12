import { formatNaira, type AssetLog, type OrgUnit } from "@/lib/types";
import { unitPath } from "@/lib/tree";
const labels: Record<string,string> = { name: "Name", barcode: "Asset code", qr_payload: "QR code", category_id: "Category", org_unit_id: "Unit", location: "Location", condition: "Condition", value: "Value", serial_number: "Serial number", acquisition_date: "Acquisition date", photo_url: "Photo", notes: "Notes" };
export default function AssetChangeDetails({ changes, units }: { changes: AssetLog["changes"]; units: OrgUnit[] }) {
  if (!changes || !Object.keys(changes).length) return null;
  const display = (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "value") return formatNaira(String(value));
    if (key === "org_unit_id") return unitPath(String(value),units) || String(value);
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  };
  return <details className="mt-2 text-xs text-nsuk-muted">
    <summary className="cursor-pointer font-semibold text-nsuk-blue">View recorded field values</summary>
    <dl className="mt-2 space-y-2 rounded-lg bg-nsuk-cream p-3">
      {Object.entries(changes).map(([key, change]) => <div key={key}>
        <dt className="font-semibold">{labels[key] ?? key}</dt>
        <dd className="break-words whitespace-pre-wrap"><span>{display(key, change.before)}</span> → <span>{display(key, change.after)}</span></dd>
      </div>)}
    </dl>
  </details>;
}
