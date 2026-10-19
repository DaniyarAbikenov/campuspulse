import {
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
import { currentLocale } from "./i18n";
import { CAMPUS_OFFSET_MS, daysBetween, isoWeekNumber, mondayOf, todayCampus } from "./week";

const API_URL = import.meta.env["VITE_API_URL"] ?? "http://127.0.0.1:8000/api/v1";
// The week every schedule/workload request is about; the store moves it with the week switcher.
let currentWeek = mondayOf(todayCampus());
export const getApiWeek = () => currentWeek;
export const setApiWeek = (isoMonday: string) => {
  currentWeek = isoMonday;
};
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
  series_id?: string | null;
  location?: string | null;
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
  estimate_accuracy_percent: number | null;
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
    assignment_id: string | null;
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
  description?: string | null;
  can_edit?: boolean;
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
  reasoning?: string;
  evidence?: { kind: string; label: string; ref_id?: string | null }[];
  generated_by?: string;
  action_type?: string;
}

/** A failed API call whose `message` is already fit to show to a person. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const FIELD_NAMES: Record<string, string> = {
  group_name: "Group",
  program: "Program",
  full_name: "Name",
  title: "Title",
  due_at: "Deadline",
  starts_at: "Start",
  ends_at: "End",
  estimated_hours: "Estimate",
  place: "Place",
  name: "Name",
};
const VALIDATION_TEXT: Record<string, string> = {
  string_too_short: "cannot be empty",
  string_too_long: "is too long",
  missing: "is required",
  greater_than: "is too small",
  less_than: "is too large",
  greater_than_equal: "is too small",
  less_than_equal: "is too large",
};

/** Turns the backend's error body (a message, or a list of validation problems) into one sentence. */
export function describeFailure(status: number, body: string): string {
  let detail: unknown = body;
  try {
    detail = (JSON.parse(body) as { detail?: unknown }).detail ?? body;
  } catch {
    /* not JSON: use the text as it is */
  }
  if (Array.isArray(detail)) {
    const problems = detail.map((item: { loc?: unknown[]; type?: string; msg?: string }) => {
      const field = String(item.loc?.[item.loc.length - 1] ?? "");
      const label = FIELD_NAMES[field] ?? field.replace(/_/g, " ");
      const reason = VALIDATION_TEXT[item.type ?? ""] ?? item.msg ?? "is not valid";
      return label ? `${label} ${reason}` : reason;
    });
    return [...new Set(problems)].join("; ");
  }
  if (typeof detail === "string" && detail.trim() && !detail.trim().startsWith("<")) return detail;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You are not allowed to do that.";
  if (status === 404) return "That no longer exists.";
  if (status >= 500) return "Something went wrong on the server. Try again in a moment.";
  return "The request was not accepted.";
}

/** The message of any thrown value, ready for a toast. */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Exchange the stored refresh token for a new access token; false when the session is gone. */
async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) return false;
  const refreshed = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (refreshed.ok) {
    setTokens((await refreshed.json()) as { access_token: string; refresh_token: string });
    return true;
  }
  clearTokens();
  return false;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && (await refreshAccess())) return request<T>(path, init, false);
  if (!response.ok) throw new ApiError(response.status, describeFailure(response.status, await response.text()));
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

/** One server-sent event: its name and parsed JSON payload. */
export interface ServerEvent {
  event: string;
  data: unknown;
}

/** Splits a text/event-stream buffer into complete events; returns the unfinished remainder. */
export function parseServerEvents(buffer: string): { events: ServerEvent[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  const events: ServerEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join("\n")) });
    } catch {
      /* a malformed event is skipped rather than ending the run */
    }
  }
  return { events, rest };
}

/**
 * POST to a streaming agent endpoint: `onStep` fires for each reasoning step the moment the
 * agent produces it; resolves with the final result or rejects with the agent's error.
 */
