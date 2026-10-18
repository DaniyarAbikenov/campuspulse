import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Search, Upload, BookMarked } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CourseTag, EmptyState, PageHeader, Panel, PredictionNote } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { courses, knowledgeDocs, documentTotals, documentFragments } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Knowledge Base — CampusPulse AI" }, { name: "description", content: "Indexed lectures, assignments and syllabi with extracted concepts." },
    { property: "og:title", content: "Knowledge Base — CampusPulse AI" }, { property: "og:description", content: "Indexed lectures, assignments and syllabi with extracted concepts." },
  ] }),
  component: Knowledge,
});

type Doc = (typeof knowledgeDocs)[number];

function Knowledge() {
  const { setUploadOpen, tasks, analysisSource } = useStore();
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("all");
  const [doc, setDoc] = useState<Doc | null>(null);
  const list = knowledgeDocs.filter((d) => (course === "all" || d.courseId === course) && (d.title + d.concepts.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Knowledge Base" subtitle={`${documentTotals.count} documents indexed · ${documentTotals.pages} pages`} actions={<Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-3.5 w-3.5" /> Add Document</Button>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-0 basis-full sm:flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label="Search document concepts" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search concepts, e.g. JWT, $group, indexes" className="h-9 pl-8" /></div>
            <div className="flex flex-wrap gap-1">{["all", ...courses.map((c) => c.id)].map((c) => <Button variant="outline" size="sm" aria-pressed={course === c} key={c} onClick={() => setCourse(c)} className={cn("rounded-md border px-2 text-[12px]", course === c ? "border-primary/40 bg-primary-soft text-primary" : "text-muted-foreground")}>{c === "all" ? "All" : courses.find((x) => x.id === c)?.code.split(" ")[0]}</Button>)}</div>
          </div>
          {list.length ? <div className="grid gap-3 md:grid-cols-2">{list.map((d) => (
            <Button variant="ghost" key={d.id} onClick={() => setDoc(d)} className="panel h-auto flex-col items-stretch whitespace-normal p-3 text-left transition-colors hover:border-primary/40">
              <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{d.title}</div><div className="text-[11.5px] text-muted-foreground">{d.type} · {d.pages} pages · indexed {d.indexed}</div></div></div>
              <div className="mt-2"><CourseTag id={d.courseId} /></div>
              <div className="mt-2 flex flex-wrap gap-1">{d.concepts.map((c) => <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{c}</span>)}</div>
            </Button>
          ))}</div> : <div className="panel"><EmptyState icon={Search} title="No matching documents" text="Try a different concept or course." /></div>}
        </div>
        <Panel title={<span className="flex items-center gap-1.5"><BookMarked className="h-4 w-4 text-ai" /> Study plan · Databases midterm</span>} className="h-fit">
          <ol className="space-y-2 text-[12.5px]">
            {[["Session 1 · 90 min", "Query optimisation — Lecture 5"], ["Session 2 · 90 min", "Indexing strategies — Lecture 6–7"], ["Session 3 · 90 min", "Aggregation pipelines — Lecture 8"]].map(([a, b]) => <li key={a} className="rounded-md border p-2"><div className="font-medium">{a}</div><div className="text-muted-foreground">{b}</div></li>)}
          </ol>
          <div className="mt-3"><PredictionNote>Draft plan references the {knowledgeDocs.filter((d) => d.courseId === "adb").length} indexed Databases lectures. Midterm on Oct 30.</PredictionNote></div>
        </Panel>
      </div>
      <Sheet open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        <SheetContent className="w-[440px] sm:max-w-[440px]">
          {doc && <>
            <SheetHeader><SheetTitle className="text-[15px]">{doc.title}</SheetTitle><SheetDescription>{doc.type} · {doc.pages} pages</SheetDescription></SheetHeader>
            <div className="space-y-3 px-4 text-[13px]">
              <CourseTag id={doc.courseId} />
              <div><div className="mb-1 text-[11.5px] text-muted-foreground">Extracted concepts</div><div className="flex flex-wrap gap-1">{doc.concepts.map((c) => <span key={c} className="rounded border bg-secondary px-1.5 py-0.5 text-[11.5px]">{c}</span>)}</div></div>
              <PredictionNote>Summary: this document introduces {doc.concepts.join(", ")} and is referenced by {doc.type === "Assignment" ? "the generated task breakdown" : "your study plan and related assignments"}.</PredictionNote>
              <div className="text-[11.5px] text-muted-foreground">Indexed {doc.indexed} · {documentFragments.filter((fragment) => fragment.documentId === doc.id).length} sourced demo fragments</div>
              <section className="border-t pt-3"><h2 className="font-semibold">Source and page fragments</h2><p className="my-2 text-[12px] text-muted-foreground">{doc.title} · fixture excerpts, not the uploaded PDF text{doc.id === "d1" ? ` · analysis input: ${analysisSource}` : ""}</p>
                {documentFragments.filter((fragment) => fragment.documentId === doc.id).map((fragment) => <article key={fragment.id} className="border-b py-3"><h3 className="font-medium">Page {fragment.page} · {fragment.requirementId ?? fragment.concept}</h3><blockquote className="my-2 border-l-2 border-ai pl-2 text-[12px] text-muted-foreground">{fragment.text}</blockquote>{fragment.assignmentId && <Link className="text-primary underline" to="/assignments/$assignmentId" params={{ assignmentId: fragment.assignmentId }}>Open source assignment · p. {fragment.page}</Link>}{tasks.filter((task) => task.req && task.req === fragment.requirementId).map((task) => <div key={task.id} className="mt-2"><Link to="/kanban" className="text-primary underline">Linked task: {task.title}</Link></div>)}</article>)}
              </section>
            </div>
          </>}
        </SheetContent>
      </Sheet>
    </>
  );
}
