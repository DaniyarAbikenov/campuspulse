import { guardWorkspace } from "@/lib/workspace-access";
import { cc } from "@/lib/chartColors";
import { createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Target, Timer, CheckCircle2, Flame } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { SimpleBars } from "@/components/app/widgets";
import { assignments, courseOf, semesterTrend } from "@/lib/data";

export const Route = createFileRoute("/statistics")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Study Statistics — CampusPulse AI" }, { name: "description", content: "Planned vs. actual study hours and estimate accuracy over the semester." },
    { property: "og:title", content: "Study Statistics — CampusPulse AI" }, { property: "og:description", content: "Planned vs. actual study hours over the semester." },
  ] }),
  component: Stats,
});

function Stats() {
  const done = assignments.filter((a) => a.actual);
  return (
    <>
      <PageHeader title="Study Statistics" subtitle="Fall Semester 2026 · Weeks 36–43" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total study time" value="119h" sub="This semester" icon={Timer} />
        <MetricCard label="Estimate accuracy" value="89%" sub="Actual vs. AI estimate" icon={Target} trend={{ dir: "up", text: "+4%", good: true }} />
        <MetricCard label="Completed" value="12" sub="Assignments & labs" icon={CheckCircle2} />
        <MetricCard label="Study streak" value="6 days" sub="Longest: 11 days" icon={Flame} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Planned vs. actual hours" subtitle="Per week">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={semesterTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={cc.border} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="planned" name="Planned" stroke={cc.muted} strokeDasharray="4 4" dot={false} />
              <Line dataKey="actual" name="Actual" stroke={cc.primary} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Hours by course"><SimpleBars data={[{ c: "SE", h: 34 }, { c: "ADB", h: 29 }, { c: "OS", h: 27 }, { c: "RM", h: 14 }, { c: "STAT", h: 15 }]} x="c" y="h" height={240} /></Panel>
      </div>
      <Panel title="Estimate vs. actual" subtitle="Completed assignments" className="mt-4" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th className="px-4 py-2 font-medium">Assignment</th><th className="font-medium">Course</th><th className="font-medium">Estimate</th><th className="font-medium">Actual</th><th className="px-4 font-medium">Δ</th></tr></thead>
          <tbody>{done.map((a) => { const d = (a.actual ?? 0) - a.estimate; return (
            <tr key={a.id} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium">{a.title}</td><td>{courseOf(a.courseId).name}</td><td className="tabular-nums">{a.estimate}h</td><td className="tabular-nums">{a.actual}h</td><td className={`px-4 tabular-nums ${d > 0 ? "text-destructive" : "text-success"}`}>{d > 0 ? "+" : ""}{d}h</td></tr>
          ); })}</tbody>
        </table>
      </Panel>
    </>
  );
}
