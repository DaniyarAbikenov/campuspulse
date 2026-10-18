import { localize, useI18n } from "@/lib/i18n";
import { cc } from "@/lib/chartColors";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  FileSearch,
  GraduationCap,
  Clock,
  CalendarX,
  CheckCircle2,
  Bot,
  ListChecks,
  Link2,
  TrendingUp,
  Database,
  CalendarClock,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
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
  const { locale } = useI18n();
  const {
    setInsightStatus,
    applyInsight,
    applyWorkloadPlan,
    approveProposal,
    addGeneratedTasks,
    tasksGenerated,
  } = useStore();
  const navigate = useNavigate();
  const m = typeMeta[insight.type];
  const Icon = m.icon;
  const muted = insight.status === "Dismissed";
  return (
    <article
      className={cn(
        "ai-surface group flex flex-col p-3 transition-shadow hover:shadow-md",
        muted && "bg-secondary",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded", m.cls)}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {localize(insight.type, locale)}
        </span>
        <span className="col-span-2 flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-[10.5px] tabular-nums text-ai"
            title={localize("Model confidence", locale)}
          >
            {localize(Math.round(insight.confidence * 100), locale)}
            {localize("%", locale)}
          </span>
          <PriorityIndicator priority={insight.priority} />
        </span>
      </div>
      <h2 className="mt-2 text-[13px] font-semibold leading-snug tracking-[-0.005em]">
        {localize(insight.title, locale)}
      </h2>
      <p
        className={cn(
          "mt-1 text-[12px] leading-relaxed text-muted-foreground",
          compact && "line-clamp-2",
        )}
      >
        {localize(insight.description, locale)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
        {localize(
          insight.courses.map((c) => <CourseTag key={c} id={c} />),
          locale,
        )}
        <span className="tabular-nums">
          {localize("·", locale)} {localize(insight.date, locale)}
        </span>
      </div>
      <div className="mt-2.5 border-l-2 border-ai bg-ai-soft px-2 py-1.5 text-[11.5px] leading-snug">
        <span className="font-semibold text-ai">{localize("Suggested", locale)} </span>
        {localize(insight.action, locale)}
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-2.5 flex-wrap">
        <Button
          size="sm"
          className="h-7 px-2.5 text-[12px]"
          onClick={() => {
            if (insight.id === "i2")
              navigate({ to: "/assignments/$assignmentId", params: { assignmentId: "se-a3" } });
            else navigate({ to: insight.primary.to });
          }}
        >
          {localize(insight.primary.label, locale)}
        </Button>
        <Button
          disabled={insight.status === "Applied" && insight.secondary !== "Open Assignment"}
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[12px] text-muted-foreground"
          onClick={() => {
            if (insight.secondary === "Open Assignment") {
              void navigate({
                to: "/assignments/$assignmentId",
                params: { assignmentId: "se-a3" },
              });
              return;
            }
          const s = insight.secondary === "Remind Me Later" ? "Snoozed" : "Dismissed";
          setInsightStatus(insight.id, s);
            toast(s === "Snoozed" ? "We'll remind you tomorrow at 09:00" : "Insight dismissed", {
              action: { label: "Undo", onClick: () => setInsightStatus(insight.id, "New") },
            });
          }}
        >
          {localize(insight.secondary, locale)}
        </Button>
        {localize(
          insight.status === "New" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[12px]"
              onClick={() => setInsightStatus(insight.id, "Accepted")}
            >
              {localize("Accept recommendation", locale)}
            </Button>
          ),
          locale,
        )}
        {localize(
          ["New", "Accepted"].includes(insight.status) && ["i1", "i2"].includes(insight.id) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (insight.id === "i1") applyWorkloadPlan();
                else {
                  approveProposal();
                  addGeneratedTasks();
                }
                applyInsight(insight.id);
                toast.success(localize("Recommendation applied", locale));
              }}
            >
              {localize(
                insight.id === "i2" && !tasksGenerated ? "Apply to Kanban" : "Apply plan",
                locale,
              )}
            </Button>
          ),
          locale,
        )}
        {localize(
          !["Dismissed", "Applied"].includes(insight.status) && insight.secondary !== "Dismiss" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setInsightStatus(insight.id, "Dismissed")}
            >
              {localize("Dismiss", locale)}
            </Button>
          ),
          locale,
        )}
        {localize(
          insight.status !== "New" && (
            <span className="ml-auto">
              <StatusBadge status={insight.status} />
            </span>
          ),
          locale,
        )}
      </div>
    </article>
  );
}

