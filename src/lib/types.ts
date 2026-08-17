export type Role = "admin" | "staff";

export const CONDITIONS = ["Working", "Faulty", "Under Repair", "Missing"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const UNIT_TYPES = [
  "Faculty",
  "School",
  "Directorate",
  "Department",
  "Centre",
  "Office",
  "Clinic",
  "Other",
] as const;

/**
 * The tiers an asset schedule is grouped and reported by. Departments and
 * offices sit beneath one of these, so a schedule "by Faculty" means every
 * item held anywhere below that faculty.
 */
export const TOP_TIERS = ["Faculty", "School", "Directorate"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export type Campus = {
  id: string;
  name: string;
};

export type OrgUnit = {
  id: string;
  parent_id: string | null;
  campus_id: string;
  name: string;
  unit_type: string;
  code: string | null;
  /** Three letters used in the asset code, e.g. ACC in NSU/ADM/ACC/CP/T/001. */
  short_code: string | null;
  created_at?: string;
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  campus_id: string | null;
  created_at?: string;
};

export type AssetCategory = {
  id: string;
  name: string;
  /** Two letters used as the item type in the asset code. */
  code?: string | null;
};

export type Asset = {
  id: string;
  barcode: string;
  qr_payload: string;
  name: string;
  category_id: string | null;
  org_unit_id: string;
  location: string | null;
  condition: Condition;
  value: number;
  serial_number: string | null;
  acquisition_date: string | null;
  photo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetWithRefs = Asset & {
  asset_categories?: { name: string } | null;
  org_units?: { name: string; code: string | null } | null;
};

export type AssetLog = {
  id: string;
  asset_id: string | null;
  asset_barcode: string | null;
  asset_name: string | null;
  action: "created" | "edited" | "moved" | "deleted";
  performed_by: string | null;
  from_unit_id: string | null;
  to_unit_id: string | null;
  note: string | null;
  created_at: string;
};

/** Naira formatting used across dashboards, lists and PDF exports. */
export function formatNaira(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "₦" + (Number.isFinite(n) ? n : 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const CONDITION_STYLES: Record<Condition, string> = {
  Working: "bg-[#1F7A3D]/12 text-[#1F7A3D] border-[#1F7A3D]/30",
  Faulty: "bg-[#C2410C]/12 text-[#C2410C] border-[#C2410C]/30",
  "Under Repair": "bg-[#F2B705]/20 text-[#8A6A00] border-[#F2B705]/50",
  Missing: "bg-[#B91C1C]/12 text-[#B91C1C] border-[#B91C1C]/30",
};
