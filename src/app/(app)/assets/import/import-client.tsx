"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, FileUp, Loader2, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isDuplicateSerialError } from "@/lib/serials";
import { fileFingerprint, importRowKey, parseAssetDate, parseAssetValue, type DateOrder } from "@/lib/asset-validation";
import {
  ACCEPTED_DESCRIPTION,
  ACCEPTED_FILE_TYPES,
  UnreadableFileError,
  readTable,
  type TableRow,
} from "@/lib/import-file";
import UnitSelect from "@/components/unit-select";
import { useToast } from "@/components/ui/toast";
import { generateLabelSheet, savePdf, type LabelInput } from "@/lib/pdf";
import { unitPath } from "@/lib/tree";
import {
  CONDITIONS,
  type Asset,
  type AssetCategory,
  type Condition,
  type OrgUnit,
} from "@/lib/types";

/** Stable empty set, for a mapping with no serials to check. */
const NO_SERIALS: ReadonlySet<string> = new Set<string>();

/** Fields an uploaded column can be mapped onto. */
const FIELDS = [
  { key: "name", label: "Asset name", required: true },
  { key: "category", label: "Category", required: false },
  { key: "unit", label: "Unit (name)", required: false },
  { key: "location", label: "Room / location", required: false },
  { key: "condition", label: "Condition", required: false },
  { key: "value", label: "Purchase cost (₦)", required: false },
  { key: "serial_number", label: "Serial number", required: false },
  { key: "acquisition_date", label: "Acquisition date (YYYY-MM-DD)", required: false },
  { key: "available_for_use_date", label: "Date available for use", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Mapping = Partial<Record<FieldKey, string>>;

type PreparedRow = {
  index: number;
  name: string;
  category_id: string | null;
  org_unit_id: string | null;
  location: string | null;
  condition: Condition;
  value: number;
  cost_known: boolean;
  available_for_use_date: string | null;
  serial_number: string | null;
  acquisition_date: string | null;
  notes: string | null;
  problems: string[];
};

const TEMPLATE =
  "name,category,unit,location,condition,value,serial_number,acquisition_date,available_for_use_date,notes\n" +
  "1.5HP Split Air Conditioner,Plant & Machinery,Fixed Assets Unit,Block B Room 14,Working,450000,LG-AC-99213,2024-03-11,2024-03-12,Staff common room\n" +
  "Toyota Hilux,Motor Vehicles,Fixed Assets Unit,Main car park,Under Repair,18500000,VIN-8891234,2019-08-02,2019-08-02,\n";

/** Guess a mapping from header names so most files need no manual work. */
function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<FieldKey, string[]> = {
    name: ["name", "assetname", "item", "description", "asset"],
    category: ["category", "type", "assetcategory"],
    unit: ["unit", "department", "faculty", "office", "orgunit", "location unit"],
    location: ["location", "room", "roomlocation", "place"],
    condition: ["condition", "status", "state"],
    value: ["value", "cost", "amount", "price", "naira"],
    serial_number: ["serialnumber", "serial", "serialno", "sn"],
    acquisition_date: ["acquisitiondate", "dateacquired", "purchasedate", "acquired", "date"],
    available_for_use_date: ["availableforusedate", "inservicedate", "servicedate"],
    notes: ["notes", "note", "remarks", "comment", "comments"],
  };

  for (const header of headers) {
    const h = norm(header);
    for (const field of FIELDS) {
      if (mapping[field.key]) continue;
      if (aliases[field.key].some((a) => norm(a) === h)) {
        mapping[field.key] = header;
        break;
      }
    }
  }
  return mapping;
}

export default function ImportClient({
  units,
  categories,
  scopedUnitIds,
  isAdmin,
}: {
  units: OrgUnit[];
  categories: AssetCategory[];
  scopedUnitIds: string[];
  isAdmin: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaultUnit, setDefaultUnit] = useState<string | null>(
    scopedUnitIds.length === 1 ? scopedUnitIds[0] : null,
  );
  const [busy, setBusy] = useState(false);
  // Reading is its own wait, separate from the import: a PDF of any length
  // takes long enough that a still screen looks like a file that was ignored.
  const [reading, setReading] = useState(false);
  const [caution, setCaution] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Serial numbers in this file that the register already holds. Looked up once
  // per file rather than per row, so a large import is still one round trip.
  const [checked, setChecked] = useState<{ key: string; found: ReadonlySet<string> }>({
    key: "",
    found: NO_SERIALS,
  });
  const [serialCheckError, setSerialCheckError] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [dateOrder, setDateOrder] = useState<DateOrder>("ymd");
  const [acceptedDefaults, setAcceptedDefaults] = useState<string | null>(null);
  const [imported, setImported] = useState<Asset[] | null>(null);
  const toast = useToast();

  const selectableUnits = isAdmin ? undefined : scopedUnitIds;

  const unitByName = useMemo(() => {
    const map = new Map<string, OrgUnit | null>();
    for (const u of units) {
      for (const key of new Set([u.id, u.name.trim().toLowerCase(), unitPath(u.id, units).toLowerCase()])) {
        map.set(key, map.has(key) ? null : u);
      }
    }
    return map;
  }, [units]);

  const categoryByName = useMemo(() => {
    const map = new Map<string, AssetCategory>();
    for (const c of categories) {
      map.set(c.name.trim().toLowerCase(), c);
      if (c.code) map.set(c.code.trim().toLowerCase(), c);
    }
    return map;
  }, [categories]);

  // The serial numbers the file offers, which is purely a function of the rows
  // and the column they were mapped to. The key gives that list an identity the
  // answer below can be matched against.
  const { serials, serialKey } = useMemo(() => {
    const column = mapping.serial_number;
    const list = column
      ? [...new Set(rows.map((r) => (r[column] ?? "").trim()).filter((v) => v.length > 0))]
      : [];
    return { serials: list, serialKey: list.join("\u0000") };
  }, [rows, mapping.serial_number]);

  // An answer counts only for the list it was asked about, so re-mapping the
  // column or loading a new file discards it without anything being reset.
  const alreadyRegistered = checked.key === serialKey ? checked.found : NO_SERIALS;
  const checkingSerials = serials.length > 0 && checked.key !== serialKey;

  const prepared: PreparedRow[] = useMemo(() => {
    if (!mapping.name) return [];
    const allowed = selectableUnits ? new Set(selectableUnits) : null;

    // Where each serial number first appears, so the second occurrence can say
    // which row it clashes with rather than simply calling itself a duplicate.
    const firstSeenAt = new Map<string, number>();
    if (mapping.serial_number) {
      rows.forEach((row, i) => {
        const serial = (row[mapping.serial_number!] ?? "").trim().toLowerCase();
        if (serial && !firstSeenAt.has(serial)) firstSeenAt.set(serial, i);
      });
    }

    return rows.map((row, index) => {
      const get = (key: FieldKey) => (mapping[key] ? (row[mapping[key]!] ?? "").trim() : "");
      const problems: string[] = [];

      const name = get("name");
      if (!name) problems.push("Missing asset name");

      const categoryRaw = get("category");
      const category = categoryRaw ? categoryByName.get(categoryRaw.toLowerCase()) : undefined;
      if (categoryRaw && !category) problems.push(`Unknown category “${categoryRaw}”`);

      const unitRaw = get("unit");
      let unitId: string | null = defaultUnit;
      if (unitRaw) {
        const match = unitByName.get(unitRaw.toLowerCase());
        if (!match) problems.push(unitByName.has(unitRaw.toLowerCase())
          ? `Ambiguous unit “${unitRaw}”. Use its full path or a default unit without mapping this column`
          : `Unknown unit “${unitRaw}”`);
        else unitId = match.id;
      }
      if (!unitId) problems.push("No unit. Select a default unit above");
      else if (allowed && !allowed.has(unitId)) problems.push("Unit is outside your access");

      const conditionRaw = get("condition");
      const matchedCondition = CONDITIONS.find((c) => c.toLowerCase() === conditionRaw.toLowerCase());
      const condition = matchedCondition ?? "Working";
      if (conditionRaw && !matchedCondition) {
        problems.push(`Unknown condition “${conditionRaw}”. Defaulting to Working`);
      }

      const valueRaw = get("value");
      const value = parseAssetValue(valueRaw);
      if (value === null) problems.push(`Value “${valueRaw}” must be a non-negative amount with at most two decimal places`);

      const serviceRaw = get("available_for_use_date");
      const available_for_use_date = serviceRaw ? parseAssetDate(serviceRaw, dateOrder) : null;
      if (serviceRaw && !available_for_use_date) problems.push("Date available for use is invalid");
      const dateRaw = get("acquisition_date");
      const acquisition_date = dateRaw ? parseAssetDate(dateRaw, dateOrder) : null;
      if (available_for_use_date && acquisition_date && available_for_use_date < acquisition_date) problems.push("Date available for use cannot precede acquisition");
      if (dateRaw && !acquisition_date) problems.push(`Date “${dateRaw}” is invalid or does not match the selected date format`);

      // A repeated serial number almost always means the same physical item has
      // been entered twice, which is exactly what a register must not contain.
      const serial = get("serial_number");
      const key = serial.toLowerCase();
      if (serial) {
        const first = firstSeenAt.get(key);
        if (first !== undefined && first !== index) {
          problems.push(`Duplicate serial number, same as row ${first + 2} of this file`);
        } else if (alreadyRegistered.has(key)) {
          problems.push("Duplicate serial number, already on the register");
        }
      }

      return {
        index,
        name,
        category_id: category?.id ?? null,
        org_unit_id: unitId,
        location: get("location") || null,
        condition,
        value: value ?? 0,
        cost_known: valueRaw.trim() !== "",
        available_for_use_date,
        serial_number: serial || null,
        acquisition_date,
        notes: get("notes") || null,
        problems,
      };
    });
  }, [rows, mapping, defaultUnit, unitByName, categoryByName, selectableUnits, alreadyRegistered, dateOrder]);

  const isDuplicate = (p: string) => p.startsWith("Duplicate serial number");

  const defaultsKey = JSON.stringify([fileHash, mapping, defaultUnit, dateOrder]);
  const isDefaultWarning = (p: string) => p.startsWith("Unknown condition") || p.startsWith("Unknown category");
  const defaultWarnings = prepared.filter((r) => r.problems.some(isDefaultWarning)).length;
  const blocked = prepared.filter((r) => r.problems.some((p) =>
    !(acceptedDefaults === defaultsKey && isDefaultWarning(p))));

  const duplicateCount = prepared.filter((r) => r.problems.some(isDuplicate)).length;
  const importable = prepared.filter((r) => !blocked.includes(r));

  /**
   * Ask the register which of these serial numbers it already holds. Done in
   * batches because a URL carrying ten thousand values would be rejected long
   * before the database saw it.
   */
  useEffect(() => {
    if (serials.length === 0) return;

    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const found = new Set<string>();
      const BATCH = 200;

      for (let i = 0; i < serials.length; i += BATCH) {
        // Matched without regard to case: the register holding "SN-ABC-001"
        // and the spreadsheet saying "sn-abc-001" is the same physical item,
        // and that is exactly the duplicate worth catching.
        const { data, error: lookupError } = await supabase.rpc("existing_serial_numbers", {
          p_serials: serials.slice(i, i + BATCH),
        });
        if (lookupError) {
          if (!cancelled) setSerialCheckError("Serial numbers could not be checked. Reconnect and reload the file before importing.");
          return;
        }
        for (const serial of (data ?? []) as string[]) found.add(serial);
        if (cancelled) return;
      }

      if (!cancelled) { setChecked({ key: serialKey, found }); setSerialCheckError(null); }
    })();

    return () => {
      cancelled = true;
    };
  }, [serials, serialKey]);

  async function handleFile(file: File) {
    setError(null);
    setCaution(null);
    setFileName(file.name);
    setReading(true);
    setFileHash("");
    setAcceptedDefaults(null);
    setSerialCheckError(null);
    try {
      const table = await readTable(file);
      const fingerprint = await fileFingerprint(await file.arrayBuffer());
      setHeaders(table.headers);
      setRows(table.rows);
      setMapping(autoMap(table.headers));
      setCaution(table.caution ?? null);
      setFileHash(fingerprint);
      setStep(2);
    } catch (cause) {
      setHeaders([]);
      setRows([]);
      setMapping({});
      setStep(1);
      // Anything the reader could put in front of a person it raises as an
      // `UnreadableFileError` already worded for the screen. Anything else is a
      // fault rather than a bad file, and should not be quoted at them.
      setError(
        cause instanceof UnreadableFileError
          ? cause.message
          : "Something went wrong reading that file. Try again, or save it as a spreadsheet.",
      );
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    if (busy || !fileHash || checkingSerials || (serials.length && serialCheckError) || !importable.length) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const created: Asset[] = [];

    // Batched so a large store-room upload does not hit request limits, and so
    // a mid-file failure still leaves everything before it correctly coded.
    try {
      const CHUNK = 50;
      for (let i = 0; i < importable.length; i += CHUNK) {
        const chunk = await Promise.all(importable.slice(i, i + CHUNK).map(async (r) => ({
          import_key: await importRowKey(fileHash, r.index, r.org_unit_id!),
          name: r.name,
          category_id: r.category_id,
          org_unit_id: r.org_unit_id!,
          location: r.location,
          condition: r.condition,
          value: r.value,
          cost_known: r.cost_known,
          available_for_use_date: r.available_for_use_date,
          serial_number: r.serial_number,
          acquisition_date: r.acquisition_date,
          notes: r.notes,
        })));

        const { data, error: insertError } = await supabase.rpc("import_asset_rows", { p_rows: chunk });
        if (insertError) {
          throw new Error(
            isDuplicateSerialError(insertError)
              ? "A serial number in this batch was registered while the upload was running. Reload the file to re-check it."
              : insertError.message,
          );
        }
        if (!data || data.length !== chunk.length) throw new Error("The server did not confirm every row. Retry the same file and unit selections.");
        created.push(...((data ?? []) as Asset[]));
      }
      setImported(created);
      setStep(3);
      toast.success(
        `${created.length.toLocaleString()} row${created.length === 1 ? "" : "s"} recorded`,
        "Previously recorded rows from the same file were reused safely.",
      );
    } catch (cause) {
      setError(`Confirmed ${created.length} of ${importable.length} rows before stopping. ${cause instanceof Error ? cause.message : "Reconnect and retry."} Re-uploading the same file to the same units will reuse already recorded rows.`);
      setImported(created);
      setStep(3);
    } finally { setBusy(false); }
  }

  async function printBatch(assets: Asset[]) {
    const labels: LabelInput[] = assets.map((a) => ({
      barcode: a.barcode,
      name: a.name,
      unitName: unitPath(a.org_unit_id, units),
      categoryName: categories.find((c) => c.id === a.category_id)?.name ?? null,
    }));
    const doc = await generateLabelSheet(labels);
    savePdf(doc, `nsuk-labels-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nsuk-asset-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Step 3 — done.
  if (step === 3 && imported) {
    return (
      <div className="card space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-green-50">
          <Check className="h-7 w-7 text-nsuk-green" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-nsuk-blue">
            {imported.length.toLocaleString()} asset{imported.length === 1 ? "" : "s"} imported
          </h2>
          <p className="mt-1 text-sm text-nsuk-muted">
            Every one has its own asset code. Print the batch and tag the items.
          </p>
        </div>

        {error && <p className="text-sm text-nsuk-danger">{error}</p>}
        {caution && (
          <p className="flex items-start gap-2 rounded-xl border border-nsuk-gold/40 bg-nsuk-gold-50 p-3 text-sm text-nsuk-blue">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-nsuk-gold" />
            {caution}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => printBatch(imported)} className="btn-gold">
            <Printer className="h-4 w-4" /> Print {imported.length} labels
          </button>
          <Link href="/assets" className="btn-primary">
            View assets
          </Link>
        </div>
        <button
          onClick={() => {
            setImported(null);
            setRows([]);
            setHeaders([]);
            setMapping({});
            setFileName("");
            setStep(1);
          }}
          className="btn-ghost w-full"
        >
          Import another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1 — upload */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-nsuk-blue">1. Upload the file</h2>
          <button onClick={downloadTemplate} className="btn-ghost btn-sm">
            <Download className="h-4 w-4" /> Template
          </button>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-nsuk-line bg-nsuk-cream px-4 py-8 text-center">
          {reading ? (
            <Loader2 className="h-7 w-7 animate-spin text-nsuk-blue" />
          ) : (
            <FileUp className="h-7 w-7 text-nsuk-blue" />
          )}
          <span className="text-sm font-semibold text-nsuk-blue">
            {reading ? `Reading ${fileName}…` : fileName || `Choose a ${ACCEPTED_DESCRIPTION} file`}
          </span>
          <span className="text-xs text-nsuk-faint">
            .csv .xlsx .xls .ods .docx .pdf — the first row must be the column headings, and a Word
            or PDF file must lay the assets out as a table
          </span>
          <input
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file again re-reads it, which is
              // what someone does after correcting the file and saving it.
              e.target.value = "";
              if (file) handleFile(file);
            }}
          />
        </label>

        <div>
          <label className="label" htmlFor="default-unit">
            Default unit for rows without one
          </label>
          <UnitSelect
            id="default-unit"
            units={units}
            value={defaultUnit}
            onChange={setDefaultUnit}
            restrictTo={selectableUnits}
            placeholder="Select a unit"
          />
        </div>
      </div>

      {/* Step 2 — map + preview */}
      {step >= 2 && (
        <>
          <div className="card space-y-3">
            <h2 className="font-semibold text-nsuk-blue">2. Match the columns</h2>
            <div>
              <label htmlFor="date-order" className="label">Dates written as text</label>
              <select id="date-order" value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)} className="field">
                <option value="ymd">YYYY-MM-DD (unambiguous)</option>
                <option value="dmy">Day / month / year</option>
                <option value="mdy">Month / day / year</option>
              </select>
              <p className="hint">Spreadsheet date cells and YYYY-MM-DD dates keep their exact date. Blank conditions use Working; blank categories remain unassigned.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required && " *"}
                  </label>
                  <select
                    id={`map-${field.key}`}
                    className="field"
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">Not in file</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-nsuk-blue">3. Check the preview</h2>
            <p className="text-sm text-nsuk-muted">
              {importable.length.toLocaleString()} of {prepared.length.toLocaleString()} rows are
              ready to import
              {blocked.length > 0 && `, ${blocked.length.toLocaleString()} need attention`}.
              {checkingSerials && " Checking serial numbers against the register\u2026"}
            </p>

            {duplicateCount > 0 && (
              <div className="rounded-xl border border-nsuk-gold/40 bg-nsuk-gold-50 p-3">
                <p className="flex items-start gap-2 text-sm font-semibold text-nsuk-gold-deep">
                  <Copy className="mt-0.5 h-4 w-4 shrink-0" />
                  {duplicateCount.toLocaleString()} row{duplicateCount === 1 ? "" : "s"} with a
                  duplicate serial number
                </p>
                <p className="mt-1 text-sm leading-relaxed text-nsuk-gold-deep/90">
                  A repeated serial number usually means the same physical item is being recorded
                  twice, which is the one thing a register must not contain. Each row below says
                  whether it clashes with another row in this file or with an asset already
                  recorded.
                </p>
                <p className="mt-2 text-sm text-nsuk-gold-deep">Duplicate serial numbers are excluded. Correct the file before importing those rows.</p>
              </div>
            )}

            {defaultWarnings > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-nsuk-gold/40 bg-nsuk-gold-50 p-3 text-sm">
                <input type="checkbox" checked={acceptedDefaults === defaultsKey}
                  onChange={(e) => setAcceptedDefaults(e.target.checked ? defaultsKey : null)} className="mt-1" />
                <span>{defaultWarnings} rows have unrecognized categories or conditions. I approve leaving those categories unassigned and using Working for those conditions.</span>
              </label>
            )}
            {serials.length > 0 && serialCheckError && <p role="alert" className="text-sm text-nsuk-danger">{serialCheckError}</p>}

            <div className="-mx-4 overflow-x-auto px-4">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-nsuk-line text-xs tracking-wide text-nsuk-faint uppercase">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Condition</th>
                    <th className="py-2 pr-3">Value</th>
                    <th className="py-2 pr-3">Acquired</th>
                    <th className="py-2">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nsuk-line">
                  {prepared.slice(0, 25).map((row) => (
                    <tr key={row.index} className={blocked.includes(row) ? "bg-nsuk-danger/5" : ""}>
                      <td className="py-2 pr-3 text-nsuk-faint">{row.index + 1}</td>
                      <td className="py-2 pr-3 font-medium">{row.name || "—"}</td>
                      <td className="py-2 pr-3 text-nsuk-muted">
                        {row.org_unit_id ? unitPath(row.org_unit_id, units) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-nsuk-muted">{row.condition}</td>
                      <td className="py-2 pr-3 text-nsuk-muted">
                        {row.cost_known ? row.value.toLocaleString("en-NG") : "Unknown"}
                      </td>
                      <td className="py-2 pr-3 text-nsuk-muted">{row.acquisition_date ?? "—"}</td>
                      <td className="py-2 text-xs text-nsuk-danger">
                        {row.problems.join("; ") || ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {prepared.length > 25 && (
                <p className="pt-2 text-xs text-nsuk-faint">
                  Showing the first 25 of {prepared.length.toLocaleString()} rows.
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            onClick={runImport}
            className="btn-green w-full"
            disabled={busy || !fileHash || checkingSerials || Boolean(serials.length && serialCheckError) || importable.length === 0}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Import {importable.length.toLocaleString()} asset
            {importable.length === 1 ? "" : "s"} & generate asset codes
          </button>
        </>
      )}
    </div>
  );
}

