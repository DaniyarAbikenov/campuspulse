import { createContext, useContext, useState, useCallback, type Context, type ReactNode } from "react";
import { initialTasks, initialInsights, initialActivity, generatedTasks, type Task, type Insight, type Activity, type CalEvent, weekEvents } from "./data";

type Role = "student" | "admin";

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  tasks: Task[];
  moveTask: (id: string, column: Task["column"]) => void;
  addTask: (t: Omit<Task, "id">) => void;
  addGeneratedTasks: () => number;
  tasksGenerated: boolean;
  insights: Insight[];
  setInsightStatus: (id: string, s: Insight["status"]) => void;
  activity: Activity[];
  log: (a: Omit<Activity, "id" | "time">) => void;
  events: CalEvent[];
  addEvent: (e: Omit<CalEvent, "id">) => void;
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
}

// Fast Refresh can keep the mounted provider while re-evaluating this module.
// Keep its context identity so refreshed consumers still read that provider.
const hotData = import.meta.hot?.data;
const Ctx: Context<Store | null> = hotData?.campusPulseContext ?? createContext<Store | null>(null);
if (hotData) hotData.campusPulseContext = Ctx;

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function StoreProvider({ children, onRoleChange }: { children: ReactNode; onRoleChange?: (role: Role) => void }) {
  const [role, setRole] = useState<Role>("student");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [tasksGenerated, setTasksGenerated] = useState(false);
  const [insights, setInsights] = useState<Insight[]>(initialInsights);
  const [activity, setActivity] = useState<Activity[]>(initialActivity);
  const [events, setEvents] = useState<CalEvent[]>(weekEvents);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState("Overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workloadPlanApplied, setWorkloadPlanApplied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const log = useCallback((a: Omit<Activity, "id" | "time">) => {
    setActivity((prev) => [{ ...a, id: crypto.randomUUID(), time: now() }, ...prev]);
  }, []);

  const addGeneratedTasks = useCallback(() => {
    if (tasksGenerated) return 0;
    setTasks((prev) => [
      ...generatedTasks.map((t, i) => ({ ...t, id: `g${i}`, column: (i === 0 ? "progress" : "todo") as Task["column"] })),
      ...prev,
    ]);
    setTasksGenerated(true);
    setInsights((prev) => [
      { id: "i-new", type: "Assignment Analysis", title: "Assignment 3 has been analyzed and planned", description: "6 tasks totalling 8.5h were added to your Kanban board and spread across Oct 19–23 around your lectures.", priority: "Medium", courses: ["se"], date: "Due Oct 23", action: "Start with 'Review existing authentication architecture' (0.5h) today.", primary: { label: "Open Kanban", to: "/kanban" }, secondary: "Dismiss", status: "New", confidence: 0.93, sources: ["Assignment_3.pdf", "Kanban board", "Timetable"] },
      ...prev.filter((i) => i.id !== "i-new"),
    ]);
    log({ title: "Six tasks added to Kanban", detail: "Software Engineering · Assignment 3 · 8.5h", kind: "task", status: "success" });
    return generatedTasks.length;
  }, [tasksGenerated, log]);

  const value: Store = {
    role, setRole: (next) => { onRoleChange?.(next); setRole(next); setChatOpen(false); setUploadOpen(false); }, tasks, tasksGenerated,
    mobileNavOpen, setMobileNavOpen, workloadPlanApplied,
    applyWorkloadPlan: () => {
      if (workloadPlanApplied) return;
      setWorkloadPlanApplied(true);
      setInsights((items) => items.map((item) => item.id === "i1" ? { ...item, status: "Accepted" } : item));
      setEvents((items) => [...items, { id: "rebalance-se", day: 0, start: 13, end: 15, title: "Study: Software Engineering", kind: "study", courseId: "se" }]);
      log({ title: "Workload plan applied", detail: "2h moved from Wednesday to Monday; weekly capacity unchanged", kind: "schedule", status: "success" });
    },
    moveTask: (id, column) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, column } : t))),
    addTask: (t) => setTasks((p) => [{ ...t, id: crypto.randomUUID() }, ...p]),
    addGeneratedTasks,
    insights,
    setInsightStatus: (id, s) => setInsights((p) => p.map((i) => (i.id === id ? { ...i, status: s } : i))),
    activity, log, events,
    addEvent: (e) => setEvents((p) => [...p, { ...e, id: crypto.randomUUID() }]),
    chatOpen, setChatOpen, chatContext,
    openChat: (ctx) => { if (ctx) setChatContext(ctx); setChatOpen(true); },
    uploadOpen, setUploadOpen, sidebarCollapsed, setSidebarCollapsed,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
