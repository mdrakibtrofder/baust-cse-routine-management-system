import { create } from "zustand";
import { persist } from "zustand/middleware";
import seed from "@/data/seed.json";
import type {
  AppData,
  Teacher,
  Room,
  Section,
  Course,
  Period,
  Day,
  ClassSlot,
  CourseSectionTeacher,
  CourseType,
  Semester,
  TeacherUnavailability,
  RoomUnavailability,
} from "./types";

const STORAGE_KEY = "rms-data-v3";

function uid() {
  return crypto.randomUUID();
}

function classifyType(theory: number, sessional: number, credit: number): CourseType {
  if (sessional > 0) {
    if (credit <= 1.0) return "sessional_0.75";
    return "sessional_1.5";
  }
  if (credit >= 3.0) return "theory_3.0";
  return "theory_2.0";
}

/** Generate Winter+Summer semesters from 2026 to 2056 */
function buildSemesters(): { semesters: Semester[]; activeId: string } {
  const list: Semester[] = [];
  for (let y = 2026; y <= 2056; y++) {
    list.push({ id: `sem-winter-${y}`, name: `Winter ${y}`, year: y, season: "Winter" });
    list.push({ id: `sem-summer-${y}`, name: `Summer ${y}`, year: y, season: "Summer" });
  }
  return { semesters: list, activeId: "sem-winter-2026" };
}

/** Build initial AppData from the bundled seed.json */
function buildSeedData(): AppData {
  const teachers: Teacher[] = seed.teachers as Teacher[];
  const rooms: Room[] = seed.rooms as Room[];
  const sections: Section[] = seed.sections as Section[];
  const periods: Period[] = seed.periods as Period[];
  const days: Day[] = seed.days as Day[];

  const courses: Course[] = (seed.courses as any[]).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    credit: c.credit,
    course_type: classifyType(c.theory, c.sessional, c.credit),
    level: c.level,
    term: c.term,
    theory: c.theory,
    sessional: c.sessional,
  }));

  const { semesters, activeId } = buildSemesters();

  const teacherByShort = new Map(teachers.map((t) => [t.short_name, t.id]));
  const roomByName = new Map(rooms.map((r) => [r.name, r.id]));
  const courseByCodeLT = new Map(courses.map((c) => [`${c.code}|${c.level}|${c.term}`, c.id]));
  const sectionByKey = new Map(sections.map((s) => [`${s.level}|${s.term}|${s.name}`, s.id]));

  const class_slots: ClassSlot[] = [];
  const cst_map = new Map<string, CourseSectionTeacher>();

  for (const a of (seed as any).assignments as any[]) {
    const cid = courseByCodeLT.get(`${a.course_code}|${a.level}|${a.term}`);
    const sid = sectionByKey.get(`${a.level}|${a.term}|${a.section_name}`);
    if (!cid || !sid) continue;
    const teacher_ids = (a.teachers as string[])
      .map((sn) => teacherByShort.get(sn))
      .filter((x): x is string => !!x);
    const key = `${cid}|${sid}`;
    if (!cst_map.has(key)) {
      cst_map.set(key, { id: uid(), semester_id: activeId, course_id: cid, section_id: sid, teacher_ids });
    }
    for (const cls of a.classes as any[]) {
      const room_id = cls.room ? roomByName.get(cls.room) ?? null : null;
      class_slots.push({
        id: uid(),
        semester_id: activeId,
        course_id: cid,
        section_id: sid,
        day: cls.day,
        start: cls.start,
        end: cls.end,
        room_id,
        week: cls.week ?? "EVERY",
      });
    }
  }

  return {
    teachers,
    rooms,
    sections,
    courses,
    periods,
    days,
    class_slots,
    course_section_teachers: Array.from(cst_map.values()),
    semesters,
    active_semester_id: activeId,
    teacher_unavailability: [],
    room_unavailability: [],
  };
}

