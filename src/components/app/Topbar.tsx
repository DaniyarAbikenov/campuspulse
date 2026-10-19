import { localize, useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Search, Sparkles, ChevronRight, CalendarRange, Menu } from "lucide-react";
import { useStore } from "@/lib/store";
import { initialsOf } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { courseOf } from "@/lib/data";
import { weekTitle } from "@/lib/week";
import { intlLocale } from "@/lib/i18n";
import { LanguageSelector } from "./LanguageSelector";

const labels: Record<string, string> = {
  "": "Overview", schedule: "My Schedule", insights: "AI Insights", courses: "Courses", assignments: "Assignments",
  kanban: "Kanban Board", knowledge: "Knowledge Base", events: "Campus Events", workload: "My Workload",
  statistics: "Study Statistics", activity: "Agent Activity", settings: "Settings", admin: "Academic Overview",
};

type Notice = { id: string; title: string; detail: string; to: "/insights" | "/assignments/$assignmentId"; params?: { assignmentId: string } };

/** What needs attention now: new insights and deadlines within two days. */
function buildNotifications(insights: { status: string }[], assignments: { id: string; title: string; status: string; dueAt?: string | undefined }[]): Notice[] {
  const notices: Notice[] = [];
  const fresh = insights.filter((item) => item.status === "New").length;
  if (fresh) notices.push({ id: "insights", title: `${fresh} new AI ${fresh === 1 ? "insight" : "insights"}`, detail: "Review the recommendations", to: "/insights" });
  const now = Date.now();
  for (const item of assignments) {
    if (!item.dueAt || item.status === "Completed" || item.status === "Cancelled") continue;
    const hours = (Date.parse(item.dueAt) - now) / 3_600_000;
    if (hours < 0 || hours > 48) continue;
    notices.push({ id: item.id, title: item.title, detail: hours < 24 ? "Due within 24 hours" : "Due within 2 days", to: "/assignments/$assignmentId", params: { assignmentId: item.id } });
  }
  return notices.slice(0, 6);
}

export function Topbar() {
  const { locale } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { openChat, setUploadOpen, role, setMobileNavOpen, courses, assignments, adminCourseOptions, backendConnected, weekStart, profile, insights, settings } = useStore();
  const notifications = buildNotifications(role === "student" ? insights : [], role === "student" ? assignments : []);
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
    return seg === "statistics" ? "Workload Statistics" : seg === "courses" ? "Courses" : seg;
  };

  return (
    <header className="sticky top-0 z-20 grid h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-background/90 px-3 md:flex md:px-5 backdrop-blur">
      <nav className="flex min-w-0 items-center gap-1 text-[13px]">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:hidden" aria-label={localize("Open navigation", locale)} onClick={() => setMobileNavOpen(true)}><Menu /></Button>
        <span className="hidden text-muted-foreground xl:inline">{localize("Workspace", locale)}</span>
        {localize((parts.length ? parts : [""]).map((p, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            {localize(i === parts.length - 1 || parts.length === 0 ? (
              <span className="truncate font-medium">{localize(crumbName(p, i), locale)}</span>
            ) : (
              <Link to={`/${parts.slice(0, i + 1).join("/")}` as "/"} className="text-muted-foreground hover:text-foreground">{localize(crumbName(p, i), locale)}</Link>
            ), locale)}
          </span>
        )), locale)}
      </nav>
      <div className="flex shrink-0 items-center gap-1 md:ml-auto md:gap-2">
        <LanguageSelector compact />
        <Button variant="outline" onClick={() => setOpen(true)} className="hidden h-8 w-72 items-center whitespace-nowrap gap-2 rounded-md border bg-card px-2.5 text-[12.5px] text-muted-foreground hover:border-primary/30 xl:flex">
          <Search className="h-3.5 w-3.5" /> {localize("Search courses, assignments…", locale)}
          <kbd className="ml-auto rounded border bg-secondary px-1 text-[10px]">{localize("⌘K", locale)}</kbd>
        </Button>
        <span className="hidden items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[12px] text-muted-foreground lg:flex"><CalendarRange className="h-3.5 w-3.5" /> {backendConnected ? [profile.semester, weekTitle(weekStart, intlLocale(locale), localize("Week", locale))].filter(Boolean).join(" · ") : localize("Fall 2026 · Week 43", locale)}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 xl:hidden" aria-label={localize("Search workspace", locale)} onClick={() => setOpen(true)}><Search /></Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={localize("Notifications", locale)}>
              <Bell className="h-4 w-4" />
              {notifications.length ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden /> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0" aria-label={localize("Notifications", locale)}>
            <div className="border-b px-3 py-2 text-[13px] font-semibold">{localize("Notifications", locale)}</div>
            {notifications.length ? notifications.map((item) => (
              <Link key={item.id} to={item.to} params={item.params as never} className="block border-b px-3 py-2 last:border-0 hover:bg-secondary">
                <div className="text-[12.5px] font-medium">{localize(item.title, locale)}</div>
                <div className="text-[11.5px] text-muted-foreground">{localize(item.detail, locale)}</div>
              </Link>
            )) : <p className="px-3 py-4 text-[12.5px] text-muted-foreground">{localize("You are all caught up: nothing is due soon and there are no new insights.", locale)}</p>}
            <Link to="/activity" className="block px-3 py-2 text-center text-[12px] text-primary hover:bg-secondary">{localize("View agent activity", locale)}</Link>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" className="h-8 w-8 gap-1.5 px-0 sm:w-auto sm:px-3" aria-label={localize("Ask CampusPulse", locale)} onClick={() => openChat()}>
          <Sparkles className="h-3.5 w-3.5 text-primary" /> <span className="hidden sm:inline">{localize("Ask CampusPulse", locale)}</span>
        </Button>
        <div className="hidden h-7 w-7 shrink-0 sm:flex items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">{localize(role === "admin" ? "AA" : initialsOf(settings.full_name), locale)}</div>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput aria-label={localize("Search courses, assignments, pages", locale)} placeholder={localize("Search courses, assignments, pages…", locale)} />
        <CommandList>
          <CommandEmpty>{localize("No results found.", locale)}</CommandEmpty>
          <CommandGroup heading={localize("Courses", locale)}>
            {localize((role === "admin" ? adminCourseOptions : courses).map((c) => <CommandItem key={c.id} onSelect={() => { setOpen(false); if (role === "admin") navigate({ to: "/admin/courses" }); else navigate({ to: "/courses/$courseId", params: { courseId: c.id } }); }}>{localize(c.name, locale)} <span className="ml-auto text-[11px] text-muted-foreground">{localize(c.code, locale)}</span></CommandItem>), locale)}
          </CommandGroup>
          {localize(role === "student" && <CommandGroup heading={localize("Assignments", locale)}>
            {localize(assignments.map((a) => <CommandItem key={a.id} onSelect={() => { setOpen(false); navigate({ to: "/assignments/$assignmentId", params: { assignmentId: a.id } }); }}>{localize(a.title, locale)} <span className="ml-auto text-[11px] text-muted-foreground">{localize(courseOf(a.courseId).code, locale)}</span></CommandItem>), locale)}
          </CommandGroup>, locale)
          }
          <CommandGroup heading={localize("Actions", locale)}>
            {localize(role === "student" && <CommandItem onSelect={() => { setOpen(false); setUploadOpen(true); }}>{localize("Upload assignment", locale)}</CommandItem>, locale)}
            <CommandItem onSelect={() => { setOpen(false); openChat(); }}>{localize("Ask CampusPulse", locale)}</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
