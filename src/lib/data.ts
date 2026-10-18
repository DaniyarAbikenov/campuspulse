export type Status = "To Do" | "In Progress" | "Review" | "Completed" | "Upcoming";
export type Priority = "High" | "Medium" | "Low";

export interface Course {
  id: string;
  name: string;
  code: string;
  instructor: string;
  assignments: number;
  completed: number;
  progress: number;
  remaining: number;
  nextDeadline: string;
  color: string; // token class for the dot
  docs: number;
  technologies: string[];
  summary: string;
}

const courseCatalog: Course[] = [
  { id: "se", name: "Software Engineering", code: "SE 3204", instructor: "Dr. A. Morgan", assignments: 4, completed: 2, progress: 58, remaining: 8.5, nextDeadline: "Oct 23", color: "bg-primary", docs: 3, technologies: ["Spring Boot", "PostgreSQL", "JWT", "JUnit"], summary: "Design and implementation of a layered REST service, built incrementally across four connected assignments." },
  { id: "adb", name: "Advanced Databases", code: "CS 3112", instructor: "Prof. L. Kessler", assignments: 5, completed: 3, progress: 64, remaining: 7.5, nextDeadline: "Oct 22", color: "bg-info", docs: 7, technologies: ["PostgreSQL", "MongoDB", "Query plans"], summary: "Query optimisation, indexing strategies, aggregation pipelines and transaction isolation." },
  { id: "os", name: "Operating Systems", code: "CS 2207", instructor: "Dr. R. Iskakov", assignments: 6, completed: 4, progress: 71, remaining: 4, nextDeadline: "Oct 24", color: "bg-warning", docs: 9, technologies: ["C", "POSIX threads", "xv6"], summary: "Processes, scheduling, memory management and concurrency through weekly labs." },
  { id: "rm", name: "Research Methods", code: "RM 2010", instructor: "Dr. S. Nurlanova", assignments: 3, completed: 1, progress: 40, remaining: 3.5, nextDeadline: "Oct 26", color: "bg-success", docs: 4, technologies: ["APA 7", "Survey design"], summary: "Research design, literature reviews and academic writing." },
  { id: "stat", name: "Statistics", code: "MATH 2301", instructor: "Prof. D. Hale", assignments: 4, completed: 2, progress: 52, remaining: 2, nextDeadline: "Oct 29", color: "bg-destructive", docs: 5, technologies: ["R", "Hypothesis testing"], summary: "Probability, inference, regression and applied data analysis in R." },
];

export interface Assignment {
  id: string;
  title: string;
  courseId: string;
  deadline: string;
  estimate: number;
  actual?: number;
  progress: number;
  status: Status;
  dependsOn?: string;
  relation?: "extends" | "depends on";
}

export const assignments: Assignment[] = [
  { id: "se-a3", title: "Assignment 3 — Authentication", courseId: "se", deadline: "Oct 23", estimate: 8.5, progress: 20, status: "In Progress", dependsOn: "se-a2", relation: "extends" },
  { id: "adb-a4", title: "Assignment 4 — Aggregation", courseId: "adb", deadline: "Oct 22", estimate: 5.5, progress: 0, status: "To Do" },
  { id: "os-l5", title: "Lab 5 — Process Scheduling", courseId: "os", deadline: "Oct 24", estimate: 4, progress: 60, status: "In Progress" },
  { id: "rm-r1", title: "Research Methods Report", courseId: "rm", deadline: "Oct 26", estimate: 3.5, progress: 0, status: "To Do" },
  { id: "stat-p2", title: "Problem Set 2 — Regression", courseId: "stat", deadline: "Oct 29", estimate: 2, progress: 0, status: "Upcoming" },
  { id: "se-a1", title: "Assignment 1 — REST API Basics", courseId: "se", deadline: "Sep 18", estimate: 6, actual: 6.5, progress: 100, status: "Completed" },
  { id: "se-a2", title: "Assignment 2 — Database Integration", courseId: "se", deadline: "Oct 2", estimate: 7, actual: 8, progress: 100, status: "Completed", dependsOn: "se-a1", relation: "extends" },
  { id: "se-a4", title: "Assignment 4 — Testing", courseId: "se", deadline: "Nov 6", estimate: 6, progress: 0, status: "Upcoming", dependsOn: "se-a3", relation: "depends on" },
  { id: "adb-a3", title: "Assignment 3 — Indexing", courseId: "adb", deadline: "Oct 8", estimate: 5, actual: 4.5, progress: 100, status: "Completed" },
];

