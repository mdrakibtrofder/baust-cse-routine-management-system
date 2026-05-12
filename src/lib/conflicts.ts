import {
  AppData,
  ClassSlot,
  COURSE_TYPE_INFO,
  Course,
  Room,
  Section,
  WeekPattern,
} from "./types";
import { fmtRange12 } from "./utils";

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

/** Returns the first matching teacher-unavailability rule, or null */
export function teacherUnavailableAt(
  data: AppData,
  teacherId: string,
  candidate: { day: string; start: string; end: string },
) {
  return (
    data.teacher_unavailability.find(
      (u) =>
        u.teacher_id === teacherId &&
        u.day === candidate.day &&
        timesOverlap(u.start, u.end, candidate.start, candidate.end),
    ) ?? null
  );
}

/** Returns the first matching room-unavailability rule, or null */
export function roomUnavailableAt(
  data: AppData,
  roomId: string,
  candidate: { day: string; start: string; end: string },
) {
  return (
    data.room_unavailability.find(
      (u) =>
        u.room_id === roomId &&
        u.days.includes(candidate.day) &&
        timesOverlap(u.start, u.end, candidate.start, candidate.end),
    ) ?? null
  );
}

/** Slots scoped to the active semester */
function semSlots(data: AppData): ClassSlot[] {
  return data.class_slots.filter((s) => s.semester_id === data.active_semester_id);
}
/** course_section_teachers scoped to the active semester */
function semCST(data: AppData) {
  return data.course_section_teachers.filter((c) => c.semester_id === data.active_semester_id);
}

export interface Conflict {
  type:
    | "room_double"
    | "room_capacity"
    | "room_type"
    | "teacher_double"
    | "section_double"
    | "teacher_credit"
    | "self_duplicate"
    | "teacher_unavailable"
    | "room_unavailable";
  message: string;
}

export interface ConflictCheckInput {
  data: AppData;
  course: Course;
  section: Section;
  teacherIds: string[];
  candidate: { day: string; start: string; end: string; room_id: string | null; week: WeekPattern };
  ignoreSlotId?: string;
  siblingDrafts?: { day: string; start: string; end: string; week: WeekPattern }[];
}

export function checkConflicts(input: ConflictCheckInput): Conflict[] {
  const { data, course, section, teacherIds, candidate, ignoreSlotId } = input;
  const conflicts: Conflict[] = [];
  const info = COURSE_TYPE_INFO[course.course_type];
  const slots = semSlots(data);
  const csts = semCST(data);

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

  if (candidate.room_id) {
    for (const slot of slots) {
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
        message: `Room ${room?.name} already booked ${slot.day} ${fmtRange12(slot.start, slot.end)} by ${otherCourse?.code} (Sec ${otherSec?.name}).`,
      });
    }
  }

  for (const tid of teacherIds) {
    for (const slot of slots) {
      if (slot.id === ignoreSlotId) continue;
      if (slot.day !== candidate.day) continue;
      if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
      if (!weeksOverlap(slot.week, candidate.week)) continue;
      const cst = csts.find(
        (x) => x.course_id === slot.course_id && x.section_id === slot.section_id,
      );
      if (!cst || !cst.teacher_ids.includes(tid)) continue;
      if (cst.course_id === course.id && cst.section_id === section.id) continue;
      const t = data.teachers.find((x) => x.id === tid);
      const otherCourse = data.courses.find((c) => c.id === slot.course_id);
      const otherSec = data.sections.find((s) => s.id === slot.section_id);
      conflicts.push({
        type: "teacher_double",
        message: `Teacher ${t?.short_name} already teaches ${otherCourse?.code} (Sec ${otherSec?.name}) on ${slot.day} ${fmtRange12(slot.start, slot.end)}.`,
      });
    }
  }

  // Teacher unavailability
  for (const tid of teacherIds) {
    const u = teacherUnavailableAt(data, tid, candidate);
    if (u) {
      const t = data.teachers.find((x) => x.id === tid);
      conflicts.push({
        type: "teacher_unavailable",
        message: `${t?.short_name ?? "Teacher"} is unavailable on ${u.day} ${fmtRange12(u.start, u.end)}${u.reason ? ` (${u.reason})` : ""}.`,
      });
    }
  }

  // Room unavailability
  if (candidate.room_id) {
    const u = roomUnavailableAt(data, candidate.room_id, candidate);
    if (u) {
      const r = data.rooms.find((x) => x.id === candidate.room_id);
      conflicts.push({
        type: "room_unavailable",
        message: `Room ${r?.name ?? ""} is unavailable on ${candidate.day} ${fmtRange12(u.start, u.end)}${u.reason ? ` (${u.reason})` : ""}.`,
      });
    }
  }
  for (const slot of slots) {
    if (slot.id === ignoreSlotId) continue;
    if (slot.section_id !== section.id) continue;
    if (slot.day !== candidate.day) continue;
    if (!timesOverlap(slot.start, slot.end, candidate.start, candidate.end)) continue;
    if (!weeksOverlap(slot.week, candidate.week)) continue;
    if (slot.course_id === course.id) continue;
    const otherCourse = data.courses.find((c) => c.id === slot.course_id);
    conflicts.push({
      type: "section_double",
      message: `Section ${section.name} already has ${otherCourse?.code} on ${slot.day} ${fmtRange12(slot.start, slot.end)}.`,
    });
  }

  if (input.siblingDrafts) {
    for (const sd of input.siblingDrafts) {
      if (!sd.day || !sd.start) continue;
      if (sd === (candidate as any)) continue;
      if (sd.day !== candidate.day) continue;
      
      // Multiple classes of the same course must be on different days
      // Unless they are on different weeks (ODD/EVEN)
      if (weeksOverlap(sd.week, candidate.week)) {
        conflicts.push({
          type: "self_duplicate",
          message: `Another class for ${course.code} is already scheduled on ${candidate.day}.`,
        });
        break;
      }
    }
  }

  return conflicts;
}

