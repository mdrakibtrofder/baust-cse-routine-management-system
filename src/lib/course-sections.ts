import type { AppData, Course, Section } from "./types";
import { HOME_DEPT_SHORT_NAME } from "./constants";

/**
 * Real sections a course's classes (or lab sections) can be scheduled
 * against: same level + term, and the same department as the course —
 * falling back to the home department for courses/sections that don't have
 * one set. This mirrors the grouping rule `CourseLoadPage` uses to build its
 * level/term blocks, factored out so any other view (e.g. `RoutineView`,
 * which needs the candidate list for a single clicked course rather than a
 * whole grouped block) can look up the same list without re-deriving the
 * department-matching rule.
 */
export function candidateSectionsForCourse(data: AppData, course: Course): Section[] {
  const homeDept = data.departments.find(
    (d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME,
  );
  const deptKey = (id: string | null | undefined) => id || homeDept?.id || "__none__";
  const courseKey = deptKey(course.department_id);
  return data.sections
    .filter((s) => s.level === course.level && s.term === course.term && deptKey(s.department_id) === courseKey)
    .sort((a, b) => a.name.localeCompare(b.name));
}
