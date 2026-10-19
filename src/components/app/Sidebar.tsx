import { localize, useI18n } from "@/lib/i18n";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, CalendarDays, Sparkles, BookOpen, ClipboardList, KanbanSquare, Library, PartyPopper,
  Gauge, BarChart3, Activity, Settings, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Shield, GraduationCap, Check, Users, LogOut,
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
  const { locale } = useI18n();
  const { sidebarCollapsed, setSidebarCollapsed, role, setRole, insights, setMobileNavOpen, settings, signOut, backendConnected, canAdminister, profile } = useStore();
  const initials = settings.full_name.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
  const collapsed = !mobile && sidebarCollapsed;
  const navigate = useNavigate();
  const newCount = insights.filter((i) => i.status === "New").length;
  const nav = role === "admin" ? adminNav : studentNav;

  return (
    <aside className={cn("flex h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200", mobile ? "w-full border-0" : collapsed ? "w-[60px]" : "w-[248px]")}>
      <div className="flex h-12 items-center gap-2 px-3.5">
        <Logo />
        {localize(!collapsed && <span className="text-[14px] font-semibold tracking-tight">{localize("CampusPulse", locale)}</span>, locale)}
        <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!collapsed)} className={cn("ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground", (collapsed || mobile) && "hidden")} aria-label={localize("Collapse sidebar", locale)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
        {localize(mobile && <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={localize("Close navigation", locale)} onClick={() => setMobileNavOpen(false)}><PanelLeftClose /></Button>, locale)}
      </div>
      {localize(collapsed && (
        <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(false)} className="mx-auto mb-2 rounded p-1.5 text-muted-foreground hover:bg-secondary" aria-label={localize("Expand sidebar", locale)}>
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      ), locale)}
      {localize(!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-[10px] font-semibold">{backendConnected && profile.institution ? profile.institution.split(/\s+/).map((word) => word[0]).join("").slice(0, 4).toUpperCase() : localize("AITU", locale)}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-medium">{backendConnected && profile.institution ? profile.institution : localize("Astana IT University", locale)}</div>
              <div className="text-[11px] text-muted-foreground">{backendConnected ? (profile.semester ?? "") : localize("Fall Semester 2026", locale)}</div>
            </div>
            </div>
        </div>
      ), locale)}

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {localize(nav.map((g) => (
          <div key={g.group} className="mb-3">
            {localize(!collapsed && <div className="px-2 pb-1 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{localize(g.group, locale)}</div>, locale)}
            {localize(g.items.map((item) => {
  
              const Icon = item.icon;
              const link = (
                <Link
                  aria-label={localize(item.label, locale)}
                  key={item.to + item.label}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" || item.to === "/admin" }}
                  className={cn("group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground", collapsed && "justify-center")}
                  activeProps={{ className: "bg-sidebar-accent !text-foreground font-medium" }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {localize(!collapsed && <span className="flex-1 truncate">{localize(item.label, locale)}</span>, locale)}
                  {localize(!collapsed && "badge" in item && newCount > 0 && <span className="rounded bg-primary-soft px-1.5 text-[10.5px] font-semibold text-primary">{localize(newCount, locale)}</span>, locale)}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={item.label}><TooltipTrigger asChild>{localize(link, locale)}</TooltipTrigger><TooltipContent side="right">{localize(item.label, locale)}</TooltipContent></Tooltip>
              ) : link;
            }), locale)}
          </div>
        )), locale)}
      </nav>

      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={localize("Switch workspace", locale)} className={cn("flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-secondary", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">{localize(role === "admin" ? "AA" : initials || "ST", locale)}</div>
            {localize(!collapsed && (
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12.5px] font-medium">{role === "admin" ? localize("Academic Admin", locale) : settings.full_name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{role === "admin" ? localize("Faculty of Computing", locale) : [settings.program, settings.group_name].filter(Boolean).join(" · ")}</div>
              </div>
            ), locale)}
            {localize(!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />, locale)}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">{localize("Switch workspace", locale)}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => { setRole("student"); navigate({ to: "/" }); }}>
              <GraduationCap className="h-4 w-4" /> {localize("Student Workspace", locale)} {localize(role === "student" && <Check className="ml-auto h-3.5 w-3.5" />, locale)}
            </DropdownMenuItem>
            {canAdminister ? (
              <DropdownMenuItem onClick={() => { setRole("admin"); navigate({ to: "/admin" }); }}>
                <Users className="h-4 w-4" /> {localize(backendConnected ? "Academic Administrator" : "Academic Administrator Demo", locale)} {localize(role === "admin" && <Check className="ml-auto h-3.5 w-3.5" />, locale)}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}><Settings className="h-4 w-4" /> {localize("Settings", locale)}</DropdownMenuItem>
            {backendConnected ? <DropdownMenuItem onClick={() => void signOut()}><LogOut className="h-4 w-4" /> {localize("Sign out", locale)}</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}


export function Sidebar() {
  const { locale } = useI18n();
  const { mobileNavOpen, setMobileNavOpen } = useStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => { setMobileNavOpen(false); }, [pathname, setMobileNavOpen]);
  return <>
    <div className="sticky top-0 hidden h-dvh shrink-0 md:block"><SidebarContent /></div>
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] p-0 [&>button]:hidden">
        <SheetTitle className="sr-only">{localize("Workspace navigation", locale)}</SheetTitle>
        <SheetDescription className="sr-only">{localize("CampusPulse workspace pages", locale)}</SheetDescription>
        <SidebarContent mobile />
      </SheetContent>
    </Sheet>
  </>;
}
