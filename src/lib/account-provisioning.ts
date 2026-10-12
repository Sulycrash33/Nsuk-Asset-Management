export type AccountInput = {
  name: string; email: string; password: string; role: "admin" | "staff" | "auditor";
  campus_id: string | null; unit_ids: string[]; invite: boolean;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function isUserId(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }

export function parseAccountInput(value: unknown): AccountInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid account request.");
  const body = value as Record<string, unknown>;
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) throw new Error("Enter a name of up to 200 characters.");
  if (typeof body.email !== "string" || body.email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) throw new Error("Enter a valid email address.");
  if (body.role !== undefined && body.role !== "admin" && body.role !== "staff" && body.role !== "auditor") throw new Error("Choose Staff, Auditor or Administrator.");
  if (body.invite !== undefined && typeof body.invite !== "boolean") throw new Error("Invalid invitation choice.");
  if (body.password !== undefined && typeof body.password !== "string") throw new Error("Invalid password.");
  const invite = body.invite === true;
  const password = (body.password as string | undefined) ?? "";
  if (!invite && password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (body.campus_id != null && !isUserId(body.campus_id)) throw new Error("Choose a valid campus.");
  if (body.unit_ids !== undefined && (!Array.isArray(body.unit_ids) || body.unit_ids.length > 500 || !body.unit_ids.every(isUserId))) throw new Error("Choose valid unit assignments.");
  const role = body.role === "admin" ? "admin" : body.role === "auditor" ? "auditor" : "staff";
  const units = [...new Set((body.unit_ids as string[] | undefined) ?? [])];
  if (role !== "admin" && !units.length) throw new Error("Assign at least one unit so this account can use the register.");
  return { name: body.name.trim(), email: body.email.trim().toLowerCase(), password, role,
    campus_id: role === "admin" ? null : (body.campus_id as string | null | undefined) ?? null,
    unit_ids: role === "admin" ? [] : units, invite };
}

type Operations = { create: () => Promise<string>; provision: (id: string) => Promise<void>; remove: (id: string) => Promise<void> };
export type ProvisionOutcome = { ok: true; id: string } | { ok: false; error: string; incompleteUserId?: string };

/** Never delete an invitation recipient on a setup failure: it might be an
 * existing invited account. Password createUser guarantees a newly created ID. */
export async function provisionAccount(invite: boolean, operations: Operations): Promise<ProvisionOutcome> {
  const id = await operations.create();
  try { await operations.provision(id); return { ok: true, id }; }
  catch (error) {
    const reason = error instanceof Error ? error.message : "Account assignments could not be saved.";
    if (!invite) {
      try { await operations.remove(id); return { ok: false, error: `Account creation was rolled back. ${reason}` }; }
      catch { /* An explicit recovery result is safer than pretending cleanup worked. */ }
    }
    return { ok: false, incompleteUserId: id,
      error: `The account exists but setup is incomplete. Refresh Staff accounts and edit its assignments before allowing access. ${reason}` };
  }
}