export const courseOf = (id: string) => (() => { const course = courses.find((c) => c.id === id); if (!course) throw new Error(`Unknown course: ${id}`); return course; })();
export const assignmentOf = (id: string) => assignments.find((a) => a.id === id);

export interface Task {
  id: string;
  title: string;
  description: string;
  courseId: string;
  assignmentId?: string;
  estimate: number;
  priority: Priority;
  due: string;
  column: "backlog" | "todo" | "progress" | "review" | "done";
  ai?: boolean;
  req?: string;
}

export const generatedTasks: Omit<Task, "id" | "column">[] = [
  { title: "Review existing authentication architecture", description: "Audit the Assignment 2 controllers and user entity to decide where security filters will plug in.", courseId: "se", assignmentId: "se-a3", estimate: 0.5, priority: "Medium", due: "Oct 19", ai: true, req: "R5" },
  { title: "Implement JWT token generation", description: "Create a JwtService that signs and validates tokens with a configurable secret and expiry.", courseId: "se", assignmentId: "se-a3", estimate: 1.5, priority: "High", due: "Oct 20", ai: true, req: "R1" },
  { title: "Configure Spring Security", description: "Add the security filter chain and mark selected REST endpoints as protected.", courseId: "se", assignmentId: "se-a3", estimate: 2, priority: "High", due: "Oct 20", ai: true, req: "R2" },
  { title: "Implement authentication endpoints", description: "POST /auth/login and /auth/refresh, including token expiration handling.", courseId: "se", assignmentId: "se-a3", estimate: 1.5, priority: "High", due: "Oct 21", ai: true, req: "R4" },
  { title: "Add role-based access control", description: "Introduce STUDENT and ADMIN roles and guard endpoints with @PreAuthorize.", courseId: "se", assignmentId: "se-a3", estimate: 1, priority: "Medium", due: "Oct 22", ai: true, req: "R3" },
  { title: "Test and document authentication", description: "Integration tests for the login flow and a README section describing the workflow.", courseId: "se", assignmentId: "se-a3", estimate: 2, priority: "Medium", due: "Oct 23", ai: true, req: "R6" },
];

export const initialTasks: Task[] = [
  { id: "t1", title: "Write $group pipeline for sales report", description: "Aggregate orders by region and month.", courseId: "adb", assignmentId: "adb-a4", estimate: 2, priority: "High", due: "Oct 21", column: "todo" },
  { id: "t2", title: "Read chapter 7: Aggregation framework", description: "Lecture 8 slides + textbook chapter.", courseId: "adb", assignmentId: "adb-a4", estimate: 1.5, priority: "Medium", due: "Oct 20", column: "todo" },
  { id: "t3", title: "Implement round-robin scheduler", description: "Time quantum configurable via argv.", courseId: "os", assignmentId: "os-l5", estimate: 1.5, priority: "High", due: "Oct 22", column: "progress" },
  { id: "t4", title: "Benchmark FCFS vs SJF", description: "Record average waiting time for 3 workloads.", courseId: "os", assignmentId: "os-l5", estimate: 1, priority: "Medium", due: "Oct 23", column: "review" },
  { id: "t5", title: "Collect 8 peer-reviewed sources", description: "Use Scopus; topic: remote learning engagement.", courseId: "rm", assignmentId: "rm-r1", estimate: 1.5, priority: "Low", due: "Oct 24", column: "backlog" },
  { id: "t6", title: "Draft report outline", description: "Introduction, method, expected findings.", courseId: "rm", assignmentId: "rm-r1", estimate: 1, priority: "Low", due: "Oct 25", column: "backlog" },
  { id: "t7", title: "Fork process skeleton from Lab 4", description: "Reuse PCB struct.", courseId: "os", assignmentId: "os-l5", estimate: 0.5, priority: "Low", due: "Oct 17", column: "done" },
  { id: "t8", title: "Regression exercise 1–4", description: "Problem Set 2, part A.", courseId: "stat", assignmentId: "stat-p2", estimate: 1, priority: "Low", due: "Oct 27", column: "backlog" },
];

