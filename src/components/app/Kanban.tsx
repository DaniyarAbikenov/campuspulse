import { localize, useI18n } from "@/lib/i18n";
import { useState } from "react";
import { Clock, Sparkles, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { type Task } from "@/lib/data";
import { cn } from "@/lib/utils";
import { CourseTag, PriorityIndicator } from "./common";

export const columns: { id: Task["column"]; label: string }[] = [
  { id: "backlog", label: "Backlog" }, { id: "todo", label: "To Do" }, { id: "progress", label: "In Progress" }, { id: "review", label: "Review" }, { id: "done", label: "Completed" },
];

const dot: Record<Task["column"], string> = { backlog: "bg-muted-foreground/40", todo: "bg-muted-foreground", progress: "bg-info", review: "bg-warning", done: "bg-success" };

export function KanbanBoard({ courseId, filter }: { courseId?: string | undefined; filter?: ((t: Task) => boolean) | undefined }) {
  const { locale } = useI18n();
  const { tasks, moveTask, assignments } = useStore();
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<Task | null>(null);
  // On phones one column is shown at a time, chosen with tabs.
  const [mobileColumn, setMobileColumn] = useState<Task["column"]>("todo");
  const list = tasks.filter((t) => (!courseId || t.courseId === courseId) && (!filter || filter(t)));

  return (
    <>
      <div role="tablist" aria-label={localize("Board columns", locale)} className="mb-2 flex gap-1 overflow-x-auto md:hidden">
        {columns.map((col) => {
          const count = list.filter((t) => t.column === col.id).length;
          return (
            <Button key={col.id} role="tab" aria-selected={mobileColumn === col.id} variant="ghost" size="sm" onClick={() => setMobileColumn(col.id)} className={cn("shrink-0 rounded-md border px-2.5 text-[12.5px]", mobileColumn === col.id ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground")}>
              {localize(col.label, locale)} <span className="ml-1 tabular-nums">{count}</span>
            </Button>
          );
        })}
      </div>
      <div className="max-w-full md:overflow-x-auto"><div className="grid grid-cols-1 gap-2.5 md:min-w-[1000px] md:grid-cols-5">
        {localize(columns.map((col) => {
  
          const items = list.filter((t) => t.column === col.id);
          const hours = items.reduce((s, t) => s + t.estimate, 0);
          return (
            <div key={col.id}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); moveTask(id, col.id); setOver(null); toast.success(localize(`Moved to ${col.label}`, locale)); }}
              className={cn("flex min-h-[420px] flex-col rounded-lg bg-secondary/70 p-1.5 transition-colors ring-1 ring-transparent", col.id !== mobileColumn && "hidden md:flex", over === col.id && "bg-primary-soft ring-primary/40")}
            >
              <div className="mb-1.5 flex h-7 items-center gap-1.5 px-1.5 text-[12px] font-semibold">
                <span className={cn("h-2 w-2 rounded-full", dot[col.id])} />{localize(col.label, locale)}<span className="text-[11px] font-normal tabular-nums text-muted-foreground">{localize(items.length, locale)}</span>
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{localize(hours, locale)}{localize("h", locale)}</span>
              </div>
              <div className="space-y-1.5">
                {localize(items.map((t) => (
                  <div key={t.id} role="button" tabIndex={0} aria-label={localize(`Open task: ${t.title}`, locale)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(t); } }} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)} onClick={() => setOpen(t)}
                    className={cn("cursor-grab rounded-md border bg-card px-2.5 py-2 shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_5%,transparent)] transition-all hover:border-foreground/20 active:cursor-grabbing animate-in fade-in", t.ai && "border-l-2 border-l-ai", t.column === "done" && "bg-secondary")}>
                    <div className="flex items-start gap-1.5">
                      <p className={cn("flex-1 text-[12.5px] font-medium leading-snug", t.column === "done" && "line-through decoration-muted-foreground/50")}>{localize(t.title, locale)}</p>
                      {localize(t.ai && <Sparkles className="h-3 w-3 shrink-0 text-ai" />, locale)}
                    </div>
                    <div className="mt-1 flex items-center gap-2"><CourseTag id={t.courseId} />{localize(t.req && <span className="font-mono text-[10.5px] text-muted-foreground">{localize(t.req, locale)}</span>, locale)}</div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <PriorityIndicator priority={t.priority} />
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{localize(t.estimate, locale)}{localize("h ·", locale)} {localize(t.due, locale)}</span>
                    </div>
                  </div>
                )), locale)}
                {localize(items.length === 0 && <div className="rounded-md border border-dashed px-2 py-6 text-center text-[11.5px] text-muted-foreground">{localize("Drop tasks here", locale)}</div>, locale)}
              </div>
            </div>
          );
        }), locale)}
      </div>
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          {localize(open && (
            <>
              <SheetHeader>
                <SheetTitle className="text-[16px] leading-snug">{localize(open.title, locale)}</SheetTitle>
                <SheetDescription>{localize(open.ai ? "Generated by CampusPulse from the assignment brief" : "Created manually", locale)}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 text-[13px]">
                <p className="text-muted-foreground">{localize(open.description, locale)}</p>
                <dl className="grid grid-cols-[110px_1fr] gap-y-2.5">
                  <dt className="text-muted-foreground">{localize("Course", locale)}</dt><dd><CourseTag id={open.courseId} /></dd>
                  <dt className="text-muted-foreground">{localize("Assignment", locale)}</dt><dd>{localize(assignments.find((a) => a.id === open.assignmentId)?.title ?? "—", locale)}</dd>
                  <dt className="text-muted-foreground">{localize("Estimate", locale)}</dt><dd>{localize(open.estimate, locale)}{localize("h", locale)}</dd>
                  <dt className="text-muted-foreground">{localize("Due", locale)}</dt><dd>{localize(open.due, locale)}</dd>
                  <dt className="text-muted-foreground">{localize("Priority", locale)}</dt><dd><PriorityIndicator priority={open.priority} /></dd>
                  {localize(open.req && <><dt className="text-muted-foreground">{localize("Requirement", locale)}</dt><dd className="font-mono text-[12px]">{localize(open.req, locale)} {localize("· Assignment_3.pdf", locale)}</dd></>, locale)}
                  <dt className="text-muted-foreground">{localize("Status", locale)}</dt>
                  <dd>
                    <Select value={tasksColumn(open)} onValueChange={(v) => { moveTask(open.id, v as Task["column"]); setOpen({ ...open, column: v as Task["column"] }); }}>
                      <SelectTrigger aria-label={localize("Task status", locale)} className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{localize(columns.map((c) => <SelectItem key={c.id} value={c.id}>{localize(c.label, locale)}</SelectItem>), locale)}</SelectContent>
                    </Select>
                  </dd>
                </dl>
                <Button size="sm" className="w-full" onClick={() => { moveTask(open.id, "done"); setOpen(null); toast.success(localize("Task completed", locale)); }}>{localize("Mark as Completed", locale)}</Button>
              </div>
            </>
          ), locale)}
        </SheetContent>
      </Sheet>
    </>
  );
}
const tasksColumn = (t: Task) => t.column;

