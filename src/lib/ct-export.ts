import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, isValid } from "date-fns";
import type { AppData, CTAssignment } from "@/lib/types";
import { slugify } from "@/lib/routine-export";

const MARGIN = 36;

function newDoc() {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFont("times", "normal");
  return doc;
}

function drawHeader(doc: jsPDF, title: string, semesterName: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = MARGIN;
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("Bangladesh Army University of Science and Technology (BAUST), Saidpur", pageWidth / 2, y, { align: "center" });
  y += 20;
  doc.setFontSize(13);
  doc.text("Department of Computer Science and Engineering (CSE)", pageWidth / 2, y, { align: "center" });
  y += 20;
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(`${title} — ${semesterName}`, pageWidth / 2, y, { align: "center" });
  y += 20;
  return y;
}

function fmtDate(d: string) {
  const parsed = parseISO(typeof d === "string" ? d.split("T")[0] : d);
  return isValid(parsed) ? format(parsed, "dd MMM yyyy") : "-";
}

function fmtDay(d: string) {
  const parsed = parseISO(typeof d === "string" ? d.split("T")[0] : d);
  return isValid(parsed) ? format(parsed, "EEEE") : "-";
}

function getSemesterName(data: AppData) {
  return data.semesters.find((s) => s.id === data.active_semester_id)?.name ?? "";
}

/** Course-wise CT routine: one section per course listing CT1/CT2/CT3 date, day, week and room. */
export function exportCourseWiseCTPdf(data: AppData, assignments: CTAssignment[]) {
  const doc = newDoc();
  const semName = getSemesterName(data);
  let y = drawHeader(doc, "Course-wise Class Test Routine", semName);

  const byCourse = new Map<string, CTAssignment[]>();
  for (const a of assignments) {
    if (!byCourse.has(a.course_id)) byCourse.set(a.course_id, []);
    byCourse.get(a.course_id)!.push(a);
  }
  const courseIds = Array.from(byCourse.keys()).sort((idA, idB) => {
    const a = byCourse.get(idA)![0].course, b = byCourse.get(idB)![0].course;
    return (a?.code ?? "").localeCompare(b?.code ?? "");
  });

  const rows = courseIds.map((courseId) => {
    const cts = byCourse.get(courseId)!.sort((a, b) => a.ct_number - b.ct_number);
    const course = cts[0].course;
    return [
      `${course?.code ?? ""}\n${course?.name ?? ""}`,
      `L${course?.level}-${course?.term}`,
      ...[1, 2, 3].map((num) => {
        const ct = cts.find((c) => c.ct_number === num);
        return ct ? `${fmtDate(ct.date)}\n${fmtDay(ct.date)}\nWeek ${ct.week_number}\n${ct.room?.name ?? ""}` : "-";
      }),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Course", "Level-Term", "CT 1", "CT 2", "CT 3"]],
    body: rows,
    styles: { font: "times", fontSize: 9, cellPadding: 6, valign: "middle" },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    theme: "grid",
  });

  doc.save(`CT-Course-wise-Routine-${slugify(semName)}.pdf`);
}

/** Week-wise CT routine: grouped by week number and date, listing every course/room/CT number that day. */
export function exportWeekWiseCTPdf(data: AppData, assignments: CTAssignment[]) {
  const doc = newDoc();
  const semName = getSemesterName(data);
  let y = drawHeader(doc, "Week-wise Class Test Routine", semName);

  const sorted = [...assignments].sort((a, b) => {
    if (a.week_number !== b.week_number) return a.week_number - b.week_number;
    return (a.date > b.date ? 1 : a.date < b.date ? -1 : 0);
  });

  const rows = sorted.map((a) => [
    `Week ${a.week_number}`,
    fmtDate(a.date),
    fmtDay(a.date),
    `${a.course?.code ?? ""} — ${a.course?.name ?? ""}`,
    `CT ${a.ct_number}`,
    a.room?.name ?? "",
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Week", "Date", "Day", "Course", "CT No.", "Room"]],
    body: rows,
    styles: { font: "times", fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    theme: "grid",
  });

  doc.save(`CT-Week-wise-Routine-${slugify(semName)}.pdf`);
}

/** Teacher-wise CT routine: resolves teacher(s) per course via course_section_teachers for the
 *  active semester (theory courses are usually one teacher across all sections, but every
 *  distinct teacher assigned is listed). Shows course name, day, week and CT number. */
export function exportTeacherWiseCTPdf(data: AppData, assignments: CTAssignment[]) {
  const doc = newDoc();
  const semName = getSemesterName(data);
  let y = drawHeader(doc, "Teacher-wise Class Test Routine", semName);

  const teacherIdsByCourse = new Map<string, Set<string>>();
  for (const cst of data.course_section_teachers) {
    if (cst.semester_id !== data.active_semester_id) continue;
    if (!teacherIdsByCourse.has(cst.course_id)) teacherIdsByCourse.set(cst.course_id, new Set());
    const set = teacherIdsByCourse.get(cst.course_id)!;
    for (const tid of cst.teacher_ids ?? []) set.add(tid);
  }

  const rowsByTeacher = new Map<string, { code: string; name: string; day: string; date: string; week: number; ct: number }[]>();
  for (const a of assignments) {
    const teacherIds = teacherIdsByCourse.get(a.course_id);
    if (!teacherIds || teacherIds.size === 0) continue;
    for (const tid of teacherIds) {
      if (!rowsByTeacher.has(tid)) rowsByTeacher.set(tid, []);
      rowsByTeacher.get(tid)!.push({
        code: a.course?.code ?? "",
        name: a.course?.name ?? "",
        day: fmtDay(a.date),
        date: fmtDate(a.date),
        week: a.week_number,
        ct: a.ct_number,
      });
    }
  }

  const teacherIds = Array.from(rowsByTeacher.keys()).sort((idA, idB) => {
    const a = data.teachers.find((t) => t.id === idA);
    const b = data.teachers.find((t) => t.id === idB);
    return (a?.name ?? "").localeCompare(b?.name ?? "");
  });

  for (const tid of teacherIds) {
    const teacher = data.teachers.find((t) => t.id === tid);
    const rows = rowsByTeacher.get(tid)!.sort((a, b) => a.week - b.week || a.ct - b.ct);

    doc.setFont("times", "bold");
    doc.setFontSize(11);
    if (y > doc.internal.pageSize.getHeight() - 100) {
      doc.addPage();
      y = MARGIN;
    }
    doc.text(`${teacher?.name ?? "Unknown Teacher"} (${teacher?.short_name ?? ""})`, MARGIN, y);
    y += 14;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Course", "Day", "Date", "Week", "CT No."]],
      body: rows.map((r) => [`${r.code} — ${r.name}`, r.day, r.date, `Week ${r.week}`, `CT ${r.ct}`]),
      styles: { font: "times", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
      theme: "grid",
    });

    y = (doc as any).lastAutoTable.finalY + 24;
  }

  if (teacherIds.length === 0) {
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text("No teacher-course mapping found for this semester's CT courses.", MARGIN, y);
  }

  doc.save(`CT-Teacher-wise-Routine-${slugify(semName)}.pdf`);
}