async function streamRequest<T>(
  path: string,
  init: { body?: unknown },
  onStep?: (step: AgentStep) => void,
  retry = true,
): Promise<T> {
  const headers = new Headers({ Accept: "text/event-stream" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (response.status === 401 && retry && (await refreshAccess()))
    return streamRequest<T>(path, init, onStep, false);
  if (!response.ok || !response.body)
    throw new ApiError(response.status, describeFailure(response.status, response.body ? await response.text() : ""));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseServerEvents(done ? `${buffer}\n\n` : buffer);
    buffer = parsed.rest;
    for (const { event, data } of parsed.events) {
      if (event === "step") onStep?.(data as AgentStep);
      else if (event === "done") result = data as T;
      else if (event === "error") {
        const failure = data as { status?: number; detail?: string };
        throw new ApiError(failure.status ?? 502, failure.detail ?? "The agent could not finish. Try again.");
      }
    }
    if (done) break;
  }
  if (result === undefined) throw new Error("The agent stopped before it finished");
  return result;
}

const COURSE_COLORS = ["bg-primary", "bg-info", "bg-warning", "bg-success", "bg-destructive"];
/** A stable colour per course, derived from its id so it never depends on a fixed catalog. */
const courseColor = (id: string) => COURSE_COLORS[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COURSE_COLORS.length] ?? "bg-primary";

const eventKind: Record<string, CalEvent["kind"]> = {
  class_session: "lecture",
  study_session: "study",
  campus_event: "event",
  personal: "personal",
};
const remoteEventKind = (kind: CalEvent["kind"]) =>
  ({ lecture: "class_session", study: "study_session", event: "campus_event", free: "personal", personal: "personal" })[
    kind
  ];
const shortDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(value),
      )
    : "—";
// The institution runs on Asia/Almaty (UTC+5, no DST); the API returns UTC instants.
const campusClock = (value: string) => new Date(Date.parse(value) + CAMPUS_OFFSET_MS);
const hours = (value: string) => {
  const date = campusClock(value);
  return date.getUTCHours() + date.getUTCMinutes() / 60;
};
const rawDayIndex = (value: string) =>
  daysBetween(currentWeek, campusClock(value).toISOString().slice(0, 10));
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
      cancelled: "Cancelled",
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
  estimateAccuracy: number | null;
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
  profile: { institution: string | null; semester: string | null };
}

function mapEvents(items: ApiEvent[], courseByBackend: Map<string, string>): CalEvent[] {
  return items.map((item) => ({
    id: item.id,
    backendId: item.id,
    day: dayIndex(item.starts_at),
    start: hours(item.starts_at),
    end: hours(item.ends_at),
    title: item.title,
    kind: eventKind[item.kind] ?? "event",
    ...(item.course_id ? { courseId: courseByBackend.get(item.course_id) ?? item.course_id } : {}),
    ...(item.task_id ? { taskId: item.task_id } : {}),
    ...(item.series_id ? { seriesId: item.series_id } : {}),
    ...(item.location ? { location: item.location } : {}),
  }));
}
const mapDistribution = (workload: ApiWorkload) =>
  workload.by_day.map((item) => ({
    day: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(item.day)),
    required: item.required_hours,
    available: item.available_hours,
  }));
const mapWorkload = (workload: ApiWorkload, allRemaining: number) => ({
  required: workload.required_hours,
  available: workload.available_hours,
  allRemaining,
  scheduled: workload.scheduled_study_hours,
  unscheduled: workload.unscheduled_hours,
});

