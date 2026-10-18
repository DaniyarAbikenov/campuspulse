import { cc } from "@/lib/chartColors";
import { createFileRoute } from "@tanstack/react-router";
import { Users, AlertTriangle, BookOpen, Gauge } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, PageHeader, Panel, PredictionNote, ProgressBar } from "@/components/app/common";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Academic Overview — CampusPulse AI" }, { name: "description", content: "Administrator view of student workload, at-risk cohorts and deadline clustering." },
    { property: "og:title", content: "Academic Overview — CampusPulse AI" }, { property: "og:description", content: "Administrator view of student workload and deadline clustering." },
  ] }),
  component: Admin,
});

const cohort = [
  { week: "W40", estimated: 14, reported: 15 }, { week: "W41", estimated: 16, reported: 17 }, { week: "W42", estimated: 18, reported: 20 },
  { week: "W43", estimated: 23, reported: 0 }, { week: "W44", estimated: 26, reported: 0 }, { week: "W45", estimated: 19, reported: 0 },
];
const courseRows = [
  { name: "Software Engineering", students: 124, median: 9.2, estimate: 8.5, risk: 18 },
  { name: "Advanced Databases", students: 98, median: 6.1, estimate: 5.5, risk: 22 },
  { name: "Operating Systems", students: 110, median: 4.4, estimate: 4, risk: 11 },
  { name: "Research Methods", students: 142, median: 3.2, estimate: 3.5, risk: 6 },
  { name: "Statistics", students: 156, median: 2.4, estimate: 2, risk: 9 },
];

function Admin() {
  return (
    <>
      <PageHeader title="Academic Overview" subtitle="Faculty of Computing · Fall 2026 · Anonymised, aggregated demo data" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Active students" value="1,284" sub="Using CampusPulse" icon={Users} />
        <MetricCard label="At risk of overload" value="17%" sub="Week 44 forecast" icon={AlertTriangle} tone="warning" trend={{ dir: "up", text: "+5%" }} />
        <MetricCard label="Courses tracked" value="42" sub="18 with dependencies" icon={BookOpen} />
        <MetricCard label="Avg weekly load" value="19.6h" sub="Median per student" icon={Gauge} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Cohort workload" subtitle="SE program · estimated vs. reported hours">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cohort} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke=cc.border />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke=cc.muted />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke=cc.muted />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="estimated" name="Estimated" fill=cc.primary radius={[4, 4, 0, 0]} />
              <Bar dataKey="reported" name="Reported" fill=cc.soft radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Deadline clustering">
          <PredictionNote><b>Week 44</b> has 5 major deadlines across SE, ADB and OS for the same cohort. Shifting the OS Lab 6 deadline by 3 days would reduce overload risk from 17% to an estimated 9%.</PredictionNote>
        </Panel>
      </div>
      <Panel title="Courses" className="mt-4" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th className="px-4 py-2 font-medium">Course</th><th className="font-medium">Students</th><th className="font-medium">Current assignment median</th><th className="font-medium">Instructor estimate</th><th className="w-48 px-4 font-medium">Overload risk</th></tr></thead>
          <tbody>{courseRows.map((c) => (
            <tr key={c.name} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium">{c.name}</td><td className="tabular-nums">{c.students}</td><td className="tabular-nums">{c.median}h</td><td className="tabular-nums">{c.estimate}h</td>
              <td className="px-4"><div className="flex items-center gap-2"><ProgressBar value={c.risk * 3} /><span className="w-8 text-[11.5px] tabular-nums">{c.risk}%</span></div></td></tr>
          ))}</tbody>
        </table>
      </Panel>
    </>
  );
}
