// Calendar helpers shared by the API layer and the pages. The campus runs on Asia/Almaty
// (UTC+5, no DST), so "today" and the week boundaries are computed in that zone.
export const CAMPUS_OFFSET_MS = 5 * 3_600_000;
/** The week the offline fixture workspace describes. */
export const FIXTURE_WEEK = "2026-10-19";

const DAY_MS = 86_400_000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Today's date in the campus time zone, as YYYY-MM-DD. */
export const todayCampus = (now: number = Date.now()) => isoDate(new Date(now + CAMPUS_OFFSET_MS));

export const addDays = (iso: string, days: number) => isoDate(new Date(Date.parse(iso) + days * DAY_MS));

/** Monday of the week containing the date. */
export const mondayOf = (iso: string) => {
  const weekday = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
};

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** ISO-8601 week number. */
export const isoWeekNumber = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * DAY_MS);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
};

export const dayLabels = (weekStart: string, locale: string) =>
  Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${addDays(weekStart, index)}T12:00:00Z`)),
  );

/** "Week 43 · Oct 19 – 25" */
export const weekRange = (weekStart: string, locale: string) => {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addDays(weekStart, 6)}T12:00:00Z`);
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const sameMonth = month.format(start) === month.format(end);
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" });
  return `${month.format(start)} ${day.format(start)} – ${sameMonth ? "" : `${month.format(end)} `}${day.format(end)}`;
};
export const weekTitle = (weekStart: string, locale: string, prefix = "Week") => `${prefix} ${isoWeekNumber(weekStart)} · ${weekRange(weekStart, locale)}`;
