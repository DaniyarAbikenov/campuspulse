import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { cc } from "@/lib/chartColors";
import { createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Target, Timer, CheckCircle2, Flame } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { SimpleBars } from "@/components/app/widgets";
import { useStore } from "@/lib/store";
import { courses, courseOf, semesterTrend } from "@/lib/data";

export const Route = createFileRoute("/statistics")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Study Statistics — CampusPulse AI" }, { name: "description", content: "Planned vs. actual study hours and estimate accuracy over the semester." },
    { property: "og:title", content: "Study Statistics — CampusPulse AI" }, { property: "og:description", content: "Planned vs. actual study hours over the semester." },
  ] }),
  component: Stats,
});

function Stats() {
  useI18n();
  const { assignments, workload } = useStore();
  const done = assignments.filter((a) => a.actual !== undefined);
  const actual = done.reduce((sum, a) => sum + (a.actual ?? 0), 0);
  const estimate = done.reduce((sum, a) => sum + a.estimate, 0);
  return (
    <>
      <PageHeader title={localize("Study Statistics")} subtitle={localize("Fall Semester 2026 · Weeks 36–43")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Reported study time")} value={`${actual}h`} sub={localize("Completed assignments")} icon={Timer} />
        <MetricCard label={localize("Estimate accuracy")} value={`${Math.round(Math.min(actual, estimate) / Math.max(actual, estimate) * 100)}%`} sub={localize("Actual vs. AI estimate")} icon={Target} trend={{ dir: "up", text: "+4%", good: true }} />
        <MetricCard label={localize("Completed")} value={String(assignments.filter((a) => a.status === "Completed").length)} sub={localize("Assignments & labs")} icon={CheckCircle2} />
        <MetricCard label={localize("Study streak")} value="6 days" sub={localize("Longest: 11 days")} icon={Flame} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={localize("Planned vs. actual hours")} subtitle={localize("Per week")}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={semesterTrend.map((week) => week.week === "W43" ? { ...week, planned: workload.required } : week)} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={cc.border} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="planned" name={localize("Planned")} stroke={cc.muted} strokeDasharray="4 4" dot={false} />
              <Line dataKey="actual" name={localize("Actual")} stroke={cc.primary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={localize("Reported assignment hours by course")}><SimpleBars data={courses.map((course) => ({ c: course.code.split(" ")[0], h: done.filter((a) => a.courseId === course.id).reduce((sum, a) => sum + (a.actual ?? 0), 0) }))} x="c" y="h" height={240} /></Panel>
      </div>
      <Panel title={localize("Estimate vs. actual")} subtitle={localize("Completed assignments")} className="mt-4" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">{localize("Assignment")}</th><th scope="col" className="font-medium">{localize("Course")}</th><th scope="col" className="font-medium">{localize("Estimate")}</th><th scope="col" className="font-medium">{localize("Actual")}</th><th scope="col" className="px-4 font-medium">{localize("Δ")}</th></tr></thead>
          <tbody>{localize(done.map((a) => {
  useI18n(); const d = (a.actual ?? 0) - a.estimate; return (
            <tr key={a.id} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium">{a.title}</td><td>{courseOf(a.courseId).name}</td><td className="tabular-nums">{a.estimate}h</td><td className="tabular-nums">{a.actual}h</td><td className={`px-4 tabular-nums ${d > 0 ? "text-destructive" : "text-success"}`}>{d > 0 ? "+" : ""}{d}h</td></tr>
          ); })): "text-success"}`}>{localize(d > 0 ? "+" : "")}{localize(d)}{localize("h")}</td></tr>
          ); })}</tbody>
        </table>
      </Panel>
    </>
  );
}
