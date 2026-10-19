import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { cc } from "@/lib/chartColors";
import { createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Target, Timer, CheckCircle2, ListChecks } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { SimpleBars } from "@/components/app/widgets";
import { useStore } from "@/lib/store";
import { courseOf, semesterTrend } from "@/lib/data";

export const Route = createFileRoute("/statistics")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Study Statistics — CampusPulse AI" }, { name: "description", content: "Planned vs. actual study hours and estimate accuracy over the semester." },
    { property: "og:title", content: "Study Statistics — CampusPulse AI" }, { property: "og:description", content: "Planned vs. actual study hours over the semester." },
  ] }),
  component: Stats,
});

function Stats() {
  const { locale } = useI18n();
  const { assignments, statistics, courses, tasks, backendConnected } = useStore();
  const trend = backendConnected && statistics ? statistics.weekly.map((item) => ({ week: item.week, planned: item.planned, actual: item.actual })) : semesterTrend;
  const doneTasks = tasks.filter((task) => task.column === "done").length;
  const done = assignments.filter((a) => a.actual !== undefined);
  const actual = done.reduce((sum, a) => sum + (a.actual ?? 0), 0);
  const estimate = done.reduce((sum, a) => sum + a.estimate, 0);
  const reported = statistics?.reportedHours ?? actual;
  const accuracy = statistics?.estimateAccuracy ?? Math.round(Math.min(actual, estimate) / Math.max(actual, estimate) * 100);
  const completedCount = statistics?.completedAssignments ?? assignments.filter((a) => a.status === "Completed").length;
  return (
    <>
      <PageHeader title={localize("Study Statistics", locale)} subtitle={trend.length ? `${trend[0]?.week} – ${trend[trend.length - 1]?.week}` : ""} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Reported study time", locale)} value={`${reported}h`} sub={localize("Completed assignments", locale)} icon={Timer} />
        <MetricCard label={localize("Estimate accuracy", locale)} value={`${accuracy}%`} sub={localize("Actual vs. AI estimate", locale)} icon={Target} />
        <MetricCard label={localize("Completed", locale)} value={String(completedCount)} sub={localize("Assignments & labs", locale)} icon={CheckCircle2} />
        <MetricCard label={localize("Tasks done", locale)} value={`${doneTasks}/${tasks.length}`} sub={localize("On your Kanban board", locale)} icon={ListChecks} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={localize("Planned vs. actual hours", locale)} subtitle={localize(backendConnected ? "By the week each assignment was due" : "Per week", locale)}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={cc.border} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="planned" name={localize("Planned", locale)} stroke={cc.muted} strokeDasharray="4 4" dot={false} />
              <Line dataKey="actual" name={localize("Actual", locale)} stroke={cc.primary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={localize("Reported assignment hours by course", locale)}><SimpleBars data={courses.map((course) => ({ c: course.code.split(" ")[0], h: done.filter((a) => a.courseId === course.id).reduce((sum, a) => sum + (a.actual ?? 0), 0) }))} x="c" y="h" height={240} /></Panel>
      </div>
      <Panel title={localize("Estimate vs. actual", locale)} subtitle={localize("Completed assignments", locale)} className="mt-4" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">{localize("Assignment", locale)}</th><th scope="col" className="font-medium">{localize("Course", locale)}</th><th scope="col" className="font-medium">{localize("Estimate", locale)}</th><th scope="col" className="font-medium">{localize("Actual", locale)}</th><th scope="col" className="px-4 font-medium">{localize("Δ", locale)}</th></tr></thead>
          <tbody>{localize(done.map((a) => {
   const d = (a.actual ?? 0) - a.estimate; return (
            <tr key={a.id} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium">{localize(a.title, locale)}</td><td>{localize(courseOf(a.courseId).name, locale)}</td><td className="tabular-nums">{localize(a.estimate, locale)}{localize("h", locale)}</td><td className="tabular-nums">{localize(a.actual, locale)}{localize("h", locale)}</td><td className={`px-4 tabular-nums ${d > 0 ? "text-destructive" : "text-success"}`}>{localize(d > 0 ? "+" : "", locale)}{localize(d, locale)}{localize("h", locale)}</td></tr>
          ); }), locale)}</tbody>
        </table>
      </Panel>
    </>
  );
}
