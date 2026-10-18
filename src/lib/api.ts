import {
  assignments as fixtureAssignments,
  courses as fixtureCourses,
  type Assignment,
  type CalEvent,
  type Course,
  type Insight,
  type Task,
} from "./data";

const API_URL = import.meta.env["VITE_API_URL"] ?? "http://127.0.0.1:8000/api/v1";
const WEEK_START = "2026-10-19";
let accessToken = "";
let refreshToken = "";

interface ApiCourse {
  id: string;
  code: string;
  name: string;
  instructor_name?: string | null;
  description?: string | null;
  assignment_count: number;
  completed_assignment_count: number;
  completion_percent: number;
  remaining_hours: number;
  next_due_at?: string | null;
}
interface ApiAssignment {
  id: string;
  course_id: string;
  title: string;
  due_at: string;
  estimated_hours: number;
  actual_hours?: number | null;
  progress_percent: number;
  status: string;
}
interface ApiAssignmentPage {
  items: ApiAssignment[];
}
interface ApiTask {
  id: string;
  course_id: string;
  assignment_id?: string | null;
  title: string;
  description?: string | null;
  estimated_hours: number;
  priority: string;
  due_at?: string | null;
  status: string;
  is_ai_generated: boolean;
  source_requirement?: string | null;
}
interface ApiKanban {
  columns: { tasks: ApiTask[] }[];
}
interface ApiEvent {
  id: string;
  starts_at: string;
  ends_at: string;
  title: string;
  kind: string;
  course_id?: string | null;
  task_id?: string | null;
}
interface ApiSchedule {
  events: ApiEvent[];
}
interface ApiWorkload {
  required_hours: number;
  available_hours: number;
  scheduled_study_hours: number;
  unscheduled_hours: number;
  by_day: { day: string; required_hours: number; available_hours: number }[];
}
interface ApiInsight {
  id: string;
  course_id?: string | null;
  category: string;
  title: string;
  summary: string;
  suggestion: string;
  confidence: number;
  severity: string;
  status: string;
  cta: { label: string; action: string };
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (refreshed.ok) {
      const tokens = (await refreshed.json()) as { access_token: string; refresh_token: string };
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
      return request<T>(path, init, false);
    }
  }
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

const courseIdByCode: Record<string, string> = {
  "SE 3204": "se",
  "CS 3112": "adb",
  "CS 2207": "os",
  "RM 2010": "rm",
  "MATH 2301": "stat",
};
const colors: Record<string, string> = {
  se: "bg-primary",
  adb: "bg-info",
  os: "bg-warning",
  rm: "bg-success",
  stat: "bg-destructive",
};
const assignmentIdByTitle: Record<string, string> = {
  "Assignment 3 — Authentication": "se-a3",
  "Assignment 4 — Aggregation": "adb-a4",
  "Lab 5 — Process Scheduling": "os-l5",
  "Research Methods Report": "rm-r1",
  "Problem Set 2 — Regression": "stat-p2",
  "Assignment 1 — REST API Basics": "se-a1",
  "Assignment 2 — Database Integration": "se-a2",
  "Assignment 4 — Testing": "se-a4",
  "Assignment 3 — Indexing": "adb-a3",
};
const insightIdByCategory: Record<string, string> = {
  workload_warning: "i1",
  assignment_analysis: "i2",
  study_preparation: "i3",
  schedule_opportunity: "i4",
  deadline_conflict: "i5",
};
const shortDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(value),
      )
    : "—";
const hours = (value: string) => {
  const date = new Date(value);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
};
const dayIndex = (value: string) =>
  Math.max(
    0,
    Math.min(6, Math.round((Date.parse(value.slice(0, 10)) - Date.parse(WEEK_START)) / 86_400_000)),
  );
const titleStatus = (status: string): Assignment["status"] =>
  (
    ({
      todo: "To Do",
      in_progress: "In Progress",
      review: "Review",
      completed: "Completed",
      upcoming: "Upcoming",
    }) as Record<string, Assignment["status"]>
  )[status] ?? "To Do";
