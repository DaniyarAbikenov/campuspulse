import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Brain, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Panel, PredictionNote, ProgressBar, StatusBadge } from "@/components/app/common";
import { AssignmentTable, SimpleBars } from "@/components/app/widgets";
import { KanbanBoard } from "@/components/app/Kanban";
import { assignments, courses, knowledgeDocs } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/courses/$courseId")({
  loader: ({ params }) => {
    const course = courses.find((c) => c.id === params.courseId);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.course.name} — CampusPulse AI` : "Course — CampusPulse AI";
    const d = loaderData?.course.summary ?? "Course workspace";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }] };
  },
  component: CourseDetails,
});

function CourseDetails() {
  const { course } = Route.useLoaderData();
  const list = assignments.filter((a) => a.courseId === course.id);
  const docs = knowledgeDocs.filter((d) => d.courseId === course.id);
  const chain = list.filter((a) => a.dependsOn || list.some((b) => b.dependsOn === a.id)).sort((a, b) => a.title.localeCompare(b.title));
  const count = (s: string) => list.filter((a) => a.status === s).length;

  return (
    <>
      <PageHeader title={course.name} subtitle={`${course.code} · ${course.instructor} · Fall 2026`} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Assignments", list.length], ["Completed", count("Completed")], ["In Progress", count("In Progress")], ["Upcoming", count("Upcoming") + count("To Do")], ["Remaining", `${course.remaining}h`]].map(([k, v]) => (
          <div key={k} className="panel px-4 py-3"><div className="text-[11.5px] text-muted-foreground">{k}</div><div className="text-[20px] font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Tabs defaultValue="overview">
          <TabsList className="mb-3">
            {["overview", "assignments", "kanban", "materials", "timeline"].map((t) => <TabsTrigger key={t} value={t} className="text-[12.5px] capitalize">{t}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <Panel title="Course summary"><p className="text-[13px] leading-relaxed text-muted-foreground">{course.summary}</p><div className="mt-3 flex items-center gap-2"><ProgressBar value={course.progress} /><span className="text-[12px] tabular-nums">{course.progress}%</span></div></Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title="Workload by assignment" subtitle="Estimated hours"><SimpleBars data={list.map((a) => ({ name: a.title.split(" — ")[0].replace("Assignment", "A"), hours: a.estimate }))} x="name" y="hours" height={170} /></Panel>
              <Panel title="AI course insights"><div className="space-y-2">
                <PredictionNote>Assignments in this course build on each other. Delays in the current one shift the next by ~3 days.</PredictionNote>
                <PredictionNote>Your actual time ran <b>+11%</b> over estimates on average — plans now include that buffer.</PredictionNote>
              </div></Panel>
            </div>
            <Panel title="Recent materials">{docs.map((d) => <div key={d.id} className="flex items-center gap-2 border-b py-2 text-[13px] last:border-0"><FileText className="h-4 w-4 text-muted-foreground" />{d.title}<span className="ml-auto text-[11.5px] text-muted-foreground">{d.indexed}</span></div>)}</Panel>
          </TabsContent>
          <TabsContent value="assignments">
            <div className="panel overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th className="px-4 py-2 font-medium">Assignment</th><th className="px-2 font-medium">Due</th><th className="px-2 font-medium">Status</th><th className="px-2 font-medium">Est.</th><th className="px-2 font-medium">Actual</th><th className="px-4 font-medium">Dependencies</th></tr></thead>
                <tbody>{list.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/60">
                    <td className="px-4 py-2.5 font-medium"><Link to="/assignments/$assignmentId" params={{ assignmentId: a.id }} className="hover:text-primary">{a.title}</Link></td>
                    <td className="px-2 tabular-nums">{a.deadline}</td><td className="px-2"><StatusBadge status={a.status} /></td>
                    <td className="px-2 tabular-nums">{a.estimate}h</td><td className="px-2 tabular-nums text-muted-foreground">{a.actual ? `${a.actual}h` : "—"}</td>
                    <td className="px-4 text-[12px] text-muted-foreground">{a.dependsOn ? <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{a.relation} {assignments.find((b) => b.id === a.dependsOn)?.title.split(" — ")[0]}</span> : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="kanban"><KanbanBoard courseId={course.id} /></TabsContent>
          <TabsContent value="materials"><div className="grid gap-3 md:grid-cols-2">{docs.map((d) => <div key={d.id} className="panel p-3"><div className="flex items-center gap-2 text-[13px] font-medium"><FileText className="h-4 w-4 text-primary" />{d.title}</div><div className="mt-1 text-[11.5px] text-muted-foreground">{d.type} · {d.pages} pages · indexed {d.indexed}</div><div className="mt-2 flex flex-wrap gap-1">{d.concepts.map((c) => <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{c}</span>)}</div></div>)}</div></TabsContent>
          <TabsContent value="timeline">
            <Panel title="Assignment progression" subtitle="How assignments build on each other">
              {chain.length ? (
                <div className="flex flex-wrap items-center gap-2 py-4">
                  {chain.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <Link to="/assignments/$assignmentId" params={{ assignmentId: a.id }} className={cn("w-44 rounded-lg border p-3 transition-colors hover:border-primary/40", a.status === "In Progress" && "border-primary ring-2 ring-primary/15")}>
                        <div className="text-[11px] text-muted-foreground">{a.deadline}</div>
                        <div className="text-[12.5px] font-medium leading-snug">{a.title}</div>
                        <div className="mt-1.5"><StatusBadge status={a.status} /></div>
                      </Link>
                      {i < chain.length - 1 && <div className="flex flex-col items-center text-[10px] text-muted-foreground"><span>{chain[i + 1].relation}</span><ArrowRight className="h-4 w-4" /></div>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-[13px] text-muted-foreground">No dependencies detected for this course yet.</p>}
            </Panel>
          </TabsContent>
        </Tabs>
        <Panel title={<span className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-ai" /> Course Memory</span>} className="h-fit">
          <p className="text-[12.5px] text-muted-foreground">CampusPulse has indexed {list.length} assignments, {docs.length} documents and {list.filter((a) => a.dependsOn).length} assignment dependencies.</p>
          <dl className="mt-3 space-y-2.5 text-[12.5px]">
            <div><dt className="text-[11.5px] text-muted-foreground">Known technologies</dt><dd className="mt-1 flex flex-wrap gap-1">{course.technologies.map((t) => <span key={t} className="rounded border bg-secondary px-1.5 py-0.5 text-[11px]">{t}</span>)}</dd></div>
            <div><dt className="text-[11.5px] text-muted-foreground">Relationships</dt><dd>{list.filter((a) => a.dependsOn).map((a) => <div key={a.id}>{a.title.split(" — ")[0]} {a.relation} {assignments.find((b) => b.id === a.dependsOn)?.title.split(" — ")[0]}</div>)}{!list.some((a) => a.dependsOn) && "—"}</dd></div>
            <div><dt className="text-[11.5px] text-muted-foreground">Last updated</dt><dd>Today, 09:44</dd></div>
          </dl>
          <Button asChild size="sm" variant="outline" className="mt-4 w-full"><Link to="/knowledge">Explore Course Knowledge</Link></Button>
        </Panel>
      </div>
    </>
  );
}
