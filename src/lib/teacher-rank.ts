/** Teacher rank → short code + color tokens for badge display */
export type TeacherRank = "professor" | "associate" | "assistant" | "lecturer" | "other";

export function teacherRank(designation: string): TeacherRank {
  const d = (designation || "").toLowerCase();
  if (d.includes("associate")) return "associate";
  if (d.includes("assistant")) return "assistant";
  if (d.includes("lecturer")) return "lecturer";
  if (d.includes("professor")) return "professor";
  return "other";
}

export interface RankInfo {
  short: string;       // P / AsP / AP / L
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
  other: {
    short: "·",
    label: "Faculty",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function rankInfoFor(designation: string): RankInfo {
  return RANK_INFO[teacherRank(designation)];
}
