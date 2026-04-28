export type CourseType =
  | "theory_2.0"
  | "theory_3.0"
  | "sessional_1.5"
  | "sessional_0.75";

export type WeekPattern = "EVERY" | "EVEN" | "ODD";

export interface Teacher {
  id: string;
  short_name: string;
  name: string;
  designation: string;
  department: string;
  status: string;
  assigned_credit: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credit: number;
  course_type: CourseType;
  level: number;
  term: string; // I | II
  theory: number;
  sessional: number;
}

export interface Section {
  id: string;
  level: number;
  term: string;
  name: string; // A, B, C
  total_students: number;
}

export interface Room {
  id: string;
  name: string;
  room_type: "Theory" | "Sessional";
  capacity: number;
}

export interface Period {
  id: string;
  name: string;
  start: string; // HH:MM
  end: string;
  duration: number; // minutes
  kind: "theory" | "sessional";
}

export interface Day {
  id: string;
  name: string; // SUN..THU
}

/** A single class meeting for one section of one course (scoped per semester) */
export interface ClassSlot {
  id: string;
  semester_id: string;
  course_id: string;
  section_id: string;
  day: string; // SUN
  start: string; // HH:MM
  end: string; // HH:MM
  room_id: string | null;
  week: WeekPattern;
}

/** Mapping: which teachers teach which course-section (scoped per semester) */
export interface CourseSectionTeacher {
  id: string;
  semester_id: string;
  course_id: string;
  section_id: string;
  teacher_ids: string[]; // 1 for theory, 2 for sessional
}

export interface Semester {
  id: string;
  name: string; // e.g. "Winter 2026"
  year: number;
  season: "Winter" | "Summer";
}

export interface AppData {
  teachers: Teacher[];
  rooms: Room[];
  sections: Section[];
  courses: Course[];
  periods: Period[];
  days: Day[];
  class_slots: ClassSlot[];
  course_section_teachers: CourseSectionTeacher[];
  semesters: Semester[];
  active_semester_id: string;
}

export const COURSE_TYPE_INFO: Record<
  CourseType,
  {
    label: string;
    classCount: number;
    classDuration: number; // minutes
    teachersRequired: number;
    roomKind: "theory" | "sessional";
    weekPattern: WeekPattern;
  }
> = {
  "theory_2.0": {
    label: "Theory 2.0 cr",
    classCount: 2,
    classDuration: 60,
    teachersRequired: 1,
    roomKind: "theory",
    weekPattern: "EVERY",
  },
  "theory_3.0": {
    label: "Theory 3.0 cr",
    classCount: 3,
    classDuration: 60,
    teachersRequired: 1,
    roomKind: "theory",
    weekPattern: "EVERY",
  },
  "sessional_1.5": {
    label: "Sessional 1.5 cr",
    classCount: 1,
    classDuration: 180,
    teachersRequired: 2,
    roomKind: "sessional",
    weekPattern: "EVERY",
  },
  "sessional_0.75": {
    label: "Sessional 0.75 cr",
    classCount: 1,
    classDuration: 180,
    teachersRequired: 2,
    roomKind: "sessional",
    weekPattern: "EVEN",
  },
};
