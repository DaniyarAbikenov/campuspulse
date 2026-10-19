import { describe, expect, it } from "vitest";
import { applyStep, toolLabel, traceOf } from "@/lib/agentSteps";
import { parseServerEvents } from "@/lib/api";

describe("agent step trace", () => {
  it("pairs each result with the running call of the same tool", () => {
    let items = traceOf([{ kind: "tool_call", name: "get_workload", detail: "{}" }]);
    expect(items).toMatchObject([{ status: "running", label: "Checking your workload" }]);
    items = applyStep(items, {
      kind: "tool_result",
      name: "get_workload",
      detail: '{"hours": 12}',
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "done", result: '{"hours": 12}' });
  });

  it("closes parallel calls of one tool in order and flags failures", () => {
    const items = traceOf([
      { kind: "tool_call", name: "moodle_get_course", detail: "1" },
      { kind: "tool_call", name: "moodle_get_course", detail: "2" },
      { kind: "tool_result", name: "moodle_get_course", detail: '{"error": "denied"}' },
    ]);
    expect(items.map((item) => item.status)).toEqual(["running", "error"]);
  });

  it("keeps thoughts and labels unknown tools readably", () => {
    expect(
      traceOf([{ kind: "thought", name: null, detail: "Compare deadlines" }])[0],
    ).toMatchObject({
      kind: "thought",
      label: "Compare deadlines",
    });
    expect(toolLabel("moodle_list_assignments")).toBe("Moodle: list assignments");
    expect(toolLabel("custom_thing")).toBe("Custom thing");
  });
});

describe("server-sent events", () => {
  it("returns complete events and keeps the unfinished tail", () => {
    const text =
      'event: step\ndata: {"kind":"tool_call"}\n\nevent: done\ndata: {"reply":"ok"}\n\nevent: step\ndata: {"ki';
    const { events, rest } = parseServerEvents(text);
    expect(events).toEqual([
      { event: "step", data: { kind: "tool_call" } },
      { event: "done", data: { reply: "ok" } },
    ]);
    expect(rest).toBe('event: step\ndata: {"ki');
  });

  it("skips malformed payloads without dropping later events", () => {
    const { events } = parseServerEvents("event: step\ndata: {oops\n\nevent: done\ndata: 1\n\n");
    expect(events).toEqual([{ event: "done", data: 1 }]);
  });
});
