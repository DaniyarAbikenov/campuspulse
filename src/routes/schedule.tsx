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
import { freeSlots, formatHour } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "My Schedule — CampusPulse AI" }, { name: "description", content: "Weekly timetable with free study slots and planned sessions." },
    { property: "og:title", content: "My Schedule — CampusPulse AI" }, { property: "og:description", content: "Weekly timetable with free study slots and planned sessions." },
  ] }),
  component: Schedule,
});

const days = ["Mon 19", "Tue 20", "Wed 21", "Thu 22", "Fri 23", "Sat 24", "Sun 25"];
const hours = Array.from({ length: 12 }, (_, i) => 8 + i);
const H = 44;
const kindCls = { lecture: "border-border bg-card", study: "border-primary/30 bg-primary-soft text-primary", event: "border-info/30 bg-info-soft text-info", free: "" };

function Schedule() {
  useI18n();
  const { events, addEvent, log, tasks, workload } = useStore();
  const [slot, setSlot] = useState<(typeof freeSlots)[number] | null>(null);
  const [task, setTask] = useState("");
  const taken = (s: (typeof freeSlots)[number]) => events.some((e) => e.day === s.day && e.start < s.end && e.end > s.start);

  const plan = () => {
    if (!slot) return;
    const selected = tasks.find((item) => item.id === task);
    if (!selected) return;
    addEvent({ day: slot.day, start: slot.start, end: Math.min(slot.end, slot.start + selected.estimate), title: `Study: ${selected.title}`, kind: "study", courseId: selected.courseId, taskId: selected.id });
    log({ title: "Study session planned", detail: `${slot.label} · ${task}`, kind: "schedule", status: "success" });
    toast.success(localize("Study session added"), { description: localize(slot.label) });
    setSlot(null);
  };

  return (
    <>
      <PageHeader title={localize("My Schedule")} subtitle={localize("Week 43 · October 19 – 25, 2026")} actions={<Button size="sm" onClick={() => setSlot(freeSlots.find((s) => !taken(s)) ?? null)}><Plus className="h-3.5 w-3.5" /> {localize("Plan Study Session")}</Button>} />
      <p className="mb-3 text-[13px]" aria-live="polite">{localize(workload.scheduled)}{localize("h study scheduled ·")} {localize(workload.unscheduled)}{localize("h not yet scheduled")}</p>
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="panel overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
            <div className="border-b" />
            {localize(days.map((d, i) => <div key={d} className={cn("border-b border-l px-2 py-2 text-[12px] font-medium", i === 0 && "text-primary")}>{localize(d)}</div>))}
            <div className="relative">{localize(hours.map((h) => <div key={h} style={{ height: H }} className="pr-2 pt-0.5 text-right font-mono text-[10.5px] text-muted-foreground">{localize(h)}{localize(":00")}</div>))}</div>
            {localize(days.map((_, di) => (
              <div key={di} className="relative border-l" style={{ height: H * hours.length }}>
                {localize(hours.map((h) => <div key={h} style={{ height: H }} className="border-b border-dashed border-border/70" />))}
                {localize(freeSlots.filter((s) => s.day === di && !taken(s)).map((s) => (
                  <Button variant="ghost" aria-label={localize(`Plan study session ${s.label}`)} key={s.id} onClick={() => setSlot(s)} style={{ top: (s.start - 8) * H, height: (s.end - s.start) * H }}
                    className="absolute inset-x-1 flex-col items-start whitespace-normal rounded-md border border-dashed border-success/50 bg-success-soft/70 p-1.5 text-left text-[11px] text-success hover:bg-success-soft">
                    <div className="font-medium">{localize("Free slot")}</div><div>{localize("+ Plan session")}</div>
                  </Button>
                )))}
                {localize(events.filter((e) => e.day === di).map((e) => (
                  <div key={e.id} style={{ top: (e.start - 8) * H + 1, height: (e.end - e.start) * H - 2 }} className={cn("absolute inset-x-1 overflow-hidden rounded-md border p-1.5 text-[11px] animate-in fade-in", kindCls[e.kind])}>
                    <div className="font-medium leading-tight">{localize(e.title)}</div>
                    <div className="font-mono text-[10px]">{localize(formatHour(e.start))}{localize("–")}{localize(formatHour(e.end))}</div>
                  </div>
                )))}
              </div>
            )))}
          </div>
        </div>
        <div className="space-y-4">
          <Panel title={localize("Free time this week")}>
            {localize(freeSlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b py-2 text-[12.5px] last:border-0">
                <span>{localize(s.label)}</span>
                {localize(taken(s) ? <span className="text-[11.5px] text-primary">{localize("Planned")}</span> : <Button size="sm" variant="ghost" className="h-6 text-[11.5px]" onClick={() => setSlot(s)}>{localize("Plan")}</Button>)}
              </div>
            )))}
          </Panel>
          <Panel title={localize(<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-ai" /> {localize("Suggestion")}</span>)}>
            <PredictionNote>{localize("Use")} <b>{localize("Mon 13:00–15:00")}</b> {localize("for JWT token generation (1.5h). It's the earliest slot before your heaviest days.")}</PredictionNote>
          </Panel>
        </div>
      </div>

      <Dialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[16px]">{localize("Plan study session")}</DialogTitle><DialogDescription>{localize(slot?.label)}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="schedule-task" className="text-[12px]">{localize("Work on")}</Label>
            <Select value={task} onValueChange={setTask}><SelectTrigger id="schedule-task"><SelectValue placeholder={localize("Choose an imported task")} /></SelectTrigger>
              <SelectContent>{localize(tasks.filter((t) => t.column !== "done").map((t) => <SelectItem key={t.id} value={t.id}>{localize(t.title)}</SelectItem>))}</SelectContent></Select>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSlot(null)}>{localize("Cancel")}</Button><Button size="sm" disabled={!task} onClick={plan}>{localize("Add to calendar")}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
