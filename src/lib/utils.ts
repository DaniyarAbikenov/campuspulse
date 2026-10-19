import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Removes internal ids from text meant for people, tidying what is left behind. */
export const withoutIds = (text: string) =>
  text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\s*·\s*(?=·|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Up to two initials of a person's name, e.g. "Alex Morgan" → "AM". */
export const initialsOf = (name: string) =>
  name.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
