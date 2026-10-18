import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Clock, BookOpen, Hourglass, Plus, Sparkles, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard, PageHeader, Panel, PredictionNote } from "@/components/app/common";
import { ActivityFeed, AssignmentTable, InsightCard, WorkloadChart } from "@/components/app/widgets";
import { useStore } from "@/lib/store";
import { todaySchedule } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — CampusPulse AI" },
      { name: "description", content: "Your academic command center: deadlines, workload, schedule and AI recommendations." },
      { property: "og:title", content: "Overview — CampusPulse AI" },
      { property: "og:description", content: "Your academic command center: deadlines, workload, schedule and AI recommendations." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { insights, activity, setUploadOpen, openChat } = useStore();
  const navigate = useNavigate();
  const shown = insights.filter((i) => ["i-new", "i1", "i2", "i3"].includes(i.id)).slice(0, 3);
  return (
    <>
      <PageHeader
        title="Good afternoon."
        subtitle="Here's what's happening across your academic workspace."
        actions={<>
          <span className="mr-1 text-[12.5px] text-muted-foreground">Sunday, October 18, 2026</span>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}><Plus className="h-3.5 w-3.5" /> Add Assignment</Button>
          <Button size="sm" onClick={() => openChat("Overview")}><Sparkles className="h-3.5 w-3.5" /> Ask CampusPulse</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Upcoming Deadlines" value="4" sub="Next 7 days" icon={CalendarClock} trend={{ dir: "up", text: "+2 vs last week" }} />
        <MetricCard label="Estimated Workload" value="21.5h" sub="Remaining this week · exceeds capacity" icon={Hourglass} tone="warning" trend={{ dir: "up", text: "+9.5h over" }} />
        <MetricCard label="Active Courses" value="5" sub="Fall Semester 2026" icon={BookOpen} />
        <MetricCard label="Available Study Time" value="12h" sub="Before upcoming deadlines" icon={Clock} trend={{ dir: "down", text: "−3h", good: false }} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Weekly Workload" subtitle="Estimated required vs. available hours · Week 43" action={<Link to="/workload" className="text-[12px] text-primary hover:underline">Details</Link>}>
          <WorkloadChart height={262} />
          <PredictionNote><b>Wednesday and Thursday</b> have the highest workload (7h and 6h vs. ~3h available). Consider moving one study session to Monday.</PredictionNote>
        </Panel>
        <Panel title="Today's Schedule" subtitle="Monday, Oct 19 · first day of Week 43" action={<Link to="/schedule" className="text-[12px] text-primary hover:underline">Week</Link>}>
          <ol className="space-y-1.5">
            {todaySchedule.map((s) => (
              <li key={s.start} className={cn("flex gap-3 rounded-md border px-2.5 py-1.5", s.kind === "free" ? "border-dashed border-success/40 bg-success-soft" : "bg-card")}>
                <div className="w-[92px] shrink-0 whitespace-nowrap font-mono text-[11px] leading-5 text-muted-foreground">{s.start}–{s.end}</div>
                <div className="min-w-0">
                  <div className={cn("text-[13px] font-medium", s.kind === "free" && "text-success")}>{s.title}</div>
                  {s.room && <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><MapPin className="h-3 w-3" />{s.room}</div>}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3"><PredictionNote>You have a 2-hour free slot. This could be a good opportunity to work on <b>Assignment 3</b>.</PredictionNote></div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="h-7 flex-1 text-[12px]" onClick={() => navigate({ to: "/schedule" })}>Plan Study Session</Button>
            <Button size="sm" variant="outline" className="h-7 flex-1 text-[12px]" onClick={() => navigate({ to: "/events" })}>Explore Activities</Button>
          </div>
        </Panel>
      </div>

      <div className="mt-5 mb-2 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-ai" /> AI Insights <span className="rounded border border-ai/20 bg-ai-soft px-1.5 text-[10px] font-semibold uppercase tracking-wide text-ai">{shown.length} new</span></h2>
          <p className="text-[12.5px] text-muted-foreground">Proactive recommendations prepared by CampusPulse.</p>
        </div>
        <Link to="/insights" className="text-[12px] text-primary hover:underline">View all insights</Link>
      </div>
      <div className="grid gap-2.5 md:grid-cols-3">{shown.map((i) => <InsightCard key={i.id} insight={i} compact />)}</div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.85fr_1fr]">
        <Panel title="Upcoming Assignments" subtitle="Click a row to open the assignment" bodyClass="p-0" action={<Link to="/assignments" className="text-[12px] text-primary hover:underline">All</Link>}>
          <AssignmentTable ids={["se-a3", "adb-a4", "os-l5", "rm-r1"]} />
        </Panel>
        <Panel title="Recent AI Activity" action={<Link to="/activity" className="text-[12px] text-primary hover:underline">View All Activity</Link>}>
          <ActivityFeed items={activity.slice(0, 5)} />
        </Panel>
      </div>
    </>
  );
}
