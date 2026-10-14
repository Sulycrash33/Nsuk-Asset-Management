"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm";
import { accountingExportRows, type AccountingReport } from "@/lib/accounting";
import { formatNaira, type AssetCategory } from "@/lib/types";

type History = {
  id: string;
  asset_id: string;
  effective_date: string;
  kind: string;
  gross_amount: number;
  reason: string;
  evidence: string;
  valuer: string | null;
  recorded_at: string;
};
export default function AccountingClient({
  report,
  categories,
  history,
  saved,
}: {
  report: AccountingReport;
  categories: AssetCategory[];
  history: History[];
  saved: { id: string; period_end: string; snapshot: AccountingReport }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const [assetId, setAssetId] = useState(report.rows[0]?.id ?? ""),
    [classId, setClassId] = useState(categories[0]?.id ?? "");
  const [shown, setShown] = useState(report);
  const asset = report.rows.find((r) => r.id === assetId);
  const classAssets = report.rows.filter((r) => r.category_id === classId);
  async function mutate(name: string, args: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const { error: failure } = await createClient().rpc(name, args);
      if (failure) throw new Error(failure.message);
      setNotice("Recorded successfully. Financial history has been preserved.");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Request failed. Retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportReport(kind: "excel" | "pdf") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "excel") {
        const XLSX = await import("xlsx");
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.json_to_sheet(accountingExportRows(shown)),
          "Asset accounting",
        );
        XLSX.writeFile(book, `nsuk-accounting-${shown.as_of}.xlsx`);
      } else {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF({ orientation: "landscape" });
        doc.setFontSize(14);
        doc.text(`NSUK Asset accounting — ${shown.as_of}`, 14, 16);
        doc.setFontSize(9);
        doc.text(
          `NGN | Book value ${formatNaira(shown.carrying_amount)} | ${shown.incomplete_count} incomplete | ${shown === report ? "Draft" : "Finalized snapshot"}`,
          14,
          23,
        );
        autoTable(doc, {
          startY: 29,
          head: [
            [
              "Code",
              "Asset",
              "Class",
              "Status",
              "Original cost",
              "Depreciation",
              "Impairment",
              "Book value",
            ],
          ],
          body: shown.rows.map((r) => [
            r.barcode,
            r.name,
            r.classification ?? "Unclassified",
            r.status,
            ...[
              r.original_cost,
              r.accumulated_depreciation,
              r.impairment,
              r.carrying_amount,
            ].map((v) => (v === null ? "Unknown" : formatNaira(v))),
          ]),
          styles: { fontSize: 7 },
        });
        doc.save(`nsuk-accounting-${shown.as_of}.pdf`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-nsuk-blue">Asset accounting</h1>
        <p className="text-sm text-nsuk-muted">
          Administrator controls for cost, straight-line depreciation,
          revaluation and January–December reporting in Naira.
        </p>
      </header>
      {error && (
        <p role="alert" className="card border-nsuk-danger text-nsuk-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="card text-nsuk-green">
          {notice}
        </p>
      )}
      <section className="card space-y-3">
        <h2 className="section-title">Financial report</h2>
        <form action="/accounting" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="report-date">
              As-of date
            </label>
            <input
              className="field"
              id="report-date"
              name="date"
              type="date"
              defaultValue={report.as_of}
              required
            />
          </div>
          <button className="btn-primary" disabled={busy}>
            Load report
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => exportReport("excel")}
          >
            Download Excel
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => exportReport("pdf")}
          >
            Download PDF
          </button>
          <button
            className="btn-gold"
            disabled={
              busy ||
              shown !== report ||
              report.incomplete_count > 0 ||
              !report.as_of.endsWith("12-31")
            }
            onClick={async () => {
              if (
                await confirm({
                  title: "Finalize this accounting year?",
                  body: "The report is saved permanently and financial events dated in this year or earlier will be refused.",
                  confirmLabel: "Finalize year",
                })
              )
                await mutate("finalize_accounting_year", {
                  p_date: report.as_of,
                });
            }}
          >
            Finalize year
          </button>
        </div>
        <p className="text-xs text-nsuk-muted">
          {shown === report
            ? "Draft — current register, including incomplete records"
            : "Finalized report — saved values"}
          . {shown.asset_count} records; {shown.incomplete_count} need
          accounting review. Finalization requires a completed year and complete
          accounting details.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <p>
            Original cost
            <br />
            <strong>{formatNaira(shown.original_cost)}</strong>
          </p>
          <p>
            Accumulated depreciation
            <br />
            <strong>{formatNaira(shown.depreciation)}</strong>
          </p>
          <p>
            Book value
            <br />
            <strong>{formatNaira(shown.carrying_amount)}</strong>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "Asset",
                  "Classification",
                  "Status",
                  "Cost",
                  "Depreciation",
                  "Book value",
                ].map((v) => (
                  <th className="p-2" key={v}>
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((r) => (
                <tr className="border-t border-nsuk-line" key={r.id}>
                  <td className="p-2">
                    <Link className="text-nsuk-blue" href={`/assets/${r.id}`}>
                      {r.name}
                    </Link>
                    <p className="font-mono text-xs">{r.barcode}</p>
                  </td>
                  <td className="p-2">{r.classification ?? "Unclassified"}</td>
                  <td className="p-2">{r.status}</td>
                  {[
                    r.original_cost,
                    r.accumulated_depreciation,
                    r.carrying_amount,
                  ].map((v, i) => (
                    <td key={i} className="p-2">
                      {v === null ? "Unknown" : formatNaira(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {saved.length > 0 && (
          <div>
            <h3 className="font-semibold">Finalized years (latest 10)</h3>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => setShown(report)}>
                Current draft
              </button>
              {saved.map((s) => (
                <button
                  className="btn-ghost"
                  key={s.id}
                  onClick={() => setShown(s.snapshot)}
                >
                  {s.period_end}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <details className="card" open>
        <summary className="cursor-pointer font-semibold">
          Classifications and future acquisition rates
        </summary>
        <p className="my-2 text-xs text-nsuk-muted">
          The nine classifications follow the supplied institutional policy.
          Rate changes affect future acquisitions; existing events retain their
          rate. Straight-line depreciation uses actual calendar-day proration
          and zero residual at initial entry. Review residual value and
          remaining life through evidenced adjustments.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {categories.map((c) => (
            <form
              className="rounded-lg border border-nsuk-line p-3"
              key={c.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate("set_accounting_rate", {
                  p_category: c.id,
                  p_rate: Number(f.get("rate")),
                  p_reason: f.get("reason"),
                });
              }}
            >
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-xs">
                {c.measurement_model === "current_value"
                  ? "Current value / revaluation"
                  : "Historical cost"}
              </p>
              <label className="label" htmlFor={`rate-${c.id}`}>
                Annual rate (%)
              </label>
              <input
                className="field"
                id={`rate-${c.id}`}
                name="rate"
                type="number"
                min="0"
                max="100"
                step="0.0001"
                defaultValue={c.annual_rate}
                required
              />
              <label className="label" htmlFor={`reason-${c.id}`}>
                Policy change reason
              </label>
              <input
                className="field"
                id={`reason-${c.id}`}
                name="reason"
                required
              />
              <button className="btn-ghost mt-2" disabled={busy}>
                Save future rate
              </button>
            </form>
          ))}
        </div>
      </details>
      <details className="card">
        <summary className="cursor-pointer font-semibold">
          Opening balances and impairment
        </summary>
        <p className="my-2 text-xs text-nsuk-muted">
          Complete unvalued or migrated assets here. Impairment retains original
          cost and gross value. Approved events are permanent and require
          supporting references.
        </p>
        <label className="label" htmlFor="accounting-asset">
          Asset
        </label>
        <select
          id="accounting-asset"
          className="field"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
        >
          {report.rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.barcode} — {r.name}
            </option>
          ))}
        </select>
        {asset && (
          <form
            key={asset.id}
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                !(await confirm({
                  title: "Record this financial adjustment?",
                  body: "The dated amounts and evidence reference will become permanent financial history.",
                  confirmLabel: "Record adjustment",
                }))
              )
                return;
              await mutate("record_accounting_event", {
                p_asset: asset.id,
                p_date: f.get("date"),
                p_kind: f.get("kind"),
                p_category: f.get("category"),
                p_cost: Number(f.get("cost")),
                p_gross: Number(f.get("gross")),
                p_depreciation: Number(f.get("depreciation")),
                p_impairment: Number(f.get("impairment")),
                p_residual: Number(f.get("residual")),
                p_years: Number(f.get("years")),
                p_evidence: f.get("evidence"),
                p_reason: f.get("reason"),
              });
            }}
          >
            <div>
              <label className="label" htmlFor="event-kind">
                Event
              </label>
              <select className="field" id="event-kind" name="kind">
                <option value="opening">Opening balances</option>
                <option value="impairment">Impairment</option>
                <option value="correction">
                  Correction / reviewed balances
                </option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="event-category">
                Classification
              </label>
              <select
                className="field"
                id="event-category"
                name="category"
                defaultValue={asset.category_id ?? categories[0]?.id}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="event-date">
                Effective date
              </label>
              <input
                className="field"
                id="event-date"
                name="date"
                type="date"
                defaultValue={report.as_of}
                required
              />
            </div>
            {(
              [
                ["cost", "Original cost", asset.original_cost],
                ["gross", "Gross amount", asset.gross_amount],
                [
                  "depreciation",
                  "Accumulated depreciation",
                  asset.accumulated_depreciation,
                ],
                ["impairment", "Accumulated impairment", asset.impairment],
                ["residual", "Residual value", asset.residual_value],
              ] as const
            ).map(([key, label, value]) => (
              <div key={key}>
                <label className="label" htmlFor={`event-${key}`}>
                  {label} (₦)
                </label>
                <input
                  className="field"
                  id={`event-${key}`}
                  name={key}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={
                    value ?? (key === "cost" || key === "gross" ? "" : 0)
                  }
                  required
                />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="event-years">
                Remaining useful life (years)
              </label>
              <input
                className="field"
                id="event-years"
                name="years"
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="event-evidence">
                Evidence / document reference
              </label>
              <input
                className="field"
                id="event-evidence"
                name="evidence"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="event-reason">
                Reason
              </label>
              <input
                className="field"
                id="event-reason"
                name="reason"
                required
              />
            </div>
            <button className="btn-primary" disabled={busy}>
              Record adjustment
            </button>
          </form>
        )}
      </details>
      <details className="card">
        <summary className="cursor-pointer font-semibold">
          Revalue an entire classification
        </summary>
        <p className="my-2 text-xs text-nsuk-muted">
          Every asset in the selected class must have an opening record and an
          approved value. Original costs are retained. The whole batch succeeds
          or fails together.
        </p>
        <label className="label" htmlFor="revalue-class">
          Classification
        </label>
        <select
          className="field"
          id="revalue-class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <form
          key={classId}
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const rows = classAssets.map((a) => ({
              asset_id: a.id,
              amount: Number(f.get(`amount-${a.id}`)),
              residual: Number(f.get(`residual-${a.id}`)),
              years: Number(f.get(`years-${a.id}`)),
              basis: f.get(`basis-${a.id}`),
            }));
            if (
              await confirm({
                title: "Approve class revaluation?",
                body: `Record new valuations for all ${rows.length} assets and use the current-value model for this class?`,
                confirmLabel: "Approve revaluation",
              })
            )
              await mutate("revalue_accounting_class", {
                p_category: classId,
                p_date: f.get("date"),
                p_rows: rows,
                p_valuer: f.get("valuer"),
                p_evidence: f.get("evidence"),
                p_reason: f.get("reason"),
              });
          }}
        >
          <label className="label" htmlFor="revalue-date">
            Valuation date
          </label>
          <input
            className="field"
            type="date"
            id="revalue-date"
            name="date"
            defaultValue={report.as_of}
            required
          />
          {classAssets.map((a) => (
            <fieldset
              key={a.id}
              className="rounded-lg border border-nsuk-line p-3"
            >
              <legend className="text-sm">
                {a.barcode} — {a.name}
              </legend>
              <label className="label" htmlFor={`basis-${a.id}`}>
                Valuation basis
              </label>
              <select
                className="field"
                id={`basis-${a.id}`}
                name={`basis-${a.id}`}
              >
                <option value="current_operational">
                  Current operational value (service assets)
                </option>
                <option value="fair_value">
                  Fair value (financial capacity)
                </option>
              </select>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["amount", "New valuation"],
                    ["residual", "Residual value"],
                    ["years", "Remaining years"],
                  ] as const
                ).map(([k, l]) => (
                  <div key={k}>
                    <label className="label" htmlFor={`${k}-${a.id}`}>
                      {l}
                    </label>
                    <input
                      id={`${k}-${a.id}`}
                      className="field"
                      name={`${k}-${a.id}`}
                      type="number"
                      step="0.01"
                      min={k === "years" ? "0.01" : "0"}
                      defaultValue={k === "residual" ? 0 : undefined}
                      required
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {["valuer", "evidence", "reason"].map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`revalue-${k}`}>
                {k === "evidence"
                  ? "Valuation report reference"
                  : k === "valuer"
                    ? "Qualified valuer"
                    : "Approval reason"}
              </label>
              <input className="field" id={`revalue-${k}`} name={k} required />
            </div>
          ))}
          <button
            className="btn-primary"
            disabled={busy || !classAssets.length}
          >
            Approve whole class ({classAssets.length} assets)
          </button>
        </form>
      </details>
      <details className="card">
        <summary className="cursor-pointer font-semibold">
          Financial event history (latest 100)
        </summary>
        <ul className="divide-y divide-nsuk-line">
          {history.map((h) => (
            <li key={h.id} className="py-3 text-sm">
              <strong>
                {h.kind} · {h.effective_date} · {formatNaira(h.gross_amount)}
              </strong>
              <p>
                {h.reason} · Evidence: {h.evidence}
                {h.valuer ? ` · Valuer: ${h.valuer}` : ""}
              </p>
              <p className="text-xs">Asset reference: {h.asset_id}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

