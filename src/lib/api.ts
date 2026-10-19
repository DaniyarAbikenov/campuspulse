import {
  courses as fixtureCourses,
  type Assignment,
  type CalEvent,
  type Activity,
  type CampusEvent,
  type DocumentFragment,
  type FreeSlot,
  type KnowledgeDoc,
  type Course,
  type Insight,
  type Task,
} from "./data";

const API_URL = import.meta.env["VITE_API_URL"] ?? "http://127.0.0.1:8000/api/v1";
const WEEK_START = "2026-10-19";
let accessToken = "";
let refreshToken = "";

export const GOOGLE_CLIENT_ID: string | undefined =
  (import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined) || undefined;
/** Local development shortcut; the backend only honours it while demo auth is enabled there. */
export const DEMO_LOGIN_ENABLED = import.meta.env["VITE_ENABLE_DEMO_LOGIN"] !== "false";
// Prototype storage: production should move the refresh token into a Secure HttpOnly cookie.
const REFRESH_KEY = "campuspulse.refresh";
const readRefresh = () => {
  try {
    return localStorage.getItem(REFRESH_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeRefresh = (value: string) => {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* Storage may be blocked; the session then lasts until reload. */
  }
};
const setTokens = (tokens: { access_token: string; refresh_token: string }) => {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  writeRefresh(refreshToken);
};
const clearTokens = () => {
  accessToken = "";
  refreshToken = "";
  writeRefresh("");
};
let currentUserId = "";

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
  description?: string | null;
  due_at: string;
  estimated_hours: number;
  actual_hours?: number | null;
  progress: number;
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
interface ApiRelation {
  source_assignment_id: string;
  target_assignment_id: string;
  relation_type: string;
}
interface ApiStatistics {
  weekly: { week_start: string; planned_hours: number; actual_hours: number }[];
  by_course: {
    course_id: string;
    course_name: string;
    completed_assignments: number;
    estimated_hours: number;
    actual_hours: number;
    estimate_accuracy_percent: number | null;
  }[];
  reported_study_hours: number;
  estimate_accuracy_percent: number;
  completed_assignments: number;
  completed: {
    assignment_id: string;
    title: string;
    course_name: string;
    estimated_hours: number;
    actual_hours: number;
    delta_hours: number;
  }[];
}
interface ApiKnowledge {
  documents: {
    id: string;
    course_id: string;
    name: string;
    kind: string;
    page_count: number;
    indexed_at: string;
    concepts: string[];
  }[];
  fragments: {
    id: string;
    document_id: string;
    assignment_id: string | null;
    page: number;
    concept: string;
    text: string;
    requirement_id: string | null;
  }[];
}
interface ApiCampusEvent {
  id: string;
  title: string;
  category: string;
  place: string;
  starts_at: string;
  ends_at: string;
  match_percent: number | null;
  reason: string | null;
  is_saved: boolean;
}
interface ApiAgentActivity {
  runs: {
    id: string;
    kind: string;
    title: string;
    detail: string;
    status: string;
    started_at: string;
    tool_calls: { tool_name: string; result_summary: string | null }[];
  }[];
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
      setTokens((await refreshed.json()) as { access_token: string; refresh_token: string });
      return request<T>(path, init, false);
    }
    clearTokens();
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
const eventKind: Record<string, CalEvent["kind"]> = {
  class_session: "lecture",
  study_session: "study",
  campus_event: "event",
  personal: "event",
};
const remoteEventKind = (kind: CalEvent["kind"]) =>
  ({ lecture: "class_session", study: "study_session", event: "campus_event", free: "personal" })[
    kind
  ];
const isoWeek = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * 86_400_000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
};
const shortDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(value),
      )
    : "—";
// The institution runs on Asia/Almaty (UTC+5, no DST); the API returns UTC instants.
const CAMPUS_OFFSET_MS = 5 * 3_600_000;
const campusClock = (value: string) => new Date(Date.parse(value) + CAMPUS_OFFSET_MS);
const hours = (value: string) => {
  const date = campusClock(value);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
};
const rawDayIndex = (value: string) =>
  Math.round((Date.parse(campusClock(value).toISOString().slice(0, 10)) - Date.parse(WEEK_START)) / 86_400_000);
