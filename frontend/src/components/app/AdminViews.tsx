import { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Gauge, Search, ShieldCheck, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { cc } from "@/lib/chartColors";
import { adminCohort, adminCourses, facultyCourseCatalog } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { AdminOverview } from "@/lib/api";
import { MetricCard, PageHeader, Panel, PredictionNote, ProgressBar } from "./common";
import { SimpleBars } from "./widgets";

/** Offline prototype data in the same shape as the API, so the views have one code path. */
const fixtureOverview: AdminOverview = {
  institution: "Faculty of Computing",
  semester: "Fall 2026",
  minCohort: 5,
  students: adminCourses.reduce((sum, course) => sum + course.students, 0),
  enrolments: adminCourses.reduce((sum, course) => sum + course.students, 0),
  courseCount: adminCourses.length,
  openAssignments: 0,
  courses: adminCourses.map((course) => ({
    id: course.id,
    code: facultyCourseCatalog.find((item) => item.id === course.id)?.code ?? "",
    name: course.name,
    instructor: facultyCourseCatalog.find((item) => item.id === course.id)?.instructor ?? "",
    suppressed: false,
    students: course.students,
    openAssignments: 0,
    medianEstimate: course.estimate,
    medianReported: course.median,
    accuracy: null,
    risk: course.risk,
  })),
  weekly: adminCohort.map((item) => ({ week: item.week, estimated: item.estimated, reported: item.reported })),
  peakWeek: "W44",
  peakHours: 26,
  highestRiskCourse: "Advanced Databases",
  highestRisk: 22,
  activity: [],
};

function useOverview() {
  const { backendConnected, adminOverview, adminError, loadAdminOverview, role } = useStore();
  useEffect(() => {
    if (backendConnected && role === "admin") void loadAdminOverview();
  }, [backendConnected, role, loadAdminOverview]);
  if (!backendConnected) return { overview: fixtureOverview, live: false, error: null, loading: false };
  return { overview: adminOverview, live: true, error: adminError, loading: !adminOverview && !adminError };
}

const dash = (value: number | null, suffix = "") => (value === null ? "—" : `${value}${suffix}`);

function PrivacyNote({ overview, live }: { overview: AdminOverview; live: boolean }) {
  const { locale } = useI18n();
  const withheld = overview.courses.some((course) => course.suppressed);
  return (
    <p className="mb-3 flex items-start gap-1.5 text-[12px] text-muted-foreground">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
      <span>
        {localize(live ? "Aggregates only: no student is named or identifiable." : "Demo data.", locale)}{" "}
        {live ? `${localize("Figures for groups under", locale)} ${overview.minCohort} ${localize("students are withheld (—).", locale)}` : ""}
        {live && withheld ? ` ${localize("Some courses are below that size.", locale)}` : ""}
      </span>
    </p>
  );
}

function Gate({ state, children }: { state: ReturnType<typeof useOverview>; children: (overview: AdminOverview) => React.ReactNode }) {
  const { locale } = useI18n();
  if (state.error) {
    const forbidden = state.error.includes("403");
    return <p role="alert" className="text-[13px] text-destructive">{localize(forbidden ? "Your account does not have administrator access." : "The faculty overview could not be loaded.", locale)}</p>;
  }
  if (state.loading || !state.overview) return <p role="status" className="text-[13px] text-muted-foreground">{localize("Loading…", locale)}</p>;
  return <>{children(state.overview)}</>;
}

const subtitle = (overview: AdminOverview, locale: Parameters<typeof localize>[1]) =>
  [overview.institution, overview.semester].filter(Boolean).join(" · ") + ` · ${localize("Anonymised aggregates", locale)}`;

export function AdminDashboard() {
  const { locale } = useI18n();
  const state = useOverview();
  return (
    <Gate state={state}>
      {(overview) => {
        const shown = overview.weekly.filter((item) => item.estimated !== null);
        const average = shown.length ? Math.round((shown.reduce((sum, item) => sum + (item.estimated ?? 0), 0) / shown.length) * 10) / 10 : null;
        return (
          <>
            <PageHeader title={localize("Academic Overview", locale)} subtitle={subtitle(overview, locale)} />
            <PrivacyNote overview={overview} live={state.live} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label={localize("Course enrolments", locale)} value={dash(overview.enrolments)} sub={localize("Not unique students", locale)} icon={Users} />
              <MetricCard label={localize("Highest course risk", locale)} value={dash(overview.highestRisk, "%")} sub={overview.highestRiskCourse ?? localize("Withheld for small cohorts", locale)} icon={AlertTriangle} tone="warning" />
              <MetricCard label={localize("Courses tracked", locale)} value={String(overview.courseCount)} sub={`${overview.openAssignments} ${localize("open assignments", locale)}`} icon={BookOpen} />
              <MetricCard label={localize("Avg weekly load", locale)} value={dash(average, "h")} sub={localize("Hours due per student, per week", locale)} icon={Gauge} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Panel title={localize("Cohort workload", locale)} subtitle={localize("Estimated vs. reported hours per student, by deadline week", locale)}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={overview.weekly.map((item) => ({ week: item.week, estimated: item.estimated ?? undefined, reported: item.reported ?? undefined }))} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={cc.border} />
                    <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="estimated" name={localize("Estimated", locale)} fill={cc.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reported" name={localize("Reported", locale)} fill={cc.soft} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title={localize("Deadline clustering", locale)}>
                {overview.peakWeek && overview.peakHours !== null ? (
                  <PredictionNote><b>{overview.peakWeek}</b> {localize("has the highest cohort load at", locale)} {overview.peakHours}{localize("h per student. Review faculty deadlines before changing the schedule.", locale)}</PredictionNote>
                ) : <p className="text-[12.5px] text-muted-foreground">{localize("Not enough students per week to show a peak.", locale)}</p>}
              </Panel>
            </div>
            <CourseTable overview={overview} />
          </>
        );
      }}
    </Gate>
  );
}

function CourseTable({ overview }: { overview: AdminOverview }) {
  const { locale } = useI18n();
  return (
    <Panel title={localize("Courses", locale)} className="mt-4" bodyClass="p-0">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-[11.5px] text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">{localize("Course", locale)}</th>
            <th scope="col" className="font-medium">{localize("Students", locale)}</th>
            <th scope="col" className="font-medium">{localize("Median estimate", locale)}</th>
            <th scope="col" className="font-medium">{localize("Median reported", locale)}</th>
            <th scope="col" className="font-medium">{localize("Estimate accuracy", locale)}</th>
            <th scope="col" className="px-4 font-medium">{localize("Overload risk", locale)}</th>
          </tr>
        </thead>
        <tbody>
          {overview.courses.map((course) => (
            <tr key={course.id} className="border-b last:border-0">
              <td className="px-4 py-2.5 font-medium">{course.name}</td>
              <td className="tabular-nums">{dash(course.students)}</td>
              <td className="tabular-nums">{dash(course.medianEstimate, "h")}</td>
              <td className="tabular-nums">{dash(course.medianReported, "h")}</td>
              <td className="tabular-nums">{dash(course.accuracy, "%")}</td>
              <td className="px-4">
                {course.risk === null ? "—" : <div className="flex items-center gap-2"><ProgressBar value={course.risk} /><span className="w-8 text-[11.5px] tabular-nums">{course.risk}%</span></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export function AdminCourses() {
  const { locale } = useI18n();
  const state = useOverview();
  const [query, setQuery] = useState("");
  return (
    <Gate state={state}>
      {(overview) => {
        const list = overview.courses.filter((course) => (course.name + course.code).toLowerCase().includes(query.toLowerCase()));
        return (
          <>
            <PageHeader title={localize("Faculty Courses", locale)} subtitle={subtitle(overview, locale)} actions={<div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input aria-label={localize("Search faculty courses", locale)} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localize("Search courses", locale)} className="h-8 w-52 pl-8 text-[13px]" /></div>} />
            <PrivacyNote overview={overview} live={state.live} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((course) => (
                <article key={course.id} className="panel p-4">
                  <div className="font-mono text-[11px] text-muted-foreground">{course.code}</div>
                  <h2 className="mt-1 text-[15px] font-semibold">{course.name}</h2>
                  <p className="text-[12px] text-muted-foreground">{course.instructor || "—"}</p>
                  {course.suppressed ? <p className="mt-3 border-t pt-3 text-[12px] text-muted-foreground">{localize("Too few students to show figures without identifying anyone.", locale)}</p> : (
                    <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-[12px]">
                      <div><dt className="text-muted-foreground">{localize("Enrolled students", locale)}</dt><dd className="font-semibold">{dash(course.students)}</dd></div>
                      <div><dt className="text-muted-foreground">{localize("Overload risk", locale)}</dt><dd className="font-semibold text-warning">{dash(course.risk, "%")}</dd></div>
                      <div><dt className="text-muted-foreground">{localize("Median estimate", locale)}</dt><dd>{dash(course.medianEstimate, "h")}</dd></div>
                      <div><dt className="text-muted-foreground">{localize("Median reported", locale)}</dt><dd>{dash(course.medianReported, "h")}</dd></div>
                    </dl>
                  )}
                </article>
              ))}
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export function AdminStatistics() {
  const { locale } = useI18n();
  const state = useOverview();
  return (
    <Gate state={state}>
      {(overview) => (
        <>
          <PageHeader title={localize("Faculty Workload Statistics", locale)} subtitle={subtitle(overview, locale)} />
          <PrivacyNote overview={overview} live={state.live} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label={localize("Students", locale)} value={dash(overview.students)} sub={localize("Enrolled this semester", locale)} icon={Users} />
            <MetricCard label={localize("Tracked courses", locale)} value={String(overview.courseCount)} sub={`${overview.openAssignments} ${localize("open assignments", locale)}`} icon={BookOpen} />
            <MetricCard label={localize("Peak forecast", locale)} value={dash(overview.peakHours, "h")} sub={overview.peakWeek ? `${localize("Per student", locale)} · ${overview.peakWeek}` : localize("Withheld", locale)} icon={Gauge} />
            <MetricCard label={localize("Highest course risk", locale)} value={dash(overview.highestRisk, "%")} sub={overview.highestRiskCourse ?? localize("Withheld", locale)} icon={AlertTriangle} tone="warning" />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title={localize("Cohort workload forecast", locale)} subtitle={localize("Estimated hours per student, by deadline week", locale)}><SimpleBars data={overview.weekly.map((item) => ({ week: item.week, estimated: item.estimated ?? 0 }))} x="week" y="estimated" height={240} /></Panel>
            <Panel title={localize("Overload risk by course", locale)} subtitle={localize("Share of the course's students with more work due this week than they can study", locale)}><SimpleBars data={overview.courses.filter((course) => course.risk !== null).map((course) => ({ course: course.code.split(" ")[0] ?? course.code, risk: course.risk ?? 0 }))} x="course" y="risk" height={240} /></Panel>
          </div>
        </>
      )}
    </Gate>
  );
}
