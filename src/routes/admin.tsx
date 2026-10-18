import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { adminCohort as cohort, adminCourses as courseRows, facultySummary } from "@/lib/data";
import { cc } from "@/lib/chartColors";
import { createFileRoute } from "@tanstack/react-router";
import { Users, AlertTriangle, BookOpen, Gauge } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, PageHeader, Panel, PredictionNote, ProgressBar } from "@/components/app/common";

export const Route = createFileRoute("/admin")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Academic Overview — CampusPulse AI" }, { name: "description", content: "Administrator view of student workload, at-risk cohorts and deadline clustering." },
    { property: "og:title", content: "Academic Overview — CampusPulse AI" }, { property: "og:description", content: "Administrator view of student workload and deadline clustering." },
  ] }),
  component: Admin,
});

function Admin() {
  useI18n();
  return (
    <>
      <PageHeader title={localize("Academic Overview")} subtitle={localize("Faculty of Computing · Fall 2026 · Anonymised, aggregated demo data")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Course enrolments")} value={String(facultySummary.enrolments)} sub="Not unique students" icon={Users} />
        <MetricCard label={localize("Highest course risk")} value={`${facultySummary.highestRisk}%`} sub="Faculty sample" icon={AlertTriangle} tone="warning" trend={{ dir: "up", text: "+5%" }} />
        <MetricCard label={localize("Courses tracked")} value={String(facultySummary.courses)} sub="Faculty sample" icon={BookOpen} />
        <MetricCard label={localize("Avg weekly load")} value={`${facultySummary.averageLoad}h`} sub="Mean cohort weekly forecast" icon={Gauge} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={localize("Cohort workload")} subtitle={localize("SE program · estimated vs. reported hours")}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={cohort} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={cc.border} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="estimated" name="Estimated" fill={cc.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="reported" name="Reported" fill={cc.soft} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={localize("Deadline clustering")}>
          <PredictionNote><b>{localize(facultySummary.peak.week)}</b> {localize("has the highest cohort forecast at")} {localize(facultySummary.peak.estimated)}{localize("h. Review faculty deadlines before changing the schedule.")}</PredictionNote>
        </Panel>
      </div>
      <Panel title={localize("Courses")} className="mt-4" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">{localize("Course")}</th><th scope="col" className="font-medium">{localize("Students")}</th><th scope="col" className="font-medium">{localize("Current assignment median")}</th><th scope="col" className="font-medium">{localize("Instructor estimate")}</th><th scope="col" className="w-48 px-4 font-medium">{localize("Overload risk")}</th></tr></thead>
          <tbody>{localize(courseRows.map((c) => (
            <tr key={c.name} className="border-b last:border-0"><td className="px-4 py-2.5 font-medium">{c.name}</td><td className="tabular-nums">{c.students}</td><td className="tabular-nums">{c.median}h</td><td className="tabular-nums">{c.estimate}h</td>
              <td className="px-4"><div className="flex items-center gap-2"><ProgressBar value={c.risk * 3} /><span className="w-8 text-[11.5px] tabular-nums">{c.risk}%</span></div></td></tr>
          )))}</tbody>
        </table>
      </Panel>
    </>
  );
}
