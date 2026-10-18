import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Brain, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Panel, PredictionNote, ProgressBar, StatusBadge } from "@/components/app/common";
import { AssignmentTable, SimpleBars } from "@/components/app/widgets";
import { KanbanBoard } from "@/components/app/Kanban";
import { assignments, courses, knowledgeDocs } from "@/lib/data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/courses/$courseId")({
  beforeLoad: guardWorkspace,
  loader: ({ params }) => {
    const course = courses.find((c) => c.id === params.courseId);
    if (!course) throw notFound();
    return { course };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.course.name} — CampusPulse AI` : "Course — CampusPulse AI";
    const d = loaderData?.course.summary ?? "Course workspace";
    return { meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }] };
  },
  component: CourseDetails,
});

function CourseDetails() {
  useI18n();
  const { course: loadedCourse } = Route.useLoaderData();
  const { courses: liveCourses, assignments } = useStore();
  const course = liveCourses.find((item) => item.id === loadedCourse.id) ?? loadedCourse;
  const list = assignments.filter((a) => a.courseId === course.id);
  const docs = knowledgeDocs.filter((d) => d.courseId === course.id);
  const chain = list.filter((a) => a.dependsOn || list.some((b) => b.dependsOn === a.id)).sort((a, b) => a.title.localeCompare(b.title));
  const count = (s: string) => list.filter((a) => a.status === s).length;

  return (
    <>
      <PageHeader title={localize(course.name)} subtitle={localize(`${course.code} · ${course.instructor} · Fall 2026`)} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {localize([["Assignments", list.length], ["Completed", count("Completed")], ["In Progress", count("In Progress")], ["Upcoming", count("Upcoming") + count("To Do")], ["Remaining", `${course.remaining}h`]].map(([k, v]) => (
          <div key={k} className="panel px-4 py-3"><div className="text-[11.5px] text-muted-foreground">{localize(k)}</div><div className="text-[20px] font-semibold tabular-nums">{localize(v)}</div></div>
        )))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Tabs defaultValue="overview">
          <TabsList className="mb-3">
            {localize(["overview", "assignments", "kanban", "materials", "timeline"].map((t) => <TabsTrigger key={t} value={t} className="text-[12.5px] capitalize">{localize(t)}</TabsTrigger>))}
          </TabsList>
          <TabsContent value="overview" className="space-y-4">
            <Panel title={localize("Course summary")}><p className="text-[13px] leading-relaxed text-muted-foreground">{localize(course.summary)}</p><div className="mt-3 flex items-center gap-2"><ProgressBar value={course.progress} /><span className="text-[12px] tabular-nums">{localize(course.progress)}{localize("%")}</span></div></Panel>
            <div className="grid gap-4 md:grid-cols-2">
              <Panel title={localize("Workload by assignment")} subtitle={localize("Estimated hours")}><SimpleBars data={list.map((a) => ({ name: (a.title.split(" — ")[0] ?? a.title).replace("Assignment", "A"), hours: a.estimate }))} x="name" y="hours" height={170} /></Panel>
              <Panel title={localize("AI course insights")}><div className="space-y-2">
                <PredictionNote>{localize("Assignments in this course build on each other. Delays in the current one shift the next by ~3 days.")}</PredictionNote>
                <PredictionNote>{localize("Your actual time ran")} <b>{localize("+11%")}</b> {localize("over estimates on average — plans now include that buffer.")}</PredictionNote>
              </div></Panel>
            </div>
            <Panel title={localize("Recent materials")}>{localize(docs.map((d) => <div key={d.id} className="flex items-center gap-2 border-b py-2 text-[13px] last:border-0"><FileText className="h-4 w-4 text-muted-foreground" />{localize(d.title)}<span className="ml-auto text-[11.5px] text-muted-foreground">{localize(d.indexed)}</span></div>))}</Panel>
          </TabsContent>
          <TabsContent value="assignments">
            <div className="panel overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">{localize("Assignment")}</th><th scope="col" className="px-2 font-medium">{localize("Due")}</th><th scope="col" className="px-2 font-medium">{localize("Status")}</th><th scope="col" className="px-2 font-medium">{localize("Est.")}</th><th scope="col" className="px-2 font-medium">{localize("Actual")}</th><th scope="col" className="px-4 font-medium">{localize("Dependencies")}</th></tr></thead>
                <tbody>{localize(list.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/60">
                    <td className="px-4 py-2.5 font-medium"><Link to="/assignments/$assignmentId" params={{ assignmentId: a.id }} className="hover:text-primary">{localize(a.title)}</Link></td>
                    <td className="px-2 tabular-nums">{localize(a.deadline)}</td><td className="px-2"><StatusBadge status={a.status} /></td>
                    <td className="px-2 tabular-nums">{localize(a.estimate)}{localize("h")}</td><td className="px-2 tabular-nums text-muted-foreground">{localize(a.actual ? `${a.actual}h` : "—")}</td>
                    <td className="px-4 text-[12px] text-muted-foreground">{localize(a.dependsOn ? <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{localize(a.relation)} {localize(assignments.find((b) => b.id === a.dependsOn)?.title.split(" — ")[0])}</span> : "—")}</td>
                  </tr>
                )))}</tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="kanban"><KanbanBoard courseId={course.id} /></TabsContent>
          <TabsContent value="materials"><div className="grid gap-3 md:grid-cols-2">{localize(docs.map((d) => <div key={d.id} className="panel p-3"><div className="flex items-center gap-2 text-[13px] font-medium"><FileText className="h-4 w-4 text-primary" />{localize(d.title)}</div><div className="mt-1 text-[11.5px] text-muted-foreground">{localize(d.type)} {localize("·")} {localize(d.pages)} {localize("pages · indexed")} {localize(d.indexed)}</div><div className="mt-2 flex flex-wrap gap-1">{localize(d.concepts.map((c) => <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{localize(c)}</span>))}</div></div>))}</div></TabsContent>
          <TabsContent value="timeline">
            <Panel title={localize("Assignment progression")} subtitle={localize("How assignments build on each other")}>
              {localize(chain.length ? (
                <div className="flex flex-wrap items-center gap-2 py-4">
                  {localize(chain.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <Link to="/assignments/$assignmentId" params={{ assignmentId: a.id }} className={cn("w-44 rounded-lg border p-3 transition-colors hover:border-primary/40", a.status === "In Progress" && "border-primary ring-2 ring-primary/15")}>
                        <div className="text-[11px] text-muted-foreground">{localize(a.deadline)}</div>
                        <div className="text-[12.5px] font-medium leading-snug">{localize(a.title)}</div>
                        <div className="mt-1.5"><StatusBadge status={a.status} /></div>
                      </Link>
                      {localize(i < chain.length - 1 && <div className="flex flex-col items-center text-[10px] text-muted-foreground"><span>{localize(chain[i + 1]?.relation)}</span><ArrowRight className="h-4 w-4" /></div>)}
                    </div>
                  )))}
                </div>
              ) : <p className="text-[13px] text-muted-foreground">{localize("No dependencies detected for this course yet.")}</p>)}
            </Panel>
          </TabsContent>
        </Tabs>
        <Panel title={localize(<span className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-ai" /> {localize("Course Memory")}</span>)} className="h-fit">
          <p className="text-[12.5px] text-muted-foreground">{localize("CampusPulse has indexed")} {localize(list.length)} {localize("assignments,")} {localize(docs.length)} {localize("documents and")} {localize(list.filter((a) => a.dependsOn).length)} {localize("assignment dependencies.")}</p>
          <dl className="mt-3 space-y-2.5 text-[12.5px]">
            <div><dt className="text-[11.5px] text-muted-foreground">{localize("Known technologies")}</dt><dd className="mt-1 flex flex-wrap gap-1">{localize(course.technologies.map((t) => <span key={t} className="rounded border bg-secondary px-1.5 py-0.5 text-[11px]">{localize(t)}</span>))}</dd></div>
            <div><dt className="text-[11.5px] text-muted-foreground">{localize("Relationships")}</dt><dd>{localize(list.filter((a) => a.dependsOn).map((a) => <div key={a.id}>{localize((a.title.split(" — ")[0] ?? a.title))} {localize(a.relation)} {localize(assignments.find((b) => b.id === a.dependsOn)?.title.split(" — ")[0])}</div>))}{localize(!list.some((a) => a.dependsOn) && "—")}</dd></div>
            <div><dt className="text-[11.5px] text-muted-foreground">{localize("Last updated")}</dt><dd>{localize("Today, 09:44")}</dd></div>
          </dl>
          <Button asChild size="sm" variant="outline" className="mt-4 w-full"><Link to="/knowledge">{localize("Explore Course Knowledge")}</Link></Button>
        </Panel>
      </div>
    </>
  );
}
