import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/common";
import { KanbanBoard, NewTaskButton } from "@/components/app/Kanban";
import { useStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { taskMatchesDate } from "@/lib/data";

export const Route = createFileRoute("/kanban")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Kanban Board — CampusPulse AI" }, { name: "description", content: "Drag academic tasks across stages, including AI-generated tasks." },
    { property: "og:title", content: "Kanban Board — CampusPulse AI" }, { property: "og:description", content: "Drag academic tasks across stages, including AI-generated tasks." },
  ] }),
  component: Kanban,
});

function Kanban() {
  const { locale } = useI18n();
  const { backendConnected, tasks, addGeneratedTasks, tasksGenerated, proposalApproved, approveProposal, proposalTasks, courses, assignments, scheduleGeneratedTasks, generatedScheduled } = useStore();
  const [course, setCourse] = useState("all");
  const [assignment, setAssignment] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [due, setDue] = useState("all");
  const [query, setQuery] = useState("");
  const filter = (task: (typeof tasks)[number]) => (assignment === "all" || task.assignmentId === assignment)
    && (priority === "all" || task.priority === priority) && (status === "all" || task.column === status)
    && (source === "all" || (source === "ai" ? !!task.ai : !task.ai))
    && taskMatchesDate(task, due)
    && (task.title + task.description + (task.req ?? "")).toLowerCase().includes(query.toLowerCase());
  const visible = tasks.filter((task) => (course === "all" || task.courseId === course) && filter(task));
  const total = visible.filter((task) => task.column !== "done").reduce((sum, task) => sum + task.estimate, 0);
  const selector = (label: string, value: string, change: (value: string) => void, options: { value: string; label: string }[]) => (
    <Select value={value} onValueChange={change}><SelectTrigger aria-label={localize(label, locale)} className="w-full text-[12px]"><SelectValue /></SelectTrigger><SelectContent>{localize(options.map((option) => <SelectItem key={option.value} value={option.value}>{localize(option.label, locale)}</SelectItem>), locale)}</SelectContent></Select>
  );
  return (
    <>
      <PageHeader title={localize("Kanban Board", locale)} subtitle={localize(`${visible.length} of ${tasks.length} tasks · ${total}h filtered open work`, locale)} actions={<NewTaskButton />} />
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Input aria-label={localize("Search tasks", locale)} placeholder={localize("Search tasks or requirement", locale)} value={query} onChange={(e) => setQuery(e.target.value)} />
        {localize(selector("Course filter", course, setCourse, [{ value: "all", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: c.name }))]), locale)}
        {localize(selector("Assignment filter", assignment, setAssignment, [{ value: "all", label: "All assignments" }, ...assignments.filter((a) => course === "all" || a.courseId === course).map((a) => ({ value: a.id, label: a.title }))]), locale)}
        {localize(selector("Priority filter", priority, setPriority, ["all", "High", "Medium", "Low"].map((value) => ({ value, label: value === "all" ? "All priorities" : value }))), locale)}
        {localize(selector("Status filter", status, setStatus, [{ value: "all", label: "All stages" }, ...["backlog", "todo", "progress", "review", "done"].map((value) => ({ value, label: value }))]), locale)}
        {localize(selector("Source filter", source, setSource, [{ value: "all", label: "All sources" }, { value: "ai", label: "AI-generated" }, { value: "manual", label: "Manual" }]), locale)}
        {localize(selector("Due date filter", due, setDue, [{ value: "all", label: "All dates" }, { value: "week", label: "This week" }, { value: "overdue", label: "Overdue" }]), locale)}
        <Button variant="ghost" onClick={() => { setQuery(""); setCourse("all"); setAssignment("all"); setPriority("all"); setStatus("all"); setSource("all"); setDue("all"); }}>{localize("Clear filters", locale)}</Button>
      </div>
      {backendConnected ? null : localize(!tasksGenerated ? <section className="mb-3 border-l-2 border-ai bg-ai-soft p-3" aria-live="polite">
        <h2 className="text-[13px] font-semibold">{localize(proposalApproved ? "Approved, not imported" : "Generated, not imported", locale)}</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">{localize(proposalTasks.length, locale)} {localize("Assignment 3 proposals ·", locale)} {localize(proposalTasks.reduce((sum, task) => sum + task.estimate, 0), locale)}{localize("h. No board tasks or calendar sessions exist for these proposals yet.", locale)}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link to="/assignments/$assignmentId" params={{ assignmentId: "se-a3" }}>{localize("Review proposals", locale)}</Link></Button><Button size="sm" onClick={() => { if (!proposalApproved) approveProposal(); else { addGeneratedTasks(); toast.success(localize("Approved tasks imported", locale)); } }}>{localize(proposalApproved ? "Import approved tasks" : "Approve task plan", locale)}</Button></div>
      </section> : <div className="mb-3 flex flex-wrap items-center gap-3 border-b pb-3" aria-live="polite"><span>{localize(generatedScheduled ? "Assignment 3 sessions scheduled" : "Imported to Kanban · not scheduled", locale)}</span><Button size="sm" disabled={generatedScheduled} onClick={() => { const ok = scheduleGeneratedTasks(); if (ok) toast.success(localize("6 study sessions scheduled; workload updated", locale)); else toast.error(localize("The proposed times overlap existing sessions or edited estimates. Plan sessions individually in My Schedule.", locale)); }}>{localize("Schedule approved tasks", locale)}</Button><Button asChild size="sm" variant="outline"><Link to="/schedule">{localize("View schedule", locale)}</Link></Button><Button asChild size="sm" variant="outline"><Link to="/workload">{localize("View workload", locale)}</Link></Button></div>, locale)}
      <KanbanBoard courseId={course === "all" ? undefined : course} filter={filter} />
    </>
  );
}
