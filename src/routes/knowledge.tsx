import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { FileText, Search, Sparkles, Upload, BookMarked, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MaterialFormDialog } from "@/components/app/MaterialFormDialog";
import { deleteRemoteMaterial, errorText, searchKnowledge, type KnowledgeHit } from "@/lib/api";
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

/** The text with every occurrence of the search term marked. */
function highlightMatch(text: string, term: string) {
  const needle = term.trim();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(target); at >= 0; at = lower.indexOf(target, from)) {
    parts.push(text.slice(from, at), <mark key={at} className="doc-highlight">{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function Knowledge() {
  const { locale } = useI18n();
  const { setUploadOpen, tasks, analysisSource, knowledgeDocs, documentFragments, courses, backendConnected, reloadWorkspace } = useStore();
  const [form, setForm] = useState<Doc | "new" | null>(null);
  const [removing, setRemoving] = useState<Doc | null>(null);
  const remove = async () => {
    if (!removing) return;
    try {
      await deleteRemoteMaterial(removing.id);
      await reloadWorkspace();
      setDoc(null);
      toast.success(localize("Material deleted", locale));
    } catch (error) {
      toast.error(localize("Could not delete", locale), { description: errorText(error) });
    } finally {
      setRemoving(null);
    }
  };
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null);
  // Search by meaning: a question in plain words finds the lecture passage even without shared words.
  useEffect(() => {
    const term = q.trim();
    if (!backendConnected || term.length < 3) { setHits(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      searchKnowledge(term).then((found) => { if (current) setHits(found); }).catch(() => { if (current) setHits(null); });
    }, 450);
    return () => { current = false; clearTimeout(timer); };
  }, [q, backendConnected]);
  const conceptMap = new Map<string, Set<string>>();
  for (const item of knowledgeDocs) for (const concept of item.concepts) conceptMap.set(concept, (conceptMap.get(concept) ?? new Set()).add(item.id));
  const concepts = [...conceptMap.entries()].filter(([concept]) => !q.trim() || concept.toLowerCase().includes(q.trim().toLowerCase())).map(([concept, ids]) => [concept, ids.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14);
  const documentTotals = { count: knowledgeDocs.length, pages: knowledgeDocs.reduce((sum, item) => sum + item.pages, 0) };
  const [course, setCourse] = useState("all");
  const [doc, setDoc] = useState<Doc | null>(null);
  const list = knowledgeDocs.filter((d) => (course === "all" || d.courseId === course) && (d.title + d.concepts.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={localize("Knowledge Base", locale)} subtitle={localize(`${documentTotals.count} documents indexed · ${documentTotals.pages} pages`, locale)} actions={backendConnected ? <Button size="sm" onClick={() => setForm("new")}><Plus className="h-3.5 w-3.5" /> {localize("Add material", locale)}</Button> : <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-3.5 w-3.5" /> {localize("Add Document", locale)}</Button>} />
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-0 basis-full sm:flex-1"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label={localize("Search document concepts", locale)} value={q} onChange={(e) => setQ(e.target.value)} placeholder={localize("Search concepts, e.g. JWT, $group, indexes", locale)} className="h-9 pl-8" /></div>
            <div className="flex flex-wrap gap-1">{localize(["all", ...courses.map((c) => c.id)].map((c) => <Button variant="outline" size="sm" aria-pressed={course === c} key={c} onClick={() => setCourse(c)} className={cn("rounded-md border px-2 text-[12px]", course === c ? "border-primary/40 bg-primary-soft text-primary" : "text-muted-foreground")}>{localize(c === "all" ? "All" : courses.find((x) => x.id === c)?.code.split(" ")[0], locale)}</Button>), locale)}</div>
          </div>
          {hits && hits.length ? (
            <section aria-label={localize("Matches by meaning", locale)} className="mb-3 rounded-lg border border-ai/30 bg-ai-soft/40 p-3">
              <h2 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-ai" aria-hidden /> {localize("Matches by meaning", locale)}</h2>
              <ul className="space-y-2">
                {hits.map((hit) => (
                  <li key={`${hit.documentId}-${hit.page}`} className="text-[12.5px]">
                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => { const found = knowledgeDocs.find((item) => item.id === hit.documentId); if (found) setDoc(found); }}>{hit.documentName} · {localize("p.", locale)} {hit.page}</button>
                    <p className="text-muted-foreground">{highlightMatch(hit.excerpt, q)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : hits && !hits.length ? <p role="status" className="mb-3 text-[12.5px] text-muted-foreground">{localize("No passage in your materials answers that.", locale)}</p> : null}
          {localize(list.length ? <div className="grid gap-3 md:grid-cols-2">{localize(list.map((d) => (
            <Button variant="ghost" key={d.id} onClick={() => setDoc(d)} aria-label={`${d.title}, ${d.type}, ${d.pages} ${locale === "en" ? "pages" : ""}`.trim()} className="panel h-auto flex-col items-stretch whitespace-normal p-3 text-left transition-colors hover:border-primary/40">
              <div className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{localize(d.title, locale)}</div><div className="text-[11.5px] text-muted-foreground">{localize(d.type, locale)} {localize("·", locale)} {localize(d.pages, locale)} {localize("pages · indexed", locale)} {localize(d.indexed, locale)}</div></div></div>
              <div className="mt-2"><CourseTag id={d.courseId} /></div>
              <div className="mt-2 flex flex-wrap gap-1">{d.concepts.slice(0, 4).map((c) => <span key={c} className="max-w-full truncate rounded bg-secondary px-1.5 py-0.5 text-[11px]">{localize(c.length > 48 ? `${c.slice(0, 47)}…` : c, locale)}</span>)}{d.concepts.length > 4 ? <span className="px-1 py-0.5 text-[11px] text-muted-foreground">+{d.concepts.length - 4}</span> : null}</div>
            </Button>
          )), locale)}</div> : <div className="panel"><EmptyState icon={Search} title={localize("No matching documents", locale)} text={localize("Try a different concept or course.", locale)} /></div>, locale)}
        </div>
        {backendConnected ? (
          <Panel title={localize(<span className="flex items-center gap-1.5"><BookMarked className="h-4 w-4 text-ai" /> {localize("Page headings in your materials", locale)}</span>, locale)} subtitle={`${knowledgeDocs.length} ${localize("indexed documents", locale)}`} className="h-fit">
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
              {backendConnected ? (doc.assignmentId ? <p className="text-[12px] text-muted-foreground">{localize("This is an assignment brief. Manage it from the assignment page.", locale)}</p> : <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setForm(doc)}><Pencil className="h-3.5 w-3.5" /> {localize("Edit", locale)}</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => setRemoving(doc)}><Trash2 className="h-3.5 w-3.5" /> {localize("Delete", locale)}</Button></div>) : null}
              <div><div className="mb-1 text-[11.5px] text-muted-foreground">{localize("Extracted concepts", locale)}</div><div className="flex flex-wrap gap-1">{localize(doc.concepts.map((c) => <span key={c} className="rounded border bg-secondary px-1.5 py-0.5 text-[11.5px]">{localize(c, locale)}</span>), locale)}</div></div>
              {backendConnected ? null : <PredictionNote>{localize("Summary: this document introduces", locale)} {localize(doc.concepts.join(", "), locale)} {localize("and is referenced by", locale)} {localize(doc.type === "Assignment" ? "the generated task breakdown" : "your study plan and related assignments", locale)}{localize(".", locale)}</PredictionNote>}
              <div className="text-[11.5px] text-muted-foreground">{localize("Indexed", locale)} {localize(doc.indexed, locale)} {localize("·", locale)} {localize(documentFragments.filter((fragment) => fragment.documentId === doc.id).length, locale)} {localize(backendConnected ? "indexed fragments" : "sourced demo fragments", locale)}</div>
              <section className="border-t pt-3"><h2 className="font-semibold">{localize("Source and page fragments", locale)}</h2><p className="my-2 text-[12px] text-muted-foreground">{localize(doc.title, locale)} {localize(backendConnected ? "· text extracted from the uploaded file" : "· fixture excerpts, not the uploaded PDF text", locale)}{backendConnected ? null : localize(doc.id === "d1" ? ` · analysis input: ${analysisSource}` : "", locale)}</p>
                {localize(documentFragments.filter((fragment) => fragment.documentId === doc.id).map((fragment) => <details key={fragment.id} open={!!q.trim() && fragment.text.toLowerCase().includes(q.trim().toLowerCase())} className="border-b py-2"><summary className="cursor-pointer font-medium">{localize("Page", locale)} {localize(fragment.page, locale)} {localize("·", locale)} {localize((fragment.requirementId ?? fragment.concept).slice(0, 80), locale)}</summary><blockquote className="my-2 max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 border-ai pl-2 text-[12px] text-muted-foreground">{highlightMatch(fragment.text, q)}</blockquote>{localize(fragment.assignmentId && <Link onClick={() => setDoc(null)} className="text-primary underline" to="/assignments/$assignmentId" params={{ assignmentId: fragment.assignmentId }} search={{ page: fragment.page }}>{localize("Open source assignment · p.", locale)} {localize(fragment.page, locale)}</Link>, locale)}{localize(tasks.filter((task) => task.req && task.req === fragment.requirementId).map((task) => <div key={task.id} className="mt-2"><Link onClick={() => setDoc(null)} to="/kanban" className="text-primary underline">{localize("Linked task:", locale)} {localize(task.title, locale)}</Link></div>), locale)}</details>), locale)}
              </section>
            </div>
          </>, locale)}
        </SheetContent>
      </Sheet>
      <MaterialFormDialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} material={form === "new" ? null : form} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{localize("Delete this material?", locale)}</AlertDialogTitle>
            <AlertDialogDescription>{localize("The file and its indexed text are removed, so the agent can no longer cite it.", locale)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{localize("Keep it", locale)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{localize("Delete", locale)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
