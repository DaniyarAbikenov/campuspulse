import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageHeader, Panel, PredictionNote } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { formatHour, type FreeSlot } from "@/lib/data";
import { WeekSwitcher } from "@/components/app/WeekSwitcher";
import { dayLabels, daysBetween, weekTitle } from "@/lib/week";
import { intlLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "My Schedule — CampusPulse AI" }, { name: "description", content: "Weekly timetable with free study slots and planned sessions." },
    { property: "og:title", content: "My Schedule — CampusPulse AI" }, { property: "og:description", content: "Weekly timetable with free study slots and planned sessions." },
  ] }),
  component: Schedule,
});

const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
const H = 44;
const kindCls = { lecture: "border-border bg-card", study: "border-primary/30 bg-primary-soft text-primary", event: "border-info/30 bg-info-soft text-info", free: "" };

function Schedule() {
  const { locale } = useI18n();
  const { events, addEvent, log, tasks, workload, freeSlots, weekStart, today } = useStore();
  const days = dayLabels(weekStart, intlLocale(locale));
  const todayIndex = daysBetween(weekStart, today);
  const [slot, setSlot] = useState<FreeSlot | null>(null);
  const [task, setTask] = useState("");
  const taken = (s: FreeSlot) => events.some((e) => e.day === s.day && e.start < s.end && e.end > s.start);

  const rank = { High: 0, Medium: 1, Low: 2 } as const;
  const scheduled = new Set(events.flatMap((e) => (e.taskId ? [e.taskId] : [])));
  const nextTask = tasks.filter((t) => t.column !== "done" && !scheduled.has(t.id)).sort((x, y) => rank[x.priority] - rank[y.priority])[0];
  const nextSlot = nextTask ? freeSlots.find((s) => !taken(s) && s.end - s.start >= Math.min(nextTask.estimate, 1)) : undefined;
  const suggestion = nextTask && nextSlot ? { task: nextTask, slot: nextSlot } : null;

  const plan = () => {
    if (!slot) return;
    const selected = tasks.find((item) => item.id === task);
    if (!selected) return;
    addEvent({ day: slot.day, start: slot.start, end: Math.min(slot.end, slot.start + selected.estimate), title: `Study: ${selected.title}`, kind: "study", courseId: selected.courseId, taskId: selected.id });
    log({ title: "Study session planned", detail: `${slot.label} · ${task}`, kind: "schedule", status: "success" });
    toast.success(localize("Study session added", locale), { description: localize(slot.label, locale) });
    setSlot(null);
  };

  return (
    <>
      <PageHeader title={localize("My Schedule", locale)} subtitle={weekTitle(weekStart, intlLocale(locale), localize("Week", locale))} actions={<><WeekSwitcher /><Button size="sm" onClick={() => setSlot(freeSlots.find((s) => !taken(s)) ?? null)}><Plus className="h-3.5 w-3.5" /> {localize("Plan Study Session", locale)}</Button></>} />
      <p className="mb-3 text-[13px]" aria-live="polite">{localize(workload.scheduled, locale)}{localize("h study scheduled ·", locale)} {localize(workload.unscheduled, locale)}{localize("h not yet scheduled", locale)}</p>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="panel overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
            <div className="border-b" />
            {localize(days.map((d, i) => <div key={d} className={cn("border-b border-l px-2 py-2 text-[12px] font-medium", i === todayIndex && "text-primary")}>{localize(d, locale)}</div>), locale)}
            <div className="relative">{localize(hours.map((h) => <div key={h} style={{ height: H }} className="pr-2 pt-0.5 text-right font-mono text-[10.5px] text-muted-foreground">{localize(h, locale)}{localize(":00", locale)}</div>), locale)}</div>
            {localize(days.map((_, di) => (
              <div key={di} className="relative border-l" style={{ height: H * hours.length }}>
                {localize(hours.map((h) => <div key={h} style={{ height: H }} className="border-b border-dashed border-border/70" />), locale)}
                {localize(freeSlots.filter((s) => s.day === di && !taken(s)).map((s) => (
                  <Button variant="ghost" aria-label={localize(`Plan study session ${s.label}`, locale)} key={s.id} onClick={() => setSlot(s)} style={{ top: (s.start - 8) * H, height: (s.end - s.start) * H }}
                    className="absolute inset-x-1 flex-col items-start whitespace-normal rounded-md border border-dashed border-success/50 bg-success-soft/70 p-1.5 text-left text-[11px] text-success hover:bg-success-soft">
                    <div className="font-medium">{localize("Free slot", locale)}</div><div>{localize("+ Plan session", locale)}</div>
                  </Button>
                )), locale)}
                {localize(events.filter((e) => e.day === di).map((e) => (
                  <div key={e.id} style={{ top: (e.start - 8) * H + 1, height: (e.end - e.start) * H - 2 }} className={cn("absolute inset-x-1 overflow-hidden rounded-md border p-1.5 text-[11px] animate-in fade-in", kindCls[e.kind])}>
                    <div className="font-medium leading-tight">{localize(e.title, locale)}</div>
                    <div className="font-mono text-[10px]">{localize(formatHour(e.start), locale)}{localize("–", locale)}{localize(formatHour(e.end), locale)}</div>
                  </div>
                )), locale)}
              </div>
            )), locale)}
          </div>
        </div>
        <div className="space-y-4">
          <Panel title={localize("Free time this week", locale)}>
            {localize(freeSlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b py-2 text-[12.5px] last:border-0">
                <span>{localize(s.label, locale)}</span>
                {localize(taken(s) ? <span className="text-[11.5px] text-primary">{localize("Planned", locale)}</span> : <Button size="sm" variant="ghost" className="h-6 text-[11.5px]" onClick={() => setSlot(s)}>{localize("Plan", locale)}</Button>, locale)}
              </div>
            )), locale)}
          </Panel>
          {suggestion ? (
            <Panel title={localize(<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-ai" /> {localize("Suggestion", locale)}</span>, locale)}>
              <PredictionNote>{localize("Use", locale)} <b>{localize(suggestion.slot.label, locale)}</b> {localize("for", locale)} {suggestion.task.title} ({suggestion.task.estimate}{localize("h", locale)}). {localize("Highest-priority task that is not scheduled yet, in the earliest free window (rule-based).", locale)}</PredictionNote>
            </Panel>
          ) : null}
        </div>
      </div>

      <Dialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[16px]">{localize("Plan study session", locale)}</DialogTitle><DialogDescription>{localize(slot?.label, locale)}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="schedule-task" className="text-[12px]">{localize("Work on", locale)}</Label>
            <Select value={task} onValueChange={setTask}><SelectTrigger id="schedule-task"><SelectValue placeholder={localize("Choose an imported task", locale)} /></SelectTrigger>
              <SelectContent>{localize(tasks.filter((t) => t.column !== "done").map((t) => <SelectItem key={t.id} value={t.id}>{localize(t.title, locale)}</SelectItem>), locale)}</SelectContent></Select>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSlot(null)}>{localize("Cancel", locale)}</Button><Button size="sm" disabled={!task} onClick={plan}>{localize("Add to calendar", locale)}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