export function WorkloadChart({ height = 220 }: { height?: number }) {
  const { locale } = useI18n();
  const { distribution } = useStore();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={distribution} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={cc.border} />
        <XAxis
          dataKey="day"
          tickFormatter={(value) => localize(String(value), locale)}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke={cc.muted}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke={cc.muted}
          unit={localize("h", locale)}
        />
        <Tooltip
          cursor={{ fill: cc.secondary }}
          contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar
          dataKey="required"
          name={localize("Required", locale)}
          radius={[3, 3, 0, 0]}
          barSize={22}
        >
          {localize(
            distribution.map((d) => (
              <Cell key={d.day} fill={d.required > d.available ? cc.danger : cc.primary} />
            )),
            locale,
          )}
        </Bar>
        <Line
          dataKey="available"
          name={localize("Available", locale)}
          type="stepAfter"
          stroke={cc.muted}
          strokeDasharray="4 4"
          dot={false}
          strokeWidth={1.5}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SimpleBars({
  data,
  x,
  y,
  height = 180,
  color = cc.primary,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  height?: number;
  color?: string;
}) {
  const { locale } = useI18n();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={cc.border} />
        <XAxis
          dataKey={x}
          tickFormatter={(value) => localize(String(value), locale)}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke={cc.muted}
        />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke={cc.muted} />
        <Tooltip
          cursor={{ fill: cc.secondary }}
          contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
        />
        <Bar dataKey={y} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AssignmentTable({ ids }: { ids?: string[] }) {
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { assignments: liveAssignments } = useStore();
  const rows = ids ? liveAssignments.filter((a) => ids.includes(a.id)) : liveAssignments;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px] w-full text-[12.5px]">
        <thead>
          <tr className="border-b bg-secondary/50 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-3.5 py-1.5 font-semibold">
              {localize("Assignment", locale)}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {localize("Course", locale)}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {localize("Deadline", locale)}
            </th>
            <th scope="col" className="px-2 py-1.5 font-semibold">
              {localize("Estimate", locale)}
            </th>
            <th scope="col" className="w-36 px-2 py-1.5 font-semibold">
              {localize("Progress", locale)}
            </th>
            <th scope="col" className="px-3.5 py-1.5 font-semibold">
              {localize("Status", locale)}
            </th>
          </tr>
        </thead>
        <tbody>
          {localize(
            rows.map((a) => (
              <tr
                key={a.id}
                className="cursor-pointer border-b last:border-0 hover:bg-secondary/60"
              >
                <td className="px-3.5 py-2 font-medium">
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="hover:text-primary"
                  >
                    {localize(a.title, locale)}
                  </Link>
                </td>
                <td className="px-2 py-2">
                  <CourseTag id={a.courseId} />
                </td>
              <td className="px-2 py-2 tabular-nums">{localize(a.deadline, locale)}</td>
                <td className="px-2 py-2 tabular-nums text-muted-foreground">
                  {localize(a.estimate, locale)}
                  {localize("h", locale)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={a.progress} />
                    <span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">
                      {localize(a.progress, locale)}
                      {localize("%", locale)}
                    </span>
                  </div>
                </td>
                <td className="px-3.5 py-2">
                  <StatusBadge status={a.status} />
                </td>
            </tr>
            )),
            locale,
          )}
        </tbody>
      </table>
    </div>
  );
}

const actIcon: Record<Activity["kind"], typeof Bot> = {
  analysis: FileSearch,
  task: ListChecks,
  dependency: Link2,
  forecast: TrendingUp,
  insight: Bot,
  index: Database,
  schedule: CalendarClock,
};

export function ActivityFeed({ items }: { items: Activity[] }) {
  const { locale } = useI18n();
  return (
    <ol className="relative space-y-2.5 before:absolute before:left-[11px] before:top-1 before:h-[calc(100%-8px)] before:w-px before:bg-border">
      {localize(
        items.map((a) => {
        const Icon = actIcon[a.kind];
        return (
          <li key={a.id} className="relative flex gap-3">
              <span
                className={cn(
                  "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card",
                  a.status === "warning" ? "text-warning" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12.5px]">
                  <span className="font-medium">{localize(a.title, locale)}</span>
                  {localize(
                    a.status === "success" && <CheckCircle2 className="h-3 w-3 text-success" />,
                    locale,
                  )}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {localize(a.detail, locale)}
            </div>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">
                {localize(a.time, locale)}
              </span>
          </li>
        );
        }),
        locale,
      )}
    </ol>
  );
}

export { courseOf };