export interface Insight {
  id: string;
  type: "Workload Warning" | "Assignment Analysis" | "Study Preparation" | "Schedule Opportunity" | "Deadline Conflict";
  title: string;
  description: string;
  priority: Priority;
  courses: string[];
  date: string;
  action: string;
  primary: { label: string; to: string };
  secondary: string;
  status: "New" | "Accepted" | "Applied" | "Dismissed" | "Snoozed";
  confidence: number;
  sources: string[];
}

export const initialInsights: Insight[] = [
  { id: "i1", type: "Workload Warning", title: "Heavy academic workload detected", description: "You have three major deadlines within the next four days. Your estimated workload exceeds your available study time.", priority: "High", courses: ["se", "adb"], date: "Oct 22 – Oct 24", action: "Move 2 hours of Software Engineering work to Monday.", primary: { label: "Review Plan", to: "/workload" }, secondary: "Dismiss", status: "New", confidence: 0.87, sources: ["Calendar: Week 43", "Assignment estimates", "Availability settings"] },
  { id: "i2", type: "Assignment Analysis", title: "Assignment 3 is ready for planning", description: "I analyzed your new assignment and detected that it extends Assignment 2. Six implementation tasks have been identified.", priority: "Medium", courses: ["se"], date: "Due Oct 23", action: "Add the 6 generated tasks (8.5h) to your Kanban board.", primary: { label: "View Tasks", to: "/kanban" }, secondary: "Open Assignment", status: "New", confidence: 0.92, sources: ["Assignment_3.pdf", "Assignment_2.pdf", "SE course memory"] },
  { id: "i3", type: "Study Preparation", title: "Midterm preparation recommended", description: "Your Advanced Databases midterm is approaching. Available lecture materials can be organized into a focused revision plan.", priority: "Medium", courses: ["adb"], date: "Midterm Oct 30", action: "Schedule 3 × 90-min revision sessions using Lectures 4–8.", primary: { label: "View Study Plan", to: "/knowledge" }, secondary: "Remind Me Later", status: "New", confidence: 0.81, sources: ["Lecture 4–8 slides", "Course syllabus"] },
  { id: "i4", type: "Schedule Opportunity", title: "2-hour free slot on Monday", description: "Between Software Engineering and Operating Systems you have an uninterrupted block from 13:00 to 15:00.", priority: "Low", courses: ["se"], date: "Mon, Oct 19", action: "Use the slot for JWT token generation (1.5h).", primary: { label: "Plan Session", to: "/schedule" }, secondary: "Dismiss", status: "New", confidence: 0.9, sources: ["Timetable", "Kanban backlog"] },
  { id: "i5", type: "Deadline Conflict", title: "Two deadlines within 24 hours", description: "Advanced Databases A4 (Oct 22) and Software Engineering A3 (Oct 23) overlap with your heaviest study days.", priority: "High", courses: ["adb", "se"], date: "Oct 22 – 23", action: "Start Aggregation pipeline work on Tuesday evening.", primary: { label: "Open Schedule", to: "/schedule" }, secondary: "Dismiss", status: "Accepted", confidence: 0.84, sources: ["Assignment deadlines"] },
];

export const weeklyWorkload = [
  { day: "Mon", required: 3, available: 4 },
  { day: "Tue", required: 5, available: 2 },
  { day: "Wed", required: 7, available: 3.5 },
  { day: "Thu", required: 6, available: 1.5 },
  { day: "Fri", required: 0.5, available: 1 },
  { day: "Sat", required: 0, available: 0 },
  { day: "Sun", required: 0, available: 0 },
];

export interface Slot { start: string; end: string; title: string; kind: "lecture" | "free" | "study" | "event"; room?: string; courseId?: string; }

export const tomorrowSchedule: Slot[] = [
  { start: "09:00", end: "11:00", title: "Advanced Databases", kind: "lecture", room: "C1.204", courseId: "adb" },
  { start: "11:00", end: "13:00", title: "Software Engineering", kind: "lecture", room: "B2.110", courseId: "se" },
  { start: "13:00", end: "15:00", title: "Free time", kind: "free" },
  { start: "15:00", end: "17:00", title: "Operating Systems", kind: "lecture", room: "Lab 3", courseId: "os" },
];

