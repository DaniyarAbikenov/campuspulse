import { describe, expect, it } from "vitest";
import { addDays, dayLabels, daysBetween, isoWeekNumber, mondayOf, todayCampus, weekRange, weekTitle } from "@/lib/week";

describe("week helpers", () => {
  it("finds the Monday of any day, including Sundays", () => {
    expect(mondayOf("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week that started on Monday
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("moves across month and year boundaries", () => {
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(daysBetween("2026-10-19", "2026-10-26")).toBe(7);
  });

  it("numbers weeks like ISO 8601", () => {
    expect(isoWeekNumber("2026-10-19")).toBe(43);
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
  });

  it("labels a week and its days", () => {
    expect(weekRange("2026-10-19", "en")).toBe("Oct 19 – 25");
    expect(weekRange("2026-10-26", "en")).toBe("Oct 26 – Nov 1");
    expect(weekTitle("2026-10-19", "en")).toBe("Week 43 · Oct 19 – 25");
    expect(dayLabels("2026-10-26", "en")[6]).toContain("Sun");
  });

  it("reads today in the campus time zone, which is five hours ahead of UTC", () => {
    expect(todayCampus(Date.parse("2026-10-19T20:30:00Z"))).toBe("2026-10-20");
    expect(todayCampus(Date.parse("2026-10-19T18:59:00Z"))).toBe("2026-10-19");
  });
});
