import { utils, writeFileXLSX } from "xlsx";
import type { AppData, Teacher } from "@/lib/types";
import { sentenceCaseDashed } from "@/lib/routine-export";

/** Course codes a teacher takes in the active semester.
 *
 *  Both assignment tables count: a teacher can be on a theory/sessional
 *  course-section assignment, on a lab section of a sessional course, or on
 *  both. Codes are de-duplicated and sorted so the cell reads the same however
 *  the assignments happened to be entered. */
export function takenCourseCodes(data: AppData, teacherId: string): string[] {
  const codes = new Set<string>();

  const addCourse = (courseId: string) => {
    const code = data.courses.find((c) => c.id === courseId)?.code;
    if (code) codes.add(code);
  };

  for (const cst of data.course_section_teachers) {
    if (cst.semester_id !== data.active_semester_id) continue;
    if (!cst.teacher_ids.includes(teacherId)) continue;
    addCourse(cst.course_id);
  }

  for (const lab of data.course_lab_sections) {
    if (lab.semester_id !== data.active_semester_id) continue;
    if (!lab.teacher_ids.includes(teacherId)) continue;
    addCourse(lab.course_id);
  }

  return Array.from(codes).sort((a, b) => a.localeCompare(b));
}

/** One row per teacher, in the column order the department expects on paper. */
export function teacherInfoRows(data: AppData, teachers: Teacher[]) {
  return teachers.map((t) => ({
    "Teacher Short Form": t.short_name,
    "Teacher Name": t.name,
    Department: t.department || "",
    "Taken Courses": takenCourseCodes(data, t.id).join(", "),
    Email: t.email || "",
    "Phone Number": t.phone || "",
  }));
}

/** Downloads the teacher information sheet for the active semester. */
export function exportTeacherInfoXlsx(data: AppData, teachers: Teacher[]) {
  const sheet = utils.json_to_sheet(teacherInfoRows(data, teachers));
  // Widths are set explicitly: course-code lists and email addresses are far
  // wider than the default column, and an unreadable sheet defeats the export.
  sheet["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 40 }, { wch: 30 }, { wch: 18 }];

  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, "Teacher Information");

  const semName = data.semesters.find((s) => s.id === data.active_semester_id)?.name ?? "";
  const suffix = semName ? `-${sentenceCaseDashed(semName)}` : "";
  writeFileXLSX(book, `Teacher-Information${suffix}.xlsx`);
}
