import type { AppData, ClassSlot } from "./types";
import type { RoutineScope } from "@/components/RoutineView";

const DAY_ORDER = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** The teachers actually responsible for ONE class meeting.
 *
 *  This is the single source of truth used by the routine grid, exports, the
 *  availability finder and the teacher/room time mapping — so a teacher's
 *  routine and their busy/free state can never disagree. It resolves, in order:
 *   1. lab-section groups (`course_lab_sections`) — these carry their own
 *      teachers and are how a course taught to ANOTHER department's sections
 *      usually reaches a teacher;
 *   2. split mode (`slot_teacher_ids`) — per-meeting teacher overrides;
 *   3. the plain course+section assignment (`teacher_ids`).
 */
export function slotTeacherIds(data: AppData, slot: ClassSlot): string[] {
  if (slot.lab_section_id) {
    const lg = data.course_lab_sections.find((g) => g.id === slot.lab_section_id);
    return lg?.teacher_ids ?? [];
  }
  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === slot.course_id &&
      x.section_id === slot.section_id,
  );
  if (!cst) return [];
  if (cst.slot_teacher_ids?.length) {
    const siblings = data.class_slots
      .filter(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === slot.course_id &&
          x.section_id === slot.section_id &&
          !x.lab_section_id,
      )
      .sort((a, b) => {
        const da = DAY_ORDER.indexOf(a.day), db = DAY_ORDER.indexOf(b.day);
        if (da !== db) return da - db;
        return a.start.localeCompare(b.start);
      });
    const idx = siblings.findIndex((x) => x.id === slot.id);
    if (idx >= 0 && cst.slot_teacher_ids[idx]?.length) return cst.slot_teacher_ids[idx];
  }
  return cst.teacher_ids ?? [];
}

/** Every section a class meeting occupies — its own section plus lab-group
 *  mappings and combined (merged) sections. */
export function slotSectionIds(data: AppData, slot: ClassSlot): string[] {
  if (slot.lab_section_id) {
    const ls = data.course_lab_sections.find((g) => g.id === slot.lab_section_id);
    return ls?.section_ids ?? (slot.section_id ? [slot.section_id] : []);
  }
  const ids = slot.section_id ? [slot.section_id] : [];
  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === slot.course_id &&
      x.section_id === slot.section_id,
  );
  for (const id of cst?.combined_section_ids ?? []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** Slots of the active semester belonging to a routine scope. */
export function filterScopeSlots(data: AppData, scope: RoutineScope): ClassSlot[] {
  return data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    if (scope.kind === "section") return slotSectionIds(data, s).includes(scope.section_id);
    return slotTeacherIds(data, s).includes(scope.teacher_id);
  });
}

/** teacher_id → their class meetings this semester, built in one pass.
 *  Use this instead of re-deriving assignments per page. */
export function buildTeacherSlotMap(data: AppData): Map<string, ClassSlot[]> {
  const map = new Map<string, ClassSlot[]>();
  for (const t of data.teachers) map.set(t.id, []);
  for (const slot of data.class_slots) {
    if (slot.semester_id !== data.active_semester_id) continue;
    for (const tid of slotTeacherIds(data, slot)) {
      const list = map.get(tid);
      if (list) list.push(slot);
      else map.set(tid, [slot]);
    }
  }
  return map;
}
