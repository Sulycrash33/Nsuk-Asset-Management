"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { AlertCircle, Camera, Check, Loader2, Plus, Printer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import UnitSelect from "@/components/unit-select";
import BarcodeImage from "@/components/barcode-image";
import { generateSingleLabel, savePdf } from "@/lib/pdf";
import { unitPath } from "@/lib/tree";
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
  notes: string;
  photo_url: string;
};

function initialState(asset: Asset | null, defaultUnitId: string): FormState {
  return {
    name: asset?.name ?? "",
    category_id: asset?.category_id ?? "",
    org_unit_id: asset?.org_unit_id ?? defaultUnitId,
    location: asset?.location ?? "",
    condition: asset?.condition ?? "Working",
    value: asset?.value != null ? String(asset.value) : "",
    serial_number: asset?.serial_number ?? "",
    acquisition_date: asset?.acquisition_date ?? "",
    notes: asset?.notes ?? "",
    photo_url: asset?.photo_url ?? "",
  };
}

export default function AssetForm({
  units: initialUnits,
  categories,
  asset = null,
  scopedUnitIds,
  isAdmin,
  campusId,
}: {
  units: OrgUnit[];
  categories: AssetCategory[];
  asset?: Asset | null;
  scopedUnitIds: string[];
  isAdmin: boolean;
  campusId: string | null;
}) {
  const router = useRouter();
  const [units, setUnits] = useState(initialUnits);
  const [form, setForm] = useState<FormState>(() =>
    initialState(asset, scopedUnitIds.length === 1 ? scopedUnitIds[0] : ""),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Asset | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("asset-photos")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setError(`Photo upload failed: ${uploadError.message}`);
    } else {
      const { data } = supabase.storage.from("asset-photos").getPublicUrl(path);
      set("photo_url", data.publicUrl);
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.org_unit_id) {
      setError("Choose the unit this asset belongs to.");
      return;
    }
    setBusy(true);

    const payload = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      org_unit_id: form.org_unit_id,
      location: form.location.trim() || null,
      condition: form.condition,
      value: form.value === "" ? 0 : Number(form.value),
      serial_number: form.serial_number.trim() || null,
      acquisition_date: form.acquisition_date || null,
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
        setError(updateError.message);
        return;
      }
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
      setError(insertError?.message ?? "Could not save the asset.");
      return;
    }
    setCreated(data as Asset);
    router.refresh();
  }

  async function printLabel(target: Asset) {
    const doc = await generateSingleLabel({
      barcode: target.barcode,
      name: target.name,
      unitName: unitPath(target.org_unit_id, units),
      categoryName: categories.find((c) => c.id === target.category_id)?.name ?? null,
    });
    savePdf(doc, `${target.barcode}.pdf`);
  }

  // Step 2 of one-by-one entry: the barcode exists, print it and stick it on.
  if (created) {
    return (
      <div className="card space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-nsuk-green/12">
          <Check className="h-7 w-7 text-nsuk-green" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-nsuk-blue">Asset recorded</h2>
          <p className="mt-1 text-sm text-neutral-600">{created.name}</p>
        </div>

        <div className="rounded-xl border border-nsuk-line bg-white p-4">
          <BarcodeImage value={created.barcode} />
          <p className="mt-2 font-mono text-base font-bold tracking-wider text-nsuk-ink">
            {created.barcode}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => printLabel(created)} className="btn-gold">
            <Printer className="h-4 w-4" /> Print label
          </button>
          <button
            onClick={() => {
              setCreated(null);
              setForm(initialState(null, form.org_unit_id));
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
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Asset name *
          </label>
          <input
            id="name"
            className="field"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            placeholder="e.g. 1.5HP Split Air Conditioner"
          />
        </div>

        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
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
            allowCreate={isAdmin}
            campusId={campusId}
            onUnitCreated={(u) => setUnits((prev) => [...prev, u])}
            restrictTo={isAdmin ? undefined : scopedUnitIds}
          />
          {!isAdmin && (
            <p className="mt-1 text-xs text-neutral-500">
              You can only record assets in the units assigned to you.
            </p>
          )}
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
      </div>

      <div className="card space-y-4">
        <div>
          <span className="label">Condition</span>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("condition", c)}
                className={`min-h-12 rounded-xl border text-sm font-semibold transition ${
                  form.condition === c
                    ? "border-nsuk-blue bg-nsuk-blue text-white"
                    : "border-nsuk-line bg-white text-neutral-700"
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
              Value (₦)
            </label>
            <input
              id="value"
              className="field"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
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
              className="field"
              value={form.serial_number}
              onChange={(e) => set("serial_number", e.target.value)}
              placeholder="Manufacturer serial, if any"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="acquired">
            Acquisition date
          </label>
          <input
            id="acquired"
            type="date"
            className="field"
            value={form.acquisition_date}
            onChange={(e) => set("acquisition_date", e.target.value)}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <span className="label">Photo</span>
          {form.photo_url ? (
            <div className="relative overflow-hidden rounded-xl border border-nsuk-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.photo_url} alt="Asset" className="h-48 w-full object-cover" />
              <button
                type="button"
                onClick={() => set("photo_url", "")}
                aria-label="Remove photo"
                className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="btn-ghost w-full cursor-pointer">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Take or choose a photo"}
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
            className="field min-h-24"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything worth recording about this item"
          />
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/8 p-3 text-sm text-[#B91C1C]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="sticky bottom-24 z-10 lg:static">
        <button type="submit" className="btn-green w-full shadow-lg lg:shadow-none" disabled={busy || uploading}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {asset ? "Save changes" : "Save & generate barcode"}
        </button>
      </div>
    </form>
  );
}
