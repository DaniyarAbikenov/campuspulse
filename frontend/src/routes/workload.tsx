import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { Hourglass, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote, CourseTag, ProgressBar } from "@/components/app/common";
import { WorkloadChart } from "@/components/app/widgets";
import { StudyPlanPanel } from "@/components/app/StudyPlanPanel";
import { WeekSwitcher } from "@/components/app/WeekSwitcher";
import { weekTitle } from "@/lib/week";
import { intlLocale } from "@/lib/i18n";
import { weeklyWorkload, workloadTotals } from "@/lib/data";

export const Route = createFileRoute("/workload")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "My Workload — CampusPulse AI" }, { name: "description", content: "Required vs. available study hours, overload days and rebalancing suggestions." },
    { property: "og:title", content: "My Workload — CampusPulse AI" }, { property: "og:description", content: "Required vs. available study hours and rebalancing suggestions." },
  ] }),
  component: Workload,
});

function Workload() {
  const { locale } = useI18n();
  const { workloadPlanApplied: applied, applyWorkloadPlan, distribution, workload: workloadTotals, courses, backendConnected, weekStart } = useStore();
  const peak = distribution.reduce((highest, day) => day.required > highest.required ? day : highest);
  const max = Math.max(...courses.map((c) => c.remaining));
  return (
    <>
      <PageHeader title={localize("My Workload", locale)} subtitle={`${weekTitle(weekStart, intlLocale(locale), localize("Week", locale))} · ${localize("based on assignment estimates and your timetable.", locale)}`} actions={<WeekSwitcher />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Required", locale)} value={`${workloadTotals.required}h`} sub={localize("This week", locale)} icon={Hourglass} />
        <MetricCard label={localize("Available", locale)} value={`${workloadTotals.available}h`} sub={localize("Free study time", locale)} icon={Clock} />
        <MetricCard label={localize(workloadTotals.required > workloadTotals.available ? "Overload" : "Spare capacity", locale)} value={`${Math.round(Math.abs(workloadTotals.required - workloadTotals.available) * 100) / 100}h`} sub={localize(workloadTotals.required > workloadTotals.available ? "Weekly capacity gap" : "Free study time beyond the work due", locale)} icon={AlertTriangle} tone={workloadTotals.required > workloadTotals.available ? "warning" : "success"} />
        <MetricCard label={localize("Peak day", locale)} value={peak.day} sub={localize(`${peak.required}h required · ${peak.available}h free`, locale)} icon={TrendingUp} />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-b pb-3 text-[13px]" aria-live="polite"><span>{localize("Scheduled study:", locale)} <b>{localize(workloadTotals.scheduled, locale)}{localize("h", locale)}</b></span><span>{localize("Not yet scheduled:", locale)} <b>{localize(workloadTotals.unscheduled, locale)}{localize("h", locale)}</b></span><span>{localize("Scheduling allocates work; completing tasks reduces required hours.", locale)}</span></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.85fr_1fr]">
        <Panel title={localize("Daily distribution", locale)} subtitle={localize("Red bars exceed available time", locale)}><WorkloadChart height={260} /></Panel>
        <Panel title={localize("All remaining by course", locale)} subtitle={localize(`${workloadTotals.allRemaining}h · all deadlines, including future weeks`, locale)}>
          <div className="space-y-3">{localize(courses.map((c) => <div key={c.id}><div className="mb-1 flex justify-between"><CourseTag id={c.id} /><span className="text-[12px] tabular-nums">{localize(c.remaining, locale)}{localize("h", locale)}</span></div><ProgressBar value={(c.remaining / max) * 100} /></div>), locale)}</div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={localize("Overloaded days", locale)}>
          {localize(distribution.filter((d) => d.required > d.available).map((d) => (
            <div key={d.day} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b py-2 text-[13px] last:border-0"><span className="font-medium">{localize(d.day, locale)}</span><span className="text-muted-foreground">{localize(d.required, locale)}{localize("h required ·", locale)} {localize(d.available, locale)}{localize("h available", locale)}</span><span className="font-medium text-destructive tabular-nums">{localize("+", locale)}{localize(d.required - d.available, locale)}{localize("h", locale)}</span></div>
          )), locale)}
        </Panel>
        {backendConnected ? <StudyPlanPanel /> : (
        <Panel title={localize("Rebalancing plan", locale)}>
          <PredictionNote>{localize("Move", locale)} <b>{localize("2h", locale)}</b> {localize("of Software Engineering work (JWT token generation) to Monday 13:00–15:00, and start the Aggregation pipeline on Tuesday evening. This redistributes work; it does not add study capacity. The weekly gap remains", locale)} <b>{localize(workloadTotals.required - workloadTotals.available, locale)}{localize("h", locale)}</b>{localize(".", locale)}</PredictionNote>
          <Button size="sm" className="mt-3" disabled={applied} onClick={() => { applyWorkloadPlan(); toast.success(localize("Plan applied", locale), { description: localize("Wednesday reduced from 7h to 5h", locale) }); }}>{localize(applied ? "Plan applied" : "Apply plan", locale)}</Button>
        </Panel>
        )}
      </div>
    </>
  );
}
