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
  loader: ({ params }) => {
    const a = assignments.find((x) => x.id === params.assignmentId);
    if (!a) throw notFound();
    return { a };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.a.title} — CampusPulse AI` : "Assignment — CampusPulse AI";
    return { meta: [{ title: t }, { name: "description", content: "AI-extracted requirements, dependencies, task breakdown and workload estimate." }, { property: "og:title", content: t }, { property: "og:description", content: "AI-extracted requirements, dependencies and task breakdown." }] };
  },
  component: AssignmentPage,
});

function AssignmentPage() {
  const { a } = Route.useLoaderData();
  if (a.id !== "se-a3") return <SimpleAssignment />;
  return <RichAssignment />;
}

function SimpleAssignment() {
  const { a } = Route.useLoaderData();
  const { setUploadOpen } = useStore();
  return (
    <>
      <PageHeader title={a.title} subtitle={`${courseOf(a.courseId).name} · Due ${a.deadline}`} actions={<StatusBadge status={a.status} />} />
      <Panel title="Assignment overview">
        <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4">
          <div><dt className="text-muted-foreground">Estimate</dt><dd className="font-medium">{a.estimate}h</dd></div>
          <div><dt className="text-muted-foreground">Actual</dt><dd className="font-medium">{a.actual ? `${a.actual}h` : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Progress</dt><dd className="font-medium">{a.progress}%</dd></div>
          <div><dt className="text-muted-foreground">Dependency</dt><dd className="font-medium">{a.dependsOn ? assignments.find((b) => b.id === a.dependsOn)?.title : "None"}</dd></div>
        </dl>
        <div className="mt-4"><PredictionNote>This assignment hasn't been analyzed in depth yet. Upload the brief to extract requirements and generate tasks — or open <Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a3" }} className="font-medium text-primary underline">Assignment 3</Link> to see a full analysis.</PredictionNote></div>
        <Button size="sm" className="mt-3" onClick={() => setUploadOpen(true)}><FileSearch className="h-3.5 w-3.5" /> Upload & Analyze</Button>
      </Panel>
    </>
  );
}

function RichAssignment() {
  const { addGeneratedTasks, tasksGenerated, log, openChat } = useStore();
  const navigate = useNavigate();
  const [openReq, setOpenReq] = useState<string | null>("R2");
  const [page, setPage] = useState(2);
  const [zoom, setZoom] = useState(100);
  const [running, setRunning] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState("Today, 09:42");
  const [estimates, setEstimates] = useState(generatedTasks.map((t) => t.estimate));
  const [editing, setEditing] = useState(false);
  const total = estimates.reduce((s, v) => s + v, 0);

  const selectReq = (id: string) => { setOpenReq(openReq === id ? null : id); setPage(requirements.find((r) => r.id === id)!.page); };
  const finish = useCallback(() => {
    setRunning(false);
    const d = new Date();
    setAnalyzedAt(`Today, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    log({ title: "Assignment 3 re-analyzed", detail: "6 requirements · 1 dependency · 8.5h", kind: "analysis", status: "success" });
    toast.success("Analysis complete", { description: "6 requirements · 1 dependency · 6 tasks" });
  }, [log]);

  return (
    <>
      <PageHeader title="Assignment 3 — JWT Authentication" subtitle="Software Engineering · SE 3204 · Due October 23, 2026" actions={<>
        <StatusBadge status="In Progress" />
        <Button size="sm" variant="outline" onClick={() => openChat("Assignment 3")}><Sparkles className="h-3.5 w-3.5 text-ai" /> Ask about this</Button>
        <Button size="sm" onClick={() => setRunning(true)}><FileSearch className="h-3.5 w-3.5" /> Analyze Assignment</Button>
      </>} />

      <div className="grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <div className="space-y-3">
          <Panel title="Assignment Overview">
            <p className="text-[13px] leading-relaxed text-muted-foreground">Extend the order-management REST service from Assignment 2 with stateless JWT authentication, protected endpoints and role-based authorization. Submit the repository link and a short README.</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t text-[12.5px] md:grid-cols-5 [&>div]:pt-3">
              <div><dt className="text-muted-foreground">Deadline</dt><dd className="font-medium">Oct 23, 23:59</dd></div>
              <div><dt className="text-muted-foreground">Difficulty</dt><dd className="font-medium">Medium–High</dd></div>
              <div><dt className="text-muted-foreground">Estimate</dt><dd className="font-medium">{total}h</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status="In Progress" /></dd></div>
              <div><dt className="text-muted-foreground">Related</dt><dd className="font-medium"><Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a2" }} className="hover:text-primary">Assignment 2</Link></dd></div>
            </dl>
          </Panel>

          <Panel title={<span className="flex items-center gap-1.5">AI-Extracted Requirements <span className="text-[11px] font-normal tabular-nums text-muted-foreground">6</span></span>} ai subtitle="Click a requirement to highlight its source in the document" bodyClass="p-0">
            {requirements.map((r) => (
              <div key={r.id} className={cn("border-b last:border-0", openReq === r.id && "bg-secondary/50")}>
                <button onClick={() => selectReq(r.id)} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-secondary/40">
                  {r.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-mono text-[11.5px] text-muted-foreground">{r.id}</span>
                  <span className="flex-1 text-[12.5px]">{r.text}</span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openReq === r.id && "rotate-180")} />
                </button>
                {openReq === r.id && (
                  <div className="space-y-2 px-3.5 pb-2.5 pl-[58px] animate-in fade-in slide-in-from-top-1">
                    <p className="text-[12.5px] text-muted-foreground">{r.detail}</p>
                    <SourceReference file="Assignment_3.pdf" page={r.page} onClick={() => setPage(r.page)} />
                  </div>
                )}
              </div>
            ))}
          </Panel>

          <Panel title="Assignment Dependencies" ai>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md border border-primary/40 bg-primary-soft px-3 py-2 text-[13px] font-medium">Assignment 3</div>
              <div className="flex items-center gap-1 text-[11px] font-semibold tracking-wider text-info"><Link2 className="h-3.5 w-3.5" /> EXTENDS <ArrowRight className="h-3.5 w-3.5" /></div>
              <Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a2" }} className="rounded-md border px-3 py-2 text-[13px] font-medium hover:border-primary/40">Assignment 2 — Database Integration</Link>
            </div>
            <p className="mt-3 text-[12.5px] text-muted-foreground">This assignment builds on the existing REST API and PostgreSQL integration implemented previously.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[["Reusable", "text-success", ["REST Controllers", "User Entity", "PostgreSQL Configuration"]], ["New", "text-primary", ["JWT Service", "Security Filters", "Authentication Endpoints"]], ["Modified", "text-warning", ["User Service", "Existing Tests"]]].map(([k, cls, items]) => (
                <div key={k as string} className="rounded-md border bg-card p-2.5">
                  <div className={cn("mb-1 text-[11.5px] font-semibold uppercase tracking-wide", cls as string)}>{k as string} components</div>
                  {(items as string[]).map((i) => <div key={i} className="font-mono text-[12px]">{i}</div>)}
                </div>
              ))}
            </div>
          </Panel>

          <Panel ai title="Task Breakdown" subtitle={`${generatedTasks.length} tasks · ${total}h total`} bodyClass="p-0" action={<div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setEditing(!editing)}><Pencil className="h-3 w-3" /> {editing ? "Done" : "Edit Estimates"}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => toast("Breakdown regenerated", { description: "Same 6 tasks — the brief hasn't changed." })}><RefreshCw className="h-3 w-3" /> Regenerate</Button>
            <Button size="sm" className="h-7 text-[12px]" onClick={() => { if (tasksGenerated) { void navigate({ to: "/kanban" }); return; } addGeneratedTasks(); toast.success("6 tasks added to Kanban", { action: { label: "Open", onClick: () => navigate({ to: "/kanban" }) } }); }}>{tasksGenerated ? "View on Kanban" : "Add All to Kanban"}</Button>
          </div>}>
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b bg-secondary/50 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground [&>th]:font-semibold"><th className="px-3.5 py-1.5 font-medium">#</th><th className="font-medium">Task</th><th className="font-medium">Priority</th><th className="font-medium">Req.</th><th className="px-4 text-right font-medium">Estimate</th></tr></thead>
              <tbody>{generatedTasks.map((t, i) => (
                <tr key={t.title} className="border-b last:border-0">
                  <td className="px-3.5 py-2 align-top font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-3"><div className="font-medium">{t.title}</div><div className="text-[11.5px] text-muted-foreground">{t.description}</div></td>
                  <td><PriorityIndicator priority={t.priority} /></td>
                  <td className="font-mono text-[11.5px]">{t.req}</td>
                  <td className="px-4 text-right tabular-nums">
                    {editing ? <input type="number" step="0.5" min="0" value={estimates[i]} onChange={(e) => setEstimates(estimates.map((v, j) => (j === i ? Number(e.target.value) : v)))} className="h-7 w-16 rounded border px-1.5 text-right" /> : `${estimates[i]}h`}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </Panel>

          <Panel ai title="Workload Estimation" subtitle="Simulated demonstration data">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <dl className="space-y-2 text-[13px]">
                {[["AI Estimate", `${total} hours`], ["Historical Student Median", "9.2 hours"], ["Sample Size", "14 students"], ["Estimated Range", "7–12 hours"]].map(([k, v]) => <div key={k} className="flex justify-between border-b pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}
              </dl>
              <SimpleBars data={historicalHours} x="range" y="students" height={150} />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" /> Historical estimates are based on voluntarily reported completion times from students who completed the same assignment version.</p>
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          <Panel title="Assignment_3.pdf" bodyClass="p-0" action={<div className="flex items-center gap-1 text-[11.5px]">
            <button className="rounded p-1 hover:bg-secondary" onClick={() => setZoom(Math.max(70, zoom - 10))}><Minus className="h-3 w-3" /></button>
            <span className="w-9 text-center tabular-nums">{zoom}%</span>
            <button className="rounded p-1 hover:bg-secondary" onClick={() => setZoom(Math.min(140, zoom + 10))}><Plus className="h-3 w-3" /></button>
          </div>}>
            <div className="flex gap-2 border-b px-3 py-2">
              {[1, 2, 3, 4].map((p) => <button key={p} onClick={() => setPage(p)} className={cn("h-10 w-8 rounded border text-[10px]", page === p ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:border-primary/40")}>{p}</button>)}
              <span className="ml-auto self-center text-[11px] text-muted-foreground">Page {page} / 4</span>
            </div>
            <div className="h-[420px] overflow-auto bg-secondary p-4">
              <DocPage page={page} zoom={zoom} highlight={openReq} />
            </div>
          </Panel>
          <Panel title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-ai" /> AI Analysis</span>}>
            {running ? <AnalysisProgress running onDone={finish} /> : (
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex items-center gap-1.5 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Document processed successfully</div>
                {[["Requirements extracted", "6"], ["Related assignments detected", "1"], ["Estimated difficulty", "Medium–High"], ["Last analyzed", analyzedAt]].map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function DocPage({ page, zoom, highlight }: { page: number; zoom: number; highlight: string | null }) {
  const reqsOnPage = requirements.filter((r) => r.page === page);
  const H = ({ id, children }: { id: string; children: React.ReactNode }) => <span className={cn("transition-all", highlight === id && "doc-highlight")}>{children}</span>;
  return (
    <div className="mx-auto origin-top bg-card p-6 font-serif text-[11px] leading-relaxed text-foreground shadow-sm" style={{ width: 300 * (zoom / 100), fontSize: 11 * (zoom / 100) }}>
      <div className="mb-3 border-b pb-2 font-sans text-[0.9em] text-muted-foreground">SE 3204 · Software Engineering · Fall 2026</div>
      {page === 1 && <>
        <h3 className="mb-2 font-sans text-[1.4em] font-bold">Assignment 3: Authentication</h3>
        <p>Due: 23 October 2026, 23:59. Weight: 15% of the final grade.</p>
        <p className="mt-2">This assignment continues the order-management service you developed in Assignments 1 and 2. You will secure the application using stateless token authentication.</p>
        <p className="mt-2">Work individually. Plagiarism checks will be applied to all repositories.</p>
      </>}
      {page > 1 && <h4 className="mb-2 font-sans font-semibold">{page === 4 ? "4. Deliverables" : `${page}. Requirements (cont.)`}</h4>}
      {reqsOnPage.map((r) => (
        <p key={r.id} className="mt-2"><b className="font-sans">{r.id}.</b> <H id={r.id}>{r.text} {r.detail}</H></p>
      ))}
      {page === 4 && <p className="mt-2">Submit the repository URL on Moodle. Include a README with setup steps and the authentication flow.</p>}
      <p className="mt-3 text-muted-foreground">— {page} —</p>
    </div>
  );
}