export function teacherAssignedCreditUsed(data: AppData, teacherId: string): number {
  let total = 0;
  for (const cst of semCST(data)) {
    if (!cst.teacher_ids.includes(teacherId)) continue;
    const c = data.courses.find((x) => x.id === cst.course_id);
    if (!c) continue;
    
    const info = COURSE_TYPE_INFO[c.course_type];
    const weight = info.roomKind === "sessional" ? 3 : 1;
    total += weight;
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
  const assigned = t ? Number(t.assigned_credit_hours || 0) : 0;
  if (!t) return { exceeds: false, current: 0, assigned: 0, addition: 0 };
  const current = teacherAssignedCreditUsed(data, teacherId);
  const existing = semCST(data).find(
    (x) => x.course_id === course.id && x.section_id === section.id,
  );
  const alreadyOnIt = existing?.teacher_ids.includes(teacherId);
  
  const info = COURSE_TYPE_INFO[course.course_type];
  const weight = info.roomKind === "sessional" ? 3 : 1;
  
  if (alreadyOnIt) return { exceeds: false, current, assigned, addition: 0 };
  return {
    exceeds: assigned > 0 && current + weight > assigned + 0.001,
    current,
    assigned,
    addition: weight,
  };
}

export function teachersBusyAt(
  data: AppData,
  teacherIds: string[],
  candidate: { day: string; start: string; end: string; week: WeekPattern },
  ignoreSlotId?: string,
  ignoreCourseSection?: { course_id: string; section_id: string },
): { teacherId: string; slot: ClassSlot } | null {
  const csts = semCST(data);
  for (const slot of semSlots(data)) {
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
    const cst = csts.find(
      (x) => x.course_id === slot.course_id && x.section_id === slot.section_id,
    );
    if (!cst) continue;
    for (const tid of teacherIds) {
      if (cst.teacher_ids.includes(tid)) return { teacherId: tid, slot };
    }
  }
  return null;
}

export function findAvailableRooms(
  data: AppData,
  course: Course,
  section: Section,
  candidate: { day: string; start: string; end: string; week: WeekPattern },
  ignoreSlotId?: string,
  teacherIds: string[] = [],
  siblingDrafts: { day: string; start: string; end: string; week: WeekPattern }[] = [],
): Room[] {
  // First, check if there's any conflict that is NOT room-dependent (Teacher, Section, or Self-Duplicate)
  const baseConflicts = checkConflicts({
    data,
    course,
    section,
    teacherIds,
    candidate: { ...candidate, room_id: null },
    ignoreSlotId,
    siblingDrafts,
  });

  // If there are teacher, section, or day-duplicate conflicts, no room can fix that
  const fatalConflicts = baseConflicts.filter(c => 
    c.type === 'teacher_double' || 
    c.type === 'teacher_unavailable' || 
    c.type === 'section_double' || 
    c.type === 'self_duplicate'
  );

  if (fatalConflicts.length > 0) return [];

  // Now check each room for capacity, type, double-booking, and room-unavailability
  return data.rooms.filter((room) => {
    const roomConflicts = checkConflicts({
      data,
      course,
      section,
      teacherIds,
      candidate: { ...candidate, room_id: room.id },
      ignoreSlotId,
      siblingDrafts,
    });
    return roomConflicts.length === 0;
  });
}

export interface SuggestedSlot {
  day: string;
  start: string;
  end: string;
  room: Room;
}

export function findAllConflictFreeSlots(
  data: AppData,
  course: Course,
  section: Section,
  teacherIds: string[],
  ignoreSlotId?: string,
  siblingDrafts: { day: string; start: string; end: string; week: WeekPattern }[] = [],
  week: WeekPattern = "EVERY"
): SuggestedSlot[] {
  const suggestions: SuggestedSlot[] = [];
  const info = COURSE_TYPE_INFO[course.course_type];
  const periods = data.periods
    .filter((p) => p.kind === info.roomKind)
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const day of data.days) {
    for (const period of periods) {
      const candidate = { day: day.name, start: period.start, end: period.end, week };
      
      const rooms = findAvailableRooms(
        data,
        course,
        section,
        candidate,
        ignoreSlotId,
        teacherIds,
        siblingDrafts
      );

      for (const room of rooms) {
        suggestions.push({
          day: day.name,
          start: period.start,
          end: period.end,
          room,
        });
        // Stop if we have plenty of options to avoid performance issues
        if (suggestions.length >= 100) return suggestions;
      }
    }
  }
  return suggestions;
}

