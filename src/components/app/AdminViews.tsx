import { localize, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Users, AlertTriangle, Gauge, BookOpen, Search } from "lucide-react";
import { adminCourses, adminCohort, facultyCourseCatalog, facultySummary } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { MetricCard, PageHeader, Panel } from "./common";
import { SimpleBars } from "./widgets";

export function AdminCourses() {
  const { locale } = useI18n();
  const [query, setQuery] = useState("");
  const list = adminCourses.filter((course) => course.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeader title={localize("Faculty Courses", locale)} subtitle={localize("Faculty of Computing · anonymised cohort data · Fall 2026", locale)} actions={<div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input aria-label={localize("Search faculty courses", locale)} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localize("Search faculty courses", locale)} className="h-8 pl-8" /></div>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{localize(list.map((course) => <article key={course.id} className="panel p-4">
      <div className="font-mono text-[11px] text-muted-foreground">{localize(facultyCourseCatalog.find((item) => item.id === course.id)?.code, locale)}</div>
      <h2 className="mt-1 text-[15px] font-semibold">{localize(course.name, locale)}</h2>
      <p className="text-[12px] text-muted-foreground">{localize(facultyCourseCatalog.find((item) => item.id === course.id)?.instructor, locale)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-[12px]">
        <div><dt className="text-muted-foreground">{localize("Enrolled students", locale)}</dt><dd className="font-semibold">{localize(course.students, locale)}</dd></div>
        <div><dt className="text-muted-foreground">{localize("Overload risk", locale)}</dt><dd className="font-semibold text-warning">{localize(course.risk, locale)}{localize("%", locale)}</dd></div>
        <div><dt className="text-muted-foreground">{localize("Assignment median", locale)}</dt><dd>{localize(course.median, locale)}{localize("h", locale)}</dd></div>
        <div><dt className="text-muted-foreground">{localize("Instructor estimate", locale)}</dt><dd>{localize(course.estimate, locale)}{localize("h", locale)}</dd></div>
      </dl>
    </article>), locale)}</div>
  </>;
}

export function AdminStatistics() {
  const { locale } = useI18n();
  const students = adminCourses.reduce((sum, course) => sum + course.students, 0);
  return <>
    <PageHeader title={localize("Faculty Workload Statistics", locale)} subtitle={localize("Anonymised course and cohort aggregates · no personal student records", locale)} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label={localize("Course enrolments", locale)} value={String(students)} sub={localize("Across tracked courses", locale)} icon={Users} />
      <MetricCard label={localize("Tracked courses", locale)} value={String(adminCourses.length)} sub={localize("Faculty sample", locale)} icon={BookOpen} />
      <MetricCard label={localize("Peak forecast", locale)} value={`${facultySummary.peak.estimated}h`} sub={localize(`Cohort · ${facultySummary.peak.week}`, locale)} icon={Gauge} />
      <MetricCard label={localize("Highest course risk", locale)} value={`${facultySummary.highestRisk}%`} sub={localize("Advanced Databases", locale)} icon={AlertTriangle} tone="warning" />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Panel title={localize("Cohort workload forecast", locale)} subtitle={localize("Estimated weekly hours per student", locale)}><SimpleBars data={adminCohort} x="week" y="estimated" height={240} /></Panel>
      <Panel title={localize("Overload risk by course", locale)} subtitle={localize("Percentage of course cohort", locale)}><SimpleBars data={adminCourses.map((course) => ({ course: course.id.toUpperCase(), risk: course.risk }))} x="course" y="risk" height={240} /></Panel>
    </div>
  </>;
}