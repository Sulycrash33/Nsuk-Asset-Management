import { createClient } from "@/lib/supabase/client";

/**
 * Serial numbers, and the one rule that decides whether two of them mean the
 * same physical item.
 *
 * The register enforces this in the database — a unique index on
 * `lower(serial_number)`, see migration 20 — so the checks here exist to give a
 * person a readable answer before they lose a filled-in form, not to keep the
 * register correct. That distinction matters: anything that only asks first can
 * be beaten by two people saving at the same moment, which is exactly the case
 * the index is there for.
 */

/** Unique constraint carrying the rule, named so an error can be attributed. */
const SERIAL_INDEX = "assets_serial_unique_idx";

/**
 * How a serial is folded before comparison. The index uses `lower()`, so the
 * screen has to fold the same way or it will pass something the database then
 * rejects.
 */
export function normaliseSerial(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Whether the register already holds this serial. `ownSerial` is the value the
 * record being edited already carries, so re-saving an asset without touching
 * its serial does not report the asset as a duplicate of itself.
 */
export async function serialAlreadyRegistered(
  serial: string,
  ownSerial?: string | null,
): Promise<boolean> {
  const needle = normaliseSerial(serial);
  if (!needle || needle === normaliseSerial(ownSerial)) return false;

  const { data, error } = await createClient().rpc("existing_serial_numbers", {
    p_serials: [needle],
  });
  // A lookup that could not run is not evidence of a clash. Let the save go
  // ahead: the index is still there to catch it, with a message to match.
  if (error) return false;
  return ((data ?? []) as string[]).length > 0;
}

/**
 * Whether a write failed because another record already holds that serial.
 * Matched on the index by name, not on the SQLSTATE alone — barcodes are unique
 * too, and a barcode collision means something quite different has gone wrong.
 */
export function isDuplicateSerialError(
  error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): boolean {
  if (!error || error.code !== "23505") return false;
  // PostgREST names the index in `message` and the offending expression in
  // `details`. Either identifies this constraint; both are checked so a change
  // in which field carries it does not turn the message back into gibberish.
  const said = `${error.message ?? ""} ${error.details ?? ""}`;
  return said.includes(SERIAL_INDEX) || said.includes("serial_number");
}

/** What to tell someone whose save was refused for that reason. */
export const DUPLICATE_SERIAL_MESSAGE =
  "That serial number is already on another asset. Check whether this item has been recorded before — if it is genuinely a different one, correct the serial.";
