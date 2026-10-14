import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import AccountingClient from "./accounting-client";
import type { AccountingReport } from "@/lib/accounting";
export const metadata = { title: "Asset accounting" };
export const dynamic = "force-dynamic";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireAdmin();
  const { date } = await searchParams;
  const asOf =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);
  const db = await createClient();
  const [report, categories, history, saved] = await Promise.all([
    db.rpc("accounting_report", { p_date: asOf }),
    db.from("asset_categories").select("*").eq("active", true).order("name"),
    db
      .from("accounting_events")
      .select(
        "id,asset_id,effective_date,kind,gross_amount,reason,evidence,valuer,recorded_at",
      )
      .order("recorded_at", { ascending: false })
      .limit(100),
    db
      .from("accounting_reports")
      .select("id,period_end,snapshot")
      .order("period_end", { ascending: false })
      .limit(10),
  ]);
  if (report.error || categories.error || history.error || saved.error)
    throw new Error("Unable to load asset accounting. Please try again.");
  return (
    <AccountingClient
      key={asOf}
      report={report.data as AccountingReport}
      categories={categories.data ?? []}
      history={history.data ?? []}
      saved={
        (saved.data ?? []) as {
          id: string;
          period_end: string;
          snapshot: AccountingReport;
        }[]
      }
    />
  );
}