// Weekly calendar: day index 0=Mon
export interface CalEvent { id: string; day: number; start: number; end: number; title: string; kind: Slot["kind"]; courseId?: string; taskId?: string; }
export const weekEvents: CalEvent[] = [
  { id: "c1", day: 0, start: 9, end: 11, title: "Advanced Databases", kind: "lecture", courseId: "adb" },
  { id: "c2", day: 0, start: 11, end: 13, title: "Software Engineering", kind: "lecture", courseId: "se" },
  { id: "c3", day: 0, start: 15, end: 17, title: "Operating Systems", kind: "lecture", courseId: "os" },
  { id: "c4", day: 1, start: 10, end: 12, title: "Statistics", kind: "lecture", courseId: "stat" },
  { id: "c5", day: 1, start: 14, end: 16, title: "Research Methods", kind: "lecture", courseId: "rm" },
  { id: "c6", day: 2, start: 9, end: 11, title: "Advanced Databases Lab", kind: "lecture", courseId: "adb" },
  { id: "c7", day: 2, start: 13, end: 15, title: "SE Studio", kind: "lecture", courseId: "se" },
  { id: "c8", day: 3, start: 11, end: 13, title: "Operating Systems Lab", kind: "lecture", courseId: "os" },
  { id: "c9", day: 3, start: 16, end: 18, title: "AI Society Meetup", kind: "event" },
  { id: "c10", day: 4, start: 10, end: 12, title: "Statistics Tutorial", kind: "lecture", courseId: "stat" },
  { id: "c11", day: 1, start: 18, end: 20, title: "Study: Aggregation pipeline", kind: "study", courseId: "adb" },
];

export const freeSlots = [
  { id: "f1", day: 0, start: 13, end: 15, label: "Mon 13:00–15:00" },
  { id: "f2", day: 2, start: 15, end: 18, label: "Wed 15:00–18:00" },
  { id: "f3", day: 4, start: 13, end: 17, label: "Fri 13:00–17:00" },
];

export interface Activity { id: string; time: string; title: string; detail: string; kind: "analysis" | "task" | "dependency" | "forecast" | "insight" | "index" | "schedule"; status: "success" | "running" | "warning"; }
export const initialActivity: Activity[] = [
  { id: "a1", time: "09:46", title: "New recommendation created", detail: "Workload warning for Oct 22–24", kind: "insight", status: "success" },
  { id: "a2", time: "09:45", title: "Workload forecast updated", detail: "Week 43 total: 21.5h required vs 12h available", kind: "forecast", status: "warning" },
  { id: "a3", time: "09:44", title: "Assignment dependency detected", detail: "SE Assignment 3 extends Assignment 2", kind: "dependency", status: "success" },
  { id: "a4", time: "09:43", title: "Six tasks generated", detail: "8.5h total from 6 extracted requirements", kind: "task", status: "success" },
  { id: "a5", time: "09:42", title: "Assignment 3 analyzed", detail: "Assignment_3.pdf · 4 pages · 6 requirements", kind: "analysis", status: "success" },
  { id: "a6", time: "08:15", title: "Lecture 8 indexed", detail: "Advanced Databases · Aggregation_Framework.pdf", kind: "index", status: "success" },
  { id: "a7", time: "07:30", title: "Timetable synchronized", detail: "Week 43 · 11 sessions", kind: "schedule", status: "success" },
];

export const requirements = [
  { id: "R1", text: "Implement JWT-based authentication.", detail: "Issue signed access tokens on successful login. Use HS256 with a secret from configuration.", page: 2, done: false },
  { id: "R2", text: "Secure selected REST endpoints.", detail: "All /api/orders and /api/users endpoints must require a valid token. /api/products remains public.", page: 2, done: false },
  { id: "R3", text: "Add role-based authorization.", detail: "Support at least STUDENT and ADMIN roles. Only ADMIN may delete users.", page: 2, done: false },
  { id: "R4", text: "Implement token expiration handling.", detail: "Access tokens expire after 15 minutes; provide a refresh endpoint.", page: 3, done: false },
  { id: "R5", text: "Update existing user services.", detail: "Store BCrypt-hashed passwords in the existing User entity from Assignment 2.", page: 3, done: false },
  { id: "R6", text: "Document authentication workflow.", detail: "Add a README section with a sequence diagram of login and refresh.", page: 4, done: false },
];

