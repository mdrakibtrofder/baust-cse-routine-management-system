import type { CTAssignment, Course, Room } from "./types";

/** Orders courses by academic progression: level, then term (I before II), then
 *  course code. Used everywhere class tests are listed so a reader can scan the
 *  schedule cohort by cohort instead of hunting for a batch across the page. */
export function compareCoursesByLevelTerm(a?: Course, b?: Course): number {
  return (
    (a?.level ?? 0) - (b?.level ?? 0) ||
    (a?.term ?? "").localeCompare(b?.term ?? "") ||
    (a?.code ?? "").localeCompare(b?.code ?? "")
  );
}

/** Level-term ordering for individual sittings; CT number breaks ties within a
 *  course so CT1 always precedes CT2. */
export function compareCTsByLevelTerm(a: CTAssignment, b: CTAssignment): number {
  return compareCoursesByLevelTerm(a.course, b.course) || a.ct_number - b.ct_number;
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
