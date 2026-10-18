import { useState } from "react";
import { Users, AlertTriangle, Gauge, BookOpen, Search } from "lucide-react";
import { adminCourses, adminCohort, courses } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { MetricCard, PageHeader, Panel } from "./common";
import { SimpleBars } from "./widgets";

export function AdminCourses() {
  const [query, setQuery] = useState("");
  const list = adminCourses.filter((course) => course.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHeader title="Faculty Courses" subtitle="Faculty of Computing · anonymised cohort data · Fall 2026" actions={<div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input aria-label="Search faculty courses" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search faculty courses" className="h-8 pl-8" /></div>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((course) => <article key={course.id} className="panel p-4">
      <div className="font-mono text-[11px] text-muted-foreground">{courses.find((item) => item.id === course.id)?.code}</div>
      <h2 className="mt-1 text-[15px] font-semibold">{course.name}</h2>
      <p className="text-[12px] text-muted-foreground">{courses.find((item) => item.id === course.id)?.instructor}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-[12px]">
        <div><dt className="text-muted-foreground">Enrolled students</dt><dd className="font-semibold">{course.students}</dd></div>
        <div><dt className="text-muted-foreground">Overload risk</dt><dd className="font-semibold text-warning">{course.risk}%</dd></div>
        <div><dt className="text-muted-foreground">Assignment median</dt><dd>{course.median}h</dd></div>
        <div><dt className="text-muted-foreground">Instructor estimate</dt><dd>{course.estimate}h</dd></div>
      </dl>
    </article>)}</div>
  </>;
}

export function AdminStatistics() {
  const students = adminCourses.reduce((sum, course) => sum + course.students, 0);
  return <>
    <PageHeader title="Faculty Workload Statistics" subtitle="Anonymised course and cohort aggregates · no personal student records" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard label="Course enrolments" value={String(students)} sub="Across tracked courses" icon={Users} />
      <MetricCard label="Tracked courses" value={String(adminCourses.length)} sub="Faculty sample" icon={BookOpen} />
      <MetricCard label="Peak forecast" value="26h" sub="Cohort · Week 44" icon={Gauge} />
      <MetricCard label="Highest course risk" value="22%" sub="Advanced Databases" icon={AlertTriangle} tone="warning" />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Panel title="Cohort workload forecast" subtitle="Estimated weekly hours per student"><SimpleBars data={adminCohort} x="week" y="estimated" height={240} /></Panel>
      <Panel title="Overload risk by course" subtitle="Percentage of course cohort"><SimpleBars data={adminCourses.map((course) => ({ course: course.id.toUpperCase(), risk: course.risk }))} x="course" y="risk" height={240} /></Panel>
    </div>
  </>;
}