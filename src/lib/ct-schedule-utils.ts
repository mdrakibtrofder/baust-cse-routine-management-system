import type { CTAssignment, Room } from "./types";

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
