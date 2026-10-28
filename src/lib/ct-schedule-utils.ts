import type { CTAssignment, Course, Department, Room } from "./types";
import { courseCodeDeptShort, roomDeptShort, sortHomeDeptFirst } from "./room-dept";
import { HOME_DEPT_SHORT_NAME } from "./constants";

/** Orders courses by academic progression: level, then term (I before II), then
 *  home-department courses ahead of borrowed ones, then course code.
 *
 *  Level-term is deliberately the *primary* key, ahead of department. A batch sits
 *  its class tests as one cohort, so every 1-I course belongs together whether it
 *  is a CSE course or a maths/EEE course taught to the same students; sorting by
 *  department first would scatter a batch's tests across the page. */
export function compareCoursesByLevelTerm(a?: Course, b?: Course): number {
  const homeRank = (c?: Course) =>
    courseCodeDeptShort(c?.code ?? "") === HOME_DEPT_SHORT_NAME ? 0 : 1;
  return (
    (a?.level ?? 0) - (b?.level ?? 0) ||
    (a?.term ?? "").localeCompare(b?.term ?? "") ||
    homeRank(a) - homeRank(b) ||
    (a?.code ?? "").localeCompare(b?.code ?? "")
  );
}

/** Level-term ordering for individual sittings; CT number breaks ties within a
 *  course so CT1 always precedes CT2. */
export function compareCTsByLevelTerm(a: CTAssignment, b: CTAssignment): number {
  return compareCoursesByLevelTerm(a.course, b.course) || a.ct_number - b.ct_number;
}

/** Course-code ordering for individual sittings; CT number breaks ties within a
 *  course so CT1 always precedes CT2. */
export function compareCTsByCourseCode(a: CTAssignment, b: CTAssignment): number {
  return (a.course?.code ?? "").localeCompare(b.course?.code ?? "") || a.ct_number - b.ct_number;
}

/** Rooms a sitting occupies, resolved against the room list and kept in the app's
 *  room order so every view and export lists them consistently. */
export function ctRooms(assignment: CTAssignment, rooms: Room[]): Room[] {
  const ids = new Set(assignment.room_ids ?? []);
  return rooms.filter((r) => ids.has(r.id));
}

/** Comma-separated room names for a sitting, for table cells and PDF rows. */
export function ctRoomNames(assignment: CTAssignment, rooms: Room[]): string {
  const names = ctRooms(assignment, rooms).map((r) => r.name);
  return names.length > 0 ? names.join(", ") : "—";
}

/** A sitting belongs to a non-departmental course (a course this department does
 *  not own, e.g. a maths or humanities course taught to our students). */
export function isNonDepartmentalCT(assignment: CTAssignment): boolean {
  return assignment.course?.departmental_type === "Non-Departmental";
}

/** Applies the shared "show non-departmental" switch. Views pass the result to
 *  both the on-screen list and the export functions, so a hidden category never
 *  reappears in a download. */
export function filterCTsByDepartmental(
  assignments: CTAssignment[],
  showNonDepartmental: boolean,
): CTAssignment[] {
  return showNonDepartmental ? assignments : assignments.filter((a) => !isNonDepartmentalCT(a));
}

/** One room on one date that hosts more than one class test. */
export interface SameDayRoomGroup {
  room: Room;
  dept: string;
  /** yyyy-MM-dd. */
  date: string;
  /** The two-or-more sittings in that room on that date, in course-code order. */
  rows: CTAssignment[];
}

/** Days a single room hosts more than one class test — the double-booked cases a
 *  room's normal schedule hides between unrelated cohorts. Rooms follow the app's
 *  room order (home department first), each room's days run earliest first, and
 *  each day's sittings are listed in course-code order. */
export function sameDayRoomCTGroups(
  assignments: CTAssignment[],
  rooms: Room[],
  departments: Department[],
): SameDayRoomGroup[] {
  const buckets = new Map<string, SameDayRoomGroup>();
  for (const a of assignments) {
    const date = (a.date ?? "").split("T")[0];
    if (!date) continue;
    for (const roomId of a.room_ids ?? []) {
      const room = rooms.find((r) => r.id === roomId);
      if (!room) continue;
      const key = `${roomId}::${date}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { room, dept: roomDeptShort(room, departments), date, rows: [] };
        buckets.set(key, bucket);
      }
      bucket.rows.push(a);
    }
  }

  const groups = Array.from(buckets.values()).filter((g) => g.rows.length > 1);
  for (const g of groups) g.rows.sort(compareCTsByCourseCode);

  const roomRank = new Map(
    sortHomeDeptFirst(rooms, (r) => roomDeptShort(r, departments)).map((r, i) => [r.id, i]),
  );
  return groups.sort(
    (a, b) =>
      (roomRank.get(a.room.id) ?? 0) - (roomRank.get(b.room.id) ?? 0) ||
      a.date.localeCompare(b.date),
  );
}
