import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Up to two initials of a person's name, e.g. "Alex Morgan" → "AM". */
export const initialsOf = (name: string) =>
  name.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
