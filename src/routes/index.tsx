import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Clock, BookOpen, Hourglass, Plus, Sparkles, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote } from "@/components/app/common";
import { ActivityFeed, AssignmentTable, InsightCard, WorkloadChart } from "@/components/app/widgets";
import { useStore } from "@/lib/store";
import { demoDate, scheduleDate, formatHour, isUpcomingDeadline } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  beforeLoad: guardWorkspace,
  head: () => ({
    meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
      { title: "Overview — CampusPulse AI" },
      { name: "description", content: "Your academic command center: deadlines, workload, schedule and AI recommendations." },
      { property: "og:title", content: "Overview — CampusPulse AI" },
      { property: "og:description", content: "Your academic command center: deadlines, workload, schedule and AI recommendations." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { formatDate, locale } = useI18n();
  const { insights, activity, setUploadOpen, openChat, workloadPlanApplied, workload: workloadTotals, events, courses, assignments, distribution } = useStore();
  const navigate = useNavigate();
  const shown = insights.filter((i) => ["i-new", "i1", "i2", "i3"].includes(i.id) && i.status === "New").slice(0, 3);
  return (
    <>
      <PageHeader
        title={localize("Good afternoon.", locale)}
        subtitle={localize("Here's what's happening across your academic workspace.", locale)}
        actions={<>
          <span className="mr-1 text-[12.5px] text-muted-foreground">{formatDate(demoDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}><Plus className="h-3.5 w-3.5" /> {localize("Add Assignment", locale)}</Button>
          <Button size="sm" onClick={() => openChat("Overview")}><Sparkles className="h-3.5 w-3.5" /> {localize("Ask CampusPulse", locale)}</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Upcoming Deadlines", locale)} value={String(assignments.filter(isUpcomingDeadline).length)} sub={localize("Through October 25", locale)} icon={CalendarClock} />
        <MetricCard label={localize("Estimated Workload", locale)} value={`${workloadTotals.required}h`} sub={localize("Week 43 · exceeds capacity", locale)} icon={Hourglass} tone="warning" trend={{ dir: "up", text: `+${workloadTotals.required - workloadTotals.available}h over` }} />
        <MetricCard label={localize("Active Courses", locale)} value={String(courses.length)} sub={localize("Fall Semester 2026", locale)} icon={BookOpen} />
        <MetricCard label={localize("Available Study Time", locale)} value={`${workloadTotals.available}h`} sub={localize("Week 43 · available study time", locale)} icon={Clock} trend={{ dir: "down", text: "−3h", good: false }} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <Panel title={localize("Weekly Workload", locale)} subtitle={localize("Estimated required vs. available hours · Week 43", locale)} action={<Link to="/workload" className="text-[12px] text-primary hover:underline">{localize("Details", locale)}</Link>}>
          <WorkloadChart height={262} />
          <PredictionNote>{localize(workloadPlanApplied ? "Rebalancing applied. " : "Current forecast: ", locale)}{localize(distribution.filter((day) => day.required > day.available).map((day) => `${day.day} ${Math.round(day.required * 100) / 100}h`).join(" · "), locale)}{localize(". Weekly capacity gap:", locale)} <b>{localize(workloadTotals.required - workloadTotals.available, locale)}{localize("h", locale)}</b>{localize(".", locale)}</PredictionNote>
        </Panel>
        <Panel title={localize("Tomorrow's Schedule", locale)} subtitle={`${formatDate(scheduleDate, { weekday: "long", month: "short", day: "numeric" })} · ${localize("first day of Week 43", locale)}`} action={<Link to="/schedule" className="text-[12px] text-primary hover:underline">{localize("Week", locale)}</Link>}>
          <ol className="space-y-1.5">
            {localize((events.filter((e) => e.day === 0).sort((a, b) => a.start - b.start).map((e) => ({ ...e, start: formatHour(e.start), end: formatHour(e.end), room: undefined }))).map((s) => (
              <li key={s.start} className={cn("flex gap-3 rounded-md border px-2.5 py-1.5", s.kind === "free" ? "border-dashed border-success/40 bg-success-soft" : "bg-card")}>
                <div className="w-[92px] shrink-0 whitespace-nowrap font-mono text-[11px] leading-5 text-muted-foreground">{localize(s.start, locale)}{localize("–", locale)}{localize(s.end, locale)}</div>
                <div className="min-w-0">
                  <div className={cn("text-[13px] font-medium", s.kind === "free" && "text-success")}>{localize(s.title, locale)}</div>
                  {localize(s.room && <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><MapPin className="h-3 w-3" />{localize(s.room, locale)}</div>, locale)}
                </div>
              </li>
            )), locale)}
          </ol>
          <div className="mt-3"><PredictionNote>{localize(events.some((e) => e.day === 0 && e.kind === "study") ? "Monday study sessions are planned. See the calendar for remaining availability." : "Monday 13:00–15:00 is available for Assignment 3.", locale)}</PredictionNote></div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="h-7 flex-1 text-[12px]" onClick={() => navigate({ to: "/schedule" })}>{localize("Plan Study Session", locale)}</Button>
            <Button size="sm" variant="outline" className="h-7 flex-1 text-[12px]" onClick={() => navigate({ to: "/events" })}>{localize("Explore Activities", locale)}</Button>
          </div>
        </Panel>
      </div>

      <div className="mt-5 mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-ai" /> {localize("AI Insights", locale)} <span className="rounded border border-ai/20 bg-ai-soft px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ai">{localize(shown.length, locale)} {localize("new", locale)}</span></h2>
          <p className="text-[12.5px] text-muted-foreground">{localize("Proactive recommendations prepared by CampusPulse.", locale)}</p>
        </div>
        <Link to="/insights" className="text-[12px] text-primary hover:underline">{localize("View all insights", locale)}</Link>
      </div>
      <div className="grid gap-2.5 lg:grid-cols-3">{localize(shown.map((i) => <InsightCard key={i.id} insight={i} compact />), locale)}</div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <Panel title={localize("Upcoming Assignments", locale)} subtitle={localize("Click a row to open the assignment", locale)} bodyClass="p-0" action={<Link to="/assignments" className="text-[12px] text-primary hover:underline">{localize("All", locale)}</Link>}>
          <AssignmentTable ids={["se-a3", "adb-a4", "os-l5", "rm-r1"]} />
        </Panel>
        <Panel title={localize("Recent AI Activity", locale)} action={<Link to="/activity" className="text-[12px] text-primary hover:underline">{localize("View All Activity", locale)}</Link>}>
          <ActivityFeed items={activity.slice(0, 5)} />
        </Panel>
      </div>
    </>
  );
}
