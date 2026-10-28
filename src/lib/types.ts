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
  /** Contact details; empty string when unknown, never null. */
  email: string;
  phone: string;
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
  /** "Both" means the room can be used for either theory or sessional classes. */
  room_type: "Theory" | "Sessional" | "Both";
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
  /** Marks this period as a break (lunch/prayer, etc.) rather than a class slot. */
  is_break?: boolean;
}

/** Global app-wide toggles (single row, not semester-scoped). */
export interface AppSettings {
  id: string;
  show_break_column: boolean;
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
  locked: boolean;
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
  app_settings: AppSettings;
  priority_classes: PriorityClass[];
}

export interface PriorityClass {
  id: string;
  semester_id: string;
  department_id: string;
  level: number;
  term: string;
  section_id: string;
  course_ids: string[];
  room_ids: string[];
  time_slots: { start: string; end: string }[] | null;
  days: string[];
  course_type: 'Theory' | 'Sessional';
  created_at?: string;
  updated_at?: string;
  semester?: Semester;
  department?: Department;
  section?: Section;
}

export interface CTSetting {
  id: string;
  semester_id: string;
  total_weeks: number;
  start_date: string | null;
  /** Named break weeks (mid term, Eid, holidays …). An entry with
   *  `before_week: 8` means the calendar week that would have carried week 8 is
   *  the break, so weeks 8, 9, 10 … each fall one calendar week later. Nothing
   *  is renumbered: only the dates behind the week numbers move. Several entries
   *  may share a `before_week` — that is two consecutive break weeks. */
  breaks: CTBreak[];
}

/** One break week in a semester's CT calendar. */
export interface CTBreak {
  before_week: number;
  name: string;
}

export interface CTWeekConfig {
  id: string;
  semester_id: string;
  week_number: number;
  date: string;
  is_available: boolean;
}

/** One class-test sitting for a course. It occupies *every* room mapped to its
 *  level-term (`room_ids`), because the whole cohort sits it at once. */
export interface CTAssignment {
  id: string;
  semester_id: string;
  course_id: string;
  room_ids: string[];
  week_number: number;
  date: string;
  ct_number: number;
  course?: Course;
}

/** Bucket key shared by CTLevelTermDayMapping and CTLevelTermRoomMapping. */
export interface CTLevelTermBucket {
  level: number;
  term: 'I' | 'II';
  departmental_type: 'Departmental' | 'Non-Departmental';
  department_id: string | null;
}

export interface CTLevelTermDayMapping extends CTLevelTermBucket {
  id: string;
  semester_id: string;
  days: string[];
}

export interface CTLevelTermRoomMapping extends CTLevelTermBucket {
  id: string;
  semester_id: string;
  room_ids: string[];
}

/** Cohort group the Reschedule CT feature splits the department into. Group 1
 *  tests Monday+Wednesday in weeks 11 & 13 and Sunday+Tuesday+Thursday in weeks
 *  12 & 14; Group 2 is the mirror image. */
export type CTRescheduleGroup = 1 | 2;

/** One class test's before/after as the Reschedule CT page shows it. */
export interface CTRescheduleShift {
  id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  level: number;
  term: string;
  group: CTRescheduleGroup;
  ct_number: number;
  room_ids: string[];
  old_date: string;
  old_week: number;
  new_date: string;
  new_week: number;
  status: "moved" | "unchanged" | "unplaced";
  /** True when the sitting did not fit on its group's own days and takes the
   *  level-term's extra day (Thursday) instead — the Extra CT list. */
  extra: boolean;
  /** Why a sitting could not be placed, when `status` is `unplaced`. */
  note?: string;
}

export interface CTRescheduleSnapshotInfo {
  created_at: string;
  count: number;
}

/** Two or more different courses of one level-term sitting on the same date —
 *  impossible for a cohort that tests together, so the reschedule separates them. */
export interface CTRescheduleConflict {
  level: number;
  term: string;
  date: string;
  week: number;
  courses: { course_code: string; ct_number: number }[];
}

/** Which weekdays a group sits on during one window week. `extra_days` are the
 *  days the group may additionally use that week — the Thursday of the weeks the
 *  group does not already sit on Thursday, where its overflow (Extra CTs) goes. */
export interface CTRescheduleWeekSlot {
  week: number;
  group: CTRescheduleGroup;
  days: string[];
  extra_days: string[];
}

/** Two level-terms of the reschedule sitting in the same room on the same date.
 *  The window had no clash-free date left, so a room is shared rather than a
 *  class test left outside weeks 11–14. */
export interface CTRescheduleOverlap {
  date: string;
  week: number;
  room_ids: string[];
  entries: { level: number; term: string; course_code: string; ct_number: number }[];
}

export interface CTReschedulePlan {
  /** Class tests from this week on are the ones the reschedule moves. */
  from_week: number;
  first_week: number;
  last_week: number;
  /** Null until the first Apply — the schedule Restore would return to. */
  snapshot: CTRescheduleSnapshotInfo | null;
  week_slots: CTRescheduleWeekSlot[];
  /** Same-day clashes the current schedule already has, per level-term. */
  conflicts: CTRescheduleConflict[];
  /** Room clashes between two level-terms of the generated schedule. */
  overlaps: CTRescheduleOverlap[];
  shifts: CTRescheduleShift[];
  warnings: string[];
}

export interface CTRescheduleApplyResult {
  applied: number;
  unplaced: number;
  warnings: string[];
  plan: CTReschedulePlan;
  assignments: CTAssignment[];
}

export interface CTRescheduleRestoreResult {
  restored: number;
  assignments: CTAssignment[];
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
