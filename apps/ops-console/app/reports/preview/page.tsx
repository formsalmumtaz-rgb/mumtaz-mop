import Link from "next/link";
import { requireView } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { pool } from "@/lib/db";
import { PageHeader, Card, CardBody, Button } from "@/components/ui";
import {
  previousPeriod, computePeriodReport, computePeriodAnalysis, periodReportEmail, type Period,
} from "@mop/worker";
import { sendReportNowAction } from "./actions";

// Item 5 — see the report BEFORE it is filed. This renders the exact email the
// scheduler would send for the chosen cadence, from live figures, so the owner
// can read it (and send it) without waiting for 17:00 or for Monday.
export const dynamic = "force-dynamic";

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" },
];

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireView("settings.manage");
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.value === sp.period)?.value ?? "daily") as Period;
  const tenantId = await getTenantId();

  // "Today" in the business's own clock — the same basis the scheduler uses.
  const { rows: nowRows } = await pool.query(`select (now() at time zone 'Asia/Dubai')::date::text as today`);
  const today: string = nowRows[0].today;
  const range = previousPeriod(period, today);

  const c = await pool.connect();
  let mail: { subject: string; text: string; html: string };
  let analysis: string[];
  try {
    const report = await computePeriodReport(c, tenantId, range);
    analysis = await computePeriodAnalysis(c, tenantId, report);
    mail = periodReportEmail(report, analysis);
  } finally {
    c.release();
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium ${active ? "border-brand bg-brand/5 text-brand" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Report preview"
        description="Exactly what the scheduled email will contain, computed from live figures right now. Nothing is sent until you press send."
        actions={<Link href="/reports" className="text-sm text-brand underline">All reports →</Link>}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link key={p.value} href={`/reports/preview?period=${p.value}`} className={chip(period === p.value)}>{p.label}</Link>
        ))}
        <span className="text-sm text-neutral-500">
          {range.from === range.to ? range.from : `${range.from} to ${range.to}`}
        </span>
      </div>

      {sp.sent && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Queued for sending to the report recipient, with the workbook attached. It goes out on the next sweep.
        </div>
      )}
      {sp.error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</div>}

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">{mail.subject}</div>
            <div className="text-sm text-neutral-500">Goes to the address in Settings → reports.daily_recipient, with the Excel pack attached.</div>
          </div>
          <form action={sendReportNowAction}>
            <input type="hidden" name="period" value={period} />
            <Button type="submit">Send this now</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0 sm:p-0">
          {/* The real email body, rendered as the recipient will see it. */}
          <iframe title="Report email preview" srcDoc={mail.html} className="h-[900px] w-full rounded-lg border-0" />
        </CardBody>
      </Card>

      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium">Plain-text version (what a phone with images off shows)</summary>
        <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600">{mail.text}</pre>
      </details>
    </div>
  );
}
