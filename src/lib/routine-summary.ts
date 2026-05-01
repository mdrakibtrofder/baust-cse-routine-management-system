import type { AppData, Course } from "./types";
import type { RoutineScope } from "@/components/RoutineView";

export interface CourseSummaryRow {
  course: Course;
  theory: number;
  sessional: number;
  credit: number;
  meetings: number;
}

/** Build a per-course summary for the slots that appear in the given routine scope.
 *  Each course in the scope appears once with its theory/sessional/credit values
 *  and the number of weekly meetings counted in this scope. */
export function buildRoutineCourseSummary(
  data: AppData,
  scope: RoutineScope,
): { rows: CourseSummaryRow[]; totals: { theory: number; sessional: number; credit: number; meetings: number } } {
  const slots = data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    if (scope.kind === "section") return s.section_id === scope.section_id;
    const cst = data.course_section_teachers.find(
      (x) =>
        x.semester_id === data.active_semester_id &&
        x.course_id === s.course_id &&
        x.section_id === s.section_id,
    );
    return !!cst && cst.teacher_ids.includes(scope.teacher_id);
  });

  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.course_id, (counts.get(s.course_id) ?? 0) + 1);

  const rows: CourseSummaryRow[] = [];
  for (const [cid, meetings] of counts.entries()) {
    const c = data.courses.find((x) => x.id === cid);
    if (!c) continue;
    rows.push({
      course: c,
      theory: c.theory ?? 0,
      sessional: c.sessional ?? 0,
      credit: c.credit ?? 0,
      meetings,
    });
  }
  rows.sort((a, b) => a.course.code.localeCompare(b.course.code));

  const totals = rows.reduce(
    (acc, r) => ({
      theory: acc.theory + r.theory,
      sessional: acc.sessional + r.sessional,
      credit: acc.credit + r.credit,
      meetings: acc.meetings + r.meetings,
    }),
    { theory: 0, sessional: 0, credit: 0, meetings: 0 },
  );

  return { rows, totals };
}
