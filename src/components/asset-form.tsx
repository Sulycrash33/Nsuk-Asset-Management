"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { removeUnusedAssetPhoto, signedAssetPhoto } from "@/lib/asset-photo";
import { preparePhoto, thumbnailKey } from "@/lib/photo-compress";
import { useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  Plus,
  Printer,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import UnitSelect from "@/components/unit-select";
import LabelPaperSelect from "@/components/label-paper-select";
import { QrImage } from "@/components/barcode-image";
import { useToast } from "@/components/ui/toast";
import { generateSingleLabel, savePdf } from "@/lib/pdf";
import { parseAssetDate, parseAssetValue, yearOnlyAvailableDate } from "@/lib/asset-validation";
import {
  DUPLICATE_SERIAL_MESSAGE,
  isDuplicateSerialError,
  serialAlreadyRegistered,
} from "@/lib/serials";
import {
  CONDITIONS,
  type Asset,
  type AssetCategory,
  type Condition,
  type OrgUnit,
} from "@/lib/types";

type FormState = {
  name: string;
  category_id: string;
  org_unit_id: string;
  location: string;
  condition: Condition;
  value: string;
  serial_number: string;
  acquisition_date: string;
  /** Only the year is known; the date box gives way to a year box. */
  acquisition_year_only: boolean;
  acquisition_year: string;
  cost_known: boolean;
  available_for_use_date: string;
  /** Only the year it became available for use is known. */
  available_year_only: boolean;
  available_year: string;
  notes: string;
  photo_url: string;
};

/** Condition buttons carry their own colour so the choice reads at a glance. */
const CONDITION_TONE: Record<Condition, string> = {
  Working: "border-nsuk-green bg-nsuk-green text-white",
  Faulty: "border-nsuk-warn bg-nsuk-warn text-white",
  "Under Repair": "border-nsuk-gold bg-nsuk-gold text-nsuk-ink",
  Missing: "border-nsuk-danger bg-nsuk-danger text-white",
};

/** Saved when the name is left blank; the record can be renamed later. */
const UNNAMED_ASSET = "Unnamed asset";

function initialState(asset: Asset | null, defaultUnitId: string): FormState {
  const yearOnly = Boolean(asset?.acquisition_year_only && asset.acquisition_date);
  const availableYearOnly = Boolean(
    asset?.available_for_use_year_only && asset.available_for_use_date,
  );
  return {
    name: asset?.name ?? "",
    category_id: asset?.category_id ?? "",
    org_unit_id: asset?.org_unit_id ?? defaultUnitId,
    location: asset?.location ?? "",
    condition: asset?.condition ?? "Working",
    value: asset?.value != null ? String(asset.value) : "",
    serial_number: asset?.serial_number ?? "",
    // A year-only record holds 1 January, which nobody recorded as a day.
    acquisition_date: yearOnly ? "" : (asset?.acquisition_date ?? ""),
    acquisition_year_only: yearOnly,
    acquisition_year: yearOnly ? asset!.acquisition_date!.slice(0, 4) : "",
    cost_known: asset?.cost_known ?? false,
    available_for_use_date: availableYearOnly ? "" : (asset?.available_for_use_date ?? ""),
    available_year_only: availableYearOnly,
    available_year: availableYearOnly ? asset!.available_for_use_date!.slice(0, 4) : "",
    notes: asset?.notes ?? "",
    photo_url: asset?.photo_url ?? "",
  };
}

export default function AssetForm({
  units: initialUnits,
  categories,
  asset = null,
  initialPhotoSource = null,
  scopedUnitIds,
  accountingLocked = false,
}: {
  units: OrgUnit[];
  categories: AssetCategory[];
  asset?: Asset | null;
  initialPhotoSource?: string | null;
  scopedUnitIds: string[];
  accountingLocked?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [units, setUnits] = useState(initialUnits);
  const [form, setForm] = useState<FormState>(() =>
    initialState(asset, scopedUnitIds.length === 1 ? scopedUnitIds[0] : ""),
  );
  const [busy, setBusy] = useState(false);
  const [photoSource, setPhotoSource] = useState(initialPhotoSource);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Asset | null>(null);
  // Reported against the serial box rather than the form, because that is the
  // field that has to change and it is a long way from the save button.
  const [serialTaken, setSerialTaken] = useState(false);
  const [checkingSerial, setCheckingSerial] = useState(false);
  /** The serial the in-flight lookup was asked about, so a late reply can be
   *  told apart from the current one. */
  const serialAskedFor = useRef("");
  /**
   * Photos a newer upload has replaced. They are removed from storage once the
   * form saves without them, so a replaced photo does not stay behind. A photo
   * that is only cleared, with nothing put in its place, is kept.
   */
  const replacedPhotos = useRef(new Set<string>());
  /** The photo last cleared with the ✕ button, until something replaces it. */
  const clearedPhoto = useRef<string | null>(null);

  // Any cost above zero is known; the checkbox is only for a confirmed ₦0.
  const costTyped = (parseAssetValue(form.value) ?? 0) > 0;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /**
   * Asked when the officer leaves the serial box, so a clash is known while the
   * cursor is still near the field rather than after the whole form is filled.
   */
  async function checkSerial() {
    const typed = form.serial_number.trim();
    if (!typed) {
      setSerialTaken(false);
      return;
    }
    serialAskedFor.current = typed;
    setCheckingSerial(true);
    const taken = await serialAlreadyRegistered(typed, asset?.serial_number);

    // A slow answer describes the value it was asked about. If the box has
    // moved on since, that answer is about something nobody is looking at.
    if (serialAskedFor.current !== typed) return;
    setCheckingSerial(false);
    setSerialTaken(taken);
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const path = `${crypto.randomUUID()}.jpg`;

    try {
      // Reduced to about 300 KB before it leaves the phone, with a small
      // thumbnail for the asset list.
      const { photo, thumbnail } = await preparePhoto(file);
      const { error: uploadError } = await supabase.storage
        .from("asset-photos")
        .upload(path, photo, {
          cacheControl: "900",
          contentType: "image/jpeg",
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);
      // The thumbnail can only follow its photo. If it fails, the list simply
      // shows the photo itself, so the upload still succeeds.
      await supabase.storage
        .from("asset-photos")
        .upload(thumbnailKey(path), thumbnail, {
          cacheControl: "900",
          contentType: "image/jpeg",
          upsert: false,
        })
        .catch(() => undefined);
      const source = await signedAssetPhoto(
        supabase,
        path,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      );
      if (!source)
        throw new Error(
          "Upload completed but its private preview could not be confirmed. Try again.",
        );
      const displaced = form.photo_url || clearedPhoto.current;
      if (displaced && displaced !== path) replacedPhotos.current.add(displaced);
      clearedPhoto.current = null;
      set("photo_url", path);
      setPhotoSource(source);
    } catch (error) {
      toast.error(
        "Photo upload failed",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  /**
   * After a save, remove the photos replaced on this form that the asset no
   * longer shows. The database decides who may remove which file and refuses
   * any photo still in use; a file that cannot be removed only stays in
   * storage, so the save is reported as done either way.
   */
  async function removeReplacedPhotos(saved: string | null) {
    const supabase = createClient();
    const stale = [...replacedPhotos.current].filter((key) => key !== saved);
    replacedPhotos.current.clear();
    clearedPhoto.current = null;
    await Promise.all(
      stale.map((key) =>
        removeUnusedAssetPhoto(supabase, key, process.env.NEXT_PUBLIC_SUPABASE_URL!),
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.org_unit_id) {
      setError("Choose the unit this asset belongs to.");
      return;
    }
    // Blank fields are fine: the record can be completed later. Only what was
    // typed and cannot be stored is refused.
    const value = parseAssetValue(form.value);
    const year = form.acquisition_year.trim();
    const yearOnly = form.acquisition_year_only && year !== "";
    const acquisitionDate = form.acquisition_year_only
      ? yearOnly
        ? `${year}-01-01`
        : ""
      : form.acquisition_date;
    // Year only: 1 January of that year, or the acquisition date if the item
    // was acquired later that same year. Depreciation starts from this day.
    const availableYear = form.available_year.trim();
    const availableYearOnly = form.available_year_only && availableYear !== "";
    const availableDate = form.available_year_only
      ? availableYearOnly
        ? yearOnlyAvailableDate(availableYear, acquisitionDate)
        : ""
      : form.available_for_use_date;
    let problem: string | null = null;
    if (value === null) {
      problem =
        "Enter the purchase cost as a non-negative amount with at most two decimal places, or leave it blank.";
    } else if (
      yearOnly &&
      (!/^\d{4}$/.test(year) ||
        Number(year) < 1900 ||
        Number(year) > new Date().getFullYear())
    ) {
      problem = `Enter the acquisition year as four digits, between 1900 and ${new Date().getFullYear()}.`;
    } else if (acquisitionDate && !parseAssetDate(acquisitionDate)) {
      problem = "Enter a valid acquisition date, or leave it blank.";
    } else if (
      availableYearOnly &&
      (!/^\d{4}$/.test(availableYear) ||
        Number(availableYear) < 1900 ||
        Number(availableYear) > new Date().getFullYear())
    ) {
      problem = `Enter the year available for use as four digits, between 1900 and ${new Date().getFullYear()}.`;
    } else if (availableDate && !parseAssetDate(availableDate)) {
      problem = "Enter a valid date available for use, or leave it blank.";
    } else if (
      acquisitionDate &&
      availableDate &&
      availableDate < acquisitionDate
    ) {
      problem = availableYearOnly
        ? `The year available for use cannot be before the year acquired (${acquisitionDate.slice(0, 4)}).`
        : yearOnly
          ? `The date available for use cannot be before ${year}.`
          : "The date available for use cannot be before the acquisition date.";
    }
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);

    // Asked once more here: the box may never have been left, and the answer
    // from the blur check may be stale by now. The index below is what actually
    // guarantees it; this is only so the refusal reads like a sentence.
    if (form.serial_number.trim()) {
      const taken = await serialAlreadyRegistered(
        form.serial_number,
        asset?.serial_number,
      );
      if (taken) {
        setSerialTaken(true);
        setError(DUPLICATE_SERIAL_MESSAGE);
        setBusy(false);
        return;
      }
    }

    const payload = {
      name: form.name.trim() || UNNAMED_ASSET,
      category_id: form.category_id || null,
      org_unit_id: form.org_unit_id,
      location: form.location.trim() || null,
      condition: form.condition,
      value,
      serial_number: form.serial_number.trim() || null,
      acquisition_date: acquisitionDate || null,
      acquisition_year_only: yearOnly,
      // A typed cost is a known cost; the box only confirms a zero.
      cost_known: form.cost_known || (value ?? 0) > 0,
      available_for_use_date: availableDate || null,
      available_for_use_year_only: availableYearOnly,
      notes: form.notes.trim() || null,
      photo_url: form.photo_url || null,
    };

    const supabase = createClient();

    if (asset) {
      // A unit change is a transfer: route it through move_asset so the activity
      // trail records from/to and the reason, then apply the other edits.
      if (payload.org_unit_id !== asset.org_unit_id) {
        const { error: moveError } = await supabase.rpc("move_asset", {
          p_asset_id: asset.id,
          p_to_unit_id: payload.org_unit_id,
          p_reason: "Updated from the asset edit form",
        });
        if (moveError) {
          setError(moveError.message);
          setBusy(false);
          return;
        }
      }

      const { error: updateError } = await supabase
        .from("assets")
        .update(payload)
        .eq("id", asset.id);
      setBusy(false);

      if (updateError) {
        // Someone else may have registered that serial between the check above
        // and this write. The database refuses it either way; this only turns
        // the refusal into something worth reading.
        const clash = isDuplicateSerialError(updateError);
        setSerialTaken(clash);
        setError(clash ? DUPLICATE_SERIAL_MESSAGE : updateError.message);
        return;
      }
      await removeReplacedPhotos(payload.photo_url);
      toast.success("Changes saved", asset.barcode);
      router.push(`/assets/${asset.id}`);
      router.refresh();
      return;
    }

    const { data, error: insertError } = await supabase
      .from("assets")
      .insert(payload)
      .select("*")
      .single();
    setBusy(false);

    if (insertError || !data) {
      const clash = isDuplicateSerialError(insertError);
      setSerialTaken(clash);
      setError(
        clash
          ? DUPLICATE_SERIAL_MESSAGE
          : (insertError?.message ?? "Could not save the asset."),
      );
      return;
    }

    await removeReplacedPhotos(payload.photo_url);
    setCreated(data as Asset);
    toast.success(
      "Asset recorded",
      `Asset code ${(data as Asset).barcode} issued.`,
    );
    router.refresh();
  }

  async function printLabel(target: Asset) {
    setPrinting(true);
    try {
      const doc = await generateSingleLabel({ barcode: target.barcode });
      savePdf(doc, `${target.barcode}.pdf`);
      toast.success(
        "Label ready",
        `${target.barcode}.pdf has been downloaded.`,
      );
    } catch {
      toast.error(
        "Could not generate the label",
        "Try again from the asset record.",
      );
    } finally {
      setPrinting(false);
    }
  }

  // Step 2 of one-by-one entry: the asset code exists — print it and tag the item.
  if (created) {
    return (
      <div className="card animate-pop-in space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-nsuk-green-50">
          <Check className="h-8 w-8 text-nsuk-green" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-nsuk-blue">Asset recorded</h2>
          <p className="mt-1 text-sm text-nsuk-muted">{created.name}</p>
        </div>

        <div className="rounded-2xl border border-nsuk-line bg-nsuk-cream p-4">
          <div className="flex flex-col items-center gap-3">
            <QrImage value={created.qr_payload} size={132} />
            <p className="font-mono text-base font-bold tracking-wider text-nsuk-ink">
              {created.barcode}
            </p>
          </div>
          <p className="mt-3 text-xs text-nsuk-muted">
            Print this label and stick it on the item. Scanning it will open
            this record.
          </p>
        </div>

        <LabelPaperSelect />
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            onClick={() => printLabel(created)}
            disabled={printing}
            className="btn-gold"
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print label
          </button>
          <button
            onClick={() => {
              setCreated(null);
              setForm(initialState(null, form.org_unit_id));
              setPhotoSource(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="btn-green"
          >
            <Plus className="h-4 w-4" /> Add another
          </button>
        </div>

        <Link href={`/assets/${created.id}`} className="btn-ghost w-full">
          Open asset record
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="card space-y-4">
        <h2 className="section-title">Identity</h2>

        <div>
          <label className="label" htmlFor="name">
            Asset name
          </label>
          <input
            id="name"
            className="field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. 1.5HP Split Air Conditioner"
          />
          <p className="hint">
            Leave blank if not known yet. It is saved as “{UNNAMED_ASSET}” and
            can be edited later.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            disabled={accountingLocked}
            className="field"
            value={form.category_id}
            onChange={(e) => set("category_id", e.target.value)}
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="unit">
            Unit *
          </label>
          <UnitSelect
            id="unit"
            units={units}
            value={form.org_unit_id || null}
            onChange={(id) => set("org_unit_id", id)}
            allowCreate
            onUnitCreated={(u) => setUnits((prev) => [...prev, u])}
          />
        </div>

        <div>
          <label className="label" htmlFor="location">
            Room / location
          </label>
          <input
            id="location"
            className="field"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="e.g. Block B, Room 14"
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">Condition & value</h2>

        <div>
          <span className="label">Condition</span>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("condition", c)}
                aria-pressed={form.condition === c}
                className={`min-h-12 rounded-xl border text-sm font-semibold transition-all duration-150 active:scale-[0.98] ${
                  form.condition === c
                    ? `${CONDITION_TONE[c]} shadow-[var(--shadow-e2)]`
                    : "border-nsuk-line bg-white text-nsuk-muted hover:border-nsuk-blue/30 hover:text-nsuk-ink"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="value">
              Purchase cost (₦)
            </label>
            <input
              id="value"
              disabled={accountingLocked}
              className="field tabular"
              value={form.value}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  value: e.target.value,
                  cost_known: e.target.value.trim() !== "",
                }))
              }
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label" htmlFor="serial">
              Serial number
            </label>
            <input
              id="serial"
              className={`field font-mono ${serialTaken ? "border-nsuk-danger" : ""}`}
              value={form.serial_number}
              onChange={(e) => {
                set("serial_number", e.target.value);
                // The old answer described the old value.
                if (serialTaken) setSerialTaken(false);
              }}
              onBlur={checkSerial}
              placeholder="Manufacturer serial, if any"
              aria-invalid={serialTaken}
              aria-describedby={serialTaken ? "serial-taken" : undefined}
            />
            {checkingSerial && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-nsuk-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking the register…
              </p>
            )}
            {serialTaken && !checkingSerial && (
              <p
                id="serial-taken"
                className="mt-1 flex items-start gap-1.5 text-xs text-nsuk-danger"
              >
                <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                Another asset already carries this serial number.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="acquired">
            {form.acquisition_year_only ? "Acquisition year" : "Acquisition date"}
          </label>
          {form.acquisition_year_only ? (
            <input
              id="acquired"
              disabled={accountingLocked}
              className="field tabular"
              value={form.acquisition_year}
              onChange={(e) =>
                set("acquisition_year", e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              maxLength={4}
              placeholder="e.g. 2019"
            />
          ) : (
            <input
              id="acquired"
              disabled={accountingLocked}
              type="date"
              className="field"
              value={form.acquisition_date}
              onChange={(e) => set("acquisition_date", e.target.value)}
            />
          )}
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.acquisition_year_only}
              disabled={accountingLocked}
              onChange={(e) => {
                const yearOnly = e.target.checked;
                setForm((f) => ({
                  ...f,
                  acquisition_year_only: yearOnly,
                  // Carry the year across when switching to year only.
                  acquisition_year:
                    yearOnly && !f.acquisition_year && f.acquisition_date
                      ? f.acquisition_date.slice(0, 4)
                      : f.acquisition_year,
                }));
              }}
            />
            I only know the year
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.cost_known || costTyped}
            disabled={accountingLocked || costTyped}
            onChange={(e) => set("cost_known", e.target.checked)}
          />
          Purchase cost is known (including a confirmed zero cost)
        </label>
        {form.cost_known && !form.value.trim() && (
          <p className="hint -mt-2">
            With the cost left blank, this is saved as a confirmed cost of ₦0.
          </p>
        )}
        <div>
          <label className="label" htmlFor="available">
            {form.available_year_only ? "Year available for use" : "Date available for use"}
          </label>
          {form.available_year_only ? (
            <input
              id="available"
              disabled={accountingLocked}
              className="field tabular"
              value={form.available_year}
              onChange={(e) =>
                set("available_year", e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              inputMode="numeric"
              maxLength={4}
              placeholder="e.g. 2019"
            />
          ) : (
            <input
              id="available"
              type="date"
              className="field"
              disabled={accountingLocked}
              value={form.available_for_use_date}
              onChange={(e) => set("available_for_use_date", e.target.value)}
            />
          )}
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.available_year_only}
              disabled={accountingLocked}
              onChange={(e) => {
                const yearOnly = e.target.checked;
                setForm((f) => ({
                  ...f,
                  available_year_only: yearOnly,
                  // Carry the year across when switching to year only.
                  available_year:
                    yearOnly && !f.available_year && f.available_for_use_date
                      ? f.available_for_use_date.slice(0, 4)
                      : f.available_year,
                }));
              }}
            />
            I only know the year
          </label>
          <p className="mt-1 text-xs text-nsuk-muted">
            {form.available_year_only
              ? "Depreciation is counted from 1 January of that year, or from the acquisition date if the item was acquired later that year."
              : "Use the date the item was ready to operate. If left blank, depreciation counts from the acquisition date."}
          </p>
        </div>
        {accountingLocked && (
          <p className="text-sm text-nsuk-muted">
            Cost, classification and dates have an accounting record. An
            administrator must record financial adjustments in Asset accounting.
          </p>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">Photo & notes</h2>

        <div>
          {form.photo_url ? (
            <div className="relative overflow-hidden rounded-xl border border-nsuk-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSource ?? undefined}
                alt={
                  photoSource
                    ? "Asset"
                    : "Photo preview unavailable; refresh to try again"
                }
                className="h-48 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  clearedPhoto.current = form.photo_url;
                  set("photo_url", "");
                  setPhotoSource(null);
                }}
                aria-label="Remove photo"
                className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-nsuk-ink/65 text-white backdrop-blur transition hover:bg-nsuk-ink/85"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-nsuk-line bg-nsuk-cream px-4 py-7 text-center transition hover:border-nsuk-blue/40 hover:bg-nsuk-blue-50">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-nsuk-blue" />
              ) : (
                <Camera className="h-6 w-6 text-nsuk-blue" />
              )}
              <span className="text-sm font-semibold text-nsuk-blue">
                {uploading ? "Reducing and uploading…" : "Take or choose a photo"}
              </span>
              <span className="text-xs text-nsuk-faint">
                Opens the camera on a phone. Any size of photo is fine: it
                is made smaller on the phone before it is sent.
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(file);
                }}
              />
            </label>
          )}
        </div>

        <div>
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            className="field min-h-24 resize-y"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything worth recording about this item"
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Save stays within thumb reach while scrolling a long form. */}
      <div className="sticky bottom-24 z-10 lg:static">
        <button
          type="submit"
          className="btn-green w-full shadow-[var(--shadow-e3)] lg:shadow-[var(--shadow-e2)]"
          disabled={busy || uploading}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {asset ? "Save changes" : "Save & generate asset code"}
        </button>
      </div>
    </form>
  );
}