const dayIndex = (value: string) => Math.max(0, Math.min(6, rawDayIndex(value)));
const clockText = (value: string) => {
  const date = campusClock(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
};
const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
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
export interface AssignmentRelation {
  /** Frontend assignment ids. */
  sourceId: string;
  targetId: string;
  type: "extends" | "depends_on" | "related_to";
}
export interface RemoteStatistics {
  reportedHours: number;
  estimateAccuracy: number;
  completedAssignments: number;
  weekly: { week: string; planned: number; actual: number }[];
  byCourse: {
    courseId: string;
    courseName: string;
    completed: number;
    estimated: number;
    actual: number;
    accuracy: number | null;
  }[];
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
  statistics: RemoteStatistics;
  knowledge: { docs: KnowledgeDoc[]; fragments: DocumentFragment[] };
  campusEvents: CampusEvent[];
  activity: Activity[];
  freeSlots: FreeSlot[];
  relations: AssignmentRelation[];
  roles: string[];
}

export async function connectWorkspace(): Promise<WorkspaceData> {
  const [
    rawCourses,
    page,
    board,
    schedule,
    workload,
    rawInsights,
    settings,
    stats,
    me,
    knowledge,
    rawEvents,
    agent,
    freeSlots,
    rawRelations,
  ] = await Promise.all([
    request<ApiCourse[]>("/courses/overview"),
    request<ApiAssignmentPage>("/assignments/overview"),
    request<ApiKanban>("/kanban"),
    request<ApiSchedule>(`/schedule?week_start=${WEEK_START}`),
    request<ApiWorkload>(`/workload?week_start=${WEEK_START}`),
    request<ApiInsight[]>("/insights"),
    request<RemoteSettings>("/settings"),
    request<ApiStatistics>("/statistics"),
    request<{ id: string; roles: string[] }>("/auth/me"),
    request<ApiKnowledge>("/knowledge"),
    request<ApiCampusEvent[]>("/campus-events"),
    request<ApiAgentActivity>("/agent/activity?limit=50"),
    fetchFreeSlots(),
    request<ApiRelation[]>("/assignment-relations"),
  ]);
  currentUserId = me.id;
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
  const usedIds = new Set<string>();
  const assignments: Assignment[] = page.items.map((item) => {
    // The prototype ids ("se-a3") stay for the first assignment with a known title only, so
    // a second upload with the same title cannot collide with it.
    const known = assignmentIdByTitle[item.title];
    const id = known && !usedIds.has(known) ? known : item.id;
    usedIds.add(id);
    assignmentByBackend.set(item.id, id);
    return {
      id,
      backendId: item.id,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      courseId: courseByBackend.get(item.course_id) ?? item.course_id,
      deadline: shortDate(item.due_at),
      estimate: item.estimated_hours,
      progress: item.progress,
      status: titleStatus(item.status),
      ...(item.actual_hours == null ? {} : { actual: item.actual_hours }),
    };
  });
  const relations: AssignmentRelation[] = rawRelations.flatMap((item) => {
    const sourceId = assignmentByBackend.get(item.source_assignment_id);
    const targetId = assignmentByBackend.get(item.target_assignment_id);
    const type = item.relation_type as AssignmentRelation["type"];
    return sourceId && targetId ? [{ sourceId, targetId, type }] : [];
  });
  for (const relation of relations) {
    const source = assignments.find((item) => item.id === relation.sourceId);
    if (source && !source.dependsOn && relation.type !== "related_to") {
      source.dependsOn = relation.targetId;
      source.relation = relation.type === "extends" ? "extends" : "depends on";
    }
  }
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
    kind: eventKind[item.kind] ?? "event",
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
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  const monthDay = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
  const campusEvents: CampusEvent[] = rawEvents.map((item) => {
    const local = campusClock(item.starts_at);
    const day = rawDayIndex(item.starts_at);
    return {
      id: item.id,
      backendId: item.id,
      title: item.title,
      date: `${weekday.format(local)}, ${monthDay.format(local)}`,
      time: `${clockText(item.starts_at)}–${clockText(item.ends_at)}`,
      place: item.place,
      category: capitalized(item.category),
      match: item.match_percent ?? 0,
      reason: item.reason ?? "",
      saved: item.is_saved,
      slot:
        day >= 0 && day <= 6
          ? { day, start: hours(item.starts_at), end: hours(item.ends_at) }
          : null,
    };
  });
  const docs: KnowledgeDoc[] = knowledge.documents.map((item) => ({
    id: item.id,
    title: item.name,
    courseId: courseByBackend.get(item.course_id) ?? item.course_id,
    type: capitalized(item.kind),
    pages: item.page_count,
    indexed: `${monthDay.format(campusClock(item.indexed_at))} ${clockText(item.indexed_at)}`,
    concepts: item.concepts,
  }));
  const fragments: DocumentFragment[] = knowledge.fragments.map((item) => ({
    id: item.id,
    documentId: item.document_id,
    page: item.page,
    text: item.text,
    concept: item.concept,
    assignmentId: item.assignment_id ? assignmentByBackend.get(item.assignment_id) : undefined,
    requirementId: item.requirement_id ?? undefined,
  }));
  const activity: Activity[] = agent.runs.map((run) => ({
    id: run.id,
    time: clockText(run.started_at),
    title: run.title,
    detail: run.detail,
    kind: (({ indexed: "index", chat: "insight" }) as Record<string, Activity["kind"]>)[run.kind] ?? (run.kind as Activity["kind"]),
    status: run.status === "failed" ? "warning" : (run.status as Activity["status"]),
    tools: run.tool_calls.map((call) => ({ name: call.tool_name, summary: call.result_summary ?? "" })),
  }));
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
    knowledge: { docs, fragments },
    campusEvents,
    activity,
    freeSlots,
    relations,
    roles: me.roles,
    statistics: {
      reportedHours: stats.reported_study_hours,
      estimateAccuracy: stats.estimate_accuracy_percent,
      completedAssignments: stats.completed_assignments,
      weekly: stats.weekly.map((item) => ({
        week: `W${isoWeek(item.week_start)}`,
        planned: item.planned_hours,
        actual: item.actual_hours,
      })),
      byCourse: stats.by_course.map((item) => ({
        courseId: courseByBackend.get(item.course_id) ?? item.course_id,
        courseName: item.course_name,
        completed: item.completed_assignments,
        estimated: item.estimated_hours,
        actual: item.actual_hours,
        accuracy: item.estimate_accuracy_percent,
      })),
    },
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
  const created = await request<{
    assignment: { id: string };
    extraction: { status: "ok" | "no_text" | "unsupported" | "failed"; pages: number };
  }>("/assignments/upload", { method: "POST", body: form });
  return { assignmentId: created.assignment.id, extraction: created.extraction };
}

const isoAt = (day: number, hour: number) =>
  new Date(
    Date.parse(WEEK_START) + day * 86_400_000 + Math.round(hour * 3_600_000) - CAMPUS_OFFSET_MS,
  ).toISOString();
export async function createRemoteTask(task: Omit<Task, "id">, assignmentId: string) {
  const created = await request<{ id: string }>("/tasks", {
    method: "POST",
    body: JSON.stringify({
      assignment_id: assignmentId,
      title: task.title,
      description: task.description,
      status: taskStatus(task.column),
      priority: task.priority.toLowerCase(),
      estimated_hours: task.estimate,
    }),
  });
  return created.id;
}
export async function createRemoteEvent(event: Omit<CalEvent, "id">, courseBackendId?: string) {
  const created = await request<{ id: string }>("/schedule-events", {
    method: "POST",
    body: JSON.stringify({
      user_id: currentUserId,
      title: event.title,
      kind: remoteEventKind(event.kind),
      ...(event.taskId && /^[0-9a-f-]{36}$/i.test(event.taskId) ? { task_id: event.taskId } : {}),
      starts_at: isoAt(event.day, event.start),
      ends_at: isoAt(event.day, event.end),
      ...(courseBackendId ? { course_id: courseBackendId } : {}),
    }),
  });
  return created.id;
}
export const saveRemoteEvent = (id: string, saved: boolean) =>
  request(`/campus-events/${id}/save`, { method: "PATCH", body: JSON.stringify({ saved }) });
export const recordRemoteRun = (run: Omit<Activity, "id" | "time">) =>
  request("/agent/runs", {
    method: "POST",
    body: JSON.stringify({
      kind: run.kind === "index" ? "indexed" : run.kind,
      title: run.title,
      detail: run.detail,
      status: run.status,
      tool_calls: (run.tools ?? []).map((tool) => ({
        tool_name: tool.name,
        result_summary: tool.summary,
      })),
    }),
  });

interface ApiImportItem {
  id: string;
  external_id: string;
  title: string;
  description: string | null;
  due_at: string;
  external_course_code: string;
  external_course_name: string;
  course_id: string | null;
  create_course: boolean;
  estimated_hours: number;
  selected: boolean;
  attachment_names: string[];
}
interface ApiImportProposal {
  id: string;
  source: string;
  status: string;
  items: ApiImportItem[];
}
export interface ImportItem {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  courseCode: string;
  courseName: string;
  /** Backend course id the assignment will be created in; null until the student chooses. */
  courseId: string | null;
  /** The student asked to create the Moodle course in CampusPulse. */
  createCourse: boolean;
  estimatedHours: number;
  selected: boolean;
  attachments: string[];
}
export interface ImportProposal {
  id: string;
  source: string;
  items: ImportItem[];
}
const importProposal = (raw: ApiImportProposal): ImportProposal => ({
  id: raw.id,
  source: raw.source,
  items: raw.items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    dueAt: item.due_at,
    courseCode: item.external_course_code,
    courseName: item.external_course_name,
    courseId: item.course_id,
    createCourse: item.create_course,
    estimatedHours: item.estimated_hours,
    selected: item.selected,
    attachments: item.attachment_names,
  })),
});
export const fetchImportProposals = async () =>
  (await request<ApiImportProposal[]>("/imports/proposals?proposal_status=pending")).map(
    importProposal,
  );
