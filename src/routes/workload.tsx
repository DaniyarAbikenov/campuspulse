import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Hourglass, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote, CourseTag, ProgressBar } from "@/components/app/common";
import { WorkloadChart } from "@/components/app/widgets";
import { courses, weeklyWorkload, workloadTotals } from "@/lib/data";

export const Route = createFileRoute("/workload")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "My Workload — CampusPulse AI" }, { name: "description", content: "Required vs. available study hours, overload days and rebalancing suggestions." },
    { property: "og:title", content: "My Workload — CampusPulse AI" }, { property: "og:description", content: "Required vs. available study hours and rebalancing suggestions." },
  ] }),
  component: Workload,
});

function Workload() {
  useI18n();
  const { workloadPlanApplied: applied, applyWorkloadPlan, distribution, workload: workloadTotals, courses } = useStore();
  const peak = distribution.reduce((highest, day) => day.required > highest.required ? day : highest);
  const max = Math.max(...courses.map((c) => c.remaining));
  return (
    <>
      <PageHeader title={localize("My Workload")} subtitle={localize("Forecast for Week 43 based on assignment estimates and your timetable.")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Required")} value={`${workloadTotals.required}h`} sub={localize("This week")} icon={Hourglass} />
        <MetricCard label={localize("Available")} value={`${workloadTotals.available}h`} sub={localize("Free study time")} icon={Clock} />
        <MetricCard label={localize("Overload")} value={`${workloadTotals.required - workloadTotals.available}h`} sub={localize("Weekly capacity gap")} icon={AlertTriangle} tone="warning" />
        <MetricCard label={localize("Peak day")} value={peak.day} sub={localize(`${peak.required}h required · ${peak.available}h free`)} icon={TrendingUp} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-b pb-3 text-[13px]" aria-live="polite"><span>{localize("Scheduled study:")} <b>{localize(workloadTotals.scheduled)}{localize("h")}</b></span><span>{localize("Not yet scheduled:")} <b>{localize(workloadTotals.unscheduled)}{localize("h")}</b></span><span>{localize("Scheduling allocates work; completing tasks reduces required hours.")}</span></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Panel title={localize("Daily distribution")} subtitle={localize("Red bars exceed available time")}><WorkloadChart height={260} /></Panel>
        <Panel title={localize("All remaining by course")} subtitle={localize(`${workloadTotals.allRemaining}h · all deadlines, including future weeks`)}>
          <div className="space-y-3">{localize(courses.map((c) => <div key={c.id}><div className="mb-1 flex justify-between"><CourseTag id={c.id} /><span className="text-[12px] tabular-nums">{localize(c.remaining)}{localize("h")}</span></div><ProgressBar value={(c.remaining / max) * 100} /></div>))}</div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={localize("Overloaded days")}>
          {localize(distribution.filter((d) => d.required > d.available).map((d) => (
            <div key={d.day} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b py-2 text-[13px] last:border-0"><span className="font-medium">{localize(d.day)}</span><span className="text-muted-foreground">{localize(d.required)}{localize("h required ·")} {localize(d.available)}{localize("h available")}</span><span className="font-medium text-destructive tabular-nums">{localize("+")}{localize(d.required - d.available)}{localize("h")}</span></div>
          )))}
        </Panel>
        <Panel title={localize("Rebalancing plan")}>
          <PredictionNote>{localize("Move")} <b>{localize("2h")}</b> {localize("of Software Engineering work (JWT token generation) to Monday 13:00–15:00, and start the Aggregation pipeline on Tuesday evening. This redistributes work; it does not add study capacity. The weekly gap remains")} <b>{localize(workloadTotals.required - workloadTotals.available)}{localize("h")}</b>{localize(".")}</PredictionNote>
          <Button size="sm" className="mt-3" disabled={applied} onClick={() => { applyWorkloadPlan(); toast.success(localize("Plan applied"), { description: localize("Wednesday reduced from 7h to 5h") }); }}>{localize(applied ? "Plan applied" : "Apply plan")}</Button>
        </Panel>
      </div>
    </>
  );
}
