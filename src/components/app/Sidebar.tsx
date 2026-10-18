import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Sparkles, BookOpen, ClipboardList, KanbanSquare, Library, PartyPopper,
  Gauge, BarChart3, Activity, Settings, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Shield, GraduationCap, Check, Users,
} from "lucide-react";
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
    { to: "/courses", label: "Courses", icon: BookOpen },
    { to: "/statistics", label: "Workload Statistics", icon: BarChart3 },
  ] },
  { group: "System", items: [
    { to: "/activity", label: "Agent Activity", icon: Activity },
    { to: "/settings", label: "Settings", icon: Settings },
  ] },
] as const;

export function Sidebar() {
  const { sidebarCollapsed: collapsed, setSidebarCollapsed, role, setRole, insights } = useStore();
  const navigate = useNavigate();
  const newCount = insights.filter((i) => i.status === "New").length;
  const nav = role === "admin" ? adminNav : studentNav;

  return (
    <aside className={cn("sticky top-0 flex h-screen shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200", collapsed ? "w-[60px]" : "w-[248px]")}>
      <div className="flex h-12 items-center gap-2 px-3.5">
        <Logo />
        {!collapsed && <span className="text-[14px] font-semibold tracking-tight">CampusPulse</span>}
        <button onClick={() => setSidebarCollapsed(!collapsed)} className={cn("ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", collapsed && "hidden")} aria-label="Collapse sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      {collapsed && (
        <button onClick={() => setSidebarCollapsed(false)} className="mx-auto mb-2 rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left hover:bg-secondary">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-[10px] font-semibold">AITU</div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-medium">Astana IT University</div>
              <div className="text-[11px] text-muted-foreground">Fall Semester 2026</div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
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
