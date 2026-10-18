import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ChevronDown, CheckCircle2, Circle, FileSearch, Link2, Minus, Plus, RefreshCw, Pencil, Sparkles, ArrowRight, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { PageHeader, Panel, PredictionNote, PriorityIndicator, SourceReference, StatusBadge, CourseTag } from "@/components/app/common";
import { SimpleBars } from "@/components/app/widgets";
import { AnalysisProgress } from "@/components/app/AnalysisProgress";
import { useStore } from "@/lib/store";
import { assignments, courseOf, generatedTasks, historicalHours, requirements } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assignments/$assignmentId")({
  beforeLoad: guardWorkspace,
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Number(search["page"]);
    return Number.isInteger(page) && page >= 1 && page <= 4 ? { page } : {};
  },
  loader: ({ params }) => {
    const a = assignments.find((x) => x.id === params.assignmentId);
    if (!a) throw notFound();
    return { a };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.a.title} — CampusPulse AI` : "Assignment — CampusPulse AI";
    return { meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: t }, { name: "description", content: "AI-extracted requirements, dependencies, task breakdown and workload estimate." }, { property: "og:title", content: t }, { property: "og:description", content: "AI-extracted requirements, dependencies and task breakdown." }] };
  },
  component: AssignmentPage,
});

function AssignmentPage() {
  useI18n();
  const { a } = Route.useLoaderData();
  if (a.id !== "se-a3") return <SimpleAssignment />;
  return <RichAssignment />;
}

function SimpleAssignment() {
  useI18n();
  const { a } = Route.useLoaderData();
  const { setUploadOpen } = useStore();
  return (
    <>
      <PageHeader title={localize(a.title)} subtitle={localize(`${courseOf(a.courseId).name} · Due ${a.deadline}`)} actions={<StatusBadge status={a.status} />} />
      <Panel title={localize("Assignment overview")}>
        <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4">
          <div><dt className="text-muted-foreground">{localize("Estimate")}</dt><dd className="font-medium">{localize(a.estimate)}{localize("h")}</dd></div>
          <div><dt className="text-muted-foreground">{localize("Actual")}</dt><dd className="font-medium">{localize(a.actual ? `${a.actual}h` : "—")}</dd></div>
          <div><dt className="text-muted-foreground">{localize("Progress")}</dt><dd className="font-medium">{localize(a.progress)}{localize("%")}</dd></div>
          <div><dt className="text-muted-foreground">{localize("Dependency")}</dt><dd className="font-medium">{localize(a.dependsOn ? assignments.find((b) => b.id === a.dependsOn)?.title : "None")}</dd></div>
        </dl>
        <div className="mt-4"><PredictionNote>{localize("This assignment hasn't been analyzed in depth yet. Upload the brief to extract requirements and generate tasks — or open")} <Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a3" }} className="font-medium text-primary underline">{localize("Assignment 3")}</Link> {localize("to see a full analysis.")}</PredictionNote></div>
        <Button size="sm" className="mt-3" onClick={() => setUploadOpen(true)}><FileSearch className="h-3.5 w-3.5" /> {localize("Upload & Analyze")}</Button>
      </Panel>
    </>
  );
}

function RichAssignment() {
  useI18n();
  const { addGeneratedTasks, tasksGenerated, log, openChat, proposalTasks, proposalApproved, approveProposal, setProposalEstimate, assignments: liveAssignments, tasks, recordAnalysis, analysisSource } = useStore();
  const navigate = useNavigate();
  const [openReq, setOpenReq] = useState<string | null>("R2");
  const search = Route.useSearch();
  const [page, setPage] = useState(search.page ?? 2);
  const [zoom, setZoom] = useState(100);
  const [running, setRunning] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState("Today, 09:42");
  const estimates = proposalTasks.map((task) => task.estimate);
  const assignment = liveAssignments.find((a) => a.id === "se-a3");
  const [editing, setEditing] = useState(false);
  const total = estimates.reduce((s, v) => s + v, 0);

  const selectReq = (id: string) => { setOpenReq(openReq === id ? null : id); setPage(requirements.find((r) => r.id === id)?.page ?? 1); };
  const finish = useCallback(() => {
    setRunning(false);
    setAnalyzedAt("Oct 18, 09:46");
    recordAnalysis(analysisSource);
    log({ title: "Assignment 3 re-analyzed", detail: `${requirements.length} requirements · 1 dependency · ${total}h`, kind: "analysis", status: "success" });
    toast.success(localize("Analysis complete"), { description: localize("6 requirements · 1 dependency · 6 tasks") });
  }, [log, recordAnalysis, analysisSource]);

  return (
    <>
      <PageHeader title={localize("Assignment 3 — JWT Authentication")} subtitle={localize("Software Engineering · SE 3204 · Due October 23, 2026")} actions={<>
        <StatusBadge status={assignment?.status ?? "To Do"} />
        <Button size="sm" variant="outline" onClick={() => openChat("Assignment 3")}><Sparkles className="h-3.5 w-3.5 text-ai" /> {localize("Ask about this")}</Button>
        <Button size="sm" onClick={() => setRunning(true)}><FileSearch className="h-3.5 w-3.5" /> {localize("Analyze Assignment")}</Button>
      </>} />

      <div className="grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <div className="space-y-3">
          <Panel title={localize("Assignment Overview")}>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{localize("Extend the order-management REST service from Assignment 2 with stateless JWT authentication, protected endpoints and role-based authorization. Submit the repository link and a short README.")}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t text-[12.5px] md:grid-cols-5 [&>div]:pt-3">
              <div><dt className="text-muted-foreground">{localize("Deadline")}</dt><dd className="font-medium">{localize("Oct 23, 23:59")}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Difficulty")}</dt><dd className="font-medium">{localize("Medium–High")}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Estimate")}</dt><dd className="font-medium">{localize(total)}{localize("h")}</dd></div>
              <div><dt className="text-muted-foreground">{localize("Status")}</dt><dd><StatusBadge status={assignment?.status ?? "To Do"} /></dd></div>
              <div><dt className="text-muted-foreground">{localize("Related")}</dt><dd className="font-medium"><Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a2" }} className="hover:text-primary">{localize("Assignment 2")}</Link></dd></div>
            </dl>
          </Panel>

          <Panel title={localize(<span className="flex items-center gap-1.5">AI-Extracted Requirements <span className="text-[11px] font-normal tabular-nums text-muted-foreground">6</span></span>)} ai subtitle={localize("Click a requirement to highlight its source in the document")} bodyClass="p-0">
            {localize(requirements.map((r) => (
              <div key={r.id} className={cn("border-b last:border-0", openReq === r.id && "bg-secondary/50")}>
                <Button variant="ghost" aria-expanded={openReq === r.id} onClick={() => selectReq(r.id)} className="h-auto whitespace-normal flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-secondary/40">
                  {tasks.some((task) => task.req === r.id && task.column === "done") ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-mono text-[11.5px] text-muted-foreground">{r.id}</span>
                  <span className="flex-1 text-[12.5px]">{r.text}</span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openReq === r.id && "rotate-180")} />
                </Button>
                {openReq === r.id && (
                  <div className="space-y-2 px-3.5 pb-2.5 pl-[58px] animate-in fade-in slide-in-from-top-1">
                    <p className="text-[12.5px] text-muted-foreground">{r.detail}</p>
                    <SourceReference file="Assignment_3.pdf" page={r.page} onClick={() => setPage(r.page)} />
                  </div>
                )}
              </div>
            )))}
          </Panel>

          <Panel title={localize("Assignment Dependencies")} ai>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-primary/40 bg-primary-soft px-3 py-2 text-[13px] font-medium">{localize("Assignment 3")}</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-info"><Link2 className="h-3.5 w-3.5" /> {localize("EXTENDS")} <ArrowRight className="h-3.5 w-3.5" /></div>
              <Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a2" }} className="rounded-md border px-3 py-2 text-[13px] font-medium hover:border-primary/40">{localize("Assignment 2 — Database Integration")}</Link>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">{localize("This assignment builds on the existing REST API and PostgreSQL integration implemented previously.")}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {localize([["Reusable", "text-success", ["REST Controllers", "User Entity", "PostgreSQL Configuration"]], ["New", "text-primary", ["JWT Service", "Security Filters", "Authentication Endpoints"]], ["Modified", "text-warning", ["User Service", "Existing Tests"]]].map(([k, cls, items]) => (
                <div key={k as string} className="rounded-md border bg-card p-2.5">
                  <div className={cn("mb-1 text-[11.5px] font-semibold uppercase tracking-wide", cls as string)}>{k as string} components</div>
                  {(items as string[]).map((i) => <div key={i} className="font-mono text-[12px]">{i}</div>)}
                </div>
              )))}
            </div>
          </Panel>

          <Panel ai title={localize("Task Breakdown")} subtitle={localize(`${proposalTasks.length} tasks · ${total}h total`)} bodyClass="p-0" action={<div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" disabled={tasksGenerated} onClick={() => setEditing(!editing)}><Pencil className="h-3 w-3" /> {localize(editing ? "Done" : "Edit Estimates")}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => toast(localize("Breakdown regenerated"), { description: localize("Same 6 tasks — the brief hasn't changed.") })}><RefreshCw className="h-3 w-3" /> {localize("Regenerate")}</Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={() => { if (!proposalApproved) { approveProposal(); toast.success(localize("Task plan approved — ready to import")); return; } if (tasksGenerated) { void navigate({ to: "/kanban" }); return; } addGeneratedTasks(); toast.success(localize("6 tasks added to Kanban"), { action: { label: "Open", onClick: () => navigate({ to: "/kanban" }) } }); }}>{localize(tasksGenerated ? "View on Kanban" : proposalApproved ? "Import approved tasks" : "Approve task plan")}</Button>
          </div>}>
            <p className="px-3.5 py-2 text-[12px] text-muted-foreground" role="status">{localize(tasksGenerated ? "Imported to Kanban; schedule sessions from the board." : proposalApproved ? "Approved, not imported. Click Import approved tasks to create board tasks." : "Generated, not imported. These proposals do not appear on the board until approved and imported.")}</p>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b bg-secondary/50 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground [&>th]:font-semibold"><th scope="col" className="px-3.5 py-1.5 font-medium">{localize("#")}</th><th scope="col" className="font-medium">{localize("Task")}</th><th scope="col" className="font-medium">{localize("Priority")}</th><th scope="col" className="font-medium">{localize("Req.")}</th><th scope="col" className="px-4 text-right font-medium">{localize("Estimate")}</th></tr></thead>
              <tbody>{localize(proposalTasks.map((t, i) => (
                <tr key={t.title} className="border-b last:border-0">
                  <td className="px-3.5 py-2 align-top font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-3"><div className="font-medium">{t.title}</div><div className="text-[11.5px] text-muted-foreground">{t.description}</div></td>
                  <td><PriorityIndicator priority={t.priority} /></td>
                  <td className="font-mono text-[11.5px]">{t.req}</td>
                  <td className="px-4 text-right tabular-nums">
                    {editing ? <input aria-label={`Estimate for ${t.title}`} type="number" step="0.5" min="0" value={estimates[i]} onChange={(e) => setProposalEstimate(i, Number(e.target.value))} className="h-7 w-16 rounded border px-1.5 text-right" /> : `${estimates[i]}h`}
                  </td>
                </tr>
              )))}</tbody>
            </table>
          </Panel>

          <Panel ai title={localize("Workload Estimation")} subtitle={localize("Simulated demonstration data")}>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <dl className="space-y-2 text-[13px]">
                {localize([["AI Estimate", `${total} hours`], ["Historical Student Median", "9.2 hours"], ["Sample Size", "14 students"], ["Estimated Range", "7–12 hours"]].map(([k, v]) => <div key={k} className="flex justify-between border-b pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>))}
              </dl>
              <SimpleBars data={historicalHours} x="range" y="students" height={150} />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" /> {localize("Historical estimates are based on voluntarily reported completion times from students who completed the same assignment version.")}</p>
          </Panel>
        </div>

        <div className="space-y-3 lg:sticky lg:top-16 lg:self-start">
          <Panel title={localize("Assignment_3.pdf")} bodyClass="p-0" action={<div className="flex items-center gap-1 text-[11.5px]">
            <Button variant="ghost" size="icon" aria-label={localize("Zoom out")} className="h-7 w-7" onClick={() => setZoom(Math.max(70, zoom - 10))}><Minus className="h-3 w-3" /></Button>
            <span className="w-9 text-center tabular-nums">{localize(zoom)}{localize("%")}</span>
            <Button variant="ghost" size="icon" aria-label={localize("Zoom in")} className="h-7 w-7" onClick={() => setZoom(Math.min(140, zoom + 10))}><Plus className="h-3 w-3" /></Button>
          </div>}>
            <div className="flex gap-2 border-b px-3 py-2">
              {localize([1, 2, 3, 4].map((p) => <Button variant="outline" size="sm" aria-label={`Page ${p}`} aria-pressed={page === p} key={p} onClick={() => setPage(p)} className={cn("h-10 w-8 rounded border text-[10px]", page === p ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:border-primary/40")}>{p}</Button>))}
              <span className="ml-auto self-center text-[11px] text-muted-foreground">{localize("Page")} {localize(page)} {localize("/ 4")}</span>
            </div>
            <div className="h-[420px] overflow-auto bg-secondary p-4">
              <DocPage page={page} zoom={zoom} highlight={openReq} />
            </div>
          </Panel>
          <Panel ai title={localize("Analysis Status")}>
            {localize(running ? <AnalysisProgress running onDone={finish} /> : (
              <dl className="space-y-2 text-[12.5px]">
                <div><dt className="sr-only">Analysis result</dt><dd className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Document processed successfully</dd></div>
                {[["Requirements extracted", "6"], ["Related assignments detected", "1"], ["Estimated difficulty", "Medium–High"], ["Last analyzed", analyzedAt]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

function DocPage({ page, zoom, highlight }: { page: number; zoom: number; highlight: string | null }) {
  useI18n();
  const reqsOnPage = requirements.filter((r) => r.page === page);
  const H = ({ id, children }: { id: string; children: React.ReactNode }) => { useI18n(); return <span className={cn("transition-all", highlight === id && "doc-highlight")}>{localize(children)}</span>; };
  return (
    <div className="mx-auto origin-top bg-card p-6 font-serif text-[11px] leading-relaxed text-foreground shadow-sm" style={{ width: 300 * (zoom / 100), fontSize: 11 * (zoom / 100) }}>
      <div className="mb-3 border-b pb-2 font-sans text-[0.9em] text-muted-foreground">{localize("SE 3204 · Software Engineering · Fall 2026")}</div>
      {localize(page === 1 && <>
        <h3 className="mb-2 font-sans text-[1.4em] font-bold">Assignment 3: Authentication</h3>
        <p>Due: 23 October 2026, 23:59. Weight: 15% of the final grade.</p>
        <p className="mt-2">This assignment continues the order-management service you developed in Assignments 1 and 2. You will secure the application using stateless token authentication.</p>
        <p className="mt-2">Work individually. Plagiarism checks will be applied to all repositories.</p>
      </>)}
      {localize(page > 1 && <h4 className="mb-2 font-sans font-semibold">{page === 4 ? "4. Deliverables" : `${page}. Requirements (cont.)`}</h4>)}
      {localize(reqsOnPage.map((r) => (
        <p key={r.id} className="mt-2"><b className="font-sans">{r.id}.</b> <H id={r.id}>{r.text} {r.detail}</H></p>
      )))}
      {localize(page === 4 && <p className="mt-2">Submit the repository URL on Moodle. Include a README with setup steps and the authentication flow.</p>)}
      <p className="mt-3 text-muted-foreground">{localize("—")} {localize(page)} {localize("—")}</p>
    </div>
  );
}
