import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type Context,
  type ReactNode,
} from "react";
import {
  initialTasks,
  initialInsights,
  initialActivity,
  generatedTasks,
  type Task,
  type Insight,
  type Activity,
  type CalEvent,
  weekEvents,
  assignments as initialAssignments,
  courses as initialCourses,
  weeklyWorkload,
  demoClock,
  generatedStudySlots,
  summarizeCourses,
  type Assignment,
  type Course,
} from "./data";
import { toast } from "sonner";
import {
  applyRemoteInsight,
  connectWorkspace,
  createRemoteEvent,
  createRemoteTask,
  moveRemoteTask,
  updateRemoteInsight,
  updateRemoteSettings,
  uploadRemoteAssignment,
  type RemoteSettings,
  type RemoteStatistics,
} from "./api";

type Role = "student" | "admin";

export type ConnectionState = "connecting" | "online" | "offline";

interface Store {
  backendConnected: boolean;
  connection: ConnectionState;
  statistics: RemoteStatistics | null;
  role: Role;
  setRole: (r: Role) => void;
  tasks: Task[];
  moveTask: (id: string, column: Task["column"]) => void;
  addTask: (t: Omit<Task, "id">) => Promise<void>;
  addGeneratedTasks: () => number;
  tasksGenerated: boolean;
  proposalApproved: boolean;
  approveProposal: () => void;
  proposalTasks: typeof generatedTasks;
  setProposalEstimate: (index: number, estimate: number) => void;
  analysisSource: string;
  recordAnalysis: (source: string) => void;
  scheduleGeneratedTasks: () => boolean;
  generatedScheduled: boolean;
  assignments: Assignment[];
  courses: Course[];
  distribution: typeof weeklyWorkload;
  workload: {
    required: number;
    available: number;
    allRemaining: number;
    scheduled: number;
    unscheduled: number;
  };
  insights: Insight[];
  setInsightStatus: (id: string, s: Insight["status"]) => void;
  applyInsight: (id: string) => void;
  activity: Activity[];
  log: (a: Omit<Activity, "id" | "time">) => void;
  events: CalEvent[];
  addEvent: (e: Omit<CalEvent, "id">) => Promise<void>;
  chatOpen: boolean;
  setChatOpen: (o: boolean) => void;
  chatContext: string;
  openChat: (ctx?: string) => void;
  uploadOpen: boolean;
  setUploadOpen: (o: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  workloadPlanApplied: boolean;
  applyWorkloadPlan: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean) => void;
  settings: RemoteSettings;
  updateSettings: (values: Partial<RemoteSettings>) => Promise<void>;
  uploadAssignment: (input: {
    file: File;
    courseId: string;
    title: string;
    dueAt: string;
    description?: string;
    estimatedHours: number;
  }) => Promise<void>;
}

// Fast Refresh can keep the mounted provider while re-evaluating this module.
// Keep its context identity so refreshed consumers still read that provider.
const hotData = import.meta.hot?.data;
const Ctx: Context<Store | null> = hotData?.campusPulseContext ?? createContext<Store | null>(null);
if (hotData) hotData.campusPulseContext = Ctx;

const now = () => demoClock;

