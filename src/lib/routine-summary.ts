import type { AppData, Course, Teacher } from "./types";
import type { RoutineScope } from "@/components/RoutineView";
import { filterScopeSlots } from "./routine-scope";

export interface CourseSummaryRow {
  course: Course;
  theory: number;
  sessional: number;
  credit: number;
  meetings: number;
}

export interface TeacherSummaryRow {
  teacher: Teacher;
}

/** Build a per-course summary for the slots that appear in the given routine scope.
 *  Each course in the scope appears once with its theory/sessional/credit values
 *  and the number of weekly meetings counted in this scope. */
export function buildRoutineCourseSummary(
  data: AppData,
  scope: RoutineScope,
): { rows: CourseSummaryRow[]; totals: { theory: number; sessional: number; credit: number; meetings: number } } {
  const slots = filterScopeSlots(data, scope);

  // For course summary, we want to count each distinct course once,
  // regardless of how many sections the teacher teaches it in
  const courseMeetings = new Map<string, number>();

  for (const s of slots) {
    courseMeetings.set(s.course_id, (courseMeetings.get(s.course_id) ?? 0) + 1);
  }

  const rows: CourseSummaryRow[] = [];
  for (const [cid, meetings] of courseMeetings.entries()) {
    const c = data.courses.find((x) => x.id === cid);
    if (!c) continue;

    let numberOfSections = 1;
    if (scope.kind === "teacher") {
      const uniqueKeys = new Set<string>();
      const courseSlots = slots.filter((s) => s.course_id === cid);
      for (const s of courseSlots) {
        const key = s.lab_section_id || s.section_id;
        if (key) uniqueKeys.add(key);
      }
      numberOfSections = uniqueKeys.size || 1;
    }

    const theory = Number(c.theory || 0) * numberOfSections;
    const sessional = Number(c.sessional || 0) * numberOfSections;

    rows.push({
      course: c,
      theory,
      sessional,
      credit: theory + 2 * sessional,
      meetings,
    });
  }
  rows.sort((a, b) => a.course.code.localeCompare(b.course.code));

  const totals = rows.reduce(
    (acc, r) => ({
      theory: Number(acc.theory || 0) + Number(r.theory || 0),
      sessional: Number(acc.sessional || 0) + Number(r.sessional || 0),
      credit: Number(acc.credit || 0) + Number(r.credit || 0),
      meetings: Number(acc.meetings || 0) + Number(r.meetings || 0),
    }),
    { theory: 0, sessional: 0, credit: 0, meetings: 0 },
  );

  return { rows, totals };
}

/** Build the de-duplicated list of teachers who teach within the given routine scope.
 *  Resolves split-mode (per-slot teacher overrides for sessional_3.0) and lab-group
 *  teachers, not just the assignment's base teacher_ids — matching what's actually
 *  shown in each routine cell. For teacher scope, scoped teacher is first. */
export function buildRoutineTeacherSummary(data: AppData, scope: RoutineScope): TeacherSummaryRow[] {
  const slots = filterScopeSlots(data, scope);
  const teacherIds = new Set<string>();
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  for (const s of slots) {
    let slotTeacherIds: string[] = [];
    if (s.lab_section_id) {
      const lg = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
      if (lg) slotTeacherIds = lg.teacher_ids;
    } else {
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id,
      );
      if (cst) {
        if (cst.slot_teacher_ids?.length) {
          const siblings = data.class_slots
            .filter(
              (x) =>
                x.semester_id === data.active_semester_id &&
                x.course_id === s.course_id &&
                x.section_id === s.section_id &&
                !x.lab_section_id,
            )
            .sort((a, b) => {
              const da = days.indexOf(a.day), db = days.indexOf(b.day);
              if (da !== db) return da - db;
              return a.start.localeCompare(b.start);
            });
          const idx = siblings.findIndex((x) => x.id === s.id);
          if (idx >= 0 && cst.slot_teacher_ids[idx]?.length) {
            slotTeacherIds = cst.slot_teacher_ids[idx];
          } else {
            slotTeacherIds = cst.teacher_ids;
          }
        } else {
          slotTeacherIds = cst.teacher_ids;
        }
      }
    }
    slotTeacherIds.forEach((id) => teacherIds.add(id));
  }

  if (scope.kind === "teacher" && !teacherIds.has(scope.teacher_id)) {
    teacherIds.add(scope.teacher_id);
  }

  const rows: TeacherSummaryRow[] = [];
  for (const id of teacherIds) {
    const teacher = data.teachers.find((t) => t.id === id);
    if (teacher) rows.push({ teacher });
  }

  rows.sort((a, b) => {
    if (scope.kind === "teacher") {
      if (a.teacher.id === scope.teacher_id) return -1;
      if (b.teacher.id === scope.teacher_id) return 1;
    }
    return a.teacher.short_name.localeCompare(b.teacher.short_name);
  });

  return rows;
}
