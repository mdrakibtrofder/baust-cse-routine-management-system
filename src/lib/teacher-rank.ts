/** Teacher rank → short code + color tokens for badge display */
export type TeacherRank =
  | "professor"
  | "associate"
  | "assistant"
  | "lecturer"
  | "senior_engineer"
  | "assistant_engineer"
  | "engineer"
  | "other";

export function teacherRank(designation: string): TeacherRank {
  const d = (designation || "").toLowerCase();

  // Engineering staff first — "Assistant Software Engineer" also contains
  // "assistant", so it must not fall through to the Assistant Professor rank.
  if (d.includes("engineer")) {
    if (d.includes("assistant") || d.includes("asst")) return "assistant_engineer";
    if (d.includes("senior") || d.includes("sr.") || d.includes("sr ")) return "senior_engineer";
    return "engineer";
  }

  if (d.includes("associate")) return "associate";
  if (d.includes("assistant")) return "assistant";
  if (d.includes("lecturer")) return "lecturer";
  if (d.includes("professor")) return "professor";
  return "other";
}

export interface RankInfo {
  short: string;       // P / AsP / AP / L / SE / ASE / SSE
  label: string;
  /** Tailwind classes for the badge (gradient-ish solid colors) */
  className: string;
}

export const RANK_INFO: Record<TeacherRank, RankInfo> = {
  professor: {
    short: "P",
    label: "Professor",
    className: "bg-gradient-to-br from-amber-500 to-orange-600 text-white border-orange-700/30",
  },
  associate: {
    short: "AsP",
    label: "Associate Professor",
    className: "bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white border-purple-700/30",
  },
  assistant: {
    short: "AP",
    label: "Assistant Professor",
    className: "bg-gradient-to-br from-sky-500 to-blue-600 text-white border-blue-700/30",
  },
  lecturer: {
    short: "L",
    label: "Lecturer",
    className: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-teal-700/30",
  },
  senior_engineer: {
    short: "SSE",
    label: "Senior Software Engineer",
    className: "bg-gradient-to-br from-slate-600 to-slate-800 text-white border-slate-900/30",
  },
  assistant_engineer: {
    short: "ASE",
    label: "Assistant Software Engineer",
    className: "bg-gradient-to-br from-rose-500 to-pink-600 text-white border-pink-700/30",
  },
  engineer: {
    short: "SE",
    label: "Software Engineer",
    className: "bg-gradient-to-br from-cyan-500 to-teal-600 text-white border-cyan-700/30",
  },
  other: {
    short: "·",
    label: "Faculty",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function rankInfoFor(designation: string): RankInfo {
  return RANK_INFO[teacherRank(designation)];
}
