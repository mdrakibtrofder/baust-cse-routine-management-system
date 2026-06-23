import { create } from "zustand";
import api from "./api";
import type {
  AppData,
  Teacher,
  Room,
  Department,
  Section,
  Course,
  Period,
  Day,
  ClassSlot,
  CourseSectionTeacher,
  CourseLabSection,
  Semester,
  Year,
  SemesterType,
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
  
  // years
  addYear: (value: number) => Promise<void>;
  updateYear: (id: string, value: number) => Promise<Year>;
  deleteYear: (id: string) => Promise<void>;

  // semester types
  addSemesterType: (name: string) => Promise<void>;
  updateSemesterType: (id: string, name: string) => Promise<SemesterType>;
  deleteSemesterType: (id: string) => Promise<void>;

  // semesters
  setActiveSemester: (id: string) => void;
  addSemester: (s: Omit<Semester, "id">) => Promise<void>;
  updateSemester: (id: string, s: Partial<Semester>) => Promise<Semester>;
  deleteSemester: (id: string) => Promise<void>;
  
  // teachers
  addTeacher: (t: Omit<Teacher, "id">) => Promise<Teacher>;
  updateTeacher: (id: string, t: Partial<Teacher>) => Promise<Teacher>;
  deleteTeacher: (id: string) => Promise<void>;
  replaceTeachers: (teachers: Teacher[]) => Promise<void>;
  moveTeacherAssignments: (fromId: string, toId: string) => Promise<void>;
  
  // rooms
  addRoom: (r: Omit<Room, "id">) => Promise<void>;
  updateRoom: (id: string, r: Partial<Room>) => Promise<Room>;
  deleteRoom: (id: string) => Promise<void>;
  replaceRooms: (rooms: Room[]) => Promise<void>;
  
  // departments
  addDepartment: (d: Omit<Department, "id">) => Promise<void>;
  updateDepartment: (id: string, d: Partial<Department>) => Promise<Department>;
  deleteDepartment: (id: string) => Promise<void>;
  
  // sections
  addSection: (s: Omit<Section, "id">) => Promise<void>;
  updateSection: (id: string, s: Partial<Section>) => Promise<Section>;
  deleteSection: (id: string) => Promise<void>;
  replaceSections: (sections: Section[]) => Promise<void>;
  
  // courses
  addCourse: (c: Omit<Course, "id">) => Promise<Course>;
  updateCourse: (id: string, c: Partial<Course>) => Promise<Course>;
  deleteCourse: (id: string) => Promise<void>;
  
  // periods / days
  addPeriod: (p: Omit<Period, "id">) => Promise<void>;
  updatePeriod: (id: string, p: Partial<Period>) => Promise<Period>;
  deletePeriod: (id: string) => Promise<void>;
  addDay: (name: string) => Promise<void>;
  deleteDay: (id: string) => Promise<void>;
  
  // assignments
  setCourseSectionTeachers: (course_id: string, section_id: string, teacher_ids: string[], primary_room_id?: string | null, slot_teacher_ids?: string[][] | null, combined_section_ids?: string[] | null) => Promise<void>;

  // lab sections
  saveLabSections: (course_id: string, sections: Array<{ label: string; section_ids: string[]; teacher_ids: string[]; primary_room_id?: string | null }>) => Promise<CourseLabSection[]>;
  deleteLabSection: (id: string) => Promise<void>;
  batchReplaceLabSectionSlots: (lab_section_id: string, slots: Array<{ day: string; start: string; end: string; room_id: string; week?: string }>) => Promise<void>;
  
  // class slots
  upsertClassSlot: (slot: Omit<ClassSlot, "id" | "semester_id"> & { id?: string; semester_id?: string }) => Promise<string>;
  deleteClassSlot: (id: string) => Promise<void>;
  deleteClassSlotsForCourseSection: (course_id: string, section_id: string) => Promise<void>;
  batchReplaceClassSlots: (course_id: string, section_id: string, slots: Array<{ day: string; start: string; end: string; room_id: string; week: string }>, force?: boolean) => Promise<void>;
  
  // unavailability
  addTeacherUnavailability: (u: Omit<TeacherUnavailability, "id">) => Promise<void>;
  updateTeacherUnavailability: (id: string, u: Partial<TeacherUnavailability>) => Promise<TeacherUnavailability>;
  deleteTeacherUnavailability: (id: string) => Promise<void>;
  addRoomUnavailability: (u: Omit<RoomUnavailability, "id">) => Promise<void>;
  updateRoomUnavailability: (id: string, u: Partial<RoomUnavailability>) => Promise<RoomUnavailability>;
  deleteRoomUnavailability: (id: string) => Promise<void>;

  // bulk
  resetToSeed: () => Promise<void>;

  // routine generator
  startRoutineGeneration: () => Promise<void>;
  pauseRoutineGeneration: () => Promise<void>;
  resumeRoutineGeneration: () => Promise<void>;
  stopRoutineGeneration: () => Promise<void>;
  getRoutineGenerationStatus: () => Promise<any>;
}

