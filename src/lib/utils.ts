import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Fixed palette of badge color classes, picked deterministically per id/string
 *  so the same entity (e.g. a department) always renders the same color. */
const TAG_COLOR_PALETTE = [
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-orange-100 text-orange-700 border-orange-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-lime-100 text-lime-700 border-lime-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-teal-100 text-teal-700 border-teal-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-sky-100 text-sky-700 border-sky-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "bg-pink-100 text-pink-700 border-pink-200",
];

/** Deterministic color classes for a given key (e.g. department id).
 *  Same key always yields the same color; different keys are spread across the palette. */
export function tagColorClasses(key: string | null | undefined): string {
  if (!key) return "bg-muted text-muted-foreground border-border";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[idx];
}

const DAY_SEQUENCE = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

const DAY_MAP: Record<string, string> = {
  SUNDAY: "SUN",
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
  SATURDAY: "SAT",
  SUN: "SUN",
  MON: "MON",
  TUE: "TUE",
  WED: "WED",
  THU: "THU",
  FRI: "FRI",
  SAT: "SAT",
};

function parseTimeParts(t?: string | null) {
  if (!t) return null;
  const cleanTime = t.replace(/[AP]M/i, "").trim();
  const m = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/.exec(cleanTime);
  if (!m) return null;
  return {
    hours: Number(m[1]),
    minutes: m[2],
    seconds: Number(m[3] ?? "0"),
  };
}

export function normalizeDayName(day?: string | null): string {
  const d = (day ?? "").trim().toUpperCase();
  return DAY_MAP[d] ?? d;
}

/** Convert SUN -> Sun, Sunday -> Sun, etc. */
export function fmtDayTitle(day?: string | null): string {
  const norm = normalizeDayName(day);
  if (!norm) return "";
  // If it's one of our short names, return Title Case version
  const map: Record<string, string> = {
    SUN: "Sun",
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
  };
  return map[norm] ?? (norm.charAt(0).toUpperCase() + norm.slice(1).toLowerCase());
}

export function compareDayNames(a?: string | null, b?: string | null): number {
  const an = normalizeDayName(a);
  const bn = normalizeDayName(b);
  const ai = DAY_SEQUENCE.indexOf(an as (typeof DAY_SEQUENCE)[number]);
  const bi = DAY_SEQUENCE.indexOf(bn as (typeof DAY_SEQUENCE)[number]);
  if (ai !== -1 || bi !== -1) {
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }
  return an.localeCompare(bn);
}

export function compareTimeValues(a?: string | null, b?: string | null): number {
  const ap = parseTimeParts(a);
  const bp = parseTimeParts(b);
  if (ap && bp) {
    const diff =
      ap.hours * 3600 +
      Number(ap.minutes) * 60 +
      ap.seconds -
      (bp.hours * 3600 + Number(bp.minutes) * 60 + bp.seconds);
    if (diff !== 0) return diff;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

export function compareDayAndTime(
  a: { day: string; start?: string | null },
  b: { day: string; start?: string | null },
): number {
  return compareDayNames(a.day, b.day) || compareTimeValues(a.start, b.start);
}

export function sortDays<T extends { name: string }>(days: T[]): T[] {
  return [...days].sort((a, b) => compareDayNames(a.name, b.name));
}

/** Convert a 24h "HH:MM" or "HH:MM:SS" string to 12h "HH.MM AM/PM" for display.
 *  Returns input unchanged if it does not match a time format. */
export function fmtTime12(t?: string | null): string {
  const parts = parseTimeParts(t);
  if (!parts) return t ?? "";
  let h = parts.hours;
  const mm = parts.minutes;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}.${mm} ${ampm}`;
}

/** "HH:MM" or "HH:MM:SS" 24h -> "HH.MM" 12h (no AM/PM suffix). */
export function fmtTime12NoSuffix(t?: string | null): string {
  const parts = parseTimeParts(t);
  if (!parts) return t ?? "";
  let h = parts.hours;
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}.${parts.minutes}`;
}

/** Render a time range using 12h format. */
export function fmtRange12(start?: string | null, end?: string | null): string {
  if (!start || !end) return "";
  return `${fmtTime12(start)} - ${fmtTime12(end)}`;
}
