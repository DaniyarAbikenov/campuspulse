import { cc } from "@/lib/chartColors";
import { useNavigate, Link } from "@tanstack/react-router";
import { AlertTriangle, FileSearch, GraduationCap, Clock, CalendarX, CheckCircle2, Bot, ListChecks, Link2, TrendingUp, Database, CalendarClock } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, ComposedChart, Legend } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { assignments, courseOf, weeklyWorkload, type Insight, type Activity } from "@/lib/data";
import { CourseTag, PriorityIndicator, ProgressBar, StatusBadge } from "./common";

const typeMeta: Record<Insight["type"], { icon: typeof AlertTriangle; cls: string }> = {
  "Workload Warning": { icon: AlertTriangle, cls: "text-warning bg-warning-soft" },
  "Assignment Analysis": { icon: FileSearch, cls: "text-ai bg-ai-soft" },
  "Study Preparation": { icon: GraduationCap, cls: "text-info bg-info-soft" },
  "Schedule Opportunity": { icon: Clock, cls: "text-success bg-success-soft" },
  "Deadline Conflict": { icon: CalendarX, cls: "text-destructive bg-danger-soft" },
};

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const { setInsightStatus, applyWorkloadPlan, approveProposal, addGeneratedTasks, tasksGenerated } = useStore();
  const navigate = useNavigate();
  const m = typeMeta[insight.type];
  const Icon = m.icon;
  const muted = insight.status === "Dismissed";
  return (
    <article className={cn("ai-surface group flex flex-col p-3 transition-shadow hover:shadow-md", muted && "opacity-60")}>
      <div className="flex items-center gap-1.5">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded", m.cls)}><Icon className="h-3 w-3" /></span>
        <span className="text-[11px] font-medium text-muted-foreground">{insight.type}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10.5px] tabular-nums text-ai" title="Model confidence">{Math.round(insight.confidence * 100)}%</span>
          <PriorityIndicator priority={insight.priority} />
        </span>
      </div>
      <h3 className="mt-2 text-[13px] font-semibold leading-snug tracking-[-0.005em]">{insight.title}</h3>
      <p className={cn("mt-1 text-[12px] leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>{insight.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        {insight.courses.map((c) => <CourseTag key={c} id={c} />)}
        <span className="tabular-nums">· {insight.date}</span>
      </div>
      <div className="mt-2.5 border-l-2 border-ai bg-ai-soft px-2 py-1.5 text-[11.5px] leading-snug"><span className="font-semibold text-ai">Suggested </span>{insight.action}</div>
      <div className="mt-auto flex items-center gap-1.5 pt-2.5 flex-wrap">
        <Button size="sm" className="h-7 px-2.5 text-[12px]" onClick={() => { navigate({ to: insight.primary.to }); }}>{insight.primary.label}</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-muted-foreground" onClick={() => {
          if (insight.secondary === "Open Assignment") { void navigate({ to: "/assignments/$assignmentId", params: { assignmentId: "se-a3" } }); return; }
          const s = insight.secondary === "Remind Me Later" ? "Snoozed" : "Dismissed";
          setInsightStatus(insight.id, s);
          toast(s === "Snoozed" ? "We'll remind you tomorrow at 09:00" : "Insight dismissed", { action: { label: "Undo", onClick: () => setInsightStatus(insight.id, "New") } });
        }}>{insight.secondary}</Button>
        {insight.status === "New" && <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => setInsightStatus(insight.id, "Accepted")}>Accept recommendation</Button>}
        {["New", "Accepted"].includes(insight.status) && ["i1", "i2"].includes(insight.id) && <Button size="sm" variant="outline" onClick={() => { if (insight.id === "i1") applyWorkloadPlan(); else { approveProposal(); addGeneratedTasks(); } toast.success("Recommendation applied"); }}>Apply{insight.id === "i2" && !tasksGenerated ? " to Kanban" : " plan"}</Button>}
        {!["Dismissed", "Applied"].includes(insight.status) && insight.secondary !== "Dismiss" && <Button size="sm" variant="ghost" onClick={() => setInsightStatus(insight.id, "Dismissed")}>Dismiss</Button>}
        {insight.status !== "New" && <span className="ml-auto"><StatusBadge status={insight.status} /></span>}
      </div>
    </article>
  );
}

export function WorkloadChart({ height = 220 }: { height?: number }) {
  const { distribution } = useStore();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={distribution} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={cc.border} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke={cc.muted} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} unit="h" />
        <Tooltip cursor={{ fill: cc.secondary }} contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="required" name="Required" radius={[3, 3, 0, 0]} barSize={22}>
          {distribution.map((d) => <Cell key={d.day} fill={d.required > d.available ? cc.danger : cc.primary} />)}
        </Bar>
        <Line dataKey="available" name="Available" type="stepAfter" stroke={cc.muted} strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({ data, x, y, height = 180, color = cc.primary }: { data: Record<string, unknown>[]; x: string; y: string; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={cc.border} />
        <XAxis dataKey={x} tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
        <Tooltip cursor={{ fill: cc.secondary }} contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
        <Bar dataKey={y} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AssignmentTable({ ids }: { ids?: string[] }) {
  const navigate = useNavigate();
  const { assignments: liveAssignments } = useStore();
  const rows = ids ? liveAssignments.filter((a) => ids.includes(a.id)) : liveAssignments;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-[12.5px]">
        <thead>
          <tr className="border-b bg-secondary/50 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-3.5 py-1.5 font-semibold">Assignment</th><th scope="col" className="px-2 py-1.5 font-semibold">Course</th><th scope="col" className="px-2 py-1.5 font-semibold">Deadline</th>
            <th scope="col" className="px-2 py-1.5 font-semibold">Estimate</th><th scope="col" className="w-36 px-2 py-1.5 font-semibold">Progress</th><th scope="col" className="px-3.5 py-1.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="cursor-pointer border-b last:border-0 hover:bg-secondary/60">
              <td className="px-3.5 py-2 font-medium"><Link to="/assignments/$assignmentId" params={{ assignmentId: a.id }} className="hover:text-primary">{a.title}</Link></td>
              <td className="px-2 py-2"><CourseTag id={a.courseId} /></td>
              <td className="px-2 py-2 tabular-nums">{a.deadline}</td>
              <td className="px-2 py-2 tabular-nums text-muted-foreground">{a.estimate}h</td>
              <td className="px-2 py-2"><div className="flex items-center gap-2"><ProgressBar value={a.progress} /><span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">{a.progress}%</span></div></td>
              <td className="px-3.5 py-2"><StatusBadge status={a.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const actIcon: Record<Activity["kind"], typeof Bot> = { analysis: FileSearch, task: ListChecks, dependency: Link2, forecast: TrendingUp, insight: Bot, index: Database, schedule: CalendarClock };

export function ActivityFeed({ items }: { items: Activity[] }) {
  return (
    <ol className="relative space-y-2.5 before:absolute before:left-[11px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = actIcon[a.kind];
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card", a.status === "warning" ? "text-warning" : "text-muted-foreground")}><Icon className="h-3 w-3" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12.5px]"><span className="font-medium">{a.title}</span>{a.status === "success" && <CheckCircle2 className="h-3 w-3 text-success" />}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">{a.detail}</div>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{a.time}</span>
          </li>
        );
      })}
    </ol>
  );
}

export { courseOf };