const safeNum = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export const useStore = create<StoreState>((set, get) => ({
  teachers: [],
  rooms: [],
  departments: [],
  sections: [],
  courses: [],
  periods: [],
  days: [],
  class_slots: [],
  course_section_teachers: [],
  course_lab_sections: [],
  semesters: [],
  active_semester_id: "",
  years: [],
  semester_types: [],
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
      const [teacherRes, rooms, departments, sections, courses, periods, days, semesters, years, types, unavailTeachers, unavailRooms] = await Promise.all([
        api.get<Teacher[]>('/teachers'),
        api.get<Room[]>('/rooms'),
        api.get<Department[]>('/departments'),
        api.get<Section[]>('/sections'),
        api.get<Course[]>('/courses'),
        api.get<Period[]>('/periods'),
        api.get<Day[]>('/days'),
        api.get<Semester[]>('/semesters'),
        api.get<Year[]>('/years'),
        api.get<SemesterType[]>('/semester-types'),
        api.get<TeacherUnavailability[]>('/teacher-unavailability').catch(() => []),
        api.get<RoomUnavailability[]>('/room-unavailability').catch(() => []),
      ]);

      const teachers = teacherRes;

      const active_semester_entity = semesters.find(s => s.is_active) || semesters[0];
      const active_semester = active_semester_entity ? active_semester_entity.id : "";
      
      let class_slots: ClassSlot[] = [];
      let course_section_teachers: CourseSectionTeacher[] = [];
      
      let course_lab_sections: CourseLabSection[] = [];
      if (active_semester) {
        [class_slots, course_section_teachers, course_lab_sections] = await Promise.all([
          api.get<ClassSlot[]>(`/class-slots?semester_id=${active_semester}`),
          api.get<CourseSectionTeacher[]>(`/assignments?semester_id=${active_semester}`),
          api.get<CourseLabSection[]>(`/lab-sections?semester_id=${active_semester}`).catch(() => []),
        ]);
      }

      set({
        teachers,
        rooms,
        departments,
        sections,
        courses,
        periods,
        days,
        semesters,
        years,
        semester_types: types,
        class_slots,
        course_section_teachers,
        course_lab_sections,
        teacher_unavailability: unavailTeachers,
        room_unavailability: unavailRooms,
        active_semester_id: active_semester,
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addYear: async (value) => {
    try {
      const res = await api.post<Year>('/years', { value });
      set((s) => ({ years: [...s.years, res].sort((a, b) => a.value - b.value) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateYear: async (id, value) => {
    try {
      const res = await api.patch<Year>(`/years/${id}`, { value });
      set((s) => ({ years: s.years.map((x) => (x.id === id ? res : x)).sort((a, b) => a.value - b.value) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteYear: async (id) => {
    try {
      await api.delete(`/years/${id}`);
      set((s) => ({ years: s.years.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addSemesterType: async (name) => {
    try {
      const res = await api.post<SemesterType>('/semester-types', { name });
      set((s) => ({ semester_types: [...s.semester_types, res].sort((a, b) => a.name.localeCompare(b.name)) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateSemesterType: async (id, name) => {
    try {
      const res = await api.patch<SemesterType>(`/semester-types/${id}`, { name });
      set((s) => ({ semester_types: s.semester_types.map((x) => (x.id === id ? res : x)).sort((a, b) => a.name.localeCompare(b.name)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteSemesterType: async (id) => {
    try {
      await api.delete(`/semester-types/${id}`);
      set((s) => ({ semester_types: s.semester_types.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  addSemester: async (s) => {
    try {
      const res = await api.post<Semester>('/semesters', s);
      set((state) => ({ semesters: [...state.semesters, res] }));
      if (res.is_active) await get().setActiveSemester(res.id);
    } catch (err: any) { set({ error: err.message }); }
  },
  updateSemester: async (id, s) => {
    try {
      const res = await api.patch<Semester>(`/semesters/${id}`, s);
      set((state) => ({ semesters: state.semesters.map((x) => (x.id === id ? res : x)) }));
      if (res.is_active) await get().setActiveSemester(res.id);
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteSemester: async (id) => {
    try {
      await api.delete(`/semesters/${id}`);
      set((state) => ({ semesters: state.semesters.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },

  login: async (username: string, password: string) => {
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
      const [class_slots, course_section_teachers, course_lab_sections] = await Promise.all([
        api.get<ClassSlot[]>(`/class-slots?semester_id=${id}`),
        api.get<CourseSectionTeacher[]>(`/assignments?semester_id=${id}`),
        api.get<CourseLabSection[]>(`/lab-sections?semester_id=${id}`).catch(() => []),
      ]);
      set((s) => ({
        class_slots,
        course_section_teachers,
        course_lab_sections,
        semesters: s.semesters.map(sem => ({ ...sem, is_active: sem.id === id })),
        isLoading: false
      }));
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addTeacher: async (t) => {
    try {
      const payload = {
        ...t,
        assigned_credit_hours: safeNum(t.assigned_credit_hours)
      };
      const res = await api.post<Teacher>('/teachers', payload);
      set((s) => ({ teachers: [...s.teachers, res] }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  updateTeacher: async (id, t) => {
    try {
      // Clean payload: only send fields that are allowed in CreateTeacherDto
      const payload = {
        short_name: t.short_name,
        name: t.name,
        designation: t.designation,
        department: t.department,
        status: t.status,
        assigned_credit_hours: t.assigned_credit_hours !== undefined ? safeNum(t.assigned_credit_hours) : undefined,
      };

      // Remove undefined fields so they aren't sent in PATCH
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      const res = await api.patch<Teacher>(`/teachers/${id}`, payload);
      set((s) => ({ teachers: s.teachers.map((x) => (x.id === id ? res : x)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteTeacher: async (id) => {
    try {
      await api.delete(`/teachers/${id}`);
      set((s) => ({ teachers: s.teachers.filter((x) => x.id !== id) }));
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
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
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },

  addRoom: async (r) => {
    try {
      // Clean payload for backend
      const payload = {
        name: r.name,
        room_type: r.room_type,
        capacity: r.capacity !== undefined ? safeNum(r.capacity) : undefined,
        departmental_type: r.departmental_type,
        department_id: r.department_id,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );
      
      const res = await api.post<Room>('/rooms', payload);
      set((s) => ({ rooms: [...s.rooms, res] }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },
  updateRoom: async (id, r) => {
    try {
      // Clean payload for backend
      const payload = {
        name: r.name,
        room_type: r.room_type,
        capacity: r.capacity !== undefined ? safeNum(r.capacity) : undefined,
        departmental_type: r.departmental_type,
        department_id: r.department_id,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      const res = await api.patch<Room>(`/rooms/${id}`, payload);
      set((s) => ({ rooms: s.rooms.map((x) => (x.id === id ? res : x)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteRoom: async (id) => {
    try {
      await api.delete(`/rooms/${id}`);
      set((s) => ({ rooms: s.rooms.filter((x) => x.id !== id) }));
    } catch (err: any) { set({ error: err.message }); }
  },
  replaceRooms: async (rooms: Room[]) => {
    try {
      await api.post('/rooms', rooms);
      await get().init();
    } catch (err: any) { set({ error: err.message }); }
  },

  addDepartment: async (d) => {
    try {
      const res = await api.post<Department>('/departments', d);
      set((s) => ({ departments: [...s.departments, res].sort((a, b) => a.short_name.localeCompare(b.short_name)) }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },
  updateDepartment: async (id, d) => {
    try {
      // Clean payload for backend
      const payload = {
        short_name: d.short_name,
        full_name: d.full_name,
        faculty_name: d.faculty_name,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      const res = await api.patch<Department>(`/departments/${id}`, payload);
      set((s) => ({ departments: s.departments.map((x) => (x.id === id ? res : x)).sort((a, b) => a.short_name.localeCompare(b.short_name)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteDepartment: async (id) => {
    try {
      await api.delete(`/departments/${id}`);
      set((s) => ({ departments: s.departments.filter((x) => x.id !== id) }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  addSection: async (sec) => {
    try {
      const res = await api.post<Section>('/sections', sec);
      set((s) => ({ sections: [...s.sections, res] }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },
  updateSection: async (id, sec) => {
    try {
      // Clean payload for backend
      const payload = {
        level: sec.level !== undefined ? safeNum(sec.level) : undefined,
        term: sec.term,
        name: sec.name,
        total_students: sec.total_students !== undefined ? safeNum(sec.total_students) : undefined,
        departmental_type: sec.departmental_type,
        department_id: sec.department_id,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      const res = await api.patch<Section>(`/sections/${id}`, payload);
      set((s) => ({ sections: s.sections.map((x) => (x.id === id ? res : x)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  deleteSection: async (id) => {
    try {
      await api.delete(`/sections/${id}`);
      set((s) => ({ sections: s.sections.filter((x) => x.id !== id) }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },
  replaceSections: async (sections: Section[]) => {
    try {
      await api.post('/sections', sections);
      await get().init();
    } catch (err: any) { set({ error: err.message }); }
  },

  addCourse: async (c) => {
    try {
      const payload = {
        ...c,
        credit: safeNum(c.credit),
        theory: safeNum(c.theory),
        sessional: safeNum(c.sessional),
        level: safeNum(c.level),
      };
      const res = await api.post<Course>('/courses', payload);
      set((s) => ({ courses: [...s.courses, res] }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
  },
  updateCourse: async (id, c) => {
    try {
      // Clean payload for backend
      const payload = {
        code: c.code,
        name: c.name,
        credit: c.credit !== undefined ? safeNum(c.credit) : undefined,
        course_type: c.course_type,
        departmental_type: c.departmental_type,
        department_id: c.department_id,
        level: c.level !== undefined ? safeNum(c.level) : undefined,
        term: c.term,
        theory: c.theory !== undefined ? safeNum(c.theory) : undefined,
        sessional: c.sessional !== undefined ? safeNum(c.sessional) : undefined,
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => 
        (payload as any)[key] === undefined && delete (payload as any)[key]
      );

      const res = await api.patch<Course>(`/courses/${id}`, payload);
      set((s) => ({ courses: s.courses.map((x) => (x.id === id ? res : x)) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
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
      const { id: _id, ...payload } = patch as any;
      const res = await api.patch<Period>(`/periods/${id}`, payload);
      // Re-fetch all slots as times might have changed
      const slots = await api.get<ClassSlot[]>(`/class-slots?semester_id=${get().active_semester_id}`);
      set((s) => ({
        periods: s.periods.map((p) => (p.id === id ? res : p)),
        class_slots: slots,
      }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
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

  setCourseSectionTeachers: async (course_id, section_id, teacher_ids, primary_room_id, slot_teacher_ids, combined_section_ids) => {
    try {
      const res = await api.post<CourseSectionTeacher>('/assignments', {
        semester_id: get().active_semester_id,
        course_id,
        section_id,
        teacher_ids,
        primary_room_id,
        slot_teacher_ids: slot_teacher_ids ?? null,
        combined_section_ids: combined_section_ids ?? null,
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
      const { id, ...rest } = slot;
      const payload = {
        ...rest,
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
  batchReplaceClassSlots: async (course_id, section_id, slots, force = false) => {
    const semester_id = get().active_semester_id;
    const res = await api.post<ClassSlot[]>('/class-slots/batch-replace', {
      semester_id,
      course_id,
      section_id,
      slots,
      force,
    });
    set((s) => ({
      class_slots: [
        // Keep lab section slots; only replace non-lab-section slots for this course+section
        ...s.class_slots.filter((x) => !(x.course_id === course_id && x.section_id === section_id && !x.lab_section_id)),
        ...res,
      ],
    }));
  },

  saveLabSections: async (course_id, sections) => {
    const semester_id = get().active_semester_id;
    const res = await api.post<CourseLabSection[]>('/lab-sections/batch', {
      semester_id,
      course_id,
      lab_sections: sections,
    });
    set((s) => ({
      course_lab_sections: [
        ...s.course_lab_sections.filter((g) => !(g.course_id === course_id && g.semester_id === semester_id)),
        ...res,
      ],
    }));
    return res;
  },

  deleteLabSection: async (id) => {
    await api.delete(`/lab-sections/${id}`);
    set((s) => ({
      course_lab_sections: s.course_lab_sections.filter((g) => g.id !== id),
      class_slots: s.class_slots.filter((x) => x.lab_section_id !== id),
    }));
  },

  batchReplaceLabSectionSlots: async (lab_section_id, slots) => {
    const res = await api.post<ClassSlot[]>(`/lab-sections/${lab_section_id}/slots/batch-replace`, { slots });
    set((s) => ({
      class_slots: [
        ...s.class_slots.filter((x) => x.lab_section_id !== lab_section_id),
        ...res,
      ],
    }));
  },

  resetToSeed: async () => {
    set({ isLoading: true });
    try {
      await api.post('/bulk/reset', {});
      await get().init();
    } catch (err: any) { set({ error: err.message, isLoading: false }); }
  },

  startRoutineGeneration: async () => {
    try {
      await api.post('/routine-generator/start', { semester_id: get().active_semester_id });
    } catch (err: any) { set({ error: err.message }); }
  },
  pauseRoutineGeneration: async () => {
    try {
      await api.post('/routine-generator/pause', {});
    } catch (err: any) { set({ error: err.message }); }
  },
  resumeRoutineGeneration: async () => {
    try {
      await api.post('/routine-generator/resume', {});
    } catch (err: any) { set({ error: err.message }); }
  },
  stopRoutineGeneration: async () => {
    try {
      await api.post('/routine-generator/stop', {});
    } catch (err: any) { set({ error: err.message }); }
  },
  getRoutineGenerationStatus: async () => {
    try {
      return await api.get('/routine-generator/status');
    } catch (err: any) { 
      set({ error: err.message });
      return null;
    }
  },

  addTeacherUnavailability: async (u) => {
    try {
      const res = await api.post<TeacherUnavailability>('/teacher-unavailability', u);
      set((s) => ({ teacher_unavailability: [...s.teacher_unavailability, res] }));
    } catch (err: any) { set({ error: err.message }); }
  },
  updateTeacherUnavailability: async (id, u) => {
    try {
      const { id: _id, ...payload } = u as any;
      const res = await api.patch<TeacherUnavailability>(`/teacher-unavailability/${id}`, payload);
      set((s) => ({ teacher_unavailability: s.teacher_unavailability.map(x => x.id === id ? res : x) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
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
      const { id: _id, ...payload } = u as any;
      const res = await api.patch<RoomUnavailability>(`/room-unavailability/${id}`, payload);
      set((s) => ({ room_unavailability: s.room_unavailability.map(x => x.id === id ? res : x) }));
      return res;
    } catch (err: any) { 
      set({ error: err.message });
      throw err;
    }
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
