import {
  AppData,
  ClassSlot,
  COURSE_TYPE_INFO,
  Course,
  Room,
  Section,
  Teacher,
  WeekPattern,
} from "./types";

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMin(aStart) < toMin(bEnd) && toMin(bStart) < toMin(aEnd);
}

export function weeksOverlap(a: WeekPattern, b: WeekPattern) {
  if (a === "EVERY" || b === "EVERY") return true;
  return a === b;
}

export interface Conflict {
  type: "room_double" | "room_capacity" | "room_type" | "teacher_double" | "section_double" | "teacher_credit";
  message: string;
}

export interface ConflictCheckInput {
  data: AppData;
  course: Course;
  section: Section;
  teacherIds: string[];
  candidate: { day: string; start: string; end: string; room_id: string | null; week: WeekPattern };
  /** ignore this slot id when checking (when editing an existing slot) */
  ignoreSlotId?: string;
}

export function checkConflicts(input: ConflictCheckInput): Conflict[] {
  const { data, course, section, teacherIds, candidate, ignoreSlotId } = input;
  const conflicts: Conflict[] = [];
  const info = COURSE_TYPE_INFO[course.course_type];

  // 1. room capacity & type
  if (candidate.room_id) {
    const room = data.rooms.find((r) => r.id === candidate.room_id);
    if (room) {
      if (room.capacity < section.total_students) {
        conflicts.push({
          type: "room_capacity",
          message: `Room ${room.name} capacity ${room.capacity} < section students ${section.total_students}.`,
        });
      }
      if (
        (info.roomKind === "sessional" && room.room_type !== "Sessional") ||
        (info.roomKind === "theory" && room.room_type !== "Theory")
      ) {
        conflicts.push({
          type: "room_type",
          message: `Room ${room.name} is ${room.room_type} but course needs a ${info.roomKind} room.`,
        });
      }
    }
  }

  // 2. room double-booking
  if (candidate.room_id) {
    for (const slot of data.class_slots) {
      if (slot.id === ignoreSlotId) continue;
      if (slot.room_id !== candidate.room_id) continue;
      if (slot.day !== candidate.day) continue;
      if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
      if (!weeksOverlap(slot.week, candidate.week)) continue;
      const otherCourse = data.courses.find((c) => c.id === slot.course_id);
      const otherSec = data.sections.find((s) => s.id === slot.section_id);
      const room = data.rooms.find((r) => r.id === candidate.room_id);
      conflicts.push({
        type: "room_double",
        message: `Room ${room?.name} already booked ${slot.day} ${slot.start}-${slot.end} by ${otherCourse?.code} (Sec ${otherSec?.name}).`,
      });
    }
  }

  // 3. teacher double-booking
  for (const tid of teacherIds) {
    for (const slot of data.class_slots) {
      if (slot.id === ignoreSlotId) continue;
      if (slot.day !== candidate.day) continue;
      if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
      if (!weeksOverlap(slot.week, candidate.week)) continue;
      const cst = data.course_section_teachers.find(
        (x) => x.course_id === slot.course_id && x.section_id === slot.section_id,
      );
      if (!cst || !cst.teacher_ids.includes(tid)) continue;
      if (cst.course_id === course.id && cst.section_id === section.id) continue; // same class
      const t = data.teachers.find((x) => x.id === tid);
      const otherCourse = data.courses.find((c) => c.id === slot.course_id);
      const otherSec = data.sections.find((s) => s.id === slot.section_id);
      conflicts.push({
        type: "teacher_double",
        message: `Teacher ${t?.short_name} already teaches ${otherCourse?.code} (Sec ${otherSec?.name}) on ${slot.day} ${slot.start}-${slot.end}.`,
      });
    }
  }

  // 4. section double-booking
  for (const slot of data.class_slots) {
    if (slot.id === ignoreSlotId) continue;
    if (slot.section_id !== section.id) continue;
    if (slot.day !== candidate.day) continue;
    if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
    if (!weeksOverlap(slot.week, candidate.week)) continue;
    if (slot.course_id === course.id) continue;
    const otherCourse = data.courses.find((c) => c.id === slot.course_id);
    conflicts.push({
      type: "section_double",
      message: `Section ${section.name} already has ${otherCourse?.code} on ${slot.day} ${slot.start}-${slot.end}.`,
    });
  }

  return conflicts;
}

