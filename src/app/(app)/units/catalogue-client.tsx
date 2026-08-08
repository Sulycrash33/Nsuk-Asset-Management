"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AssetCategory, Campus } from "@/lib/types";

type Table = "campuses" | "asset_categories";

/** Shared lists an administrator maintains: campuses and asset categories. */
function ListEditor({
  title, description, table, rows, placeholder,
}: {
  title: string;
  description: string;
  table: Table;
  rows: { id: string; name: string }[];
  placeholder: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await createClient().from(table).insert({ name: name.trim() });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setName("");
    router.refresh();
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Remove “${label}”?`)) return;
    setBusy(true);
    setError(null);
    const { error: deleteError } = await createClient().from(table).delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      setError(
        deleteError.message.includes("violates foreign key")
          ? `“${label}” is still in use and cannot be removed.`
          : deleteError.message,
      );
      return;
    }
    router.refresh();
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold text-nsuk-blue">{title}</h2>
        <p className="text-sm text-neutral-600">{description}</p>
      </div>

      <ul className="divide-y divide-nsuk-line">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
            <button
              onClick={() => remove(row.id, row.name)}
              disabled={busy}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#B91C1C] hover:bg-[#B91C1C]/8"
              aria-label={`Remove ${row.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-sm text-neutral-500">Nothing here yet.</li>}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <input
          className="field flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={`Add to ${title}`}
        />
        <button type="submit" className="btn-green shrink-0 !px-4" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </form>

      {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
    </div>
  );
}

export default function CatalogueClient({
  campuses,
  categories,
}: {
  campuses: Campus[];
  categories: AssetCategory[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ListEditor
        title="Campuses"
        description="Every unit belongs to a campus."
        table="campuses"
        rows={campuses}
        placeholder="Add a campus"
      />
      <ListEditor
        title="Asset categories"
        description="The shared list offered when recording an asset."
        table="asset_categories"
        rows={categories}
        placeholder="Add a category"
      />
    </div>
  );
}
