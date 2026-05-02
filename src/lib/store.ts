import { create } from "zustand";
import api from "./api";
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
  Semester,
  TeacherUnavailability,
  RoomUnavailability,
} from "./types";

interface AuthState {
  user: { id: string; username: string } | null;
  token: string | null;
}

interface StoreState extends AppData {
  isLoading: boolean;
  error: string | null;
  auth: AuthState;

  // initialization
  init: () => Promise<void>;
  
  // auth
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  // semesters
  setActiveSemester: (id: string) => void;
  
  // teachers
  addTeacher: (t: Omit<Teacher, "id">) => Promise<void>;
  updateTeacher: (id: string, t: Partial<Teacher>) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;
  replaceTeachers: (teachers: Teacher[]) => Promise<void>;
  moveTeacherAssignments: (fromId: string, toId: string) => Promise<void>;
  
  // rooms
  addRoom: (r: Omit<Room, "id">) => Promise<void>;
  updateRoom: (id: string, r: Partial<Room>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  
  // sections
  addSection: (s: Omit<Section, "id">) => Promise<void>;
  updateSection: (id: string, s: Partial<Section>) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  
  // courses
  addCourse: (c: Omit<Course, "id">) => Promise<void>;
  updateCourse: (id: string, c: Partial<Course>) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  
  // periods / days
  addPeriod: (p: Omit<Period, "id">) => Promise<void>;
  updatePeriod: (id: string, p: Partial<Period>) => Promise<void>;
  deletePeriod: (id: string) => Promise<void>;
  addDay: (name: string) => Promise<void>;
  deleteDay: (id: string) => Promise<void>;
  
  // assignments
  setCourseSectionTeachers: (course_id: string, section_id: string, teacher_ids: string[]) => Promise<void>;
  
  // class slots
  upsertClassSlot: (slot: Omit<ClassSlot, "id" | "semester_id"> & { id?: string; semester_id?: string }) => Promise<string>;
  deleteClassSlot: (id: string) => Promise<void>;
  deleteClassSlotsForCourseSection: (course_id: string, section_id: string) => Promise<void>;
  
  // unavailability
  addTeacherUnavailability: (u: Omit<TeacherUnavailability, "id">) => Promise<void>;
  updateTeacherUnavailability: (id: string, u: Partial<TeacherUnavailability>) => Promise<void>;
  deleteTeacherUnavailability: (id: string) => Promise<void>;
  addRoomUnavailability: (u: Omit<RoomUnavailability, "id">) => Promise<void>;
  updateRoomUnavailability: (id: string, u: Partial<RoomUnavailability>) => Promise<void>;
  deleteRoomUnavailability: (id: string) => Promise<void>;

  // bulk
  resetToSeed: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  teachers: [],
  rooms: [],
  sections: [],
  courses: [],
  periods: [],
  days: [],
  class_slots: [],
  course_section_teachers: [],
  semesters: [],
  active_semester_id: "",
  teacher_unavailability: [],
  room_unavailability: [],
  isLoading: false,
  error: null,
  auth: {
    user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
    token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null,
  },

  init: async () => {
    set({ isLoading: true, error: null });
    try {
      const [teachers, rooms, sections, courses, periods, days, semesters, unavailTeachers, unavailRooms] = await Promise.all([
        api.get<any>('/teachers').then(res => res.data),
        api.get<Room[]>('/rooms'),
        api.get<Section[]>('/sections'),
        api.get<Course[]>('/courses'),
        api.get<Period[]>('/periods'),
        api.get<Day[]>('/days'),
        api.get<Semester[]>('/semesters'),
        api.get<TeacherUnavailability[]>('/teacher-unavailability').catch(() => []),
        api.get<RoomUnavailability[]>('/room-unavailability').catch(() => []),
      ]);

      const active_semester = semesters.length > 0 ? semesters[0].id : "";
      
      let class_slots: ClassSlot[] = [];
      let course_section_teachers: CourseSectionTeacher[] = [];
      
      if (active_semester) {
        [class_slots, course_section_teachers] = await Promise.all([
          api.get<ClassSlot[]>(`/class-slots?semester_id=${active_semester}`),
          api.get<CourseSectionTeacher[]>(`/assignments?semester_id=${active_semester}`),
        ]);
      }

      set({
        teachers,
        rooms,
        sections,
        courses,
        periods,
        days,
        semesters,
        class_slots,
        course_section_teachers,
        teacher_unavailability: unavailTeachers,
        room_unavailability: unavailRooms,
        active_semester_id: active_semester,
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ access_token: string, user: any }>('/auth/login', { username, password });
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', res.access_token);
        localStorage.setItem('user', JSON.stringify(res.user));
      }
      set({ auth: { token: res.access_token, user: res.user }, isLoading: false });
      await get().init();
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
    set({ auth: { token: null, user: null }, teachers: [], rooms: [], sections: [], courses: [], class_slots: [], course_section_teachers: [] });
  },

  setActiveSemester: async (id) => {
    set({ active_semester_id: id, isLoading: true });
    try {
      const [class_slots, course_section_teachers] = await Promise.all([
        api.get<ClassSlot[]>(`/class-slots?semester_id=${id}`),
        api.get<CourseSectionTeacher[]>(`/assignments?semester_id=${id}`),
      ]);
      set({ class_slots, course_section_teachers, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addTeacher: async (t) => {
    try {
      const res = await api.post<Teacher>('/teachers', t);
      set((s) => ({ teachers: [...s.teachers, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateTeacher: async (id, t) => {
    try {
      const res = await api.patch<Teacher>(`/teachers/${id}`, t);
      set((s) => ({ teachers: s.teachers.map((x) => (x.id === id ? res : x)) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteTeacher: async (id) => {
    try {
      await api.delete(`/teachers/${id}`);
      set((s) => ({ teachers: s.teachers.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  replaceTeachers: async (teachers: Teacher[]) => {
    try {
      await api.post('/teachers', teachers);
      await get().init();
    } catch (err: any) { set({ error: err.message }); }
  },
  moveTeacherAssignments: async (fromId, toId) => {
    try {
      await api.post(`/teachers/${fromId}/move-assignments`, { toTeacherId: toId });
      await get().init();
    } catch (err: any) { set({ error: err.message }); }
  },

  addRoom: async (r) => {
    try {
      const res = await api.post<Room>('/rooms', r);
      set((s) => ({ rooms: [...s.rooms, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateRoom: async (id, r) => {
    try {
      const res = await api.patch<Room>(`/rooms/${id}`, r);
      set((s) => ({ rooms: s.rooms.map((x) => (x.id === id ? res : x)) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteRoom: async (id) => {
    try {
      await api.delete(`/rooms/${id}`);
      set((s) => ({ rooms: s.rooms.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addSection: async (sec) => {
    try {
      const res = await api.post<Section>('/sections', sec);
      set((s) => ({ sections: [...s.sections, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateSection: async (id, sec) => {
    try {
      const res = await api.patch<Section>(`/sections/${id}`, sec);
      set((s) => ({ sections: s.sections.map((x) => (x.id === id ? res : x)) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteSection: async (id) => {
    try {
      await api.delete(`/sections/${id}`);
      set((s) => ({ sections: s.sections.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addCourse: async (c) => {
    try {
      const res = await api.post<Course>('/courses', c);
      set((s) => ({ courses: [...s.courses, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateCourse: async (id, c) => {
    try {
      const res = await api.patch<Course>(`/courses/${id}`, c);
      set((s) => ({ courses: s.courses.map((x) => (x.id === id ? res : x)) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteCourse: async (id) => {
    try {
      await api.delete(`/courses/${id}`);
      set((s) => ({ courses: s.courses.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addPeriod: async (p) => {
    try {
      const res = await api.post<Period>('/periods', p);
      set((s) => ({ periods: [...s.periods, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updatePeriod: async (id, patch) => {
    try {
      const res = await api.patch<Period>(`/periods/${id}`, patch);
      // Re-fetch all slots as times might have changed
      const slots = await api.get<ClassSlot[]>(`/class-slots?semester_id=${get().active_semester_id}`);
      set((s) => ({
        periods: s.periods.map((p) => (p.id === id ? res : p)),
        class_slots: slots,
      }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deletePeriod: async (id) => {
    try {
      await api.delete(`/periods/${id}`);
      set((s) => ({ periods: s.periods.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addDay: async (name) => {
    try {
      const res = await api.post<Day>('/days', { name });
      set((s) => ({ days: [...s.days, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteDay: async (id) => {
    try {
      await api.delete(`/days/${id}`);
      set((s) => ({ days: s.days.filter((d) => d.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  setCourseSectionTeachers: async (course_id, section_id, teacher_ids) => {
    try {
      const res = await api.post<CourseSectionTeacher>('/assignments', {
        semester_id: get().active_semester_id,
        course_id,
        section_id,
        teacher_ids
      });
      set((s) => {
        const idx = s.course_section_teachers.findIndex(x => x.id === res.id);
        if (idx === -1) return { course_section_teachers: [...s.course_section_teachers, res] };
        const next = [...s.course_section_teachers];
        next[idx] = res;
        return { course_section_teachers: next };
      });
    } catch (err: any) { set({ error: err.message }); }
  },

  upsertClassSlot: async (slot) => {
    try {
      const payload = {
        ...slot,
        semester_id: slot.semester_id || get().active_semester_id
      };
      const res = slot.id 
        ? await api.patch<ClassSlot>(`/class-slots/${slot.id}`, payload)
        : await api.post<ClassSlot>('/class-slots', payload);
      
      set((s) => {
        const idx = s.class_slots.findIndex(x => x.id === res.id);
        if (idx === -1) return { class_slots: [...s.class_slots, res] };
        const next = [...s.class_slots];
        next[idx] = res;
        return { class_slots: next };
      });
      return res.id;
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },
  deleteClassSlot: async (id) => {
    try {
      await api.delete(`/class-slots/${id}`);
      set((s) => ({ class_slots: s.class_slots.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteClassSlotsForCourseSection: async (course_id, section_id) => {
    try {
      await api.delete(`/class-slots/course/${course_id}/section/${section_id}?semester_id=${get().active_semester_id}`);
      set((s) => ({
        class_slots: s.class_slots.filter(x => !(x.course_id === course_id && x.section_id === section_id))
      }));
    } catch (err: any) { set({ error: err.message }); }
  },

  resetToSeed: async () => {
    set({ isLoading: true });
    try {
      await api.post('/bulk/reset', {});
      await get().init();
    } catch (err: any) { set({ error: err.message, isLoading: false }); }
  },

  addTeacherUnavailability: async (u) => {
    try {
      const res = await api.post<TeacherUnavailability>('/teacher-unavailability', u);
      set((s) => ({ teacher_unavailability: [...s.teacher_unavailability, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateTeacherUnavailability: async (id, u) => {
    try {
      const res = await api.patch<TeacherUnavailability>(`/teacher-unavailability/${id}`, u);
      set((s) => ({ teacher_unavailability: s.teacher_unavailability.map(x => x.id === id ? res : x) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteTeacherUnavailability: async (id) => {
    try {
      await api.delete(`/teacher-unavailability/${id}`);
      set((s) => ({ teacher_unavailability: s.teacher_unavailability.filter(x => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addRoomUnavailability: async (u) => {
    try {
      const res = await api.post<RoomUnavailability>('/room-unavailability', u);
      set((s) => ({ room_unavailability: [...s.room_unavailability, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateRoomUnavailability: async (id, u) => {
    try {
      const res = await api.patch<RoomUnavailability>(`/room-unavailability/${id}`, u);
      set((s) => ({ room_unavailability: s.room_unavailability.map(x => x.id === id ? res : x) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  deleteRoomUnavailability: async (id) => {
    try {
      await api.delete(`/room-unavailability/${id}`);
      set((s) => ({ room_unavailability: s.room_unavailability.filter(x => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },
}));

/** Get class_slots for the active semester */
export function activeClassSlots(s: AppData): ClassSlot[] {
  return s.class_slots.filter((x) => x.semester_id === s.active_semester_id);
}
/** Get course_section_teachers for the active semester */
export function activeCST(s: AppData): CourseSectionTeacher[] {
  return s.course_section_teachers.filter((x) => x.semester_id === s.active_semester_id);
}
