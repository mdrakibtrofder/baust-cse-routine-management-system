import type { Course, Department, Room } from "./types";
import { HOME_DEPT_SHORT_NAME } from "./constants";

/** Alphabetic prefix of a course code, e.g. "EEE 1270" -> "EEE".
 *  Codes without a letter prefix count as home-department courses. */
export function courseCodeDeptShort(code: string): string {
  const m = (code ?? "").trim().match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : HOME_DEPT_SHORT_NAME;
}

/** Short name of the department owning a room; rooms without a department
 *  belong to the home department. */
export function roomDeptShort(room: Room, departments: Department[]): string {
  if (!room.department_id) return HOME_DEPT_SHORT_NAME;
  const dept = departments.find((d) => d.id === room.department_id);
  return dept ? dept.short_name.trim().toUpperCase() : HOME_DEPT_SHORT_NAME;
}

/** Department room rule:
 *  - Home-dept course (code starts with CSE) -> home-department rooms only
 *  - Other course (e.g. "EEE 1270")          -> home rooms + that department's rooms
 *  Rooms outside this set are only shown behind an explicit "show other rooms" toggle. */
export function roomAllowedForCourse(room: Room, course: Course, departments: Department[]): boolean {
  const roomDept = roomDeptShort(room, departments);
  if (roomDept === HOME_DEPT_SHORT_NAME) return true;
  return roomDept === courseCodeDeptShort(course.code);
}

export function roomAllowedForHomeDept(room: Room, departments: Department[]): boolean {
  const roomDept = roomDeptShort(room, departments);
  return roomDept === HOME_DEPT_SHORT_NAME;
}

/** Short name of the department a teacher belongs to; teachers without one are
 *  treated as home department. */
export function teacherDeptShort(teacher: { department?: string | null }): string {
  const value = (teacher.department ?? "").trim().toUpperCase();
  return value === "" ? HOME_DEPT_SHORT_NAME : value;
}

/** Stable sort putting home-department (CSE) entries first, then every other
 *  department grouped alphabetically, then the original order within a group.
 *  Used anywhere a room / teacher / course list is presented or exported so the
 *  home department always reads first. */
export function sortHomeDeptFirst<T>(items: T[], deptShortOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({ item, index, dept: deptShortOf(item) }))
    .sort((a, b) => {
      const aHome = a.dept === HOME_DEPT_SHORT_NAME;
      const bHome = b.dept === HOME_DEPT_SHORT_NAME;
      if (aHome !== bHome) return aHome ? -1 : 1;
      if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
      return a.index - b.index;
    })
    .map((e) => e.item);
}

/** Split a room list into [allowed, other] for a course, preserving order. */
export function partitionRoomsForCourse<T extends Room>(
  rooms: T[],
  course: Course,
  departments: Department[],
): { allowed: T[]; other: T[] } {
  const allowed: T[] = [];
  const other: T[] = [];
  for (const r of rooms) {
    (roomAllowedForCourse(r, course, departments) ? allowed : other).push(r);
  }
  return { allowed, other };
}
