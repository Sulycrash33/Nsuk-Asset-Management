"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import type { AssetCategory, Campus } from "@/lib/types";

type Table = "campuses" | "asset_categories";

/** Shared lists an administrator maintains: campuses and asset categories. */
function ListEditor({
  title,
  description,
  table,
  rows,
  placeholder,
  icon: Icon,
  noun,
}: {
  title: string;
  description: string;
  table: Table;
  rows: { id: string; name: string }[];
  placeholder: string;
  icon: LucideIcon;
  noun: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);

    const { error } = await createClient().from(table).insert({ name: name.trim() });
    setBusy(false);

    if (error) {
      toast.error(
        `Could not add the ${noun}`,
        error.message.includes("duplicate")
          ? `“${name.trim()}” is already on the list.`
          : error.message,
      );
      return;
    }
    toast.success(`${title.replace(/e?s$/, "")} added`, name.trim());
    setName("");
    router.refresh();
  }

  async function remove(id: string, label: string) {
    const ok = await confirm({
      title: `Remove “${label}”?`,
      body: `It will no longer be offered when recording an asset. Anything already using this ${noun} keeps it.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;

    setPending(id);
    const { error } = await createClient().from(table).delete().eq("id", id);
    setPending(null);

    if (error) {
      toast.error(
        `Could not remove the ${noun}`,
        error.message.includes("violates foreign key")
          ? `“${label}” is still in use and cannot be removed.`
          : error.message,
      );
      return;
    }
    toast.success("Removed", label);
    router.refresh();
  }

  return (
    <div className="card flex flex-col">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-nsuk-blue-50 text-nsuk-blue">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-nsuk-blue">{title}</h2>
          <p className="text-sm leading-relaxed text-nsuk-muted">{description}</p>
        </div>
      </div>

      <ul className="scroll-slim mt-4 max-h-64 flex-1 divide-y divide-nsuk-line-soft overflow-y-auto">
        {rows.map((row) => (
          <li key={row.id} className="group flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-nsuk-ink">{row.name}</span>
            <button
              onClick={() => remove(row.id, row.name)}
              disabled={pending === row.id}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-nsuk-danger transition hover:bg-nsuk-danger-soft lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
              aria-label={`Remove ${row.name}`}
            >
              {pending === row.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-3 text-sm text-nsuk-faint">Nothing here yet.</li>}
      </ul>

      <form onSubmit={add} className="mt-3 flex gap-2 border-t border-nsuk-line pt-3">
        <input
          className="field flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          aria-label={`Add to ${title}`}
        />
        <button type="submit" className="btn-green shrink-0 !px-4" disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="sr-only">Add</span>
        </button>
      </form>
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
        icon={Building2}
        noun="campus"
      />
      <ListEditor
        title="Asset categories"
        description="The shared list offered when recording an asset."
        table="asset_categories"
        rows={categories}
        placeholder="Add a category"
        icon={Tags}
        noun="category"
      />
    </div>
  );
}
