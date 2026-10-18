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
import { freeSlots, generatedTasks, initialTasks } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [
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
  const { events, addEvent, log } = useStore();
  const [slot, setSlot] = useState<(typeof freeSlots)[number] | null>(null);
  const [task, setTask] = useState(generatedTasks[1].title);
  const taken = (s: (typeof freeSlots)[number]) => events.some((e) => e.kind === "study" && e.day === s.day && e.start === s.start);

  const plan = () => {
    if (!slot) return;
    addEvent({ day: slot.day, start: slot.start, end: Math.min(slot.end, slot.start + 2), title: `Study: ${task}`, kind: "study", courseId: "se" });
    log({ title: "Study session planned", detail: `${slot.label} · ${task}`, kind: "schedule", status: "success" });
    toast.success("Study session added", { description: slot.label });
    setSlot(null);
  };

  return (
    <>
      <PageHeader title="My Schedule" subtitle="Week 43 · October 19 – 25, 2026" actions={<Button size="sm" onClick={() => setSlot(freeSlots.find((s) => !taken(s)) ?? freeSlots[0])}><Plus className="h-3.5 w-3.5" /> Plan Study Session</Button>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div className="panel overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,1fr)]">
            <div className="border-b" />
            {days.map((d, i) => <div key={d} className={cn("border-b border-l px-2 py-2 text-[12px] font-medium", i === 0 && "text-primary")}>{d}</div>)}
            <div className="relative">{hours.map((h) => <div key={h} style={{ height: H }} className="pr-2 pt-0.5 text-right font-mono text-[10.5px] text-muted-foreground">{h}:00</div>)}</div>
            {days.map((_, di) => (
              <div key={di} className="relative border-l" style={{ height: H * hours.length }}>
                {hours.map((h) => <div key={h} style={{ height: H }} className="border-b border-dashed border-border/70" />)}
                {freeSlots.filter((s) => s.day === di && !taken(s)).map((s) => (
                  <button key={s.id} onClick={() => setSlot(s)} style={{ top: (s.start - 8) * H, height: (s.end - s.start) * H }}
                    className="absolute inset-x-1 rounded-md border border-dashed border-success/50 bg-success-soft/70 p-1.5 text-left text-[11px] text-success hover:bg-success-soft">
                    <div className="font-medium">Free slot</div><div className="opacity-80">+ Plan session</div>
                  </button>
                ))}
                {events.filter((e) => e.day === di).map((e) => (
                  <div key={e.id} style={{ top: (e.start - 8) * H + 1, height: (e.end - e.start) * H - 2 }} className={cn("absolute inset-x-1 overflow-hidden rounded-md border p-1.5 text-[11px] animate-in fade-in", kindCls[e.kind])}>
                    <div className="font-medium leading-tight">{e.title}</div>
                    <div className="font-mono text-[10px] opacity-70">{e.start}:00–{e.end}:00</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Panel title="Free time this week">
            {freeSlots.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b py-2 text-[12.5px] last:border-0">
                <span>{s.label}</span>
                {taken(s) ? <span className="text-[11.5px] text-primary">Planned</span> : <Button size="sm" variant="ghost" className="h-6 text-[11.5px]" onClick={() => setSlot(s)}>Plan</Button>}
              </div>
            ))}
          </Panel>
          <Panel title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-ai" /> Suggestion</span>}>
            <PredictionNote>Use <b>Mon 13:00–15:00</b> for JWT token generation (1.5h). It's the earliest slot before your heaviest days.</PredictionNote>
          </Panel>
        </div>
      </div>

      <Dialog open={!!slot} onOpenChange={(o) => !o && setSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-[16px]">Plan study session</DialogTitle><DialogDescription>{slot?.label}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label className="text-[12px]">Work on</Label>
            <Select value={task} onValueChange={setTask}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[...generatedTasks, ...initialTasks].slice(0, 9).map((t) => <SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSlot(null)}>Cancel</Button><Button size="sm" onClick={plan}>Add to calendar</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
