/** Refuse incomplete exports: every batch must agree on the matching count. */
export async function collectRegister<T extends { id: string }>(load: (offset: number) => Promise<{ assets: T[]; total: number }>): Promise<T[]> {
  const rows: T[] = [], ids = new Set<string>();
  let expected: number | null = null;
  for (;;) {
    const batch = await load(rows.length);
    if (!Number.isSafeInteger(batch.total) || batch.total < 0 || !Array.isArray(batch.assets)) throw new Error("Invalid export response.");
    expected ??= batch.total;
    if (batch.total !== expected) throw new Error("The register changed during export. Retry the export.");
    for (const row of batch.assets) {
      if (!row.id || ids.has(row.id)) throw new Error("The register changed during export. Retry the export.");
      ids.add(row.id); rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (!batch.assets.length || rows.length > expected) throw new Error("The export was incomplete. Retry the export.");
  }
}
