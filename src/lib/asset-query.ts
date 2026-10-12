import type { SupabaseClient } from "@supabase/supabase-js";

export type RegisterFilters = { unitIds: string[] | null; category: string | null; condition: string | null; from: string | null; to: string | null; term: string; sort: string };
export const EMPTY_UNIT_ID = "00000000-0000-0000-0000-000000000000";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function filterId(value: string | undefined) { return value && uuid.test(value) ? value : null; }
export function filterDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
export function registerTerm(value: string | undefined) { return (value ?? "").replace(/[%,().\\"']/g, " ").trim().slice(0, 200); }
export function registerPage(value: string | undefined) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000000) : 1; }
export function registerQuery(client: SupabaseClient, select: string, f: RegisterFilters) {
  let query = client.from("assets").select(select, { count: "exact" });
  if (f.unitIds !== null) query = query.in("org_unit_id", f.unitIds.length ? f.unitIds : [EMPTY_UNIT_ID]);
  if (f.category) query = query.eq("category_id", f.category);
  if (f.condition) query = query.eq("condition", f.condition);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59.999999Z`);
  if (f.term) query = query.or(`name.ilike.%${f.term}%,barcode.ilike.%${f.term}%,serial_number.ilike.%${f.term}%,location.ilike.%${f.term}%`);
  switch (f.sort) {
    case "oldest": query = query.order("created_at", { ascending: true }); break;
    case "name": query = query.order("name", { ascending: true }); break;
    case "value": query = query.order("value", { ascending: false }); break;
    case "unit": query = query.order("org_unit_id", { ascending: true }).order("name", { ascending: true }); break;
    default: query = query.order("created_at", { ascending: false });
  }
  return query.order("id", { ascending: true });
}
export function summaryArgs(f: RegisterFilters) { return { p_unit_ids: f.unitIds, p_category: f.category, p_condition: f.condition, p_from: f.from, p_to: f.to, p_term: f.term }; }
