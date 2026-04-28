import { cn } from "@/lib/utils";
import { rankInfoFor } from "@/lib/teacher-rank";
import type { Teacher } from "@/lib/types";

/** Compact rank pill (just the rank short code + color) */
export function RankPill({ designation, className }: { designation: string; className?: string }) {
  const info = rankInfoFor(designation);
  return (
    <span
      title={info.label}
      className={cn(
        "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded text-[9px] font-bold leading-none border",
        info.className,
        className,
      )}
    >
      {info.short}
    </span>
  );
}

/** Teacher short_name + color rank pill */
export function TeacherChip({
  teacher,
  className,
}: {
  teacher: Pick<Teacher, "short_name" | "designation" | "name">;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={`${teacher.name} · ${teacher.designation}`}>
      <RankPill designation={teacher.designation} />
      <span className="font-mono font-semibold">{teacher.short_name}</span>
    </span>
  );
}
