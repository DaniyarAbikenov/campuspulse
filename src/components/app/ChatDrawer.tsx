import { localize, useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, FileText } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useStore } from "@/lib/store";
import { generatedTasks, workloadTotals, adminCourses } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sendAgentMessage, type AgentStep } from "@/lib/api";

interface Msg { role: "user" | "ai"; text: string; sources?: string[]; list?: string[]; steps?: AgentStep[]; error?: boolean }

const stepLabel = (step: AgentStep) =>
  step.kind === "tool_call" ? `→ ${step.name}(${step.detail})` : step.kind === "tool_result" ? `← ${step.name}: ${step.detail}` : `… ${step.detail}`;

const contextFor = (path: string) => {
  if (path.startsWith("/assignments")) return "Assignment 3 — JWT Authentication";
  if (path.startsWith("/kanban")) return "Kanban Board";
  if (path.startsWith("/courses/se")) return "Software Engineering";
  if (path.startsWith("/courses")) return "Courses";
  if (path.startsWith("/schedule")) return "Week 43 schedule";
  if (path.startsWith("/workload")) return "Workload forecast";
  return "Overview · Week 43";
};

function answer(q: string, tasksGenerated: boolean): Msg {
  const l = q.toLowerCase();
  if (l.includes("why") && l.includes("task")) {
    return {
      role: "ai",
      text: `I split Assignment 3 into ${generatedTasks.length} tasks because the PDF contains 6 distinct requirements (R1–R6). Each task maps to one requirement, and estimates come from your Assignment 2 pace (+14% vs. plan) and the class median of 9.2h.`,
      list: generatedTasks.map((t) => `${t.title} — ${t.estimate}h · ${t.req}`),
      sources: ["Assignment_3.pdf p.2–4", "Assignment_2 actual hours", tasksGenerated ? "Kanban board" : "Draft breakdown"],
    };
  }
  if (l.includes("overload") || l.includes("week") || l.includes("workload")) {
    return { role: "ai", text: `Week 43 needs ${workloadTotals.required}h of work with ${workloadTotals.available}h of study capacity. Wednesday and Thursday exceed daily capacity. Moving 2h to Monday redistributes work, but the weekly capacity gap remains ${workloadTotals.required - workloadTotals.available}h.`, sources: ["Timetable Week 43", "Assignment estimates"] };
  }
  if (l.includes("first") || l.includes("next") || l.includes("start")) {
    return { role: "ai", text: "Start with Advanced Databases Assignment 4 — it's due first (Oct 22) and has no progress yet. Then continue JWT token generation for SE Assignment 3 during Monday's free slot.", sources: ["Deadlines", "Kanban board"] };
  }
  if (l.includes("midterm") || l.includes("database")) {
    return { role: "ai", text: "The Advanced Databases midterm (Oct 30) covers Lectures 4–8. I suggest three 90-minute sessions: query optimisation, indexing, and aggregation pipelines.", sources: ["Lecture 4–8 slides", "Syllabus"] };
  }
  return { role: "ai", text: `Based on your current workspace: 3 deadlines through Oct 25, ${workloadTotals.required}h estimated work and ${workloadTotals.available}h available. I can explain a recommendation, plan a study session, or summarise a course.`, sources: ["Workspace snapshot"] };
}

const prompts = ["Why did you create these tasks?", "Why is this week overloaded?", "What should I work on first?", "Summarise the Databases midterm"];