export const updateImportItem = (
  proposalId: string,
  itemId: string,
  values: {
    selected?: boolean;
    courseId?: string;
    createCourse?: boolean;
    estimatedHours?: number;
  },
) =>
  request(`/imports/proposals/${proposalId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(values.selected === undefined ? {} : { selected: values.selected }),
      ...(values.courseId === undefined ? {} : { course_id: values.courseId }),
      ...(values.createCourse === undefined ? {} : { create_course: values.createCourse }),
      ...(values.estimatedHours === undefined ? {} : { estimated_hours: values.estimatedHours }),
    }),
  });
export const applyImportProposal = (id: string) =>
  request<{ created: number; already_imported: number }>(`/imports/proposals/${id}/apply`, {
    method: "POST",
  });
export const dismissImportProposal = (id: string) =>
  request(`/imports/proposals/${id}/dismiss`, { method: "POST" });

export interface AgentStep {
  kind: "thought" | "tool_call" | "tool_result";
  name: string | null;
  detail: string;
}
export interface AgentChatReply {
  sessionId: string;
  reply: string;
  steps: AgentStep[];
}
export const fetchAgentEnabled = async () =>
  (await request<{ enabled: boolean }>("/agent/status")).enabled;
export const sendAgentMessage = async (
  message: string,
  sessionId: string | null,
): Promise<AgentChatReply> => {
  const reply = await request<{ session_id: string; reply: string; steps: AgentStep[] }>(
    "/agent/chat",
    {
      method: "POST",
      body: JSON.stringify({ message, ...(sessionId ? { session_id: sessionId } : {}) }),
    },
  );
  return { sessionId: reply.session_id, reply: reply.reply, steps: reply.steps };
};

export type AuthState = "signed_out" | "needs_onboarding" | "signed_in";
export interface OnboardingOptions {
  institutions: {
    id: string;
    name: string;
    shortName: string;
    courses: { id: string; code: string; name: string }[];
  }[];
}

const afterSignIn = async (): Promise<AuthState> => {
  const me = await request<{ institution_id: string | null }>("/auth/me");
  return me.institution_id ? "signed_in" : "needs_onboarding";
};
/** Resume a stored session; falls back to the demo account only when Google sign-in is off. */
export async function restoreSession(): Promise<AuthState> {
  const stored = readRefresh();
  if (stored) {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: stored }),
    });
    if (response.ok) {
      setTokens((await response.json()) as { access_token: string; refresh_token: string });
      return afterSignIn();
    }
    clearTokens();
  }
  if (!GOOGLE_CLIENT_ID && DEMO_LOGIN_ENABLED) return signInDemo();
  return "signed_out";
}
export async function signInWithGoogle(credential: string): Promise<AuthState> {
  setTokens(
    await request<{ access_token: string; refresh_token: string }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  );
  return afterSignIn();
}
export async function signInDemo(): Promise<AuthState> {
  setTokens(
    await request<{ access_token: string; refresh_token: string }>("/auth/demo", {
      method: "POST",
    }),
  );
  return afterSignIn();
}
export async function signOutRemote() {
  const token = refreshToken;
  clearTokens();
  if (token)
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    }).catch(() => undefined);
}
export async function fetchOnboardingOptions(): Promise<OnboardingOptions> {
  const raw = await request<{
    institutions: {
      id: string;
      name: string;
      short_name: string;
      courses: { id: string; code: string; name: string }[];
    }[];
  }>("/auth/onboarding/options");
  return {
    institutions: raw.institutions.map((item) => ({
      id: item.id,
      name: item.name,
      shortName: item.short_name,
      courses: item.courses,
    })),
  };
}
export const completeOnboardingRemote = (values: {
  institutionId: string;
  studentNumber: string;
  program: string;
  courseIds: string[];
}) =>
  request("/auth/onboarding", {
    method: "POST",
    body: JSON.stringify({
      institution_id: values.institutionId,
      student_number: values.studentNumber,
      program: values.program,
      course_ids: values.courseIds,
    }),
  });

interface ApiPlanItem {
  id: string;
  requirement_id: string;
  requirement_text: string;
  quote: string;
  page: number;
  quote_verified: boolean;
  title: string;
  description: string;
  estimated_hours: number;
  priority: string;
  selected: boolean;
}
interface ApiTaskPlan {
  id: string;
  assignment_id: string;
  status: string;
  summary: string;
  related_assignment_title: string | null;
  relation_type: string | null;
  items: ApiPlanItem[];
}
export interface PlanTask {
  id: string;
  requirementId: string;
  requirementText: string;
  quote: string;
  page: number;
  quoteVerified: boolean;
  title: string;
  description: string;
  estimatedHours: number;
  priority: string;
  selected: boolean;
}
export interface TaskPlan {
  id: string;
  assignmentId: string;
  summary: string;
  relatedTitle: string | null;
  relation: string | null;
  items: PlanTask[];
}
const taskPlan = (raw: ApiTaskPlan): TaskPlan => ({
  id: raw.id,
  assignmentId: raw.assignment_id,
  summary: raw.summary,
  relatedTitle: raw.related_assignment_title,
  relation: raw.relation_type,
  items: raw.items.map((item) => ({
    id: item.id,
    requirementId: item.requirement_id,
    requirementText: item.requirement_text,
    quote: item.quote,
    page: item.page,
    quoteVerified: item.quote_verified,
    title: item.title,
    description: item.description,
    estimatedHours: item.estimated_hours,
    priority: item.priority,
    selected: item.selected,
  })),
});
/** Asks the agent to read the uploaded brief; resolves with its proposed plan (30–90 s). */
export async function analyzeRemoteAssignment(assignmentId: string) {
  const result = await request<{ plan: ApiTaskPlan; steps: AgentStep[] }>(
    `/assignments/${assignmentId}/analysis`,
    { method: "POST" },
  );
  return { plan: taskPlan(result.plan), steps: result.steps };
}
export const updatePlanItem = (
  planId: string,
  itemId: string,
  values: { selected?: boolean; estimatedHours?: number },
) =>
  request(`/task-plans/${planId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(values.selected === undefined ? {} : { selected: values.selected }),
      ...(values.estimatedHours === undefined ? {} : { estimated_hours: values.estimatedHours }),
    }),
  });
