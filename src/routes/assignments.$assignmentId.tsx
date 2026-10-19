import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, FileSearch, Link2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader, Panel, PredictionNote, PriorityIndicator, SourceReference, StatusBadge } from "@/components/app/common";
import { TaskPlanReview } from "@/components/app/TaskPlanReview";
import { AssignmentActions } from "@/components/app/AssignmentActions";
import { applyStep, type TraceItem } from "@/lib/agentSteps";
import { AgentTrace } from "@/components/app/AgentTrace";
import { analyzeRemoteAssignment, fetchAssignmentText, fetchTaskPlan, type AgentStep, type DocumentPage, type TaskPlan } from "@/lib/api";
import { useStore } from "@/lib/store";
import { courseOf, type Assignment, type Priority } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assignments/$assignmentId")({
  beforeLoad: guardWorkspace,
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Number(search["page"]);
    return Number.isInteger(page) && page >= 1 ? { page } : {};
  },
  // Assignments created from the backend are only known after the workspace loads.
  loader: ({ params }) => ({ id: params.assignmentId }),
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { title: "Assignment — CampusPulse AI" }, { name: "description", content: "Requirements with their source in the document, dependencies, task breakdown and estimate accuracy." }] }),
  component: AssignmentPage,
});

const priorityLabel = (value: string): Priority => (value === "high" ? "High" : value === "low" ? "Low" : "Medium");
const normalize = (text: string) => text.toLowerCase().replace(/\W+/g, " ").trim();

function AssignmentPage() {
  const { locale } = useI18n();
  const { id } = Route.useLoaderData();
  const { assignments, connection } = useStore();
  const assignment = assignments.find((item) => item.id === id);
  if (!assignment) {
    if (connection === "connecting") return <p role="status" className="text-[13px] text-muted-foreground">{localize("Loading assignment…", locale)}</p>;
    throw notFound();
  }
  return <AssignmentDetails a={assignment} />;
}

