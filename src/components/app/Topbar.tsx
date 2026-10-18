import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Search, Sparkles, ChevronRight, CalendarRange } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { assignments, courses, courseOf } from "@/lib/data";

const labels: Record<string, string> = {
  "": "Overview", schedule: "My Schedule", insights: "AI Insights", courses: "Courses", assignments: "Assignments",
  kanban: "Kanban Board", knowledge: "Knowledge Base", events: "Campus Events", workload: "My Workload",
  statistics: "Study Statistics", activity: "Agent Activity", settings: "Settings", admin: "Academic Overview",
};

export function Topbar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { openChat, activity, setUploadOpen } = useStore();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const parts = path.split("/").filter(Boolean);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const crumbName = (seg: string, i: number) => {
    if (i === 0) return labels[seg] ?? seg;
    if (parts[0] === "courses") return courses.find((c) => c.id === seg)?.name ?? seg;
    if (parts[0] === "assignments") return assignments.find((a) => a.id === seg)?.title.split(" — ")[0] ?? seg;
    return seg;
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b bg-background/90 px-5 backdrop-blur">
      <nav className="flex min-w-0 items-center gap-1 text-[13px]">
        <span className="text-muted-foreground">Workspace</span>
        {(parts.length ? parts : [""]).map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            {i === parts.length - 1 || parts.length === 0 ? (
              <span className="truncate font-medium">{crumbName(p, i)}</span>
            ) : (
              <Link to={`/${parts.slice(0, i + 1).join("/")}` as "/"} className="text-muted-foreground hover:text-foreground">{crumbName(p, i)}</Link>
            )}
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => setOpen(true)} className="hidden h-8 w-72 items-center whitespace-nowrap gap-2 rounded-md border bg-card px-2.5 text-[12.5px] text-muted-foreground hover:border-primary/30 md:flex">
          <Search className="h-3.5 w-3.5" /> Search courses, assignments…
          <kbd className="ml-auto rounded border bg-secondary px-1 text-[10px]">⌘K</kbd>
        </button>
        <span className="hidden items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[12px] text-muted-foreground lg:flex"><CalendarRange className="h-3.5 w-3.5" /> Fall 2026 · Week 8</span>
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b px-3 py-2 text-[13px] font-semibold">Notifications</div>
            {activity.slice(0, 5).map((a) => (
              <div key={a.id} className="border-b px-3 py-2 last:border-0">
                <div className="text-[12.5px] font-medium">{a.title}</div>
                <div className="text-[11.5px] text-muted-foreground">{a.time} · {a.detail}</div>
              </div>
            ))}
            <Link to="/activity" className="block px-3 py-2 text-center text-[12px] text-primary hover:bg-secondary">View all activity</Link>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => openChat()}>
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Ask CampusPulse
        </Button>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">DS</div>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search courses, assignments, pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Courses">
            {courses.map((c) => <CommandItem key={c.id} onSelect={() => { setOpen(false); navigate({ to: "/courses/$courseId", params: { courseId: c.id } }); }}>{c.name} <span className="ml-auto text-[11px] text-muted-foreground">{c.code}</span></CommandItem>)}
          </CommandGroup>
          <CommandGroup heading="Assignments">
            {assignments.map((a) => <CommandItem key={a.id} onSelect={() => { setOpen(false); navigate({ to: "/assignments/$assignmentId", params: { assignmentId: a.id } }); }}>{a.title} <span className="ml-auto text-[11px] text-muted-foreground">{courseOf(a.courseId).code}</span></CommandItem>)}
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => { setOpen(false); setUploadOpen(true); }}>Upload assignment</CommandItem>
            <CommandItem onSelect={() => { setOpen(false); openChat(); }}>Ask CampusPulse</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