// ---------- Dependency analysis (for protected deletes) ----------

export interface Dependency {
  kind: "class_slot" | "assignment";
  description: string;
}

/** All dependencies for a teacher across all semesters */
export function teacherDependencies(data: AppData, teacherId: string): Dependency[] {
  const deps: Dependency[] = [];
  for (const cst of data.course_section_teachers) {
    if (!cst.teacher_ids.includes(teacherId)) continue;
    const c = data.courses.find((x) => x.id === cst.course_id);
    const s = data.sections.find((x) => x.id === cst.section_id);
    const sem = data.semesters.find((x) => x.id === cst.semester_id);
    deps.push({
      kind: "assignment",
      description: `${c?.code ?? "?"} (Sec ${s?.name ?? "?"}) · ${sem?.name ?? cst.semester_id}`,
    });
  }
  return deps;
}

export function roomDependencies(data: AppData, roomId: string): Dependency[] {
  const deps: Dependency[] = [];
  for (const slot of data.class_slots) {
    if (slot.room_id !== roomId) continue;
    const c = data.courses.find((x) => x.id === slot.course_id);
    const s = data.sections.find((x) => x.id === slot.section_id);
    const sem = data.semesters.find((x) => x.id === slot.semester_id);
    deps.push({
      kind: "class_slot",
      description: `${c?.code ?? "?"} (Sec ${s?.name ?? "?"}) · ${slot.day} ${fmtRange12(slot.start, slot.end)} · ${sem?.name ?? ""}`,
    });
  }
  return deps;
}

export function sectionDependencies(data: AppData, sectionId: string): Dependency[] {
  const deps: Dependency[] = [];
  for (const slot of data.class_slots) {
    if (slot.section_id !== sectionId) continue;
    const c = data.courses.find((x) => x.id === slot.course_id);
    const sem = data.semesters.find((x) => x.id === slot.semester_id);
    deps.push({
      kind: "class_slot",
      description: `${c?.code ?? "?"} · ${slot.day} ${fmtRange12(slot.start, slot.end)} · ${sem?.name ?? ""}`,
    });
  }
  for (const cst of data.course_section_teachers) {
    if (cst.section_id !== sectionId) continue;
    const c = data.courses.find((x) => x.id === cst.course_id);
    const sem = data.semesters.find((x) => x.id === cst.semester_id);
    deps.push({
      kind: "assignment",
      description: `Teacher assignment for ${c?.code ?? "?"} · ${sem?.name ?? ""}`,
    });
  }
  return deps;
}

export function courseDependencies(data: AppData, courseId: string): Dependency[] {
  const deps: Dependency[] = [];
  for (const slot of data.class_slots) {
    if (slot.course_id !== courseId) continue;
    const s = data.sections.find((x) => x.id === slot.section_id);
    const sem = data.semesters.find((x) => x.id === slot.semester_id);
    deps.push({
      kind: "class_slot",
      description: `Sec ${s?.name ?? "?"} · ${slot.day} ${fmtRange12(slot.start, slot.end)} · ${sem?.name ?? ""}`,
    });
  }
  for (const cst of data.course_section_teachers) {
    if (cst.course_id !== courseId) continue;
    const s = data.sections.find((x) => x.id === cst.section_id);
    const sem = data.semesters.find((x) => x.id === cst.semester_id);
    deps.push({
      kind: "assignment",
      description: `Teacher assignment · Sec ${s?.name ?? "?"} · ${sem?.name ?? ""}`,
    });
  }
  return deps;
}

export function periodDependencies(data: AppData, periodId: string): Dependency[] {
  const period = data.periods.find((p) => p.id === periodId);
  if (!period) return [];
  const deps: Dependency[] = [];
  for (const slot of data.class_slots) {
    if (slot.start !== period.start || slot.end !== period.end) continue;
    const c = data.courses.find((x) => x.id === slot.course_id);
    const s = data.sections.find((x) => x.id === slot.section_id);
    const sem = data.semesters.find((x) => x.id === slot.semester_id);
    deps.push({
      kind: "class_slot",
      description: `${c?.code ?? "?"} (Sec ${s?.name ?? "?"}) · ${slot.day} · ${sem?.name ?? ""}`,
    });
  }
  return deps;
}

export function dayDependencies(data: AppData, dayName: string): Dependency[] {
  const deps: Dependency[] = [];
  for (const slot of data.class_slots) {
    if (slot.day !== dayName) continue;
    const c = data.courses.find((x) => x.id === slot.course_id);
    const s = data.sections.find((x) => x.id === slot.section_id);
    const sem = data.semesters.find((x) => x.id === slot.semester_id);
    deps.push({
      kind: "class_slot",
      description: `${c?.code ?? "?"} (Sec ${s?.name ?? "?"}) · ${fmtRange12(slot.start, slot.end)} · ${sem?.name ?? ""}`,
    });
  }
  return deps;
}