function AssignmentDetails({ a }: { a: Assignment }) {
  const { locale } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { assignments, tasks, relations, statistics, backendConnected, agentEnabled, reloadWorkspace, openChat } = useStore();
  const [pages, setPages] = useState<DocumentPage[] | null>(null);
  const [plan, setPlan] = useState<(TaskPlan & { status: string; createdAt: string }) | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [liveSteps, setLiveSteps] = useState<TraceItem[]>([]);
  const [page, setPage] = useState(search.page ?? 1);
  const [openReq, setOpenReq] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [review, setReview] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!backendConnected || !a.backendId) { setLoaded(true); return; }
    try {
      const [text, latest] = await Promise.all([fetchAssignmentText(a.backendId), fetchTaskPlan(a.backendId)]);
      setPages(text?.pages ?? null);
      const first = text?.pages[0]?.page;
      if (first !== undefined) setPage((current) => (text?.pages.some((item) => item.page === current) ? current : first));
      setPlan(latest);
    } catch (error) {
      console.warn("Assignment details unavailable", error);
    } finally {
      setLoaded(true);
    }
  }, [backendConnected, a.backendId]);
  useEffect(() => { void load(); }, [load]);

  const own = tasks.filter((task) => task.assignmentId === a.id);
  const requirements = plan ? [...new Map(plan.items.map((item) => [item.requirementId, item])).values()] : [];
  const open = requirements.find((item) => item.requirementId === openReq);
  const related = relations.filter((item) => item.sourceId === a.id || item.targetId === a.id);
  const titleOf = (id: string) => assignments.find((item) => item.id === id)?.title ?? id;
  const sameCourse = assignments.filter((item) => item.courseId === a.courseId && item.actual !== undefined);
  const courseStat = statistics?.byCourse.find((item) => item.courseId === a.courseId);
  const pending = plan?.status === "pending";
  const currentText = pages?.find((item) => item.page === page)?.text ?? "";

  const analyze = async () => {
    if (!a.backendId) return;
    setAnalyzing(true);
    setLiveSteps([]);
    try {
      const result = await analyzeRemoteAssignment(a.backendId, (step) => setLiveSteps((items) => applyStep(items, step)));
      setPlan({ ...result.plan, status: "pending", createdAt: new Date().toISOString() });
      setSteps(result.steps);
      setReview(true);
    } catch (error) {
      toast.error(localize("Analysis failed", locale), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAnalyzing(false);
    }
  };

  const selectRequirement = (requirementId: string) => {
    setOpenReq(openReq === requirementId ? null : requirementId);
    const item = requirements.find((row) => row.requirementId === requirementId);
    if (item) setPage(item.page);
  };

  const highlighted = (text: string) => {
    const quote = open?.quote;
    if (!quote || page !== open.page) return text;
    const index = text.toLowerCase().indexOf(quote.toLowerCase());
    if (index < 0) return text;
    return (<>{text.slice(0, index)}<mark className="doc-highlight">{text.slice(index, index + quote.length)}</mark>{text.slice(index + quote.length)}</>);
  };

  return (
    <>
      <PageHeader
        title={a.title}
        subtitle={`${courseOf(a.courseId).name} · ${localize("Due", locale)} ${a.deadline}`}
        actions={<>
          <StatusBadge status={a.status} />
          <AssignmentActions assignment={a} />
          <Button size="sm" variant="outline" onClick={() => openChat(a.title)}><Sparkles className="h-3.5 w-3.5 text-ai" /> {localize("Ask about this", locale)}</Button>
          {pending ? <Button size="sm" onClick={() => setReview(true)}>{localize("Review task plan", locale)}</Button> : null}
          {pages && agentEnabled && !pending ? (
            <Button size="sm" disabled={analyzing} onClick={() => void analyze()}>
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSearch className="h-3.5 w-3.5" />} {localize(plan ? "Analyze again" : "Analyze assignment", locale)}
            </Button>
          ) : null}
        </>}
      />

      <div className="grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <div className="space-y-3">
          <Panel title={localize("Assignment overview", locale)}>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{a.description || localize("No description was provided for this assignment.", locale)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t text-[12.5px] md:grid-cols-5 [&>div]:pt-3">
              <div><dt className="text-muted-foreground">{localize("Deadline", locale)}</dt><dd className="font-medium">{a.deadline}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Estimate", locale)}</dt><dd className="font-medium">{a.estimate}{localize("h", locale)}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Actual", locale)}</dt><dd className="font-medium">{a.actual !== undefined ? `${a.actual}h` : "—"}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Progress", locale)}</dt><dd className="font-medium">{a.progress}%</dd></div>
              <div><dt className="text-muted-foreground">{localize("Tasks", locale)}</dt><dd className="font-medium">{own.filter((task) => task.column === "done").length}/{own.length}</dd></div>
            </dl>
          </Panel>

          <Panel ai title={<span className="flex items-center gap-1.5">{localize("Requirements", locale)} <span className="text-[11px] font-normal tabular-nums text-muted-foreground">{requirements.length}</span></span>} bodyClass="p-0">
            {requirements.length ? requirements.map((item) => {
              const linked = own.filter((task) => task.req === item.requirementId);
              const done = linked.length > 0 && linked.every((task) => task.column === "done");
              return (
                <div key={item.requirementId} className={cn("border-b last:border-0", openReq === item.requirementId && "bg-secondary/50")}>
                  <Button variant="ghost" aria-expanded={openReq === item.requirementId} onClick={() => selectRequirement(item.requirementId)} className="flex h-auto w-full items-center gap-2.5 whitespace-normal px-3.5 py-2 text-left hover:bg-secondary/40">
                    {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-mono text-[11.5px] text-muted-foreground">{item.requirementId}</span>
                    <span className="flex-1 text-[12.5px]">{item.requirementText}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openReq === item.requirementId && "rotate-180")} />
                  </Button>
                  {openReq === item.requirementId ? (
                    <div className="space-y-2 px-3.5 pb-2.5 pl-[58px]">
                      <blockquote className="border-l-2 border-ai/40 pl-3 text-[12.5px] text-muted-foreground">“{item.quote}”</blockquote>
                      {!item.quoteVerified ? <p className="text-[11.5px] text-warning">{localize("This quote could not be found in the document.", locale)}</p> : null}
                      <SourceReference file={a.title} page={item.page} onClick={() => setPage(item.page)} />
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <div className="p-3.5"><EmptyState icon={FileSearch} title={localize(loaded && pages ? "No requirements extracted yet" : "No analyzed document", locale)} text={localize(pages ? "Analyze the assignment to extract requirements with their source in the document." : "Upload the assignment brief (PDF, DOCX or TXT) to extract requirements.", locale)} /></div>
            )}
          </Panel>

          <Panel title={localize("Related assignments", locale)}>
            {related.length ? (
              <ul className="space-y-2 text-[13px]">
                {related.map((item) => {
                  const outgoing = item.sourceId === a.id;
                  const otherId = outgoing ? item.targetId : item.sourceId;
                  const verb = item.type === "extends" ? (outgoing ? "extends" : "is extended by") : item.type === "depends_on" ? (outgoing ? "depends on" : "is a prerequisite of") : "is related to";
                  return (
                    <li key={`${item.sourceId}-${item.targetId}-${item.type}`} className="flex flex-wrap items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-info" aria-hidden />
                      <span className="text-muted-foreground">{localize(verb, locale)}</span>
                      <Link to="/assignments/$assignmentId" params={{ assignmentId: otherId }} className="font-medium hover:text-primary">{titleOf(otherId)}</Link>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-[12.5px] text-muted-foreground">{localize("No related assignments were detected.", locale)}</p>}
          </Panel>

          <Panel ai title={localize("Task breakdown", locale)} subtitle={pending ? localize("Proposed, not imported", locale) : `${own.length} ${localize("tasks", locale)} · ${Math.round(own.reduce((sum, task) => sum + task.estimate, 0) * 100) / 100}${localize("h", locale)}`} bodyClass="p-0" action={pending ? <Button size="sm" className="h-7 text-[12px]" onClick={() => setReview(true)}>{localize("Review plan", locale)}</Button> : own.length ? <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => void navigate({ to: "/kanban" })}>{localize("Open Kanban", locale)}</Button> : undefined}>
            {own.length ? (
              <table className="w-full text-[12.5px]">
                <thead><tr className="border-b bg-secondary/50 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground"><th scope="col" className="px-3.5 py-1.5 font-medium">{localize("Task", locale)}</th><th scope="col" className="font-medium">{localize("Priority", locale)}</th><th scope="col" className="font-medium">{localize("Requirement", locale)}</th><th scope="col" className="font-medium">{localize("Status", locale)}</th><th scope="col" className="px-4 text-right font-medium">{localize("Estimate", locale)}</th></tr></thead>
                <tbody>{own.map((task) => (
                  <tr key={task.id} className="border-b last:border-0">
                    <td className="px-3.5 py-2"><div className="font-medium">{task.title}</div></td>
                    <td><PriorityIndicator priority={task.priority} /></td>
                    <td className="font-mono text-[11.5px]">{task.req ?? "—"}</td>
                    <td><StatusBadge status={task.column === "progress" ? "In Progress" : task.column === "done" ? "Completed" : task.column === "review" ? "Review" : "To Do"} /></td>
                    <td className="px-4 text-right tabular-nums">{task.estimate}{localize("h", locale)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="p-3.5 text-[12.5px] text-muted-foreground">{pending ? localize("Review the proposed plan to add tasks to the board.", locale) : localize("No tasks yet. Analyze the assignment to get a proposed breakdown.", locale)}</div>}
          </Panel>

          <Panel title={localize("Your estimate accuracy", locale)} subtitle={localize("Based on your own completed assignments in this course", locale)}>
            {sameCourse.length ? (
              <div className="space-y-2 text-[12.5px]">
                {courseStat?.accuracy != null ? <p>{localize("Accuracy in this course:", locale)} <b>{courseStat.accuracy}%</b> ({courseStat.completed} {localize("completed", locale)})</p> : null}
                <ul className="divide-y rounded-md border">{sameCourse.map((item) => <li key={item.id} className="flex justify-between px-3 py-1.5"><span>{item.title}</span><span className="tabular-nums text-muted-foreground">{item.estimate}h → {item.actual}h</span></li>)}</ul>
              </div>
            ) : <PredictionNote>{localize("No completed assignments in this course yet, so there is no history to calibrate this estimate.", locale)}</PredictionNote>}
          </Panel>
        </div>

        <div className="space-y-3 lg:sticky lg:top-16 lg:self-start">
          <Panel title={localize("Document", locale)} bodyClass="p-0" subtitle={pages ? `${pages.length} ${localize(pages.length === 1 ? "page" : "pages", locale)}` : ""}>
            {pages ? (
              <>
                <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
                  {pages.slice(0, 40).map((item) => <Button key={item.page} variant="outline" size="sm" aria-pressed={page === item.page} aria-label={`${localize("Page", locale)} ${item.page}`} onClick={() => setPage(item.page)} className={cn("h-7 min-w-7 rounded border px-1.5 text-[11px]", page === item.page && "border-primary bg-primary-soft text-primary")}>{item.page}</Button>)}
                </div>
                <div className="h-[420px] overflow-auto whitespace-pre-wrap bg-secondary p-4 font-serif text-[12px] leading-relaxed">{highlighted(currentText) || localize("This page has no text.", locale)}</div>
              </>
            ) : <div className="p-3.5 text-[12.5px] text-muted-foreground">{loaded ? localize("No document with extractable text is attached to this assignment.", locale) : localize("Loading…", locale)}</div>}
          </Panel>
          <Panel ai title={localize("Analysis status", locale)}>
            <dl className="space-y-2 text-[12.5px]">
              {[
                [localize("Requirements extracted", locale), String(requirements.length)],
                [localize("Related assignments", locale), String(related.length)],
                [localize("Citations verified", locale), plan ? `${plan.items.filter((item) => item.quoteVerified).length}/${plan.items.length}` : "—"],
                [localize("Last analyzed", locale), plan ? new Date(plan.createdAt).toLocaleString() : localize("Not analyzed", locale)],
              ].map(([label, value]) => <div key={label} className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
            </dl>
            {analyzing ? <div role="status" className="mt-3 border-t pt-3"><AgentTrace items={liveSteps} live /></div> : null}
          </Panel>
        </div>
      </div>

      <Dialog open={review && !!plan} onOpenChange={setReview}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[16px]">{localize("Proposed task plan", locale)}</DialogTitle>
            <DialogDescription className="text-[12.5px]">{localize("Review, edit and approve. Nothing is added to the board until you approve.", locale)}</DialogDescription>
          </DialogHeader>
          {plan ? (
            <TaskPlanReview
              initial={plan}
              steps={steps}
              onDismissed={() => { setReview(false); setPlan(null); }}
              onApplied={(created) => {
                setReview(false);
                void reloadWorkspace().then(load);
                toast.success(`${created} ${localize("tasks added to Kanban", locale)}`);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