/** Everything that depends on the selected week: events, daily workload and free time. */
export async function fetchWeekData(courses: Course[]) {
  const [schedule, workload, freeSlots] = await Promise.all([
    request<ApiSchedule>(`/schedule?week_start=${currentWeek}`),
    request<ApiWorkload>(`/workload?week_start=${currentWeek}`),
    fetchFreeSlots(),
  ]);
  const byBackend = new Map(courses.flatMap((course) => (course.backendId ? [[course.backendId, course.id] as const] : [])));
  return {
    events: mapEvents(schedule.events, byBackend),
    distribution: mapDistribution(workload),
    workload: mapWorkload(workload, courses.reduce((sum, course) => sum + course.remaining, 0)),
    freeSlots,
  };
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
    request<ApiSchedule>(`/schedule?week_start=${currentWeek}`),
    request<ApiWorkload>(`/workload?week_start=${currentWeek}`),
    request<ApiInsight[]>("/insights"),
    request<RemoteSettings>("/settings"),
    request<ApiStatistics>("/statistics"),
    request<{ id: string; roles: string[]; institution_name?: string | null; semester_name?: string | null }>("/auth/me"),
    request<ApiKnowledge>("/knowledge"),
    request<ApiCampusEvent[]>("/campus-events"),
    request<ApiAgentActivity>("/agent/activity?limit=50"),
    fetchFreeSlots(),
    request<ApiRelation[]>("/assignment-relations"),
  ]);
  currentUserId = me.id;
  const courseByBackend = new Map<string, string>();
  const courses: Course[] = rawCourses.map((item) => {
    const id = item.id;
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
      color: courseColor(id),
      docs: 0,
      technologies: [],
      summary: item.description ?? "",
    };
  });
  const assignmentByBackend = new Map<string, string>();
  const assignments: Assignment[] = page.items.map((item) => {
    const id = item.id;
    assignmentByBackend.set(item.id, id);
    return {
      id,
      backendId: item.id,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      courseId: courseByBackend.get(item.course_id) ?? item.course_id,
      deadline: shortDate(item.due_at),
      dueAt: item.due_at,
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
  const events = mapEvents(schedule.events, courseByBackend);
  const insights: Insight[] = rawInsights.map((item) => {
    const courseId = item.course_id ? courseByBackend.get(item.course_id) : undefined;
    return {
      id: item.id,
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
      date: "Suggested for you",
      action: item.suggestion,
      primary: {
        label: item.cta.label,
        to: item.cta.action.startsWith("/") ? item.cta.action : "/insights",
      },
      ...(item.reasoning ? { reasoning: item.reasoning } : {}),
      evidence: (item.evidence ?? []).map((entry) => ({ kind: entry.kind, label: entry.label, ...(entry.ref_id ? { refId: entry.ref_id } : {}) })),
      generatedBy: item.generated_by ?? "system",
      applicable: (item.action_type ?? "none") !== "none",
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
      sources: (item.evidence ?? []).map((entry) => entry.label),
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
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      ...(item.description ? { description: item.description } : {}),
      canEdit: item.can_edit ?? false,
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
    kind: item.kind,
    assignmentId: item.assignment_id,
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
    distribution: mapDistribution(workload),
    workload: mapWorkload(workload, courses.reduce((sum, course) => sum + course.remaining, 0)),
    settings,
    knowledge: { docs, fragments },
    campusEvents,
    activity,
    freeSlots,
    relations,
    roles: me.roles,
    profile: { institution: me.institution_name ?? null, semester: me.semester_name ?? null },
    statistics: {
      reportedHours: stats.reported_study_hours,
      estimateAccuracy: stats.estimate_accuracy_percent,
      completedAssignments: stats.completed_assignments,
      weekly: stats.weekly.map((item) => ({
        week: `W${isoWeekNumber(item.week_start)}`,
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
    Date.parse(currentWeek) + day * 86_400_000 + Math.round(hour * 3_600_000) - CAMPUS_OFFSET_MS,
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
/** A change the agent proposed; it only happens after the student applies it. */
export interface AgentAction {
  id: string;
  kind: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}
export interface AgentChatReply {
  sessionId: string;
  reply: string;
  steps: AgentStep[];
  actions: AgentAction[];
}
export const fetchAgentEnabled = async () =>
  (await request<{ enabled: boolean }>("/agent/status")).enabled;
export const sendAgentMessage = async (
  message: string,
  sessionId: string | null,
  onStep?: (step: AgentStep) => void,
): Promise<AgentChatReply> => {
  const reply = await streamRequest<{
    session_id: string;
    reply: string;
    steps: AgentStep[];
    actions?: AgentAction[];
  }>(
    "/agent/chat/stream",
    { body: { message, language: currentLocale(), ...(sessionId ? { session_id: sessionId } : {}) } },
    onStep,
  );
  return {
    sessionId: reply.session_id,
    reply: reply.reply,
    steps: reply.steps,
    actions: reply.actions ?? [],
  };
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
  groupName?: string;
  courseIds: string[];
}) =>
  request("/auth/onboarding", {
    method: "POST",
    body: JSON.stringify({
      institution_id: values.institutionId,
      student_number: values.studentNumber,
      program: values.program,
      ...(values.groupName ? { group_name: values.groupName } : {}),
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
export async function analyzeRemoteAssignment(
  assignmentId: string,
  onStep?: (step: AgentStep) => void,
) {
  const result = await streamRequest<{ plan: ApiTaskPlan; steps: AgentStep[] }>(
    `/assignments/${assignmentId}/analysis/stream?language=${currentLocale()}`,
    {},
    onStep,
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
  const raw = await request<ApiFreeSlot[]>(`/schedule/free-time?week_start=${currentWeek}`);
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
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
/** The agent's latest non-dismissed plan for an assignment, or null. */
/** The open proposal, or with `applied` the plan whose tasks are already on the board. */
export async function fetchTaskPlan(backendId: string, applied = false): Promise<(TaskPlan & { status: string; createdAt: string; applied: boolean }) | null> {
  try {
    const raw = await request<ApiTaskPlan & { created_at: string }>(`/assignments/${backendId}/task-plan${applied ? "?applied=true" : ""}`);
    return { ...taskPlan(raw), status: raw.status, createdAt: raw.created_at, applied: raw.status === "applied" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
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
export const fetchStudyPlan = async () => studyPlan(await request<ApiStudyPlan>(`/schedule/plan?week_start=${currentWeek}`));
export const applyStudyPlan = async () => {
  const result = await request<{ created: number; plan: ApiStudyPlan }>(`/schedule/plan/apply?week_start=${currentWeek}`, { method: "POST" });
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
    weekly: raw.weekly.map((item) => ({ week: `W${isoWeekNumber(item.week_start)}`, estimated: item.estimated_hours_per_student, reported: item.reported_hours_per_student })),
    peakWeek: raw.peak_week ? `W${isoWeekNumber(raw.peak_week)}` : null,
    peakHours: raw.peak_hours_per_student,
    highestRiskCourse: raw.highest_risk_course,
    highestRisk: raw.highest_risk_percent,
    activity: raw.activity,
  };
}

/** Asks the agent to review deadlines, workload and free time; resolves with the new insights. */
export async function refreshRemoteInsights(onStep?: (step: AgentStep) => void) {
  const result = await streamRequest<{ created: unknown[]; steps: AgentStep[] }>(
    `/insights/refresh/stream?language=${currentLocale()}`,
    {},
    onStep,
  );
  return { count: result.created.length, steps: result.steps };
}

const pad = (value: number) => String(value).padStart(2, "0");
/** An instant from a date (YYYY-MM-DD) and clock time (HH:MM) on the campus clock. */
export function campusIso(date: string, time: string): string {
  const offset = CAMPUS_OFFSET_MS / 3_600_000;
  return `${date}T${time}:00${offset < 0 ? "-" : "+"}${pad(Math.abs(offset))}:00`;
}
/** Date and time inputs (YYYY-MM-DD, HH:MM) for an API instant, on the campus clock. */
export function campusInputs(value: string): { date: string; time: string } {
  const local = campusClock(value).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export interface AssignmentChange {
  removedTasks: number;
  removedSessions: number;
}
const changeOf = (raw: { removed_tasks: number; removed_sessions: number }): AssignmentChange => ({
  removedTasks: raw.removed_tasks,
  removedSessions: raw.removed_sessions,
});
export const createRemoteAssignment = (input: {
  courseId: string;
  title: string;
  dueAt: string;
  description?: string;
  estimatedHours: number;
}) =>
  request<{ id: string }>("/assignments", {
    method: "POST",
    body: JSON.stringify({
      course_id: input.courseId,
      owner_user_id: currentUserId,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      due_at: input.dueAt,
      estimated_hours: input.estimatedHours,
    }),
  });
export const updateRemoteAssignment = (
  id: string,
  values: { title?: string; description?: string; dueAt?: string; estimatedHours?: number },
) =>
  request(`/assignments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(values.title === undefined ? {} : { title: values.title }),
      ...(values.description === undefined ? {} : { description: values.description }),
      ...(values.dueAt === undefined ? {} : { due_at: values.dueAt }),
      ...(values.estimatedHours === undefined ? {} : { estimated_hours: values.estimatedHours }),
    }),
  });
export const cancelRemoteAssignment = async (id: string) =>
  changeOf(await request(`/assignments/${id}/cancel`, { method: "POST" }));
export const reopenRemoteAssignment = async (id: string) =>
  changeOf(await request(`/assignments/${id}/reopen`, { method: "POST" }));
export const deleteRemoteAssignment = async (id: string) =>
  changeOf(await request(`/assignments/${id}`, { method: "DELETE" }));

export interface RepeatingActivity {
  id: string;
  title: string;
  kind: "personal" | "class_session";
  weekdays: number[];
  start: string;
  end: string;
  startsOn: string;
  endsOn: string;
  location: string | null;
  courseId: string | null;
  occurrences: number;
}
interface ApiSeries {
  id: string;
  title: string;
  kind: RepeatingActivity["kind"];
  weekdays: number[];
  start: string;
  end: string;
  starts_on: string;
  ends_on: string;
  location: string | null;
  course_id: string | null;
  occurrences: number;
}
const seriesOf = (item: ApiSeries): RepeatingActivity => ({
  id: item.id,
  title: item.title,
  kind: item.kind,
  weekdays: item.weekdays,
  start: item.start,
  end: item.end,
  startsOn: item.starts_on,
  endsOn: item.ends_on,
  location: item.location,
  courseId: item.course_id,
  occurrences: item.occurrences,
});
export const fetchSeries = async () =>
  (await request<ApiSeries[]>("/schedule/series")).map(seriesOf);
export const createRemoteSeries = async (input: {
  title: string;
  kind: RepeatingActivity["kind"];
  weekdays: number[];
  start: string;
  end: string;
  startsOn: string;
  endsOn?: string;
  location?: string;
  courseId?: string;
}) =>
  seriesOf(
    await request<ApiSeries>("/schedule/series", {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        kind: input.kind,
        weekdays: input.weekdays,
        start: input.start,
        end: input.end,
        starts_on: input.startsOn,
        ...(input.endsOn ? { ends_on: input.endsOn } : {}),
        ...(input.location ? { location: input.location } : {}),
        ...(input.courseId ? { course_id: input.courseId } : {}),
      }),
    }),
  );
export const deleteRemoteSeries = (id: string) =>
  request(`/schedule/series/${id}`, { method: "DELETE" });
export const deleteRemoteEvent = (id: string) =>
  request(`/schedule-events/${id}`, { method: "DELETE" });
/** A one-off activity on any date (a workout, a meeting) as a personal calendar event. */
export const createRemoteActivity = (input: {
  title: string;
  date: string;
  start: string;
  end: string;
  location?: string;
  courseId?: string;
}) =>
  request<{ id: string }>("/schedule-events", {
    method: "POST",
    body: JSON.stringify({
      user_id: currentUserId,
      title: input.title,
      kind: "personal",
      starts_at: campusIso(input.date, input.start),
      ends_at: campusIso(input.date, input.end),
      ...(input.location ? { location: input.location } : {}),
      ...(input.courseId ? { course_id: input.courseId } : {}),
    }),
  });
/** A study session for a task on any date. */
export const createRemoteStudySession = (input: {
  title: string;
  date: string;
  start: string;
  end: string;
  taskId: string;
  courseId?: string;
}) =>
  request<{ id: string }>("/schedule-events", {
    method: "POST",
    body: JSON.stringify({
      user_id: currentUserId,
      title: input.title,
      kind: "study_session",
      task_id: input.taskId,
      starts_at: campusIso(input.date, input.start),
      ends_at: campusIso(input.date, input.end),
      ...(input.courseId ? { course_id: input.courseId } : {}),
    }),
  });

export interface CampusEventInput {
  title: string;
  description?: string;
  category: string;
  place: string;
  date: string;
  start: string;
  end: string;
}
const campusEventBody = (input: CampusEventInput) => ({
  title: input.title,
  description: input.description ?? "",
  category: input.category.toLowerCase(),
  place: input.place,
  starts_at: campusIso(input.date, input.start),
  ends_at: campusIso(input.date, input.end),
});
export const createRemoteCampusEvent = (input: CampusEventInput) =>
  request("/campus-events", { method: "POST", body: JSON.stringify(campusEventBody(input)) });
export const updateRemoteCampusEvent = (id: string, input: CampusEventInput) =>
  request(`/campus-events/${id}`, { method: "PATCH", body: JSON.stringify(campusEventBody(input)) });
export const deleteRemoteCampusEvent = (id: string) =>
  request(`/campus-events/${id}`, { method: "DELETE" });

export async function uploadRemoteMaterial(input: {
  file: File;
  courseId: string;
  kind: string;
  name?: string;
}) {
  const form = new FormData();
  form.set("file", input.file);
  form.set("course_id", input.courseId);
  form.set("kind", input.kind.toLowerCase());
  if (input.name) form.set("name", input.name);
  return request<{ id: string; page_count: number }>("/materials", { method: "POST", body: form });
}
export const updateRemoteMaterial = (
  id: string,
  values: { name?: string; kind?: string; courseId?: string },
) =>
  request(`/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(values.name === undefined ? {} : { name: values.name }),
      ...(values.kind === undefined ? {} : { kind: values.kind.toLowerCase() }),
      ...(values.courseId === undefined ? {} : { course_id: values.courseId }),
    }),
  });
export const deleteRemoteMaterial = (id: string) =>
  request(`/materials/${id}`, { method: "DELETE" });

export const applyAgentAction = (id: string) =>
  request<{ detail: string }>(`/agent/actions/${id}/apply`, { method: "POST" });
export const dismissAgentAction = (id: string) =>
  request(`/agent/actions/${id}/dismiss`, { method: "POST" });

export const updateRemoteTask = (
  id: string,
  values: { title?: string; description?: string; estimatedHours?: number; priority?: string },
) =>
  request(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(values.title === undefined ? {} : { title: values.title }),
      ...(values.description === undefined ? {} : { description: values.description }),
      ...(values.estimatedHours === undefined ? {} : { estimated_hours: values.estimatedHours }),
      ...(values.priority === undefined ? {} : { priority: values.priority.toLowerCase() }),
    }),
  });
export const deleteRemoteTask = (id: string) => request(`/tasks/${id}`, { method: "DELETE" });
/** Change the title, time or place of one calendar event (one occurrence of a series). */
export const updateRemoteEvent = (
  id: string,
  values: { title: string; date: string; start: string; end: string; location: string },
) =>
  request(`/schedule-events/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: values.title,
      starts_at: campusIso(values.date, values.start),
      ends_at: campusIso(values.date, values.end),
      ...(values.location ? { location: values.location } : {}),
    }),
  });