export const applyTaskPlan = (planId: string) =>
  request<{ created: number }>(`/task-plans/${planId}/apply`, { method: "POST" });
export const dismissTaskPlan = (planId: string) =>
  request(`/task-plans/${planId}/dismiss`, { method: "POST" });

interface ApiFreeSlot {
  starts_at: string;
  ends_at: string;
  duration_hours: number;
}
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Study windows computed by the backend from classes, study sessions and the student's availability. */
export async function fetchFreeSlots(): Promise<FreeSlot[]> {
  const raw = await request<ApiFreeSlot[]>(`/schedule/free-time?week_start=${WEEK_START}`);
  return raw
    .filter((item) => item.duration_hours >= 0.5 && rawDayIndex(item.starts_at) >= 0 && rawDayIndex(item.starts_at) <= 6)
    .map((item) => {
      const day = rawDayIndex(item.starts_at);
      const start = hours(item.starts_at);
      const end = hours(item.ends_at);
      return {
        id: `${day}-${start}`,
        day,
        start,
        end,
        label: `${DAY_NAMES[day]} ${clockText(item.starts_at)}–${clockText(item.ends_at)}`,
      };
    });
}

export interface DocumentPage {
  page: number;
  text: string;
}
/** Extracted brief text of an assignment, or null when no document was uploaded. */
export async function fetchAssignmentText(
  backendId: string,
): Promise<{ title: string; pages: DocumentPage[] } | null> {
  try {
    const data = await request<{ title: string; pages: DocumentPage[] }>(
      `/assignments/${backendId}/text`,
    );
    return { title: data.title, pages: data.pages };
  } catch (error) {
    if (String(error).startsWith("Error: 404")) return null;
    throw error;
  }
}
/** The agent's latest non-dismissed plan for an assignment, or null. */
export async function fetchTaskPlan(backendId: string): Promise<(TaskPlan & { status: string; createdAt: string; applied: boolean }) | null> {
  try {
    const raw = await request<ApiTaskPlan & { created_at: string }>(`/assignments/${backendId}/task-plan`);
    return { ...taskPlan(raw), status: raw.status, createdAt: raw.created_at, applied: raw.status === "applied" };
  } catch (error) {
    if (String(error).startsWith("Error: 404")) return null;
    throw error;
  }
}

