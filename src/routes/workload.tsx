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
  const { workloadPlanApplied: applied, applyWorkloadPlan, distribution, workload: workloadTotals, courses } = useStore();
  const peak = distribution.reduce((highest, day) => day.required > highest.required ? day : highest);
  const max = Math.max(...courses.map((c) => c.remaining));
  return (
    <>
      <PageHeader title="My Workload" subtitle="Forecast for Week 43 based on assignment estimates and your timetable." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Required" value={`${workloadTotals.required}h`} sub="This week" icon={Hourglass} />
        <MetricCard label="Available" value={`${workloadTotals.available}h`} sub="Free study time" icon={Clock} />
        <MetricCard label="Overload" value={`${workloadTotals.required - workloadTotals.available}h`} sub="Weekly capacity gap" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Peak day" value={peak.day} sub={`${peak.required}h required · ${peak.available}h free`} icon={TrendingUp} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-b pb-3 text-[13px]" aria-live="polite"><span>Scheduled study: <b>{workloadTotals.scheduled}h</b></span><span>Not yet scheduled: <b>{workloadTotals.unscheduled}h</b></span><span>Scheduling allocates work; completing tasks reduces required hours.</span></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Daily distribution" subtitle="Red bars exceed available time"><WorkloadChart height={260} /></Panel>
        <Panel title="All remaining by course" subtitle={`${workloadTotals.allRemaining}h · all deadlines, including future weeks`}>
          <div className="space-y-3">{courses.map((c) => <div key={c.id}><div className="mb-1 flex justify-between"><CourseTag id={c.id} /><span className="text-[12px] tabular-nums">{c.remaining}h</span></div><ProgressBar value={(c.remaining / max) * 100} /></div>)}</div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Overloaded days">
          {distribution.filter((d) => d.required > d.available).map((d) => (
            <div key={d.day} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b py-2 text-[13px] last:border-0"><span className="font-medium">{d.day}</span><span className="text-muted-foreground">{d.required}h required · {d.available}h available</span><span className="font-medium text-destructive tabular-nums">+{d.required - d.available}h</span></div>
          ))}
        </Panel>
        <Panel title="Rebalancing plan">
          <PredictionNote>Move <b>2h</b> of Software Engineering work (JWT token generation) to Monday 13:00–15:00, and start the Aggregation pipeline on Tuesday evening. This redistributes work; it does not add study capacity. The weekly gap remains <b>{workloadTotals.required - workloadTotals.available}h</b>.</PredictionNote>
          <Button size="sm" className="mt-3" disabled={applied} onClick={() => { applyWorkloadPlan(); toast.success("Plan applied", { description: "Wednesday reduced from 7h to 5h" }); }}>{applied ? "Plan applied" : "Apply plan"}</Button>
        </Panel>
      </div>
    </>
  );
}
