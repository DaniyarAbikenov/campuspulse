import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";
import { documentTotals, knowledgeDocs, workloadTotals, weeklyWorkload, demoDate, scheduleDate, taskMatchesDate, initialTasks } from "@/lib/data";
import { workspaceDestination, guardWorkspace } from "@/lib/workspace-access";

describe("Workspace rules", () => {
  it("redirects admin course URLs to faculty courses", () => {
    expect(workspaceDestination("admin", "/courses")).toBe("/admin/courses");
    expect(workspaceDestination("admin", "/courses/se")).toBe("/admin/courses");
  });
  it("redirects admin personal statistics to faculty statistics", () => {
    expect(workspaceDestination("admin", "/statistics")).toBe("/admin/statistics");
  });
  it("blocks student access to every administrator route", () => {
    for (const pathname of ["/admin", "/admin/courses", "/admin/statistics"]) {
      expect(workspaceDestination("student", pathname)).toBe("/");
      expect(() => guardWorkspace({ context: { workspaceRole: "student" }, location: { pathname } })).toThrow();
    }
    expect(workspaceDestination("admin", "/admin/courses")).toBeNull();
  });
  it("starts reviewable recommendations as New without applying a plan", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    expect(result.current.insights.find((item) => item.id === "i1")?.status).toBe("New");
    expect(result.current.workloadPlanApplied).toBe(false);
  });
  it("records Applied when executing the plan and does not duplicate the session", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    act(() => result.current.applyWorkloadPlan());
    expect(result.current.insights.find((item) => item.id === "i1")?.status).toBe("Applied");
    expect(result.current.workloadPlanApplied).toBe(true);
    act(() => result.current.applyWorkloadPlan());
    expect(result.current.events.filter((event) => event.id === "rebalance-se")).toHaveLength(1);
  });
  it("uses the same eight documents and 162 pages for all aggregates", () => {
    expect(documentTotals.count).toBe(8);
    expect(documentTotals.pages).toBe(162);
    expect(documentTotals.pages).toBe(knowledgeDocs.reduce((sum, doc) => sum + doc.pages, 0));
  });
  it("shows the October 19 schedule as tomorrow relative to October 18", () => {
    expect(demoDate).toBe("2026-10-18");
    expect(scheduleDate).toBe("2026-10-19");
    expect(Date.parse(scheduleDate) - Date.parse(demoDate)).toBe(86400000);
  });
  it("derives all remaining hours from open assignments, separate from this week", () => {
    expect(workloadTotals.required).toBe(21.5);
    expect(workloadTotals.available).toBe(12);
    expect(workloadTotals.allRemaining).toBe(29.5);
    expect(weeklyWorkload.reduce((sum, day) => sum + day.required, 0)).toBe(21.5);
  });
  it("Accept approves without executing, and Dismiss does not create tasks or events", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    const count = result.current.tasks.length;
    const sessions = result.current.events.length;
    act(() => result.current.setInsightStatus("i2", "Accepted"));
    expect(result.current.proposalApproved).toBe(true);
    expect(result.current.tasks).toHaveLength(count);
    expect(result.current.events).toHaveLength(sessions);
    act(() => result.current.setInsightStatus("i2", "Dismissed"));
    expect(result.current.proposalApproved).toBe(false);
    expect(result.current.insights.find((item) => item.id === "i2")?.status).toBe("Dismissed");
    expect(result.current.tasks).toHaveLength(count);
  });
  it("requires approval before importing, then schedules the imported plan exactly once", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    act(() => { expect(result.current.addGeneratedTasks()).toBe(0); });
    expect(result.current.tasksGenerated).toBe(false);
    act(() => result.current.recordAnalysis("student-brief.pdf"));
    expect(result.current.analysisSource).toBe("student-brief.pdf");
    act(() => result.current.approveProposal());
    act(() => { expect(result.current.addGeneratedTasks()).toBe(6); expect(result.current.addGeneratedTasks()).toBe(0); });
    expect(result.current.tasks.filter((task) => task.assignmentId === "se-a3")).toHaveLength(6);
    expect(result.current.events.filter((event) => event.taskId)).toHaveLength(0);
    act(() => { expect(result.current.scheduleGeneratedTasks()).toBe(true); expect(result.current.scheduleGeneratedTasks()).toBe(false); });
    expect(result.current.events.filter((event) => event.taskId)).toHaveLength(6);
    expect(result.current.workload.scheduled).toBe(10.5);
    expect(result.current.workload.unscheduled).toBe(11);
    act(() => result.current.moveTask("g0", "done"));
    expect(result.current.workload.required).toBe(21);
    expect(result.current.assignments.find((assignment) => assignment.id === "se-a3")?.progress).toBe(17);
  });
  it("uses edited estimates at import rather than discarding the approved values", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    act(() => result.current.setProposalEstimate(0, 1));
    expect(result.current.workload.required).toBe(22);
    act(() => result.current.approveProposal());
    act(() => result.current.addGeneratedTasks());
    expect(result.current.tasks.find((task) => task.id === "g0")?.estimate).toBe(1);
    expect(result.current.assignments.find((assignment) => assignment.id === "se-a3")?.estimate).toBe(9);
  });
  it("keeps course assignment counts and remaining hours aligned to entities", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    expect(result.current.courses.reduce((sum, course) => sum + course.assignments, 0)).toBe(result.current.assignments.length);
    expect(result.current.courses.reduce((sum, course) => sum + course.remaining, 0)).toBe(29.5);
  });
  it("filters overdue open tasks separately from the October 19–25 week", () => {
    const overdue = { ...initialTasks[0], id: "overdue", title: "Late task", description: "", courseId: "se", estimate: 1, priority: "Low" as const, due: "Oct 17", column: "todo" as const };
    expect(taskMatchesDate(overdue, "overdue")).toBe(true);
    expect(taskMatchesDate({ ...overdue, column: "done" }, "overdue")).toBe(false);
    expect(taskMatchesDate({ ...overdue, due: "Oct 19" }, "week")).toBe(true);
    expect(taskMatchesDate({ ...overdue, due: "Oct 27" }, "week")).toBe(false);
  });
});