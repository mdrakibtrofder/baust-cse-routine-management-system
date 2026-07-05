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