export interface StudyPlan {
  sessions: { taskId: string; taskTitle: string; assignmentTitle: string; startsAt: string; endsAt: string; hours: number }[];
  unplaced: { taskId: string; taskTitle: string; assignmentTitle: string; dueAt: string; hours: number }[];
  placedHours: number;
  unplacedHours: number;
}
interface ApiStudyPlan {
  sessions: { task_id: string; task_title: string; assignment_title: string; starts_at: string; ends_at: string; hours: number }[];
  unplaced: { task_id: string; task_title: string; assignment_title: string; due_at: string; hours: number }[];
  placed_hours: number;
  unplaced_hours: number;
}
const studyPlan = (raw: ApiStudyPlan): StudyPlan => ({
  sessions: raw.sessions.map((item) => ({ taskId: item.task_id, taskTitle: item.task_title, assignmentTitle: item.assignment_title, startsAt: item.starts_at, endsAt: item.ends_at, hours: item.hours })),
  unplaced: raw.unplaced.map((item) => ({ taskId: item.task_id, taskTitle: item.task_title, assignmentTitle: item.assignment_title, dueAt: item.due_at, hours: item.hours })),
  placedHours: raw.placed_hours,
  unplacedHours: raw.unplaced_hours,
});
/** Preview of where the unscheduled work would go this week; writes nothing. */
export const fetchStudyPlan = async () => studyPlan(await request<ApiStudyPlan>(`/schedule/plan?week_start=${WEEK_START}`));
export const applyStudyPlan = async () => {
  const result = await request<{ created: number; plan: ApiStudyPlan }>(`/schedule/plan/apply?week_start=${WEEK_START}`, { method: "POST" });
  return { created: result.created, plan: studyPlan(result.plan) };
};
export { campusClock as campusTime, clockText as campusClockText };

