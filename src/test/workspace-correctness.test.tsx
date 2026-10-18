import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreProvider, useStore } from "@/lib/store";
import { documentTotals, knowledgeDocs, workloadTotals, weeklyWorkload, demoDate, scheduleDate } from "@/lib/data";
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
  it("accepts a recommendation only when its plan is applied and does not duplicate the session", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    act(() => result.current.applyWorkloadPlan());
    expect(result.current.insights.find((item) => item.id === "i1")?.status).toBe("Accepted");
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
  it("separates 21.5 weekly hours from 25.5 all-remaining hours", () => {
    expect(workloadTotals.required).toBe(21.5);
    expect(workloadTotals.available).toBe(12);
    expect(workloadTotals.allRemaining).toBe(25.5);
    expect(weeklyWorkload.reduce((sum, day) => sum + day.required, 0)).toBe(21.5);
  });
});