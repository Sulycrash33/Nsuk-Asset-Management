export type AccountingRow = {
  id: string;
  barcode: string;
  name: string;
  classification: string | null;
  category_id: string | null;
  unit_name: string | null;
  status: string;
  model: "cost" | "current_value" | null;
  original_cost: number | null;
  gross_amount: number | null;
  residual_value: number | null;
  impairment: number | null;
  accumulated_depreciation: number | null;
  carrying_amount: number | null;
  year_depreciation: number | null;
};
export type AccountingReport = {
  as_of: string;
  rows: AccountingRow[];
  asset_count: number;
  valued_count: number;
  incomplete_count: number;
  original_cost: number;
  depreciation: number;
  impairment: number;
  carrying_amount: number;
  year_depreciation: number;
};

/** Keep the draft tied to fresh server data; only an explicit saved ID selects a snapshot. */
export function selectAccountingReport(
  draft: AccountingReport,
  saved: { id: string; snapshot: AccountingReport }[],
  selectedId: string | null,
) {
  const snapshot = saved.find((item) => item.id === selectedId);
  return { report: snapshot?.snapshot ?? draft, finalized: Boolean(snapshot) };
}

/** Explicit report columns; unknown financial amounts remain blank in exports. */
export function accountingExportRows(report: AccountingReport) {
  return report.rows.map((row) => ({
    "Asset code": row.barcode,
    Name: row.name,
    Classification: row.classification ?? "Unclassified",
    Unit: row.unit_name ?? "",
    Status: row.status,
    Model: row.model ?? "",
    "Original cost (NGN)": row.original_cost,
    "Gross amount (NGN)": row.gross_amount,
    "Accumulated depreciation (NGN)": row.accumulated_depreciation,
    "Impairment (NGN)": row.impairment,
    "Book value (NGN)": row.carrying_amount,
    "Year depreciation (NGN)": row.year_depreciation,
    "As of": report.as_of,
  }));
}


