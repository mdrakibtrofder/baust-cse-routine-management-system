export type CourseType =
  | "theory_2.0"
  | "theory_3.0"
  | "sessional_1.5"
  | "sessional_0.75"
  | "sessional_3.0";

export type DepartmentalType = "Departmental" | "Non-Departmental";

export type WeekPattern = "EVERY" | "EVEN" | "ODD";

export interface Teacher {
  id: string;
  short_name: string;
  name: string;
  designation: string;
  department: string;
  status: string;
  assigned_credit_hours: number;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credit: number;
  course_type: CourseType;
  departmental_type: DepartmentalType;
  department_id: string | null;
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
  departmental_type: DepartmentalType;
  department_id: string | null;
}

export interface Room {
  id: string;
  name: string;
  room_type: "Theory" | "Sessional";
  capacity: number;
  departmental_type: DepartmentalType;
  department_id: string | null;
}

export interface Department {
  id: string;
  short_name: string;
  full_name: string;
  faculty_name: string;
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
  /** Null when this slot belongs to a lab section instead — the affected actual
   *  section(s) are derived from the lab section's own `section_ids` mapping. */
  section_id: string | null;
  day: string; // SUN
  start: string; // HH:MM
  end: string; // HH:MM
  room_id: string | null;
  week: WeekPattern;
  /** Set when this slot belongs to a lab section, not the regular section schedule */
  lab_section_id?: string | null;
}

/** Mapping: which teachers teach which course-section (scoped per semester) */
export interface CourseSectionTeacher {
  id: string;
  semester_id: string;
  course_id: string;
  section_id: string;
  teacher_ids: string[]; // 1 for theory, 2 for sessional (union of all slot teachers)
  /** Per-slot teacher override for sessional_3.0 split mode.
   *  Index matches slot order sorted by day+time.
   *  null = shared mode (all slots use teacher_ids). */
  slot_teacher_ids?: string[][] | null;
  /** Other section IDs taught combined in the same class. Only set on the "primary" section's assignment. */
  combined_section_ids?: string[] | null;
  primary_room_id?: string | null;
}

/** A virtual sub-section of a sessional course for lab scheduling.
 *  Many-to-many with actual sections: a lab section's classes can count toward
 *  multiple actual sections at once (e.g. Lab Section B mapped to both Sec A and Sec B). */
export interface CourseLabSection {
  id: string;
  semester_id: string;
  course_id: string;
  /** Display label: "Lab A", "Lab B", etc. */
  label: string;
  /** The actual section(s) this lab section's classes count toward */
  section_ids: string[];
  teacher_ids: string[];
  primary_room_id: string | null;
}

export interface Year {
  id: string;
  value: number;
}

export interface SemesterType {
  id: string;
  name: string;
}

export interface Semester {
  id: string;
  name: string; // e.g. "Winter 2026"
  year_id: string;
  type_id: string;
  is_active: boolean;
  year_ref?: Year;
  type_ref?: SemesterType;
}

/** A recurring weekly window when a teacher is unavailable */
export interface TeacherUnavailability {
  id: string;
  teacher_id: string;
  day: string; // SUN..THU
  start: string; // HH:MM
  end: string; // HH:MM
  reason: string;
}

/** A recurring weekly window when a room is unavailable.
 *  `days` lets one entry cover multiple days (e.g. SUN+WED). */
export interface RoomUnavailability {
  id: string;
  room_id: string;
  days: string[]; // ["SUN","WED"]
  start: string;
  end: string;
  reason: string;
}

export interface AppData {
  teachers: Teacher[];
  rooms: Room[];
  departments: Department[];
  sections: Section[];
  courses: Course[];
  periods: Period[];
  days: Day[];
  class_slots: ClassSlot[];
  course_section_teachers: CourseSectionTeacher[];
  course_lab_sections: CourseLabSection[];
  semesters: Semester[];
  active_semester_id: string;
  years: Year[];
  semester_types: SemesterType[];
  teacher_unavailability: TeacherUnavailability[];
  room_unavailability: RoomUnavailability[];
}

export interface CTSetting {
  id: string;
  semester_id: string;
  total_weeks: number;
  start_week: number;
  start_date: string | null;
}

export interface CTWeekConfig {
  id: string;
  semester_id: string;
  week_number: number;
  date: string;
  is_available: boolean;
}

export interface CTAssignment {
  id: string;
  semester_id: string;
  course_id: string;
  section_id: string;
  room_id: string;
  week_number: number;
  date: string;
  ct_number: number;
  course?: Course;
  section?: Section;
  room?: Room;
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
  "sessional_3.0": {
    label: "Sessional 3.0 cr",
    classCount: 2,
    classDuration: 180,
    teachersRequired: 2,
    roomKind: "sessional",
    weekPattern: "EVERY",
  },
};