export const knowledgeDocs = [
  { id: "d1", title: "Assignment_3.pdf", courseId: "se", type: "Assignment", pages: 4, indexed: "Today 09:42", concepts: ["JWT", "Spring Security", "RBAC"] },
  { id: "d2", title: "Assignment_2.pdf", courseId: "se", type: "Assignment", pages: 3, indexed: "Oct 2", concepts: ["JPA", "PostgreSQL", "Repositories"] },
  { id: "d3", title: "Lecture 6 — Security in Web APIs.pdf", courseId: "se", type: "Lecture", pages: 38, indexed: "Oct 14", concepts: ["OAuth2", "Tokens", "CORS"] },
  { id: "d4", title: "Lecture 8 — Aggregation Framework.pdf", courseId: "adb", type: "Lecture", pages: 42, indexed: "Today 08:15", concepts: ["$group", "$match", "Pipelines"] },
  { id: "d5", title: "Lecture 5 — Query Optimization.pdf", courseId: "adb", type: "Lecture", pages: 36, indexed: "Oct 7", concepts: ["EXPLAIN", "Cost model", "Indexes"] },
  { id: "d6", title: "Lab 5 — Scheduling.pdf", courseId: "os", type: "Assignment", pages: 5, indexed: "Oct 15", concepts: ["Round robin", "SJF", "Context switch"] },
  { id: "d7", title: "Syllabus — Research Methods.pdf", courseId: "rm", type: "Syllabus", pages: 6, indexed: "Sep 2", concepts: ["Grading", "APA 7"] },
  { id: "d8", title: "Week 6 — Linear Regression.pdf", courseId: "stat", type: "Lecture", pages: 28, indexed: "Oct 12", concepts: ["OLS", "Residuals", "R²"] },
];

export const campusEvents = [
  { id: "e1", title: "AI Society Meetup: LLM Agents", date: "Thu, Oct 22", time: "16:00–18:00", place: "Main Hall C1", category: "Tech", match: 94, reason: "Matches your SE coursework and fits Thursday after OS Lab." },
  { id: "e2", title: "Career Fair — Software Roles", date: "Fri, Oct 23", time: "13:00–17:00", place: "Expo Center", category: "Career", match: 82, reason: "Falls inside your Friday free slot." },
  { id: "e3", title: "Hackathon Info Session", date: "Mon, Oct 19", time: "13:15–14:00", place: "Room B2.204", category: "Tech", match: 76, reason: "Short session during your Monday free block." },
  { id: "e4", title: "Database Systems Guest Lecture", date: "Wed, Oct 28", time: "15:00–16:30", place: "C1.204", category: "Academic", match: 88, reason: "Directly supports your Advanced Databases midterm." },
  { id: "e5", title: "Campus Volleyball Night", date: "Sat, Oct 24", time: "18:00–20:00", place: "Sports Complex", category: "Sports", match: 61, reason: "Your Saturday has no academic workload." },
  { id: "e6", title: "Academic Writing Workshop", date: "Tue, Oct 20", time: "17:00–18:30", place: "Library L2", category: "Academic", match: 79, reason: "Helpful for the Research Methods report due Oct 26." },
];

export const historicalHours = [
  { range: "5–6h", students: 1 }, { range: "6–7h", students: 2 }, { range: "7–8h", students: 3 }, { range: "8–9h", students: 3 },
  { range: "9–10h", students: 2 }, { range: "10–11h", students: 2 }, { range: "11–12h", students: 1 },
];

export const semesterTrend = [
  { week: "W36", planned: 12, actual: 11 }, { week: "W37", planned: 14, actual: 15 }, { week: "W38", planned: 16, actual: 14.5 },
  { week: "W39", planned: 15, actual: 17 }, { week: "W40", planned: 18, actual: 19.5 }, { week: "W41", planned: 17, actual: 16 },
  { week: "W42", planned: 19, actual: 20 }, { week: "W43", planned: 21.5, actual: 6 },
];


