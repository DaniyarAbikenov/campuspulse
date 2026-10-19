import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, MapPin, Clock, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { EventFormDialog } from "@/components/app/EventFormDialog";
import { deleteRemoteCampusEvent } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { CampusEvent } from "@/lib/data";

export const Route = createFileRoute("/events")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Campus Events — CampusPulse AI" }, { name: "description", content: "Campus activities matched to your free time and interests." },
    { property: "og:title", content: "Campus Events — CampusPulse AI" }, { property: "og:description", content: "Campus activities matched to your free time and interests." },
  ] }),
  component: Events,
});

// Fixture events carry only display strings; only those inside the visible week can be placed.
const fixtureSlot = (e: CampusEvent) => {
  if (!["e1", "e2", "e3", "e5", "e6"].includes(e.id)) return null;
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].findIndex((d) => e.date.startsWith(d));
  const start = Number(e.time.split("–")[0]?.split(":")[0] ?? 0);
  return { day, start, end: Number(e.time.split("–")[1]?.split(":")[0] ?? start + 1) };
};

const cats = ["All", "Tech", "Academic", "Career", "Sports"];

function Events() {
  const { locale } = useI18n();
  const { events, addEvent, campusEvents, saveCampusEvent, backendConnected, reloadWorkspace } = useStore();
  const [cat, setCat] = useState("All");
  const [form, setForm] = useState<CampusEvent | "new" | null>(null);
  const [removing, setRemoving] = useState<CampusEvent | null>(null);
  const remove = async () => {
    if (!removing?.backendId) return;
    try {
      await deleteRemoteCampusEvent(removing.backendId);
      await reloadWorkspace();
      toast.success(localize("Event deleted", locale));
    } catch (error) {
      toast.error(localize("Could not delete", locale), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setRemoving(null);
    }
  };
  const list = campusEvents.filter((e) => cat === "All" || e.category === cat).sort((a, b) => b.match - a.match);
  return (
    <>
      <PageHeader title={localize("Campus Events", locale)} subtitle={localize("Ranked by fit with your schedule and courses.", locale)} actions={backendConnected ? <Button size="sm" onClick={() => setForm("new")}><Plus className="h-3.5 w-3.5" /> {localize("Add event", locale)}</Button> : undefined} />
      <div className="mb-3 flex flex-wrap gap-1">{localize(cats.map((c) => <Button variant="ghost" size="sm" aria-pressed={cat === c} key={c} onClick={() => setCat(c)} className={cn("rounded-md px-2.5 py-1 text-[12.5px]", cat === c ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground")}>{localize(c, locale)}</Button>), locale)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {localize(list.map((e) => (
          <article key={e.id} className="panel flex flex-col p-4">
            <div className="flex items-center justify-between"><span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{localize(e.category, locale)}</span>{e.match ? <span className="text-[11.5px] font-medium text-ai tabular-nums">{localize(e.match, locale)}{localize("% match", locale)}</span> : null}</div>
            <h2 className="mt-2 text-[14px] font-semibold">{localize(e.title, locale)}</h2>
            <div className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{localize(e.date, locale)}</div>
              <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{localize(e.time, locale)}</div>
              <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{localize(e.place, locale)}</div>
            </div>
            {e.description ? <p className="mt-2 text-[12px] text-muted-foreground">{e.description}</p> : null}
            {e.reason ? <p className="mt-3 rounded-md bg-ai-soft/60 px-2.5 py-1.5 text-[12px]">{localize(e.reason, locale)}</p> : null}
            <Button size="sm" variant={e.saved ? "secondary" : "outline"} className="mt-3 h-7 text-[12px]" onClick={() => { const next = !e.saved; void saveCampusEvent(e.id, next); if (next) { const slot = e.slot !== undefined ? e.slot : fixtureSlot(e); if (slot && !events.some((event) => event.title === e.title)) void addEvent({ ...slot, title: e.title, kind: "event" }); toast.success(localize("Event saved", locale), { description: localize(`${e.date} · ${e.time}`, locale) }); } }}>
              {localize(e.saved ? <><Check className="h-3.5 w-3.5" /> {localize("Added", locale)}</> : "Save event", locale)}
            </Button>
            {e.canEdit ? (
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setForm(e)}><Pencil className="h-3.5 w-3.5" /> {localize("Edit", locale)}</Button>
                <Button size="sm" variant="ghost" className="h-7 text-[12px] text-destructive" onClick={() => setRemoving(e)}><Trash2 className="h-3.5 w-3.5" /> {localize("Delete", locale)}</Button>
              </div>
            ) : null}
          </article>
        )), locale)}
      </div>
      {!list.length ? <div className="panel"><EmptyState icon={CalendarDays} title={localize("No campus events yet", locale)} text={localize("Add a meetup, lecture or club event so classmates can see it and save it to their calendar.", locale)} action={backendConnected ? <Button size="sm" onClick={() => setForm("new")}><Plus className="h-3.5 w-3.5" /> {localize("Add event", locale)}</Button> : undefined} /></div> : null}
      <EventFormDialog open={form !== null} onOpenChange={(o) => !o && setForm(null)} event={form === "new" ? null : form} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{localize("Delete this event?", locale)}</AlertDialogTitle>
            <AlertDialogDescription>{removing?.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{localize("Keep it", locale)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>{localize("Delete", locale)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