export function ChatDrawer() {
  const { locale } = useI18n();
  const { chatOpen, setChatOpen, tasksGenerated, role, tasks, workload, agentEnabled } = useStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, typing]);
  const useAgent = agentEnabled && role === "student";

  const send = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTyping(true);
    if (useAgent) {
      sendAgentMessage(q, sessionId)
        .then((reply) => {
          setSessionId(reply.sessionId);
          setMsgs((m) => [...m, { role: "ai", text: reply.reply || "The agent returned no answer.", steps: reply.steps }]);
        })
        .catch(() => setMsgs((m) => [...m, { role: "ai", text: "The agent is unavailable right now. Try again in a moment.", error: true }]))
        .finally(() => setTyping(false));
      return;
    }
    setTimeout(() => { setMsgs((m) => [...m, role === "admin" ? { role: "ai", text: `Faculty demo: ${adminCourses.length} courses tracked in this view. Advanced Databases has the highest course overload risk at 22%. These are anonymised cohort aggregates, not individual student records.`, sources: ["Faculty course aggregates"] } : q.toLowerCase().match(/workload|overload|week/) ? { role: "ai", text: `Week 43: ${workload.required}h required, ${workload.available}h capacity, ${workload.scheduled}h scheduled and ${workload.unscheduled}h not yet scheduled.`, sources: ["Live workspace"] } : answer(q, tasksGenerated)]); setTyping(false); }, 900);
  };

  return (
    <Sheet open={chatOpen} onOpenChange={setChatOpen}>
      <SheetContent side="right" className="flex w-[420px] flex-col gap-0 p-0 sm:max-w-[420px] [&>button]:hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ai-soft"><Sparkles className="h-4 w-4 text-ai" /></div>
          <div className="flex-1">
            <SheetTitle className="text-[14px]">{localize("CampusPulse Assistant", locale)}</SheetTitle><SheetDescription className="sr-only">{localize(useAgent ? "AI academic assistant" : "Simulated academic assistant", locale)}</SheetDescription>
            <p className="text-[11.5px] text-muted-foreground">{localize("Context:", locale)} {localize(role === "admin" ? "Faculty of Computing" : contextFor(path), locale)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label={localize("Close assistant", locale)} onClick={() => setChatOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {localize(msgs.length === 0 && (
            <div className="rounded-lg border bg-secondary/50 p-3 text-[12.5px] text-muted-foreground">
              {localize(useAgent ? "I can read your assignments, workload, free time, campus events, indexed materials and Moodle. I cannot submit work or change grades." : "I have access to your courses, assignments, schedule and generated tasks. Responses in this prototype are simulated from demo data.", locale)}
            </div>
          ), locale)}
          {localize(msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[90%] text-[13px]", m.role === "user" ? "ml-auto rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "")}>
              {localize(m.role === "ai" ? (
                <div className="rounded-lg border bg-card p-3">
                  {m.steps?.length ? (
                    <details className="mb-2 rounded border bg-secondary/40 px-2 py-1 text-[11.5px] text-muted-foreground">
                      <summary className="cursor-pointer">{localize("Reasoning", locale)} · {m.steps.filter((s) => s.kind === "tool_call").length} {localize("tool calls", locale)}</summary>
                      <ol className="mt-1 space-y-0.5 font-mono text-[10.5px]">
                        {m.steps.map((s, n) => <li key={n} className="break-words">{stepLabel(s)}</li>)}
                      </ol>
                    </details>
                  ) : null}
                  <p className={cn("leading-relaxed", m.error && "text-destructive")}>{localize(m.text, locale)}</p>
                  {localize(m.list && <ol className="mt-2 space-y-1 border-l-2 border-ai/30 pl-3 text-[12px] text-muted-foreground">{localize(m.list.map((l) => <li key={l}>{localize(l, locale)}</li>), locale)}</ol>, locale)}
                  {localize(m.sources && <div className="mt-2 flex flex-wrap gap-1">{localize(m.sources.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground"><FileText className="h-3 w-3" />{localize(s, locale)}</span>), locale)}</div>, locale)}
                </div>
              ) : m.text, locale)}
            </div>
          )), locale)}
          {localize(typing && <div className="flex gap-1 px-1">{localize([0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 120}ms` }} />), locale)}</div>, locale)}
          <div ref={end} />
        </div>
        <div className="border-t p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {localize(prompts.map((p) => <Button variant="outline" size="sm" key={p} onClick={() => send(p)} className="rounded-md border px-2 py-1 text-[11.5px] text-muted-foreground hover:border-primary/40 hover:text-primary">{localize(p, locale)}</Button>), locale)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 rounded-md border px-2 focus-within:border-primary/50">
            <input aria-label={localize("Message CampusPulse", locale)} value={input} onChange={(e) => setInput(e.target.value)} placeholder={localize("Ask about your workspace…", locale)} className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
            <Button variant="ghost" size="icon" aria-label={localize("Send message", locale)} type="submit" className="rounded p-1 text-primary hover:bg-primary-soft"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