export function NewTaskButton() {
  const { locale } = useI18n();
  const { addTask, backendConnected, courses, assignments } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [estimate, setEstimate] = useState("1");
  const [priority, setPriority] = useState<Task["priority"]>("Medium");
  const openAssignments = assignments.filter((item) => item.status !== "Completed");

  const reset = () => { setTitle(""); setDescription(""); setAssignmentId(""); setEstimate("1"); setPriority("Medium"); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const assignment = assignments.find((item) => item.id === assignmentId);
    const hours = Number(estimate);
    if (!assignment || !title.trim() || !Number.isFinite(hours) || hours < 0) return;
    await addTask({ title: title.trim(), description: description.trim(), courseId: assignment.courseId, assignmentId: assignment.id, estimate: hours, priority, due: assignment.deadline, column: "backlog" });
    toast(localize("Task added to Backlog", locale));
    reset();
    setOpen(false);
  };

  // The offline demo keeps its one-click placeholder; a live workspace asks for real details.
  if (!backendConnected)
    return <Button size="sm" variant="outline" onClick={() => { void addTask({ title: "New task", description: "Describe the work.", courseId: courses[0]?.id ?? "se", estimate: 1, priority: "Low", due: "Oct 25", column: "backlog" }); toast(localize("Task added to Backlog", locale)); }}><Plus className="h-3.5 w-3.5" /> {localize("New Task", locale)}</Button>;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> {localize("New Task", locale)}</Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[16px]">{localize("New task", locale)}</DialogTitle><DialogDescription className="text-[12.5px]">{localize("Tasks belong to an assignment so their hours count toward its workload.", locale)}</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="task-title" className="text-[12px]">{localize("Title", locale)}</Label><Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} required /></div>
            <div className="space-y-1.5"><Label htmlFor="task-description" className="text-[12px]">{localize("Description", locale)}</Label><Input id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="task-assignment" className="text-[12px]">{localize("Assignment", locale)}</Label>
              <select id="task-assignment" className="w-full rounded-md border bg-background px-2 py-2 text-[13px]" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} required>
                <option value="">{localize("Choose…", locale)}</option>
                {openAssignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="task-estimate" className="text-[12px]">{localize("Estimate (h)", locale)}</Label><Input id="task-estimate" type="number" min={0} step={0.25} value={estimate} onChange={(event) => setEstimate(event.target.value)} required /></div>
              <div className="space-y-1.5">
                <Label htmlFor="task-priority" className="text-[12px]">{localize("Priority", locale)}</Label>
                <select id="task-priority" className="w-full rounded-md border bg-background px-2 py-2 text-[13px]" value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])}>
                  {(["High", "Medium", "Low"] as const).map((value) => <option key={value} value={value}>{localize(value, locale)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>{localize("Cancel", locale)}</Button><Button type="submit" size="sm" disabled={!assignmentId || !title.trim()}>{localize("Add task", locale)}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
