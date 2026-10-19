import { describe, expect, it } from "vitest";
import { describeAction } from "@/components/app/AgentActionsDialog";
import { campusInputs, campusIso } from "@/lib/api";

describe("campus time helpers", () => {
  it("turns date and time inputs into an instant on the campus clock", () => {
    expect(campusIso("2026-10-20", "08:00")).toBe("2026-10-20T08:00:00+05:00");
  });

  it("reads an instant back as campus date and time", () => {
    expect(campusInputs("2026-10-20T03:00:00Z")).toEqual({ date: "2026-10-20", time: "08:00" });
    expect(campusInputs("2026-10-20T20:30:00Z")).toEqual({ date: "2026-10-21", time: "01:30" });
  });
});

describe("agent action descriptions", () => {
  const base = { id: "a", title: "t", summary: "" };

  it("shows when a calendar change happens", () => {
    const text = describeAction({
      ...base,
      kind: "create_study_session",
      payload: {
        starts_at: "2026-10-20T03:00:00Z",
        ends_at: "2026-10-20T05:00:00Z",
        location: "Lab",
      },
    });
    expect(text).toBe("2026-10-20 08:00–10:00 · Lab");
  });

  it("names the task and the new status", () => {
    const text = describeAction(
      { ...base, kind: "update_task_status", payload: { task_id: "t1", status: "completed" } },
      (id) => (id === "t1" ? "Write tests" : undefined),
    );
    expect(text).toBe("Write tests → completed");
  });

  it("warns what cancelling removes", () => {
    const text = describeAction({
      ...base,
      kind: "cancel_assignment",
      payload: { assignment_id: "x" },
    });
    expect(text).toContain("future study sessions");
  });
});