interface ApiAdminOverview {
  institution_name: string;
  semester_name: string | null;
  min_cohort_size: number;
  totals: { students: number | null; enrolments: number | null; courses: number; open_assignments: number };
  courses: {
    course_id: string;
    code: string;
    name: string;
    instructor_name: string | null;
    suppressed: boolean;
    enrolled_students: number | null;
    open_assignments: number;
    median_estimate_hours: number | null;
    median_reported_hours: number | null;
    estimate_accuracy_percent: number | null;
    overload_risk_percent: number | null;
  }[];
  weekly: { week_start: string; estimated_hours_per_student: number | null; reported_hours_per_student: number | null }[];
  peak_week: string | null;
  peak_hours_per_student: number | null;
  highest_risk_course: string | null;
  highest_risk_percent: number | null;
  activity: { kind: string; title: string; count: number | null }[];
}
/** Faculty aggregates. A null figure means the group was too small to show without risk. */
export interface AdminOverview {
  institution: string;
  semester: string | null;
  minCohort: number;
  students: number | null;
  enrolments: number | null;
  courseCount: number;
  openAssignments: number;
  courses: {
    id: string;
    code: string;
    name: string;
    instructor: string;
    suppressed: boolean;
    students: number | null;
    openAssignments: number;
    medianEstimate: number | null;
    medianReported: number | null;
    accuracy: number | null;
    risk: number | null;
  }[];
  weekly: { week: string; estimated: number | null; reported: number | null }[];
  peakWeek: string | null;
  peakHours: number | null;
  highestRiskCourse: string | null;
  highestRisk: number | null;
  activity: { kind: string; title: string; count: number | null }[];
}
export async function fetchAdminOverview(): Promise<AdminOverview> {
  const raw = await request<ApiAdminOverview>("/admin/overview");
  return {
    institution: raw.institution_name,
    semester: raw.semester_name,
    minCohort: raw.min_cohort_size,
    students: raw.totals.students,
    enrolments: raw.totals.enrolments,
    courseCount: raw.totals.courses,
    openAssignments: raw.totals.open_assignments,
    courses: raw.courses.map((item) => ({
      id: item.course_id,
      code: item.code,
      name: item.name,
      instructor: item.instructor_name ?? "",
      suppressed: item.suppressed,
      students: item.enrolled_students,
      openAssignments: item.open_assignments,
      medianEstimate: item.median_estimate_hours,
      medianReported: item.median_reported_hours,
      accuracy: item.estimate_accuracy_percent,
      risk: item.overload_risk_percent,
    })),
    weekly: raw.weekly.map((item) => ({ week: `W${isoWeek(item.week_start)}`, estimated: item.estimated_hours_per_student, reported: item.reported_hours_per_student })),
    peakWeek: raw.peak_week ? `W${isoWeek(raw.peak_week)}` : null,
    peakHours: raw.peak_hours_per_student,
    highestRiskCourse: raw.highest_risk_course,
    highestRisk: raw.highest_risk_percent,
    activity: raw.activity,
  };
}
