import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutGrid, List, Plus, Search, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ProgressBar } from "@/components/app/common";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/courses/")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "My Courses — CampusPulse AI" }, { name: "description", content: "Manage your courses, progress and academic materials." },
    { property: "og:title", content: "My Courses — CampusPulse AI" }, { property: "og:description", content: "Manage your courses, progress and academic materials." },
  ] }),
  component: Courses,
});

function Courses() {
  const { locale } = useI18n();
  const { courses, backendConnected, profile } = useStore();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const list = courses.filter((c) => (c.name + c.code + c.instructor).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={localize("My Courses", locale)} subtitle={localize("Manage your courses and academic materials.", locale)} actions={<>
        {backendConnected ? (profile.semester ? <span className="rounded-md border bg-card px-2 py-1 text-[12.5px] text-muted-foreground">{profile.semester}</span> : null) :         <Select defaultValue="fall"><SelectTrigger aria-label={localize("Semester", locale)} className="h-8 w-40 text-[12.5px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fall">{localize("Fall Semester 2026", locale)}</SelectItem><SelectItem value="spring">{localize("Spring Semester 2026", locale)}</SelectItem></SelectContent></Select>}
        <div className="relative"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label={localize("Search courses", locale)} value={q} onChange={(e) => setQ(e.target.value)} placeholder={localize("Search courses", locale)} className="h-8 w-52 pl-8 text-[12.5px]" /></div>
        <div className="flex rounded-md border p-0.5">
          {localize((["grid", "table"] as const).map((v) => <Button variant="ghost" size="icon" aria-label={localize(`${v} view`, locale)} aria-pressed={view === v} key={v} onClick={() => setView(v)} className={cn("rounded px-1.5 py-1", view === v ? "bg-secondary text-foreground" : "text-muted-foreground")}>{localize(v === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />, locale)}</Button>), locale)}
        </div>
        {backendConnected ? null : <Button size="sm" onClick={() => toast(localize("Course import is connected to your university timetable", locale), { description: localize("Demo: all 5 courses are already synced.", locale) })}><Plus className="h-3.5 w-3.5" /> {localize("Add Course", locale)}</Button>}
      </>} />
      {localize(view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {localize(list.map((c) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="panel group block p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-sm", c.color)} /><span className="font-mono text-[11px] text-muted-foreground">{localize(c.code, locale)}</span></div>
              <h2 className="mt-1.5 text-[15px] font-semibold group-hover:text-primary">{localize(c.name, locale)}</h2>
              <p className="text-[12px] text-muted-foreground">{localize(c.instructor, locale)}</p>
              <div className="mt-4 flex items-center gap-2"><ProgressBar value={c.progress} /><span className="text-[11.5px] tabular-nums text-muted-foreground">{localize(c.progress, locale)}{localize("%", locale)}</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-[12px]">
                <div><div className="text-muted-foreground">{localize("Assignments", locale)}</div><div className="font-medium tabular-nums">{localize(c.completed, locale)}{localize("/", locale)}{localize(c.assignments, locale)}</div></div>
                <div><div className="text-muted-foreground">{localize("Remaining", locale)}</div><div className="font-medium tabular-nums">{localize(c.remaining, locale)}{localize("h", locale)}</div></div>
                <div><div className="text-muted-foreground">{localize("Next due", locale)}</div><div className="flex items-center gap-1 font-medium"><CalendarClock className="h-3 w-3" />{localize(c.nextDeadline, locale)}</div></div>
              </div>
            </Link>
          )), locale)}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">{localize("Course", locale)}</th><th scope="col" className="px-2 font-medium">{localize("Code", locale)}</th><th scope="col" className="px-2 font-medium">{localize("Instructor", locale)}</th><th scope="col" className="px-2 font-medium">{localize("Assignments", locale)}</th><th scope="col" className="w-40 px-2 font-medium">{localize("Progress", locale)}</th><th scope="col" className="px-2 font-medium">{localize("Remaining", locale)}</th><th scope="col" className="px-4 font-medium">{localize("Next deadline", locale)}</th></tr></thead>
            <tbody>{localize(list.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/60">
                <td className="px-4 py-2.5 font-medium"><Link to="/courses/$courseId" params={{ courseId: c.id }} className="hover:text-primary">{localize(c.name, locale)}</Link></td>
                <td className="px-2 font-mono text-[12px] text-muted-foreground">{localize(c.code, locale)}</td><td className="px-2">{localize(c.instructor, locale)}</td><td className="px-2 tabular-nums">{localize(c.completed, locale)}{localize("/", locale)}{localize(c.assignments, locale)}</td>
                <td className="px-2"><div className="flex items-center gap-2"><ProgressBar value={c.progress} /><span className="w-9 text-right text-[11.5px] tabular-nums text-muted-foreground">{c.progress}%</span></div></td><td className="px-2 tabular-nums">{localize(c.remaining, locale)}{localize("h", locale)}</td><td className="px-4">{localize(c.nextDeadline, locale)}</td>
              </tr>
            )), locale)}</tbody>
          </table>
        </div>
      ), locale)}
    </>
  );
}
