import Link from "next/link";
import { requireView } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { withRequest } from "@/lib/rls";
import { PageHeader, Card, CardBody, Button } from "@/components/ui";
import {
  previousPeriod, computePeriodReport, computePeriodAnalysis, periodReportEmail, type Period,
} from "@mop/worker";
import { sendReportNowAction } from "./actions";
import { narrateReport } from "@/lib/assistant";
import { getSession } from "@/lib/auth";

// Item 5 — see the report BEFORE it is filed. This renders the exact email the
// scheduler would send for the chosen cadence, from live figures, so the owner
// can read it (and send it) without waiting for 17:00 or for Monday.
export const dynamic = "force-dynamic";

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-year" }, { value: "yearly", label: "Yearly" },
];

export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireView("settings.manage");
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.value === sp.period)?.value ?? "daily") as Period;
  const tenantId = await getTenantId();

  // The whole preview computes inside ONE tenant-scoped transaction (lib/rls.ts),
  // so this page reads under mop_app with RLS live, exactly like every other read.
  // It used to take a raw pooled connection and bypass the boundary.
  const { mail, analysis, figures, range } = await withRequest({ tenantId }, async (c) => {
    // "Today" in the business's own clock — the same basis the scheduler uses.
    const { rows: nowRows } = await c.query(`select (now() at time zone 'Asia/Dubai')::date::text as today`);
    const range = previousPeriod(period, nowRows[0].today as string);
    const report = await computePeriodReport(c, tenantId, range);
    const an = await computePeriodAnalysis(c, tenantId, report);
    return {
      mail: periodReportEmail(report, an),
      analysis: an,
      range,
      figures: { period: range, current: report.current, previous: report.previous } as Record<string, unknown>,
    };
  });

  // Phase 2/3 commentary. The report above is already complete and sendable;
  // this only turns the computed figures and the rule-flagged exceptions into
  // prose. Null (no key, refusal, any error) simply renders nothing.
  const session = await getSession();
  const narration = await narrateReport(tenantId, session?.userId ?? null, mail.subject, figures, analysis);

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

      {narration && (
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand">Commentary</span>
              <span className="text-xs text-neutral-500">
                Written by the assistant from the figures and flags above — the numbers themselves are computed, never generated.
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{narration}</p>
          </CardBody>
        </Card>
      )}

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
