import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, MapPin, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { campusEvents } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Campus Events — CampusPulse AI" }, { name: "description", content: "Campus activities matched to your free time and interests." },
    { property: "og:title", content: "Campus Events — CampusPulse AI" }, { property: "og:description", content: "Campus activities matched to your free time and interests." },
  ] }),
  component: Events,
});

const cats = ["All", "Tech", "Academic", "Career", "Sports"];

function Events() {
  const { events, addEvent } = useStore();
  const [cat, setCat] = useState("All");
  const [saved, setSaved] = useState<string[]>([]);
  const list = campusEvents.filter((e) => cat === "All" || e.category === cat).sort((a, b) => b.match - a.match);
  return (
    <>
      <PageHeader title="Campus Events" subtitle="Ranked by fit with your schedule and courses." />
      <div className="mb-3 flex flex-wrap gap-1">{cats.map((c) => <Button variant="ghost" size="sm" aria-pressed={cat === c} key={c} onClick={() => setCat(c)} className={cn("rounded-md px-2.5 py-1 text-[12.5px]", cat === c ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground")}>{c}</Button>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((e) => (
          <article key={e.id} className="panel flex flex-col p-4">
            <div className="flex items-center justify-between"><span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{e.category}</span><span className="text-[11.5px] font-medium text-ai tabular-nums">{e.match}% match</span></div>
            <h2 className="mt-2 text-[14px] font-semibold">{e.title}</h2>
            <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{e.date}</div>
              <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{e.time}</div>
              <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{e.place}</div>
            </div>
            <p className="mt-3 rounded-md bg-ai-soft/60 px-2.5 py-1.5 text-[12px]">{e.reason}</p>
            <Button size="sm" variant={saved.includes(e.id) ? "secondary" : "outline"} className="mt-3 h-7 text-[12px]" onClick={() => { setSaved((s) => s.includes(e.id) ? s.filter((x) => x !== e.id) : [...s, e.id]); if (!saved.includes(e.id)) { const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].findIndex((day) => e.date.startsWith(day)); const start = Number(e.time.split("–")[0]?.split(":")[0] ?? 0); const end = Number(e.time.split("–")[1]?.split(":")[0] ?? start + 1); if (["e1", "e2", "e3", "e5", "e6"].includes(e.id) && !events.some((event) => event.title === e.title)) addEvent({ day, start, end, title: e.title, kind: "event" }); toast.success("Event saved", { description: `${e.date} · ${e.time}` }); } }}>
              {saved.includes(e.id) ? <><Check className="h-3.5 w-3.5" /> Added</> : "Save event"}
            </Button>
          </article>
        ))}
      </div>
    </>
  );
}