export function StoreProvider({
  children,
  onRoleChange,
}: {
  children: ReactNode;
  onRoleChange?: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>("student");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const backendConnected = connection === "online";
  const [statistics, setStatistics] = useState<RemoteStatistics | null>(null);
  const [baseAssignments, setBaseAssignments] = useState<Assignment[]>(initialAssignments);
  const [baseCourses, setBaseCourses] = useState<Course[]>(initialCourses);
  const [baseDistribution, setBaseDistribution] = useState(weeklyWorkload);
  const [remoteWorkload, setRemoteWorkload] = useState<{
    required: number;
    available: number;
    allRemaining: number;
    scheduled: number;
    unscheduled: number;
  } | null>(null);
  const [settings, setSettings] = useState<RemoteSettings>({
    full_name: "Demo Student",
    program: "Software Engineering",
    group_name: "SE-2429",
    interface_language: "en",
    max_study_hours_per_day: 4,
    earliest_start: "08:00:00",
    latest_end: "21:00:00",
    proactive_insights: true,
    automatic_task_generation: true,
    share_anonymized_completion_times: false,
    deadline_reminders: true,
    daily_briefing: true,
    event_suggestions: false,
  });
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [tasksGenerated, setTasksGenerated] = useState(false);
  const imported = useRef(false);
  const scheduled = useRef(false);
  const approved = useRef(false);
  const [proposalApproved, setProposalApproved] = useState(false);
  const [proposalTasks, setProposalTasks] = useState(generatedTasks);
  const [analysisSource, setAnalysisSource] = useState("Assignment_3.pdf");
  const [generatedScheduled, setGeneratedScheduled] = useState(false);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [activity, setActivity] = useState<Activity[]>(initialActivity);
  const [events, setEvents] = useState<CalEvent[]>(weekEvents);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState("Overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workloadPlanApplied, setWorkloadPlanApplied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    let active = true;
    connectWorkspace()
      .then((workspace) => {
        if (!active) return;
        setBaseCourses(workspace.courses);
        setBaseAssignments(workspace.assignments);
        setTasks(workspace.tasks);
        setEvents(workspace.events);
        setInsights(workspace.insights);
        setBaseDistribution(workspace.distribution);
        setRemoteWorkload(workspace.workload);
        setSettings(workspace.settings);
        setStatistics(workspace.statistics);
        setConnection("online");
      })
      .catch((error: unknown) => {
        console.warn("CampusPulse API is unavailable; using local demo data.", error);
        if (active) setConnection("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  const log = useCallback((a: Omit<Activity, "id" | "time">) => {
    setActivity((prev) => [{ ...a, id: crypto.randomUUID(), time: now() }, ...prev]);
  }, []);

  const addGeneratedTasks = useCallback(() => {
    if (imported.current || !approved.current) return 0;
    imported.current = true;
    setTasks((prev) => [
      ...proposalTasks.map((t, i) => ({ ...t, id: `g${i}`, column: "todo" as Task["column"] })),
      ...prev,
    ]);
    setTasksGenerated(true);
    setInsights((prev) =>
      prev.map((insight) => (insight.id === "i2" ? { ...insight, status: "Applied" } : insight)),
    );
    log({
      title: "Approved tasks imported to Kanban",
      detail: `${proposalTasks.length} tasks · ${proposalTasks.reduce((sum, task) => sum + task.estimate, 0)}h · not scheduled yet`,
      kind: "task",
      status: "success",
    });
    return proposalTasks.length;
  }, [proposalTasks, log]);

  const liveAssignments = baseAssignments.map((assignment) => {
    if (assignment.id !== "se-a3") return assignment;
    const board = tasks.filter((task) => task.assignmentId === assignment.id);
    const done = board.filter((task) => task.column === "done").length;
    return {
      ...assignment,
      estimate: proposalTasks.reduce((sum, task) => sum + task.estimate, 0),
      progress: board.length ? Math.round((done / board.length) * 100) : 0,
      status: (board.length && done === board.length
        ? "Completed"
        : board.some((task) => task.column !== "todo")
          ? "In Progress"
          : "To Do") as Assignment["status"],
    };
  });
  const liveCourses = summarizeCourses(liveAssignments).map((summary) => {
    const remote = baseCourses.find((course) => course.id === summary.id);
    const course = remote
      ? {
          ...remote,
          assignments: summary.assignments,
          completed: summary.completed,
          progress: summary.progress,
          remaining: summary.remaining,
          nextDeadline: summary.nextDeadline,
        }
      : summary;
    return course.id === "se" &&
      liveAssignments.find((assignment) => assignment.id === "se-a3")?.status !== "Completed"
      ? {
          ...course,
          remaining:
            course.remaining -
            tasks
              .filter((task) => task.ai && task.column === "done")
              .reduce((sum, task) => sum + task.estimate, 0),
        }
      : course;
  });
  const proposalDelta = proposalTasks.reduce((sum, task) => sum + task.estimate, 0) - 8.5;
  const completedHours = tasks
    .filter((task) => task.column === "done" && task.ai)
    .reduce((sum, task) => sum + task.estimate, 0);
  const distribution = baseDistribution.map((day, index) => ({
    ...day,
    required: Math.max(
      0,
      day.required +
        (index === 2 ? proposalDelta : 0) -
        (completedHours * day.required) / 21.5 +
        (workloadPlanApplied ? (index === 0 ? 2 : index === 2 ? -2 : 0) : 0),
    ),
  }));
  const required = Math.round(distribution.reduce((sum, day) => sum + day.required, 0) * 100) / 100;
  const scheduledHours = events
    .filter(
      (event) =>
        event.kind === "study" &&
        (!event.taskId || tasks.some((task) => task.id === event.taskId && task.column !== "done")),
    )
    .reduce((sum, event) => sum + event.end - event.start, 0);

  const value: Store = {
    backendConnected,
    connection,
    statistics,
    role,
    setRole: (next) => {
      onRoleChange?.(next);
      setRole(next);
      setChatOpen(false);
      setUploadOpen(false);
    },
    tasks,
    tasksGenerated,
    mobileNavOpen,
    setMobileNavOpen,
    workloadPlanApplied,
    proposalApproved,
    proposalTasks,
    analysisSource,
    generatedScheduled,
    assignments: liveAssignments,
    courses: liveCourses,
    distribution,
    workload:
      remoteWorkload && !workloadPlanApplied
        ? remoteWorkload
        : {
            required,
            available: baseDistribution.reduce((sum, day) => sum + day.available, 0),
            allRemaining: liveCourses.reduce((sum, course) => sum + course.remaining, 0),
            scheduled: scheduledHours,
            unscheduled: Math.max(0, required - scheduledHours),
          },
    recordAnalysis: (source) => {
      setAnalysisSource(source);
      log({
        title: "PDF analysis ready for approval",
        detail: `${source} · simulated fixture · ${proposalTasks.length} proposed tasks`,
        kind: "analysis",
        status: "success",
      });
    },
    setProposalEstimate: (index, estimate) => {
      if (imported.current || !Number.isFinite(estimate) || estimate <= 0) return;
      setProposalTasks((items) =>
        items.map((task, i) => (i === index ? { ...task, estimate } : task)),
      );
      approved.current = false;
      setProposalApproved(false);
      setInsights((items) =>
        items.map((insight) => (insight.id === "i2" ? { ...insight, status: "New" } : insight)),
      );
    },
    approveProposal: () => {
      if (imported.current) return;
      approved.current = true;
      setProposalApproved(true);
      setInsights((items) =>
        items.map((insight) =>
          insight.id === "i2" ? { ...insight, status: "Accepted" } : insight,
        ),
      );
    },
    scheduleGeneratedTasks: () => {
      if (!imported.current || scheduled.current) return false;
      const proposals = proposalTasks
        .map((task, i) => {
          const slot = generatedStudySlots[i];
          return slot
            ? {
                ...slot,
                id: `study-g${i}`,
                taskId: `g${i}`,
                title: `Study: ${task.title}`,
                kind: "study" as const,
                courseId: task.courseId,
                end: slot.start + task.estimate,
              }
            : null;
        })
        .filter((event): event is NonNullable<typeof event> => event !== null);
      const conflict = proposals.some(
        (event) =>
          event.end > 21 ||
          events.some(
            (existing) =>
              existing.day === event.day &&
              existing.start < event.end &&
              existing.end > event.start,
          ) ||
          proposals.some(
            (other) =>
              other.id !== event.id &&
              other.day === event.day &&
              other.start < event.end &&
              other.end > event.start,
          ),
      );
      if (conflict) return false;
      scheduled.current = true;
      setGeneratedScheduled(true);
      setEvents((items) => [...items, ...proposals]);
      log({
        title: "Approved tasks scheduled",
        detail: `${proposals.length} sessions · workload forecast updated`,
        kind: "schedule",
        status: "success",
      });
      return true;
    },
    applyWorkloadPlan: () => {
      if (workloadPlanApplied) return;
      setWorkloadPlanApplied(true);
      setInsights((items) =>
        items.map((item) => (item.id === "i1" ? { ...item, status: "Applied" } : item)),
      );
      setEvents((items) =>
        items.some((event) => event.day === 0 && event.start < 15 && event.end > 13)
          ? items
          : [
              ...items,
              {
                id: "rebalance-se",
                day: 0,
                start: 13,
                end: 15,
                title: "Study: Software Engineering",
                kind: "study",
                courseId: "se",
              },
            ],
      );
      log({
        title: "Workload plan applied",
        detail: "2h moved from Wednesday to Monday; weekly capacity unchanged",
        kind: "schedule",
        status: "success",
      });
    },
    moveTask: (id, column) => {
      const task = tasks.find((item) => item.id === id);
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, column } : t)));
      if (task?.backendId)
        void moveRemoteTask(task.backendId, column).catch((error) =>
          console.warn("Task sync failed", error),
        );
    },
    addTask: async (t) => {
      const localId = crypto.randomUUID();
      const assignment =
        (t.assignmentId ? baseAssignments.find((item) => item.id === t.assignmentId) : undefined) ??
        baseAssignments.find(
          (item) => item.courseId === t.courseId && item.status !== "Completed" && item.backendId,
        );
      const task = { ...t, ...(assignment ? { assignmentId: assignment.id } : {}) };
      setTasks((p) => [{ ...task, id: localId }, ...p]);
      if (!backendConnected || !assignment?.backendId) return;
      try {
        const backendId = await createRemoteTask(task, assignment.backendId);
        setTasks((p) => p.map((item) => (item.id === localId ? { ...item, backendId } : item)));
      } catch (error) {
        setTasks((p) => p.filter((item) => item.id !== localId));
        toast.error("Task was not saved", { description: String(error) });
      }
    },
    addGeneratedTasks,
    insights: insights.map((insight) =>
      insight.id === "i2"
        ? {
            ...insight,
            description: `${proposalTasks.length} tasks · ${proposalTasks.reduce((sum, task) => sum + task.estimate, 0)}h · ${tasksGenerated ? (generatedScheduled ? "imported and scheduled" : "imported, not scheduled") : proposalApproved ? "approved, not imported" : "generated, not imported"}. Extends Assignment 2.`,
            action: tasksGenerated
              ? "Open the board to review tasks and calendar planning."
              : "Review, approve and import the proposed tasks.",
            sources: [analysisSource, "Assignment_2.pdf"],
          }
        : insight,
    ),
    setInsightStatus: (id, s) => {
      const insight = insights.find((item) => item.id === id);
      if (id === "i2" && s === "Accepted") {
        approved.current = true;
        setProposalApproved(true);
      }
      if (id === "i2" && s === "Dismissed" && !imported.current) {
        approved.current = false;
        setProposalApproved(false);
      }
      setInsights((p) => p.map((i) => (i.id === id ? { ...i, status: s } : i)));
      if (insight?.backendId)
        void updateRemoteInsight(insight.backendId, s).catch((error) =>
          console.warn("Insight sync failed", error),
        );
    },
    applyInsight: (id) => {
      const insight = insights.find((item) => item.id === id);
      setInsights((items) =>
        items.map((item) => (item.id === id ? { ...item, status: "Applied" } : item)),
      );
      if (insight?.backendId)
        void applyRemoteInsight(insight.backendId).catch((error) =>
          console.warn("Insight apply failed", error),
        );
    },
    activity,
    log,
    events,
    addEvent: async (e) => {
      const localId = crypto.randomUUID();
      setEvents((p) => [...p, { ...e, id: localId }]);
      if (!backendConnected) return;
      try {
        const course = e.courseId ? baseCourses.find((item) => item.id === e.courseId) : undefined;
        const backendId = await createRemoteEvent(e, course?.backendId);
        setEvents((p) => p.map((item) => (item.id === localId ? { ...item, backendId } : item)));
      } catch (error) {
        setEvents((p) => p.filter((item) => item.id !== localId));
        toast.error("Event was not saved", { description: String(error) });
      }
    },
    chatOpen,
    setChatOpen,
    chatContext,
    openChat: (ctx) => {
      if (ctx) setChatContext(ctx);
      setChatOpen(true);
    },
    uploadOpen,
    setUploadOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    settings,
    updateSettings: async (values) => {
      const updated = await updateRemoteSettings(values);
      setSettings(updated);
    },
    uploadAssignment: async (input) => {
      const course = baseCourses.find((item) => item.id === input.courseId);
      if (!course?.backendId) throw new Error("The selected course is not connected to the API");
      await uploadRemoteAssignment({ ...input, courseId: course.backendId });
      const workspace = await connectWorkspace();
      setBaseCourses(workspace.courses);
      setBaseAssignments(workspace.assignments);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
