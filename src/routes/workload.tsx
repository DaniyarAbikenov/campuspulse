import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Hourglass, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote, CourseTag, ProgressBar } from "@/components/app/common";
import { WorkloadChart } from "@/components/app/widgets";
import { courses, weeklyWorkload, workloadTotals } from "@/lib/data";

export const Route = createFileRoute("/workload")({
  head: () => ({ meta: [
    { title: "My Workload — CampusPulse AI" }, { name: "description", content: "Required vs. available study hours, overload days and rebalancing suggestions." },
    { property: "og:title", content: "My Workload — CampusPulse AI" }, { property: "og:description", content: "Required vs. available study hours and rebalancing suggestions." },
  ] }),
  component: Workload,
});

function Workload() {
  const { workloadPlanApplied: applied, applyWorkloadPlan } = useStore();
  const distribution = weeklyWorkload.map((day) => ({ ...day, required: day.required + (applied ? day.day === "Mon" ? 2 : day.day === "Wed" ? -2 : 0 : 0) }));
  const max = Math.max(...courses.map((c) => c.remaining));
  return (
    <>
      <PageHeader title="My Workload" subtitle="Forecast for Week 43 based on assignment estimates and your timetable." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Required" value={`${workloadTotals.required}h`} sub="This week" icon={Hourglass} />
        <MetricCard label="Available" value={`${workloadTotals.available}h`} sub="Free study time" icon={Clock} />
        <MetricCard label="Overload" value={`${workloadTotals.required - workloadTotals.available}h`} sub="Weekly capacity gap" icon={AlertTriangle} tone="warning" />
        <MetricCard label="Peak day" value={applied ? "Thu" : "Wed"} sub={applied ? "6h required · 1.5h free" : "7h required · 3.5h free"} icon={TrendingUp} />
      </div>
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
          <PredictionNote>Move <b>2h</b> of Software Engineering work (JWT token generation) to Monday 13:00–15:00, and start the Aggregation pipeline on Tuesday evening. This redistributes work; it does not add study capacity. The weekly gap remains <b>9.5h</b>.</PredictionNote>
          <Button size="sm" className="mt-3" disabled={applied} onClick={() => { applyWorkloadPlan(); toast.success("Plan applied", { description: "Wednesday reduced from 7h to 5h" }); }}>{applied ? "Plan applied" : "Apply plan"}</Button>
        </Panel>
      </div>
    </>
  );
}