interface StoreState extends AppData {
  // semesters
  setActiveSemester: (id: string) => void;
  // teachers
  addTeacher: (t: Omit<Teacher, "id">) => void;
  updateTeacher: (id: string, t: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
  /** Move all assignments+slots from one teacher to another (across all semesters), then delete the old teacher */
  moveTeacherAssignments: (fromId: string, toId: string) => void;
  // rooms
  addRoom: (r: Omit<Room, "id">) => void;
  updateRoom: (id: string, r: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  // sections
  addSection: (s: Omit<Section, "id">) => void;
  updateSection: (id: string, s: Partial<Section>) => void;
  deleteSection: (id: string) => void;
  // courses
  addCourse: (c: Omit<Course, "id">) => void;
  updateCourse: (id: string, c: Partial<Course>) => void;
  deleteCourse: (id: string) => void;
  // periods / days
  addPeriod: (p: Omit<Period, "id">) => void;
  /** When period times change, propagate to all class_slots whose times match the OLD period times */
  updatePeriod: (id: string, p: Partial<Period>) => void;
  deletePeriod: (id: string) => void;
  addDay: (name: string) => void;
  deleteDay: (id: string) => void;
  // assignments (active semester implied)
  setCourseSectionTeachers: (course_id: string, section_id: string, teacher_ids: string[]) => void;
  // class slots (active semester implied)
  upsertClassSlot: (slot: Omit<ClassSlot, "id" | "semester_id"> & { id?: string; semester_id?: string }) => string;
  deleteClassSlot: (id: string) => void;
  deleteClassSlotsForCourseSection: (course_id: string, section_id: string) => void;
  // bulk
  resetToSeed: () => void;
  replaceTeachers: (list: Teacher[]) => void;
  replaceRooms: (list: Room[]) => void;
  replaceSections: (list: Section[]) => void;
  replaceCourses: (list: Course[]) => void;
  // unavailability
  addTeacherUnavailability: (u: Omit<TeacherUnavailability, "id">) => void;
  updateTeacherUnavailability: (id: string, u: Partial<TeacherUnavailability>) => void;
  deleteTeacherUnavailability: (id: string) => void;
  addRoomUnavailability: (u: Omit<RoomUnavailability, "id">) => void;
  updateRoomUnavailability: (id: string, u: Partial<RoomUnavailability>) => void;
  deleteRoomUnavailability: (id: string) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...buildSeedData(),

      setActiveSemester: (id) => set(() => ({ active_semester_id: id })),

      addTeacher: (t) =>
        set((s) => ({ teachers: [...s.teachers, { ...t, id: uid() }] })),
      updateTeacher: (id, t) =>
        set((s) => ({
          teachers: s.teachers.map((x) => (x.id === id ? { ...x, ...t } : x)),
        })),
      deleteTeacher: (id) =>
        set((s) => ({ teachers: s.teachers.filter((x) => x.id !== id) })),
      moveTeacherAssignments: (fromId, toId) =>
        set((s) => {
          if (fromId === toId) return {};
          // Replace fromId with toId in every course_section_teachers entry (across all semesters).
          const next_cst = s.course_section_teachers.map((cst) => {
            if (!cst.teacher_ids.includes(fromId)) return cst;
            const ids = cst.teacher_ids.map((t) => (t === fromId ? toId : t));
            // de-dup in case toId already on it
            return { ...cst, teacher_ids: Array.from(new Set(ids)) };
          });
          // Old teacher record is intentionally KEPT (per project rule).
          return { course_section_teachers: next_cst };
        }),

      addRoom: (r) => set((s) => ({ rooms: [...s.rooms, { ...r, id: uid() }] })),
      updateRoom: (id, r) =>
        set((s) => ({ rooms: s.rooms.map((x) => (x.id === id ? { ...x, ...r } : x)) })),
      deleteRoom: (id) => set((s) => ({ rooms: s.rooms.filter((x) => x.id !== id) })),

      addSection: (sec) =>
        set((s) => ({ sections: [...s.sections, { ...sec, id: uid() }] })),
      updateSection: (id, sec) =>
        set((s) => ({
          sections: s.sections.map((x) => (x.id === id ? { ...x, ...sec } : x)),
        })),
      deleteSection: (id) =>
        set((s) => ({ sections: s.sections.filter((x) => x.id !== id) })),

      addCourse: (c) => set((s) => ({ courses: [...s.courses, { ...c, id: uid() }] })),
      updateCourse: (id, c) =>
        set((s) => ({
          courses: s.courses.map((x) => (x.id === id ? { ...x, ...c } : x)),
        })),
      deleteCourse: (id) =>
        set((s) => ({ courses: s.courses.filter((x) => x.id !== id) })),

      addPeriod: (p) => set((s) => ({ periods: [...s.periods, { ...p, id: uid() }] })),
      updatePeriod: (id, patch) =>
        set((s) => {
          const old = s.periods.find((p) => p.id === id);
          if (!old) return {};
          const next = { ...old, ...patch };
          // Propagate start/end changes to class_slots that exactly matched the old times.
          const startChanged = patch.start !== undefined && patch.start !== old.start;
          const endChanged = patch.end !== undefined && patch.end !== old.end;
          let class_slots = s.class_slots;
          if (startChanged || endChanged) {
            class_slots = s.class_slots.map((slot) =>
              slot.start === old.start && slot.end === old.end
                ? { ...slot, start: next.start, end: next.end }
                : slot,
            );
          }
          return {
            periods: s.periods.map((p) => (p.id === id ? next : p)),
            class_slots,
          };
        }),
      deletePeriod: (id) =>
        set((s) => ({ periods: s.periods.filter((x) => x.id !== id) })),

      addDay: (name) => set((s) => ({ days: [...s.days, { id: uid(), name }] })),
      deleteDay: (id) => set((s) => ({ days: s.days.filter((d) => d.id !== id) })),

      setCourseSectionTeachers: (course_id, section_id, teacher_ids) =>
        set((s) => {
          const sem = s.active_semester_id;
          const idx = s.course_section_teachers.findIndex(
            (x) => x.semester_id === sem && x.course_id === course_id && x.section_id === section_id,
          );
          if (idx === -1) {
            return {
              course_section_teachers: [
                ...s.course_section_teachers,
                { id: uid(), semester_id: sem, course_id, section_id, teacher_ids },
              ],
            };
          }
          const next = [...s.course_section_teachers];
          next[idx] = { ...next[idx], teacher_ids };
          return { course_section_teachers: next };
        }),

      upsertClassSlot: (slot) => {
        const id = slot.id ?? uid();
        const sem = slot.semester_id ?? get().active_semester_id;
        set((s) => {
          const exists = s.class_slots.findIndex((x) => x.id === id);
          const full: ClassSlot = {
            id,
            semester_id: sem,
            course_id: slot.course_id,
            section_id: slot.section_id,
            day: slot.day,
            start: slot.start,
            end: slot.end,
            room_id: slot.room_id,
            week: slot.week,
          };
          if (exists === -1) return { class_slots: [...s.class_slots, full] };
          const next = [...s.class_slots];
          next[exists] = full;
          return { class_slots: next };
        });
        return id;
      },
      deleteClassSlot: (id) =>
        set((s) => ({ class_slots: s.class_slots.filter((x) => x.id !== id) })),
      deleteClassSlotsForCourseSection: (course_id, section_id) =>
        set((s) => {
          const sem = s.active_semester_id;
          return {
            class_slots: s.class_slots.filter(
              (x) => !(x.semester_id === sem && x.course_id === course_id && x.section_id === section_id),
            ),
          };
        }),

      resetToSeed: () => set(() => buildSeedData()),
      replaceTeachers: (list) => set(() => ({ teachers: list })),
      replaceRooms: (list) => set(() => ({ rooms: list })),
      replaceSections: (list) => set(() => ({ sections: list })),
      replaceCourses: (list) => set(() => ({ courses: list })),

      addTeacherUnavailability: (u) =>
        set((s) => ({ teacher_unavailability: [...s.teacher_unavailability, { ...u, id: uid() }] })),
      updateTeacherUnavailability: (id, u) =>
        set((s) => ({
          teacher_unavailability: s.teacher_unavailability.map((x) => (x.id === id ? { ...x, ...u } : x)),
        })),
      deleteTeacherUnavailability: (id) =>
        set((s) => ({ teacher_unavailability: s.teacher_unavailability.filter((x) => x.id !== id) })),
      addRoomUnavailability: (u) =>
        set((s) => ({ room_unavailability: [...s.room_unavailability, { ...u, id: uid() }] })),
      updateRoomUnavailability: (id, u) =>
        set((s) => ({
          room_unavailability: s.room_unavailability.map((x) => (x.id === id ? { ...x, ...u } : x)),
        })),
      deleteRoomUnavailability: (id) =>
        set((s) => ({ room_unavailability: s.room_unavailability.filter((x) => x.id !== id) })),
    }),
    { name: STORAGE_KEY },
  ),
);

// ---------- Helpers (selector-style; not part of the store API) ----------

/** Get class_slots for the active semester */
export function activeClassSlots(s: AppData): ClassSlot[] {
  return s.class_slots.filter((x) => x.semester_id === s.active_semester_id);
}
/** Get course_section_teachers for the active semester */
export function activeCST(s: AppData): CourseSectionTeacher[] {
  return s.course_section_teachers.filter((x) => x.semester_id === s.active_semester_id);
}
