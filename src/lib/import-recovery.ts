type SerialRow = { index: number; serial_number: string | null };
export type ExpectedImportRow = SerialRow & { import_key: string; org_unit_id: string };
type RecordedImportRow = { import_key: string | null; serial_number: string | null; org_unit_id: string };

/** Only a visible asset from this exact file row and original unit can be reused. */
export function reusableImportIndexes(expected: ExpectedImportRow[], recorded: RecordedImportRow[]): ReadonlySet<number> {
  const byKey = new Map(recorded.map((row) => [row.import_key, row]));
  return new Set(expected.filter((row) => {
    const saved = byKey.get(row.import_key);
    return saved && saved.org_unit_id === row.org_unit_id
      && !!row.serial_number?.trim()
      && saved.serial_number?.trim().toLowerCase() === row.serial_number.trim().toLowerCase();
  }).map((row) => row.index));
}

/** Reuse never permits a second occurrence of the same serial within one file. */
export function importSerialProblems(rows: SerialRow[], registered: ReadonlySet<string>, reused: ReadonlySet<number>): Map<number, string> {
  const firstSeen = new Map<string, number>();
  const problems = new Map<number, string>();
  for (const row of rows) {
    const serial = row.serial_number?.trim().toLowerCase();
    if (!serial) continue;
    const first = firstSeen.get(serial);
    if (first !== undefined) problems.set(row.index, `Duplicate serial number, same as row ${first + 2} of this file`);
    else {
      firstSeen.set(serial, row.index);
      if (registered.has(serial) && !reused.has(row.index)) problems.set(row.index, "Duplicate serial number, already on the register");
    }
  }
  return problems;
}

