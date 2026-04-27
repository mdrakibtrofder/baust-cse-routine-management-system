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
} from "./types";

const STORAGE_KEY = "rms-data-v1";

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

/** Build initial AppData from the bundled seed.json (mapping section letters / teacher shorts / room names to ids) */
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
      cst_map.set(key, { id: uid(), course_id: cid, section_id: sid, teacher_ids });
    }
    for (const cls of a.classes as any[]) {
      const room_id = cls.room ? roomByName.get(cls.room) ?? null : null;
      class_slots.push({
        id: uid(),
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
  };
}

interface StoreState extends AppData {
  // teachers
  addTeacher: (t: Omit<Teacher, "id">) => void;
  updateTeacher: (id: string, t: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
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
  updatePeriod: (id: string, p: Partial<Period>) => void;
  deletePeriod: (id: string) => void;
  addDay: (name: string) => void;
  deleteDay: (id: string) => void;
  // assignments
  setCourseSectionTeachers: (course_id: string, section_id: string, teacher_ids: string[]) => void;
  // class slots
  upsertClassSlot: (slot: Omit<ClassSlot, "id"> & { id?: string }) => string;
  deleteClassSlot: (id: string) => void;
  deleteClassSlotsForCourseSection: (course_id: string, section_id: string) => void;
  // bulk
  resetToSeed: () => void;
  replaceTeachers: (list: Teacher[]) => void;
  replaceRooms: (list: Room[]) => void;
  replaceSections: (list: Section[]) => void;
  replaceCourses: (list: Course[]) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      ...buildSeedData(),

      addTeacher: (t) =>
        set((s) => ({ teachers: [...s.teachers, { ...t, id: uid() }] })),
      updateTeacher: (id, t) =>
        set((s) => ({
          teachers: s.teachers.map((x) => (x.id === id ? { ...x, ...t } : x)),
        })),
      deleteTeacher: (id) =>
        set((s) => ({ teachers: s.teachers.filter((x) => x.id !== id) })),

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
      updatePeriod: (id, p) =>
        set((s) => ({
          periods: s.periods.map((x) => (x.id === id ? { ...x, ...p } : x)),
        })),
      deletePeriod: (id) =>
        set((s) => ({ periods: s.periods.filter((x) => x.id !== id) })),

      addDay: (name) => set((s) => ({ days: [...s.days, { id: uid(), name }] })),
      deleteDay: (id) => set((s) => ({ days: s.days.filter((d) => d.id !== id) })),

      setCourseSectionTeachers: (course_id, section_id, teacher_ids) =>
        set((s) => {
          const idx = s.course_section_teachers.findIndex(
            (x) => x.course_id === course_id && x.section_id === section_id,
          );
          if (idx === -1) {
            return {
              course_section_teachers: [
                ...s.course_section_teachers,
                { id: uid(), course_id, section_id, teacher_ids },
              ],
            };
          }
          const next = [...s.course_section_teachers];
          next[idx] = { ...next[idx], teacher_ids };
          return { course_section_teachers: next };
        }),

      upsertClassSlot: (slot) => {
        const id = slot.id ?? uid();
        set((s) => {
          const exists = s.class_slots.findIndex((x) => x.id === id);
          if (exists === -1) {
            return { class_slots: [...s.class_slots, { ...slot, id }] };
          }
          const next = [...s.class_slots];
          next[exists] = { ...next[exists], ...slot, id };
          return { class_slots: next };
        });
        return id;
      },
      deleteClassSlot: (id) =>
        set((s) => ({ class_slots: s.class_slots.filter((x) => x.id !== id) })),
      deleteClassSlotsForCourseSection: (course_id, section_id) =>
        set((s) => ({
          class_slots: s.class_slots.filter(
            (x) => !(x.course_id === course_id && x.section_id === section_id),
          ),
        })),

      resetToSeed: () => set(() => buildSeedData()),
      replaceTeachers: (list) => set(() => ({ teachers: list })),
      replaceRooms: (list) => set(() => ({ rooms: list })),
      replaceSections: (list) => set(() => ({ sections: list })),
      replaceCourses: (list) => set(() => ({ courses: list })),
    }),
    { name: STORAGE_KEY },
  ),
);
