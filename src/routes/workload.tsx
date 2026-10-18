import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Hourglass, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote, CourseTag, ProgressBar } from "@/components/app/common";
import { WorkloadChart } from "@/components/app/widgets";
import { courses, weeklyWorkload } from "@/lib/data";

export const Route = createFileRoute("/workload")({
  head: () => ({ meta: [
    { title: "My Workload — CampusPulse AI" }, { name: "description", content: "Required vs. available study hours, overload days and rebalancing suggestions." },
    { property: "og:title", content: "My Workload — CampusPulse AI" }, { property: "og:description", content: "Required vs. available study hours and rebalancing suggestions." },
  ] }),
  component: Workload,
});

function Workload() {
  const [applied, setApplied] = useState(false);
  const max = Math.max(...courses.map((c) => c.remaining));
  return (
    <>
      <PageHeader title="My Workload" subtitle="Forecast for Week 43 based on assignment estimates and your timetable." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Required" value="21.5h" sub="This week" icon={Hourglass} />
        <MetricCard label="Available" value="12h" sub="Free study time" icon={Clock} />
        <MetricCard label="Overload" value={applied ? "7.5h" : "9.5h"} sub={applied ? "After rebalancing" : "Above capacity"} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Peak day" value="Wed" sub="7h required · 3.5h free" icon={TrendingUp} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Daily distribution" subtitle="Red bars exceed available time"><WorkloadChart height={260} /></Panel>
        <Panel title="By course" subtitle="Remaining hours">
          <div className="space-y-3">{courses.map((c) => <div key={c.id}><div className="mb-1 flex justify-between"><CourseTag id={c.id} /><span className="text-[12px] tabular-nums">{c.remaining}h</span></div><ProgressBar value={(c.remaining / max) * 100} /></div>)}</div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Overloaded days">
          {weeklyWorkload.filter((d) => d.required > d.available).map((d) => (
            <div key={d.day} className="flex items-center justify-between border-b py-2 text-[13px] last:border-0"><span className="font-medium">{d.day}</span><span className="text-muted-foreground">{d.required}h required · {d.available}h available</span><span className="font-medium text-destructive tabular-nums">+{d.required - d.available}h</span></div>
          ))}
        </Panel>
        <Panel title="Rebalancing plan">
          <PredictionNote>Move <b>2h</b> of Software Engineering work (JWT token generation) to Monday 13:00–15:00, and start the Aggregation pipeline on Tuesday evening.</PredictionNote>
          <Button size="sm" className="mt-3" disabled={applied} onClick={() => { setApplied(true); toast.success("Plan applied", { description: "Wednesday reduced from 7h to 5h" }); }}>{applied ? "Plan applied" : "Apply plan"}</Button>
        </Panel>
      </div>
    </>
  );
}
