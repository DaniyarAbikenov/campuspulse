import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Search, Upload, BookMarked } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CourseTag, EmptyState, PageHeader, Panel, PredictionNote } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { type KnowledgeDoc } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Knowledge Base — CampusPulse AI" }, { name: "description", content: "Indexed lectures, assignments and syllabi with extracted concepts." },
    { property: "og:title", content: "Knowledge Base — CampusPulse AI" }, { property: "og:description", content: "Indexed lectures, assignments and syllabi with extracted concepts." },
  ] }),
  component: Knowledge,
});

type Doc = KnowledgeDoc;

function Knowledge() {
  const { locale } = useI18n();
  const { setUploadOpen, tasks, analysisSource, knowledgeDocs, documentFragments, courses, backendConnected } = useStore();
  const conceptMap = new Map<string, Set<string>>();
  for (const item of knowledgeDocs) for (const concept of item.concepts) conceptMap.set(concept, (conceptMap.get(concept) ?? new Set()).add(item.id));
  const concepts = [...conceptMap.entries()].map(([concept, ids]) => [concept, ids.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14);
  const documentTotals = { count: knowledgeDocs.length, pages: knowledgeDocs.reduce((sum, item) => sum + item.pages, 0) };
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("all");
  const [doc, setDoc] = useState<Doc | null>(null);
  const list = knowledgeDocs.filter((d) => (course === "all" || d.courseId === course) && (d.title + d.concepts.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={localize("Knowledge Base", locale)} subtitle={localize(`${documentTotals.count} documents indexed · ${documentTotals.pages} pages`, locale)} actions={<Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-3.5 w-3.5" /> {localize("Add Document", locale)}</Button>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-0 basis-full sm:flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label={localize("Search document concepts", locale)} value={q} onChange={(e) => setQ(e.target.value)} placeholder={localize("Search concepts, e.g. JWT, $group, indexes", locale)} className="h-9 pl-8" /></div>
            <div className="flex flex-wrap gap-1">{localize(["all", ...courses.map((c) => c.id)].map((c) => <Button variant="outline" size="sm" aria-pressed={course === c} key={c} onClick={() => setCourse(c)} className={cn("rounded-md border px-2 text-[12px]", course === c ? "border-primary/40 bg-primary-soft text-primary" : "text-muted-foreground")}>{localize(c === "all" ? "All" : courses.find((x) => x.id === c)?.code.split(" ")[0], locale)}</Button>), locale)}</div>
          </div>
          {localize(list.length ? <div className="grid gap-3 md:grid-cols-2">{localize(list.map((d) => (
            <Button variant="ghost" key={d.id} onClick={() => setDoc(d)} className="panel h-auto flex-col items-stretch whitespace-normal p-3 text-left transition-colors hover:border-primary/40">
              <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{localize(d.title, locale)}</div><div className="text-[11.5px] text-muted-foreground">{localize(d.type, locale)} {localize("·", locale)} {localize(d.pages, locale)} {localize("pages · indexed", locale)} {localize(d.indexed, locale)}</div></div></div>
              <div className="mt-2"><CourseTag id={d.courseId} /></div>
              <div className="mt-2 flex flex-wrap gap-1">{localize(d.concepts.map((c) => <span key={c} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{localize(c, locale)}</span>), locale)}</div>
            </Button>
          )), locale)}</div> : <div className="panel"><EmptyState icon={Search} title={localize("No matching documents", locale)} text={localize("Try a different concept or course.", locale)} /></div>, locale)}
        </div>
        {backendConnected ? (
          <Panel title={localize(<span className="flex items-center gap-1.5"><BookMarked className="h-4 w-4 text-ai" /> {localize("Concepts in your materials", locale)}</span>, locale)} subtitle={`${knowledgeDocs.length} ${localize("indexed documents", locale)}`} className="h-fit">
            {concepts.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {concepts.map(([concept, count]) => (
                  <li key={concept}><Button variant="outline" size="sm" className="h-auto rounded-md px-2 py-1 text-[11.5px]" onClick={() => setQ(concept)}>{concept.length > 48 ? `${concept.slice(0, 47)}…` : concept}{count > 1 ? <span className="ml-1 text-muted-foreground">×{count}</span> : null}</Button></li>
                ))}
              </ul>
            ) : <p className="text-[12.5px] text-muted-foreground">{localize("Upload an assignment brief to index its concepts.", locale)}</p>}
          </Panel>
        ) : (
        <Panel title={localize(<span className="flex items-center gap-1.5"><BookMarked className="h-4 w-4 text-ai" /> {localize("Study plan · Databases midterm", locale)}</span>, locale)} className="h-fit">
          <ol className="space-y-2 text-[12.5px]">
            {localize([["Session 1 · 90 min", "Query optimisation — Lecture 5"], ["Session 2 · 90 min", "Indexing strategies — Lecture 6–7"], ["Session 3 · 90 min", "Aggregation pipelines — Lecture 8"]].map(([a, b]) => <li key={a} className="rounded-md border p-2"><div className="font-medium">{localize(a, locale)}</div><div className="text-muted-foreground">{localize(b, locale)}</div></li>), locale)}
          </ol>
          <div className="mt-3"><PredictionNote>{localize("Draft plan references the", locale)} {localize(knowledgeDocs.filter((d) => d.courseId === "adb").length, locale)} {localize("indexed Databases lectures. Midterm on Oct 30.", locale)}</PredictionNote></div>
        </Panel>
        )}
      </div>
      <Sheet open={!!doc} onOpenChange={(o) => !o && setDoc(null)}>
        <SheetContent className="w-[440px] sm:max-w-[440px]">
          {localize(doc && <>
            <SheetHeader><SheetTitle className="text-[15px]">{localize(doc.title, locale)}</SheetTitle><SheetDescription>{localize(doc.type, locale)} {localize("·", locale)} {localize(doc.pages, locale)} {localize("pages", locale)}</SheetDescription></SheetHeader>
            <div className="space-y-3 px-4 text-[13px]">
              <CourseTag id={doc.courseId} />
              <div><div className="mb-1 text-[11.5px] text-muted-foreground">{localize("Extracted concepts", locale)}</div><div className="flex flex-wrap gap-1">{localize(doc.concepts.map((c) => <span key={c} className="rounded border bg-secondary px-1.5 py-0.5 text-[11.5px]">{localize(c, locale)}</span>), locale)}</div></div>
              {backendConnected ? null : <PredictionNote>{localize("Summary: this document introduces", locale)} {localize(doc.concepts.join(", "), locale)} {localize("and is referenced by", locale)} {localize(doc.type === "Assignment" ? "the generated task breakdown" : "your study plan and related assignments", locale)}{localize(".", locale)}</PredictionNote>}
              <div className="text-[11.5px] text-muted-foreground">{localize("Indexed", locale)} {localize(doc.indexed, locale)} {localize("·", locale)} {localize(documentFragments.filter((fragment) => fragment.documentId === doc.id).length, locale)} {localize(backendConnected ? "indexed fragments" : "sourced demo fragments", locale)}</div>
              <section className="border-t pt-3"><h2 className="font-semibold">{localize("Source and page fragments", locale)}</h2><p className="my-2 text-[12px] text-muted-foreground">{localize(doc.title, locale)} {localize(backendConnected ? "· text extracted from the uploaded file" : "· fixture excerpts, not the uploaded PDF text", locale)}{backendConnected ? null : localize(doc.id === "d1" ? ` · analysis input: ${analysisSource}` : "", locale)}</p>
                {localize(documentFragments.filter((fragment) => fragment.documentId === doc.id).map((fragment) => <article key={fragment.id} className="border-b py-3"><h3 className="font-medium">{localize("Page", locale)} {localize(fragment.page, locale)} {localize("·", locale)} {localize(fragment.requirementId ?? fragment.concept, locale)}</h3><blockquote className="my-2 border-l-2 border-ai pl-2 text-[12px] text-muted-foreground">{localize(fragment.text, locale)}</blockquote>{localize(fragment.assignmentId && <Link onClick={() => setDoc(null)} className="text-primary underline" to="/assignments/$assignmentId" params={{ assignmentId: fragment.assignmentId }} search={{ page: fragment.page }}>{localize("Open source assignment · p.", locale)} {localize(fragment.page, locale)}</Link>, locale)}{localize(tasks.filter((task) => task.req && task.req === fragment.requirementId).map((task) => <div key={task.id} className="mt-2"><Link onClick={() => setDoc(null)} to="/kanban" className="text-primary underline">{localize("Linked task:", locale)} {localize(task.title, locale)}</Link></div>), locale)}</article>), locale)}
              </section>
            </div>
          </>, locale)}
        </SheetContent>
      </Sheet>
    </>
  );
}
