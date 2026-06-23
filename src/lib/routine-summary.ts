import type { AppData, Course, Teacher } from "./types";
import type { RoutineScope } from "@/components/RoutineView";

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
  const slots = data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    if (scope.kind === "section") {
      if (s.section_id === scope.section_id) return true;
      if (s.lab_section_id) {
        const ls = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
        return !!ls && ls.section_ids.includes(scope.section_id);
      }
      const primaryCst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id &&
          x.combined_section_ids?.includes(scope.section_id),
      );
      if (primaryCst) return true;
      return false;
    }
    // For teacher scope, we need to check if the slot is taught by this teacher
    if (scope.kind === "teacher") {
      if (s.lab_section_id) {
        const lg = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
        return !!lg && lg.teacher_ids.includes(scope.teacher_id);
      }
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id,
      );
      if (!cst) return false;
      // Check slot_teacher_ids if present (sessional_3.0 split mode)
      if (cst.slot_teacher_ids?.length) {
        const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
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
          return cst.slot_teacher_ids[idx].includes(scope.teacher_id);
        }
      }
      return cst.teacher_ids.includes(scope.teacher_id);
    }
    return false;
  });

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
    const theory = Number(c.theory || 0);
    const sessional = Number(c.sessional || 0);
    rows.push({
      course: c,
      theory,
      sessional,
      // Credit hours = theory hours + 2 * sessional hours
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
 *  shown in each routine cell. Sorted by short_name. */
export function buildRoutineTeacherSummary(data: AppData, scope: RoutineScope): TeacherSummaryRow[] {
  const slots = data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    if (scope.kind === "section") {
      if (s.section_id === scope.section_id) return true;
      if (s.lab_section_id) {
        const ls = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
        return !!ls && ls.section_ids.includes(scope.section_id);
      }
      const primaryCst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id &&
          x.combined_section_ids?.includes(scope.section_id),
      );
      if (primaryCst) return true;
      return false;
    }
    return true; // teacher scope: filter by resolved teacher ids below instead
  });

  const teacherIds = new Set<string>();
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  for (const s of slots) {
    if (s.lab_section_id) {
      const lg = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
      if (lg) lg.teacher_ids.forEach((id) => teacherIds.add(id));
      continue;
    }
    const cst = data.course_section_teachers.find(
      (x) =>
        x.semester_id === data.active_semester_id &&
        x.course_id === s.course_id &&
        x.section_id === s.section_id,
    );
    if (!cst) continue;
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
        cst.slot_teacher_ids[idx].forEach((id) => teacherIds.add(id));
        continue;
      }
    }
    cst.teacher_ids.forEach((id) => teacherIds.add(id));
  }

  if (scope.kind === "teacher" && !teacherIds.has(scope.teacher_id)) {
    teacherIds.add(scope.teacher_id);
  }
  if (scope.kind === "teacher") {
    // Narrow to just the scoped teacher for a teacher-specific routine view
    teacherIds.forEach((id) => {
      if (id !== scope.teacher_id) teacherIds.delete(id);
    });
  }

  const rows: TeacherSummaryRow[] = [];
  for (const id of teacherIds) {
    const teacher = data.teachers.find((t) => t.id === id);
    if (teacher) rows.push({ teacher });
  }
  rows.sort((a, b) => a.teacher.short_name.localeCompare(b.teacher.short_name));
  return rows;
}
