import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert a 24h "HH:MM" string to 12h "HH:MM AM/PM" for display.
 *  Returns input unchanged if it does not match HH:MM. */
export function fmtTime12(t?: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  let h = Number(m[1]);
  const mm = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${mm} ${ampm}`;
}

/** "HH:MM" 24h -> "HH:MM" 12h (no AM/PM suffix). */
export function fmtTime12NoSuffix(t?: string | null): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t ?? "";
  let h = Number(m[1]);
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Render a time range using 12h format, sharing the AM/PM suffix when both halves match. */
export function fmtRange12(start?: string | null, end?: string | null): string {
  if (!start || !end) return "";
  const sm = /^(\d{1,2}):(\d{2})$/.exec(start);
  const em = /^(\d{1,2}):(\d{2})$/.exec(end);
  if (!sm || !em) return `${start}–${end}`;
  const sh = Number(sm[1]);
  const eh = Number(em[1]);
  const sAmPm = sh >= 12 ? "PM" : "AM";
  const eAmPm = eh >= 12 ? "PM" : "AM";
  if (sAmPm === eAmPm) {
    return `${fmtTime12NoSuffix(start)}–${fmtTime12NoSuffix(end)} ${sAmPm}`;
  }
  return `${fmtTime12(start)}–${fmtTime12(end)}`;
}
