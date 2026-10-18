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
  useI18n();
  const { courses } = useStore();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const list = courses.filter((c) => (c.name + c.code + c.instructor).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title={localize("My Courses")} subtitle={localize("Manage your courses and academic materials.")} actions={<>
        <Select defaultValue="fall"><SelectTrigger aria-label={localize("Semester")} className="h-8 w-40 text-[12.5px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fall">{localize("Fall Semester 2026")}</SelectItem><SelectItem value="spring">{localize("Spring Semester 2026")}</SelectItem></SelectContent></Select>
        <div className="relative"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" /><Input aria-label={localize("Search courses")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={localize("Search courses")} className="h-8 w-52 pl-8 text-[12.5px]" /></div>
        <div className="flex rounded-md border p-0.5">
          {localize((["grid", "table"] as const).map((v) => <Button variant="ghost" size="icon" aria-label={`${v} view`} aria-pressed={view === v} key={v} onClick={() => setView(v)} className={cn("rounded px-1.5 py-1", view === v ? "bg-secondary text-foreground" : "text-muted-foreground")}>{v === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}</Button>))}
        </div>
        <Button size="sm" onClick={() => toast(localize("Course import is connected to your university timetable"), { description: localize("Demo: all 5 courses are already synced.") })}><Plus className="h-3.5 w-3.5" /> {localize("Add Course")}</Button>
      </>} />
      {localize(view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} to="/courses/$courseId" params={{ courseId: c.id }} className="panel group block p-4 transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-sm", c.color)} /><span className="font-mono text-[11px] text-muted-foreground">{c.code}</span></div>
              <h2 className="mt-1.5 text-[15px] font-semibold group-hover:text-primary">{c.name}</h2>
              <p className="text-[12px] text-muted-foreground">{c.instructor}</p>
              <div className="mt-4 flex items-center gap-2"><ProgressBar value={c.progress} /><span className="text-[11.5px] tabular-nums text-muted-foreground">{c.progress}%</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-[12px]">
                <div><div className="text-muted-foreground">Assignments</div><div className="font-medium tabular-nums">{c.completed}/{c.assignments}</div></div>
                <div><div className="text-muted-foreground">Remaining</div><div className="font-medium tabular-nums">{c.remaining}h</div></div>
                <div><div className="text-muted-foreground">Next due</div><div className="flex items-center gap-1 font-medium"><CalendarClock className="h-3 w-3" />{c.nextDeadline}</div></div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b text-left text-[11.5px] text-muted-foreground"><th scope="col" className="px-4 py-2 font-medium">Course</th><th scope="col" className="px-2 font-medium">Code</th><th scope="col" className="px-2 font-medium">Instructor</th><th scope="col" className="px-2 font-medium">Assignments</th><th scope="col" className="w-40 px-2 font-medium">Progress</th><th scope="col" className="px-2 font-medium">Remaining</th><th scope="col" className="px-4 font-medium">Next deadline</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/60">
                <td className="px-4 py-2.5 font-medium"><Link to="/courses/$courseId" params={{ courseId: c.id }} className="hover:text-primary">{c.name}</Link></td>
                <td className="px-2 font-mono text-[12px] text-muted-foreground">{c.code}</td><td className="px-2">{c.instructor}</td><td className="px-2 tabular-nums">{c.completed}/{c.assignments}</td>
                <td className="px-2"><ProgressBar value={c.progress} /></td><td className="px-2 tabular-nums">{c.remaining}h</td><td className="px-4">{c.nextDeadline}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}
