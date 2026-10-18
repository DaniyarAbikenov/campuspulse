import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalStatus, languages, setLocale, statusLabel, translate, useI18n } from "@/lib/i18n";
import { StoreProvider, useStore } from "@/lib/store";

afterEach(() => { act(() => setLocale("en")); });
describe("Interface languages and canonical statuses", () => {
  it("supports exactly Kazakh, Russian and English", () => {
    expect(languages.map((language) => language.value)).toEqual(["kk", "ru", "en"]);
  });
  it("persists a selected language and notifies mounted consumers", () => {
    const { result } = renderHook(() => useI18n());
    act(() => setLocale("kk"));
    expect(result.current.locale).toBe("kk");
    expect(localStorage.getItem("campuspulse.locale")).toBe("kk");
    expect(document.documentElement.lang).toBe("kk");
  });
  it("maps server codes without changing them or losing unknown codes", () => {
    expect(canonicalStatus("IN_PROGRESS")).toBe("In Progress");
    expect(statusLabel("IN_PROGRESS", "ru")).toBe("В работе");
    expect(statusLabel("in-progress", "kk")).toBe("Орындалуда");
    expect(statusLabel("ACCEPTED", "ru")).toBe("Принята");
    expect(statusLabel("APPLIED", "kk")).toBe("Қолданылды");
    expect(statusLabel("unrecognized_server_code", "kk")).toBe("unrecognized_server_code");
  });
  it("keeps recommendation lifecycle and task values canonical after switching", () => {
    const { result } = renderHook(() => useStore(), { wrapper: StoreProvider });
    act(() => setLocale("ru"));
    expect(result.current.insights.find((insight) => insight.id === "i1")?.status).toBe("New");
    act(() => result.current.setInsightStatus("i1", "Accepted"));
    expect(result.current.insights.find((insight) => insight.id === "i1")?.status).toBe("Accepted");
    expect(result.current.workloadPlanApplied).toBe(false);
    act(() => setLocale("kk"));
    act(() => result.current.applyWorkloadPlan());
    expect(result.current.insights.find((insight) => insight.id === "i1")?.status).toBe("Applied");
    expect(result.current.tasks[0]?.column).toBe("todo");
    expect(translate("untranslated_fixture_identifier", "ru")).toBe("untranslated_fixture_identifier");
  });
});