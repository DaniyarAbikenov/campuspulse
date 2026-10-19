import type { AgentStep } from "./api";

/** One line of the agent's visible work: a tool call paired with its result, or a thought. */
export interface TraceItem {
  id: number;
  kind: "tool" | "thought";
  tool: string | null;
  label: string;
  args: string;
  result: string;
  status: "running" | "done" | "error";
}

const LABELS: Record<string, string> = {
  get_workload: "Checking your workload",
  list_assignments: "Reading your assignments",
  get_free_time: "Looking for free time",
  list_campus_events: "Checking campus events",
  search_knowledge: "Searching your materials",
  propose_assignment_import: "Preparing an import from Moodle",
  get_assignment_text: "Reading the assignment document",
  get_study_statistics: "Calibrating with your study history",
  propose_task_plan: "Writing the task plan",
  list_insights: "Checking earlier insights",
  list_open_tasks: "Reading your open tasks",
  propose_insights: "Saving insights",
};

/** A readable name for a tool; Moodle tools are labelled as such. */
export function toolLabel(name: string | null): string {
  if (!name) return "Working";
  const known = LABELS[name];
  if (known) return known;
  if (name.startsWith("moodle_")) return `Moodle: ${name.slice(7).replace(/_/g, " ")}`;
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const failed = (result: string) => /"error"|\berror\b/i.test(result.slice(0, 120));

/** Fold one streamed step into the trace: results close the matching running call. */
export function applyStep(items: TraceItem[], step: AgentStep): TraceItem[] {
  if (step.kind === "tool_call") {
    return [
      ...items,
      {
        id: items.length,
        kind: "tool",
        tool: step.name,
        label: toolLabel(step.name),
        args: step.detail,
        result: "",
        status: "running",
      },
    ];
  }
  if (step.kind === "tool_result") {
    let index = -1;
    items.forEach((item, position) => {
      if (item.kind === "tool" && item.tool === step.name && item.status === "running")
        index = position;
    });
    const status = failed(step.detail) ? "error" : "done";
    if (index < 0) {
      return [
        ...items,
        {
          id: items.length,
          kind: "tool",
          tool: step.name,
          label: toolLabel(step.name),
          args: "",
          result: step.detail,
          status,
        },
      ];
    }
    return items.map((item, position) =>
      position === index ? { ...item, result: step.detail, status } : item,
    );
  }
  return [
    ...items,
    {
      id: items.length,
      kind: "thought",
      tool: null,
      label: step.detail,
      args: "",
      result: "",
      status: "done",
    },
  ];
}

/** The full trace for a finished list of steps. */
export const traceOf = (steps: AgentStep[]): TraceItem[] => steps.reduce(applyStep, []);

const parse = (raw: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One readable line about what a tool achieved, or null when its name already says it.
 *  Raw tool output (JSON, ids, notes meant for the model) is never shown to people. */
export function describeToolResult(name: string | null, raw: string): string | null {
  if (!raw) return null;
  if (failed(raw)) return "It did not work";
  const data = parse(raw);
  switch (name) {
    case "propose_actions": {
      const count = Number(data?.["proposed"] ?? 0);
      return count ? `Proposed ${plural(count, "change", "changes")} for you to confirm` : "Nothing to propose";
    }
    case "propose_insights":
      return `Saved ${plural(Number(data?.["saved"] ?? 0), "insight", "insights")}`;
    case "propose_task_plan":
      return "Proposed a task plan for your approval";
    case "propose_assignment_import":
      return "Prepared an import for your approval";
    default:
      return null;
  }
}
