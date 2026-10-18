import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Sparkles, BookOpen, ClipboardList, KanbanSquare, Library, PartyPopper,
  Gauge, BarChart3, Activity, Settings, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Shield, GraduationCap, Check, Users,
} from "lucide-react";
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { Logo } from "./Logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const studentNav = [
  { group: "Workspace", items: [
    { to: "/", label: "Overview", icon: LayoutDashboard },
    { to: "/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/insights", label: "AI Insights", icon: Sparkles, badge: true },
  ] },
  { group: "Academics", items: [
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/assignments", label: "Assignments", icon: ClipboardList },
    { to: "/kanban", label: "Kanban Board", icon: KanbanSquare },
    { to: "/knowledge", label: "Knowledge Base", icon: Library },
  ] },
  { group: "Explore", items: [{ to: "/events", label: "Campus Events", icon: PartyPopper }] },
  { group: "Analytics", items: [
    { to: "/workload", label: "My Workload", icon: Gauge },
    { to: "/statistics", label: "Study Statistics", icon: BarChart3 },
  ] },
  { group: "System", items: [
    { to: "/activity", label: "Agent Activity", icon: Activity },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
] as const;

const adminNav = [
  { group: "Administration", items: [
    { to: "/admin", label: "Academic Overview", icon: Shield },
    { to: "/admin/courses", label: "Courses", icon: BookOpen },
    { to: "/admin/statistics", label: "Workload Statistics", icon: BarChart3 },
  ] },
  { group: "System", items: [
    { to: "/activity", label: "Agent Activity", icon: Activity },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
] as const;

function SidebarContent({ mobile = false }: { mobile?: boolean }) {
  const { sidebarCollapsed, setSidebarCollapsed, role, setRole, insights } = useStore();
  const collapsed = !mobile && sidebarCollapsed;
  const navigate = useNavigate();
  const newCount = insights.filter((i) => i.status === "New").length;
  const nav = role === "admin" ? adminNav : studentNav;

  return (
    <aside className={cn("flex h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200", mobile ? "w-full border-0" : collapsed ? "w-[60px]" : "w-[248px]")}>
      <div className="flex h-12 items-center gap-2 px-3.5">
        <Logo />
        {!collapsed && <span className="text-[14px] font-semibold tracking-tight">CampusPulse</span>}
        <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!collapsed)} className={cn("ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", (collapsed || mobile) && "hidden")} aria-label="Collapse sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      {collapsed && (
        <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(false)} className="mx-auto mb-2 rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}
      {!collapsed && (
        <div className="px-3 pb-2">
          <Button variant="outline" className="h-auto flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left hover:bg-secondary">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-[10px] font-semibold">AITU</div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-medium">Astana IT University</div>
              <div className="text-[11px] text-muted-foreground">Fall Semester 2026</div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {nav.map((g) => (
          <div key={g.group} className="mb-3">
            {!collapsed && <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/80">{g.group}</div>}
            {g.items.map((item) => {
              const Icon = item.icon;
              const link = (
                <Link
                  key={item.to + item.label}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className={cn("group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground", collapsed && "justify-center")}
                  activeProps={{ className: "bg-sidebar-accent !text-foreground font-medium" }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!collapsed && "badge" in item && newCount > 0 && <span className="rounded bg-primary-soft px-1.5 text-[10.5px] font-semibold text-primary">{newCount}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.label}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>
              ) : link;
            })}
          </div>
        ))}
      </nav>

      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className={cn("flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-secondary", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">{role === "admin" ? "AA" : "DS"}</div>
            {!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12.5px] font-medium">{role === "admin" ? "Academic Admin" : "Demo Student"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{role === "admin" ? "Faculty of Computing" : "Software Engineering · SE-2429"}</div>
              </div>
            )}
            {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Switch workspace</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => { setRole("student"); navigate({ to: "/" }); }}>
              <GraduationCap className="h-4 w-4" /> Student Workspace {role === "student" && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setRole("admin"); navigate({ to: "/admin" }); }}>
              <Users className="h-4 w-4" /> Academic Administrator Demo {role === "admin" && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}><Settings className="h-4 w-4" /> Settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}


export function Sidebar() {
  const { mobileNavOpen, setMobileNavOpen } = useStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => { setMobileNavOpen(false); }, [pathname, setMobileNavOpen]);
  return <>
    <div className="sticky top-0 hidden h-screen shrink-0 md:block"><SidebarContent /></div>
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <SheetDescription className="sr-only">CampusPulse workspace pages</SheetDescription>
        <SidebarContent mobile />
      </SheetContent>
    </Sheet>
  </>;
}