const taskColumn = (status: string): Task["column"] =>
  (({ in_progress: "progress", completed: "done" }) as Record<string, Task["column"]>)[status] ??
  (status as Task["column"]);
const taskStatus = (column: Task["column"]) =>
  ({
    progress: "in_progress",
    done: "completed",
    backlog: "backlog",
    todo: "todo",
    review: "review",
  })[column];

export interface RemoteSettings {
  full_name: string;
  program: string | null;
  group_name: string | null;
  interface_language: string;
  max_study_hours_per_day: number;
  earliest_start: string;
  latest_end: string;
  proactive_insights: boolean;
  automatic_task_generation: boolean;
  share_anonymized_completion_times: boolean;
  deadline_reminders: boolean;
  daily_briefing: boolean;
  event_suggestions: boolean;
}
export interface WorkspaceData {
  courses: Course[];
  assignments: Assignment[];
  tasks: Task[];
  events: CalEvent[];
  insights: Insight[];
  distribution: { day: string; required: number; available: number }[];
  workload: {
    required: number;
    available: number;
    allRemaining: number;
    scheduled: number;
    unscheduled: number;
  };
  settings: RemoteSettings;
}

export async function connectWorkspace(): Promise<WorkspaceData> {
  const tokens = await request<{ access_token: string; refresh_token: string }>("/auth/demo", {
    method: "POST",
  });
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  const [rawCourses, page, board, schedule, workload, rawInsights, settings] = await Promise.all([
    request<ApiCourse[]>("/courses/overview"),
    request<ApiAssignmentPage>("/assignments/overview"),
    request<ApiKanban>("/kanban"),
    request<ApiSchedule>(`/schedule?week_start=${WEEK_START}`),
    request<ApiWorkload>(`/workload?week_start=${WEEK_START}`),
    request<ApiInsight[]>("/insights"),
    request<RemoteSettings>("/settings"),
  ]);
  const courseByBackend = new Map<string, string>();
  const courses: Course[] = rawCourses.map((item) => {
    const id = courseIdByCode[item.code] ?? item.id;
    const fixture = fixtureCourses.find((course) => course.id === id);
    courseByBackend.set(item.id, id);
    return {
      id,
      backendId: item.id,
      name: item.name,
      code: item.code,
      instructor: item.instructor_name ?? "",
      assignments: item.assignment_count,
      completed: item.completed_assignment_count,
      progress: item.completion_percent,
      remaining: item.remaining_hours,
      nextDeadline: shortDate(item.next_due_at),
      color: colors[id] ?? "bg-primary",
      docs: fixture?.docs ?? 0,
      technologies: fixture?.technologies ?? [],
      summary: item.description ?? fixture?.summary ?? "",
    };
  });
  const assignmentByBackend = new Map<string, string>();
  const assignments: Assignment[] = page.items.map((item) => {
    const id = assignmentIdByTitle[item.title] ?? item.id;
    const fixture = fixtureAssignments.find((assignment) => assignment.id === id);
    assignmentByBackend.set(item.id, id);
    return {
      id,
      backendId: item.id,
      title: item.title,
      courseId: courseByBackend.get(item.course_id) ?? item.course_id,
      deadline: shortDate(item.due_at),
      estimate: item.estimated_hours,
      progress: item.progress_percent,
      status: titleStatus(item.status),
      ...(fixture?.dependsOn ? { dependsOn: fixture.dependsOn } : {}),
      ...(fixture?.relation ? { relation: fixture.relation } : {}),
      ...(item.actual_hours == null ? {} : { actual: item.actual_hours }),
    };
  });
  const tasks: Task[] = board.columns.flatMap((column) =>
    column.tasks.map((item) => ({
      id: item.id,
      backendId: item.id,
      title: item.title,
      description: item.description ?? "",
      courseId: courseByBackend.get(item.course_id) ?? item.course_id,
      estimate: item.estimated_hours,
      priority:
        ({ high: "High", medium: "Medium", low: "Low" } as Record<string, Task["priority"]>)[
          item.priority
        ] ?? "Medium",
      due: shortDate(item.due_at),
      column: taskColumn(item.status),
      ai: item.is_ai_generated,
      ...(item.assignment_id
        ? { assignmentId: assignmentByBackend.get(item.assignment_id) ?? item.assignment_id }
        : {}),
      ...(item.source_requirement ? { req: item.source_requirement } : {}),
    })),
  );
  const events: CalEvent[] = schedule.events.map((item) => ({
    id: item.id,
    backendId: item.id,
    day: dayIndex(item.starts_at),
    start: hours(item.starts_at),
    end: hours(item.ends_at),
    title: item.title,
    kind:
      ({ class: "lecture", personal: "event" } as Record<string, CalEvent["kind"]>)[item.kind] ??
      (item.kind as CalEvent["kind"]),
    ...(item.course_id ? { courseId: courseByBackend.get(item.course_id) ?? item.course_id } : {}),
    ...(item.task_id ? { taskId: item.task_id } : {}),
  }));
  const insights: Insight[] = rawInsights.map((item) => {
    const courseId = item.course_id ? courseByBackend.get(item.course_id) : undefined;
    return {
      id: insightIdByCategory[item.category] ?? item.id,
      backendId: item.id,
      type:
        (
          {
            workload_warning: "Workload Warning",
            assignment_analysis: "Assignment Analysis",
            study_preparation: "Study Preparation",
            schedule_opportunity: "Schedule Opportunity",
            deadline_conflict: "Deadline Conflict",
          } as Record<string, Insight["type"]>
        )[item.category] ?? "Study Preparation",
      title: item.title,
      description: item.summary,
      priority:
        ({ high: "High", medium: "Medium", low: "Low" } as Record<string, Insight["priority"]>)[
          item.severity
        ] ?? "Medium",
      courses: courseId ? [courseId] : [],
      date: "Current week",
      action: item.suggestion,
      primary: {
        label: item.cta.label,
        to: item.cta.action.startsWith("/") ? item.cta.action : "/insights",
      },
      secondary: "Dismiss",
      status:
        (
          {
            new: "New",
            accepted: "Accepted",
            applied: "Applied",
            dismissed: "Dismissed",
            snoozed: "Snoozed",
          } as Record<string, Insight["status"]>
        )[item.status] ?? "New",
      confidence: item.confidence / 100,
      sources: [],
    };
  });
  return {
    courses,
    assignments,
    tasks,
    events,
    insights,
    distribution: workload.by_day.map((item) => ({
      day: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
        new Date(item.day),
      ),
      required: item.required_hours,
      available: item.available_hours,
    })),
    workload: {
      required: workload.required_hours,
      available: workload.available_hours,
      allRemaining: courses.reduce((sum, course) => sum + course.remaining, 0),
      scheduled: workload.scheduled_study_hours,
      unscheduled: workload.unscheduled_hours,
    },
    settings,
  };
}

export const moveRemoteTask = (id: string, column: Task["column"]) =>
  request(`/kanban/tasks/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify({ status: taskStatus(column) }),
  });
export const updateRemoteInsight = (id: string, status: Insight["status"]) =>
  request(`/insights/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: status.toLowerCase() }),
  });
export const applyRemoteInsight = (id: string) =>
  request(`/insights/${id}/apply`, { method: "POST" });
export const updateRemoteSettings = (values: Partial<RemoteSettings>) =>
  request<RemoteSettings>("/settings", { method: "PATCH", body: JSON.stringify(values) });
export async function uploadRemoteAssignment(input: {
  file: File;
  courseId: string;
  title: string;
  dueAt: string;
  description?: string;
  estimatedHours: number;
}) {
  const form = new FormData();
  form.set("file", input.file);
  form.set("course_id", input.courseId);
  form.set("title", input.title);
  form.set("due_at", input.dueAt);
  form.set("estimated_hours", String(input.estimatedHours));
  if (input.description) form.set("description", input.description);
  return request<Record<string, unknown>>("/assignments/upload", { method: "POST", body: form });
}