export const demoDate = "2026-10-18";
export const scheduleDate = "2026-10-19";
export const documentTotals = {
  count: knowledgeDocs.length,
  pages: knowledgeDocs.reduce((sum, doc) => sum + doc.pages, 0),
};
export const workloadTotals = {
  required: weeklyWorkload.reduce((sum, day) => sum + day.required, 0),
  available: weeklyWorkload.reduce((sum, day) => sum + day.available, 0),
  allRemaining: assignments.filter((assignment) => assignment.status !== "Completed").reduce((sum, assignment) => sum + assignment.estimate, 0),
};
export const adminCohort = [
  { week: "W40", estimated: 14, reported: 15 }, { week: "W41", estimated: 16, reported: 17 },
  { week: "W42", estimated: 18, reported: 20 }, { week: "W43", estimated: 23, reported: 0 },
  { week: "W44", estimated: 26, reported: 0 }, { week: "W45", estimated: 19, reported: 0 },
];
export const adminCourses = [
  { id: "se", name: "Software Engineering", students: 124, median: 9.2, estimate: 8.5, risk: 18 },
  { id: "adb", name: "Advanced Databases", students: 98, median: 6.1, estimate: 5.5, risk: 22 },
  { id: "os", name: "Operating Systems", students: 110, median: 4.4, estimate: 4, risk: 11 },
  { id: "rm", name: "Research Methods", students: 142, median: 3.2, estimate: 3.5, risk: 6 },
  { id: "stat", name: "Statistics", students: 156, median: 2.4, estimate: 2, risk: 9 },
];

export const adminActivity: Activity[] = [
  { id: "faculty-1", time: "09:45", title: "Faculty workload forecast updated", detail: "SE cohort · Week 44 peak: 26h", kind: "forecast", status: "warning" },
  { id: "faculty-2", time: "09:30", title: "Course aggregates refreshed", detail: "5 courses · anonymised enrolments and overload risk", kind: "index", status: "success" },
  { id: "faculty-3", time: "07:30", title: "Faculty timetable synchronized", detail: "Fall 2026 · faculty scheduling", kind: "schedule", status: "success" },
];

// Explicit demonstration excerpts, not a claim of parsing an uploaded file.
export interface DocumentFragment { id: string; documentId: string; page: number; text: string; concept: string; assignmentId?: string | undefined; requirementId?: string | undefined; }
export const documentFragments = knowledgeDocs.flatMap<DocumentFragment>((doc) => doc.id === "d1"
  ? requirements.map((req) => ({ id: `d1-${req.id}`, documentId: doc.id, page: req.page, text: req.detail, concept: req.text, assignmentId: "se-a3", requirementId: req.id }))
  : doc.concepts.map((concept, i) => ({ id: `${doc.id}-${i}`, documentId: doc.id, page: Math.min(doc.pages, i + 1), text: `${concept} — demonstration excerpt from ${doc.title}.`, concept, assignmentId: doc.id === "d2" ? "se-a2" : doc.id === "d6" ? "os-l5" : undefined, requirementId: undefined })));

export const demoClock = "09:46";
export const formatHour = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;

export const summarizeCourses = (items: Assignment[]) => courseCatalog.map((course) => {
  const rows = items.filter((assignment) => assignment.courseId === course.id);
  const open = rows.filter((assignment) => assignment.status !== "Completed");
  return { ...course, assignments: rows.length, completed: rows.filter((assignment) => assignment.status === "Completed").length,
    progress: rows.length ? Math.round(rows.reduce((sum, assignment) => sum + assignment.progress, 0) / rows.length) : 0,
    remaining: open.reduce((sum, assignment) => sum + assignment.estimate, 0), docs: knowledgeDocs.filter((doc) => doc.courseId === course.id).length };
});
export const courses = summarizeCourses(assignments);
export const upcomingAssignments = assignments.filter((assignment) => ["se-a3", "adb-a4", "os-l5"].includes(assignment.id));
export const generatedStudySlots = [
  { day: 0, start: 13, end: 13.5 }, { day: 0, start: 13.5, end: 15 },
  { day: 2, start: 15, end: 17 }, { day: 2, start: 17, end: 18.5 },
  { day: 4, start: 13, end: 14 }, { day: 4, start: 14, end: 16 },
];

export const facultyCourseCatalog = adminCourses.map((course) => ({ ...course, code: courseCatalog.find((item) => item.id === course.id)?.code, instructor: courseCatalog.find((item) => item.id === course.id)?.instructor }));
export const facultySummary = {
  enrolments: adminCourses.reduce((sum, course) => sum + course.students, 0),
  courses: adminCourses.length,
  highestRisk: Math.max(...adminCourses.map((course) => course.risk)),
  peak: adminCohort.reduce((highest, week) => week.estimated > highest.estimated ? week : highest),
  averageLoad: Math.round(adminCohort.reduce((sum, week) => sum + week.estimated, 0) / adminCohort.length * 10) / 10,
};
