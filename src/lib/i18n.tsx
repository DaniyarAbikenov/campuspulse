import { useEffect, useSyncExternalStore } from "react";
import catalog from "./locales/catalog.json";

export type Locale = "en" | "ru" | "kk";
export const languages: { value: Locale; label: string }[] = [{ value: "kk", label: "Қазақша" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }];
const messages: Record<string, string[]> = catalog;
const listeners = new Set<() => void>();
let locale: Locale = "en";
const storageKey = "campuspulse.locale";
const phrasePatterns = Object.keys(messages).filter((key) => key.length >= 3).sort((a, b) => b.length - a.length).map((key) => ({ key, pattern: new RegExp(`(?<![\\p{L}\\p{N}_])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu") }));
export const intlLocale = (language: Locale) => ({ en: "en-US", ru: "ru-RU", kk: "kk-KZ" })[language];
export function setLocale(next: Locale) {
  locale = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Storage may be unavailable. */ }
  listeners.forEach((listener) => listener());
}
export function useI18n() {
  const language = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => locale, () => "en" as Locale);
  return { locale: language, setLocale, t: (text: string) => translate(text, language), formatDate: (date: string, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(language), { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`)) };
}
export function LanguageInitialization() {
  useEffect(() => {
    try { const stored = localStorage.getItem(storageKey); if (stored === "en" || stored === "ru" || stored === "kk") setLocale(stored); } catch { /* Use English if storage is blocked. */ }
  }, []);
  return null;
}

const aliases: Record<string, string> = { todo: "To Do", to_do: "To Do", pending: "To Do", in_progress: "In Progress", progress: "In Progress", under_review: "Review", review: "Review", done: "Completed", complete: "Completed", completed: "Completed", upcoming: "Upcoming", new: "New", accepted: "Accepted", approved: "Accepted", applied: "Applied", dismissed: "Dismissed", rejected: "Dismissed", snoozed: "Snoozed", postponed: "Snoozed", backlog: "Backlog", processing: "In Progress", success: "Completed", failed: "Failed", cancelled: "Cancelled" };
export const canonicalStatus = (status: string) => aliases[status.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? status;
export const statusLabel = (status: string, language: Locale = locale) => translate(canonicalStatus(status), language);

export function translate(text: string, language: Locale = locale): string {
  if (language === "en" || !text.trim()) return text;
  if (/\.pdf\b/i.test(text.trim()) && !text.includes(" · ")) return text;
  const index = language === "ru" ? 0 : 1;
  const exact = messages[text] ?? messages[text.trim()];
  if (exact) return text.replace(text.trim(), exact[index] ?? text.trim());
  // ISO fixtures stay canonical; only their display is formatted.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Intl.DateTimeFormat(intlLocale(language), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${text}T12:00:00Z`));
  let result = text;
  const datePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{1,2})(?:, 2026)?\b/g;
  result = result.replace(datePattern, (_match, month: string, day: string) => {
    const date = new Date(`${month} ${day}, 2026 12:00:00 GMT`);
    return new Intl.DateTimeFormat(intlLocale(language), { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  });
  // Compose dynamic labels from catalog phrases, longest first, never alter IDs or data.
  const translated: string[] = [];
  for (const { key, pattern } of phrasePatterns) {
    result = result.replace(pattern, () => { translated.push(messages[key]?.[index] ?? key); return `\u0000${translated.length - 1}\u0000`; });
  }
  return result.replace(/\u0000(\d+)\u0000/g, (_match, position: string) => translated[Number(position)] ?? "").replace(/\b(\d+(?:\.\d+)?)h\b/g, `$1 ${language === "ru" ? "ч" : "сағ"}`);
}

/** Render-boundary helper: domain values, event handlers and objects remain untouched. */
export function localize<T>(value: T, language: Locale = locale): T {
  if (typeof value === "string") return translate(value, language) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => typeof item === "string" ? translate(item, language) : item) as T;
  return value;
}