/** Total credit currently assigned to a teacher, factoring co-teaching split for sessional (1 credit each) is not assumed; we count full course credit per assignment. */
export function teacherAssignedCreditUsed(data: AppData, teacherId: string): number {
  let total = 0;
  for (const cst of data.course_section_teachers) {
    if (!cst.teacher_ids.includes(teacherId)) continue;
    const c = data.courses.find((x) => x.id === cst.course_id);
    if (!c) continue;
    // For sessional with 2 teachers, split credit equally
    const share = c.sessional > 0 && cst.teacher_ids.length > 1 ? c.credit / cst.teacher_ids.length : c.credit;
    total += share;
  }
  return total;
}

export function teacherWouldExceed(
  data: AppData,
  teacherId: string,
  course: Course,
  section: Section,
  coteachers: number,
): { exceeds: boolean; current: number; assigned: number; addition: number } {
  const t = data.teachers.find((x) => x.id === teacherId);
  if (!t) return { exceeds: false, current: 0, assigned: 0, addition: 0 };
  const current = teacherAssignedCreditUsed(data, teacherId);
  const existing = data.course_section_teachers.find(
    (x) => x.course_id === course.id && x.section_id === section.id,
  );
  const alreadyOnIt = existing?.teacher_ids.includes(teacherId);
  if (alreadyOnIt) return { exceeds: false, current, assigned: t.assigned_credit, addition: 0 };
  const share = course.sessional > 0 && coteachers > 0 ? course.credit / (coteachers + 1) : course.credit;
  return {
    exceeds: t.assigned_credit > 0 && current + share > t.assigned_credit + 0.001,
    current,
    assigned: t.assigned_credit,
    addition: share,
  };
}

/** Are any of the listed teachers busy on the candidate day/time? */
export function teachersBusyAt(
  data: AppData,
  teacherIds: string[],
  candidate: { day: string; start: string; end: string; week: WeekPattern },
  ignoreSlotId?: string,
  ignoreCourseSection?: { course_id: string; section_id: string },
): { teacherId: string; slot: ClassSlot } | null {
  for (const slot of data.class_slots) {
    if (slot.id === ignoreSlotId) continue;
    if (slot.day !== candidate.day) continue;
    if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
    if (!weeksOverlap(slot.week, candidate.week)) continue;
    if (
      ignoreCourseSection &&
      slot.course_id === ignoreCourseSection.course_id &&
      slot.section_id === ignoreCourseSection.section_id
    )
      continue;
    const cst = data.course_section_teachers.find(
      (x) => x.course_id === slot.course_id && x.section_id === slot.section_id,
    );
    if (!cst) continue;
    for (const tid of teacherIds) {
      if (cst.teacher_ids.includes(tid)) return { teacherId: tid, slot };
    }
  }
  return null;
}

/** Find available rooms for a candidate (matching room kind + capacity + not booked + teachers free) */
export function findAvailableRooms(
  data: AppData,
  course: Course,
  section: Section,
  candidate: { day: string; start: string; end: string; week: WeekPattern },
  ignoreSlotId?: string,
  teacherIds: string[] = [],
): Room[] {
  const info = COURSE_TYPE_INFO[course.course_type];
  // If teachers are busy, no room is "available" for this slot.
  if (teacherIds.length > 0) {
    const busy = teachersBusyAt(data, teacherIds, candidate, ignoreSlotId, {
      course_id: course.id,
      section_id: section.id,
    });
    if (busy) return [];
  }
  return data.rooms.filter((room) => {
    if (info.roomKind === "sessional" && room.room_type !== "Sessional") return false;
    if (info.roomKind === "theory" && room.room_type !== "Theory") return false;
    if (room.capacity < section.total_students) return false;
    const conflict = data.class_slots.some((slot) => {
      if (slot.id === ignoreSlotId) return false;
      if (slot.room_id !== room.id) return false;
      if (slot.day !== candidate.day) return false;
      if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) return false;
      if (!weeksOverlap(slot.week, candidate.week)) return false;
      return true;
    });
    return !conflict;
  });
}
