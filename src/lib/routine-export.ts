import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType, HeadingLevel, AlignmentType, BorderStyle, ImageRun,
} from "docx";
import type { AppData, ClassSlot } from "@/lib/types";
import { timesOverlap } from "@/lib/conflicts";
import { compareTimeValues, fmtRange12, sortDays, fmtDayTitle } from "@/lib/utils";
import type { RoutineScope } from "@/components/RoutineView";
import { buildRoutineCourseSummary, buildRoutineTeacherSummary } from "./routine-summary";
import JSZip from "jszip";

const DEFAULT_DEPT = "CSE";

function isBreak(p: { name: string; is_break?: boolean }) {
  return !!p.is_break || /break/i.test(p.name);
}

/** Slugify a string for safe filenames: lowercase, dashes only. */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert a string to Sentence-Case-Dashed for filenames.
 *  e.g. "md. mahadi hasan" -> "Md-Mahadi-Hasan", "level 1 term ii" -> "Level-1-Term-II".
 *  Preserves all-uppercase tokens (e.g. roman numerals II/III). */
export function sentenceCaseDashed(s: string) {
  return s
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      // Preserve all-uppercase tokens up to 4 chars (roman numerals, acronyms)
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 4) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join("-");
}

/** Compute friendly scope info: human title, slug filename suffix, and metadata fields. */
export function getScopeInfo(data: AppData, scope: RoutineScope) {
  if (scope.kind === "teacher") {
    const t = data.teachers.find((x) => x.id === scope.teacher_id);
    if (!t) return { title: "Teacher", slug: "Teacher-Routine", meta: [] as { label: string; value: string }[] };
    return {
      title: `Routine of ${t.name}`,
      slug: `${t.department || DEFAULT_DEPT}-${sentenceCaseDashed(t.name)}-Routine`,
      meta: [
        { label: "Teacher Name", value: t.name },
        { label: "Short Name", value: t.short_name },
        { label: "Designation", value: t.designation },
        { label: "Department", value: t.department },
        { label: "Total Credit", value: (Number(t.assigned_credit_hours) || 0).toFixed(2) },
      ],
    };
  }
  if (scope.kind === "room") {
    const r = data.rooms.find((x) => x.id === scope.room_id);
    if (!r) return { title: "Room", slug: "Room-Routine", meta: [] };
    return {
      title: `Routine of Room ${r.name}`,
      slug: `Room-${sentenceCaseDashed(r.name)}-Routine`,
      meta: [
        { label: "Room Name", value: r.name },
        { label: "Room Type", value: r.room_type },
        { label: "Capacity", value: String(r.capacity) },
      ],
    };
  }
  if (scope.kind === "section") {
    const s = data.sections.find((x) => x.id === scope.section_id);
    if (!s) return { title: "Section", slug: "Section-Routine", meta: [] };
    const termRoman = s.term;
    const sectionDept = s.department_id
      ? data.departments.find((d) => d.id === s.department_id)?.short_name ?? DEFAULT_DEPT
      : DEFAULT_DEPT;
    return {
      title: `Routine of Level ${s.level} Term ${termRoman} Section ${s.name}`,
      slug: `${sectionDept}-Level-${s.level}-Term-${termRoman}-Section-${sentenceCaseDashed(s.name)}-Routine`,
      meta: [
        { label: "Department", value: sectionDept },
        { label: "Level", value: String(s.level) },
        { label: "Term", value: s.term },
        { label: "Section", value: s.name },
        { label: "Total Students", value: String(s.total_students) },
      ],
    };
  }
  return { title: "Full Routine", slug: "Full-Routine", meta: [] };
}

/** Build a 2D matrix [day][period] => string for the routine. */
export function buildRoutineMatrix(data: AppData, scope: RoutineScope) {
  const theoryPeriods = [...data.periods]
    .filter((p) => p.kind === "theory")
    .filter((p) => data.app_settings.show_break_column || !isBreak(p))
    .sort((a, b) => compareTimeValues(a.start, b.start));
  const days = sortDays(data.days);

  const slots = data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    
    if (scope.kind === "section") {
      if (s.section_id === scope.section_id) return true;
      if (s.lab_section_id) {
        const ls = data.course_lab_sections.find((x) => x.id === s.lab_section_id);
        return !!ls && ls.section_ids.includes(scope.section_id);
      }
      return false;
    }

    if (scope.kind === "teacher") {
      let teacherIds: string[] = [];
      if (s.lab_section_id) {
        const ls = data.course_lab_sections.find((x) => x.id === s.lab_section_id);
        teacherIds = ls?.teacher_ids ?? [];
      } else {
        const cst = data.course_section_teachers.find(
          (x) =>
            x.semester_id === data.active_semester_id &&
            x.course_id === s.course_id &&
            x.section_id === s.section_id,
        );
        teacherIds = cst?.teacher_ids ?? [];
      }
      return teacherIds.includes(scope.teacher_id);
    }
    return false;
  });

  const cellText = (slot: ClassSlot) => {
    const c = data.courses.find((x) => x.id === slot.course_id);
    const room = data.rooms.find((x) => x.id === slot.room_id);
    
    let teacherIds: string[] = [];
    let sectionList: any[] = [];
    let labLabel = "";
    if (slot.lab_section_id) {
      const ls = data.course_lab_sections.find((x) => x.id === slot.lab_section_id);
      if (ls) {
        teacherIds = ls.teacher_ids;
        sectionList = data.sections.filter((s) => ls.section_ids.includes(s.id));
        labLabel = ls.label;
      }
    } else {
      if (slot.section_id) {
        const s = data.sections.find((x) => x.id === slot.section_id);
        if (s) sectionList = [s];
      }
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === slot.course_id &&
          x.section_id === slot.section_id,
      );
      teacherIds = cst?.teacher_ids ?? [];
    }

    const teacherShorts = teacherIds
      .map((tid) => data.teachers.find((t) => t.id === tid)?.short_name)
      .filter(Boolean)
      .join(", ");

    const weekText = slot.week !== "EVERY" ? ` #${slot.week}#` : "";
    const courseCodeWithLab = labLabel && c ? `${c.code}(${labLabel})` : c?.code || "";

    if (scope.kind === "section") {
      const teachersPart = teacherShorts ? ` (${teacherShorts})` : "";
      const roomPart = room ? ` [${room.name}]` : "";
      return `${courseCodeWithLab}${teachersPart}${weekText}${roomPart}`;
    }

    if (scope.kind === "room") {
      const sectionTags = sectionList.map((sec) => {
        return `${sec.level}/${sec.term} - ${sec.name}`;
      }).join(", ");
      
      const teachersPart = teacherShorts ? `(${teacherShorts})` : "";
      const roomPart = room ? ` [${room.name}]` : "";
      const sectionPart = sectionTags ? `{${sectionTags}}` : "";
      return `${courseCodeWithLab}${teachersPart}${weekText}${roomPart}${sectionPart}`;
    }

    if (scope.kind === "teacher") {
      const sectionTags = sectionList.map((sec) => {
        return `${sec.level}-${sec.term}  ${sec.name}`;
      }).join(", ");

      const teachersPart = teacherShorts ? ` (${teacherShorts})` : "";
      const roomPart = room ? ` [${room.name}]` : "";
      const sectionPart = sectionTags ? ` {${sectionTags}}` : "";
      return `${courseCodeWithLab}${teachersPart}${weekText}${roomPart}${sectionPart}`;
    }

    const teachersPart = teacherShorts ? ` (${teacherShorts})` : "";
    const roomPart = room ? ` [${room.name}]` : "";
    return `${courseCodeWithLab}${teachersPart}${weekText}${roomPart}`;
  };

  const header = ["Day", ...theoryPeriods.map((p) => fmtRange12(p.start, p.end))];
  const rows = days.map((d) => {
    const row: string[] = [fmtDayTitle(d.name)];
    let skipCount = 0;
    for (const p of theoryPeriods) {
      if (skipCount > 0) {
        row.push("SKIP");
        skipCount--;
        continue;
      }
      if (isBreak(p)) {
        row.push("BREAK");
        continue;
      }
      const cellSlots = slots.filter(
        (s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end)
      );
      
      const starting = cellSlots.filter(s => s.start === p.start);
      if (starting.length === 0) {
        const spanning = cellSlots.find(s => s.start < p.start);
        row.push(spanning ? "SKIP" : "");
      } else {
        const colSpan = Math.max(1, ...starting.map(s => {
          return theoryPeriods.filter(tp => timesOverlap(s.start, s.end, tp.start, tp.end)).length;
        }));
        skipCount = colSpan - 1;
        row.push(starting.map(cellText).join("  /  "));
      }
    }
    return row;
  });

  return { header, rows, periods: theoryPeriods, days, slots };
}



/* =============== DOCX =============== */
/* =============== DOCX =============== */
interface CellOptions {
  text: string;
  bold?: boolean;
  size?: number;
  fill?: string;
  align?: any;
  colSpan?: number;
  rowSpan?: number;
  color?: string;
  italic?: boolean;
}

function createCell(width: number, options: CellOptions): TableCell {
  const {
    text,
    bold = false,
    size = 24,
    fill,
    align = AlignmentType.CENTER,
    colSpan,
    rowSpan,
    color,
    italic = false,
  } = options;

  const lines = text.split("\n");
  const paragraphs = lines.map((line) => {
    return new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0, line: 240 },
      children: [
        new TextRun({
          text: line,
          bold,
          italics: italic,
          font: "Times New Roman",
          size,
          color,
        }),
      ],
    });
  });

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill } : undefined,
    columnSpan: colSpan && colSpan > 1 ? colSpan : undefined,
    rowSpan: rowSpan && rowSpan > 1 ? rowSpan : undefined,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "A0A0A0" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "A0A0A0" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "A0A0A0" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "A0A0A0" },
    },
    children: paragraphs.length > 0 ? paragraphs : [new Paragraph({})],
  });
}

function formatCredit(val: number | string | undefined | null): string {
  const n = Number(val) || 0;
  if (n === 0) return "";
  if (n % 1 !== 0) {
    return n.toFixed(2);
  }
  return n.toFixed(1);
}

export function buildRoutineDocxDocument(data: AppData, scope: RoutineScope): Document {
  const info = getScopeInfo(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);
  const summary = buildRoutineCourseSummary(data, scope);

  const title1 = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({
        text: scope.kind === "section"
          ? "Bangladesh Army University of Science and Technology (BAUST), Saidpur"
          : "Bangladesh Army University of Science and Technology (BAUST)",
        bold: true,
        font: "Times New Roman",
        size: scope.kind === "section" ? 32 : 36, // 16pt / 18pt
      }),
    ],
  });

  const title2 = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({
        text: scope.kind === "section"
          ? "Department of Computer Science and Engineering (CSE)"
          : "Department of Computer Science and Engineering",
        bold: true,
        font: "Times New Roman",
        size: scope.kind === "section" ? 28 : 34, // 14pt / 17pt
      }),
    ],
  });

  const semName = data.semesters.find(s => s.id === data.active_semester_id)?.name || "Winter-2026";
  let subtitleText = "";
  if (scope.kind === "section") {
    subtitleText = `Batchwise Class Routine, ${semName}`;
  } else if (scope.kind === "room") {
    subtitleText = `Room-wise Class Routine for ${semName}`;
  } else {
    subtitleText = `Individual Class Routine & Course Load for ${semName}`;
  }

  const title3 = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({
        text: subtitleText,
        font: "Times New Roman",
        size: 26, // 13pt
      }),
    ],
  });

  // Table 0: Metadata Table
  let table0: Table | null = null;
  if (scope.kind === "section") {
    const sec = data.sections.find(x => x.id === scope.section_id);
    const levelTermStr = sec ? `${sec.level}-${sec.term}` : "";
    const secName = sec ? sec.name : "";
    const sectionDept = sec && sec.department_id
      ? data.departments.find((d) => d.id === sec.department_id)?.short_name ?? DEFAULT_DEPT
      : DEFAULT_DEPT;
    
    const widths0 = [2232, 3571];
    table0 = new Table({
      width: { size: 5803, type: WidthType.DXA },
      columnWidths: widths0,
      rows: [
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Department:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: sectionDept, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Level-Term:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: levelTermStr, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Section:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: secName, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
      ],
    });
  } else if (scope.kind === "room") {
    const r = data.rooms.find(x => x.id === scope.room_id);
    const roomName = r ? r.name : "";
    const widths0 = [2600, 2700];
    table0 = new Table({
      width: { size: 5300, type: WidthType.DXA },
      columnWidths: widths0,
      rows: [
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Room No:", bold: true, size: 36, align: AlignmentType.RIGHT }),
            createCell(widths0[1], { text: roomName, bold: true, size: 36, align: AlignmentType.LEFT }),
          ],
        }),
      ],
    });
  } else if (scope.kind === "teacher") {
    const t = data.teachers.find(x => x.id === scope.teacher_id);
    const tName = t ? t.name : "";
    const tShort = t ? t.short_name : "";
    const designation = t ? t.designation : "";
    const dept = t ? (t.department || "CSE") : "CSE";
    const contactHours = formatCredit(summary.totals.credit);
    
    const widths0 = [1713, 7833];
    table0 = new Table({
      width: { size: 9546, type: WidthType.DXA },
      columnWidths: widths0,
      rows: [
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Teacher Name:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: `${tName} (${tShort})`, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Designation:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: `${designation}, ${dept}`, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
        new TableRow({
          children: [
            createCell(widths0[0], { text: "Total Credit Hours:", bold: true, align: AlignmentType.LEFT }),
            createCell(widths0[1], { text: contactHours, bold: true, align: AlignmentType.LEFT }),
          ],
        }),
      ],
    });
  }

  // Table 1: Routine Matrix Table
  let colWidths: number[];
  if (scope.kind === "section") {
    colWidths = [780, 1670, 1526, 1526, 360, 1612, 1713, 1612, 1483, 1454, 1368];
  } else if (scope.kind === "room") {
    colWidths = [780, 1612, 1612, 1612, 504, 1656, 1656, 1656, 1641, 1641, 1641];
  } else { // teacher
    colWidths = [820, 1540, 1540, 1540, 532, 1584, 1584, 1584, 1584, 1584, 1584];
  }
  const totalTable1Width = colWidths.reduce((sum, w) => sum + w, 0);

  const headerRow = new TableRow({
    children: header.map((h, i) => {
      const displayHeader = h.includes(":") ? h.replace(/:/g, ".") : h;
      return createCell(colWidths[i], {
        text: displayHeader,
        bold: true,
        size: 24, // 12pt
      });
    }),
  });

  const bodyRows: TableRow[] = [];
  for (const r of rows) {
    const rowCells: TableCell[] = [];
    let skipCount = 0;
    for (let i = 0; i < r.length; i++) {
      const cell = r[i];
      if (skipCount > 0) {
        skipCount--;
        continue;
      }

      let colSpan = 1;
      if (cell !== "" && cell !== "BREAK" && cell !== "SKIP") {
        let j = i + 1;
        while (j < r.length && r[j] === "SKIP") {
          colSpan++;
          j++;
        }
        skipCount = colSpan - 1;
      }

      const cellWidth = colWidths.slice(i, i + colSpan).reduce((sum, w) => sum + w, 0);

      const isDay = i === 0;
      const isBreak = cell === "BREAK";

      let text = cell;
      let size = scope.kind === "section" ? 18 : 24; // 9pt for section, 12pt for teacher/room
      let bold = false;

      if (isDay) {
        size = 24; // 12pt
      } else if (isBreak) {
        if (scope.kind === "section") {
          text = "BREAK (10.50- 11.30)";
          size = 16; // 8pt
        } else {
          text = "BREAK";
          size = 24; // 12pt
        }
      } else if (cell !== "" && cell !== "SKIP") {
        bold = scope.kind === "section"; // bold only in section routine class cells
      }

      if (cell !== "SKIP") {
        rowCells.push(createCell(cellWidth, {
          text,
          bold,
          size,
          colSpan,
        }));
      }
    }
    bodyRows.push(new TableRow({ children: rowCells }));
  }

  const routineGridTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: colWidths,
    rows: [headerRow, ...bodyRows],
  });

  // Table 2: Course Load Summary Table
  const widths2 = [1500, 6000, 1000, 1000, 1500];
  const totalTable2Width = widths2.reduce((sum, w) => sum + w, 0);

  const summaryHeaderRow0 = new TableRow({
    children: [
      createCell(totalTable2Width, {
        text: "COURSES",
        bold: true,
        size: 24, // 12pt
        fill: "4F46E5",
        color: "FFFFFF",
        colSpan: 5,
      }),
    ],
  });

  const summaryHeaderRow1 = new TableRow({
    children: [
      createCell(widths2[0], { text: "Course No.", bold: true, fill: "E0E7FF", rowSpan: 2 }),
      createCell(widths2[1], { text: "Course Title", bold: true, fill: "E0E7FF", rowSpan: 2 }),
      createCell(widths2[2] + widths2[3], { text: "Hours/Week", bold: true, fill: "E0E7FF", colSpan: 2 }),
      createCell(widths2[4], { text: "Credit Hours", bold: true, fill: "E0E7FF", rowSpan: 2 }),
    ],
  });

  const summaryHeaderRow2 = new TableRow({
    children: [
      createCell(widths2[2], { text: "Theory", bold: true, fill: "E0E7FF" }),
      createCell(widths2[3], { text: "Sessional", bold: true, fill: "E0E7FF" }),
    ],
  });

  const summaryBodyRows = summary.rows.map((r) => {
    return new TableRow({
      children: [
        createCell(widths2[0], { text: r.course.code, size: 18 }),
        createCell(widths2[1], { text: r.course.name, size: 18, align: AlignmentType.LEFT }),
        createCell(widths2[2], { text: formatCredit(r.theory), size: 18 }),
        createCell(widths2[3], { text: formatCredit(r.sessional), size: 18 }),
        createCell(widths2[4], { text: formatCredit(r.credit), size: 18 }),
      ],
    });
  });

  const summaryTotalRow = new TableRow({
    children: [
      createCell(widths2[0], { text: "" }),
      createCell(widths2[1], { text: "Total:", bold: true, size: 18, align: AlignmentType.RIGHT }),
      createCell(widths2[2], { text: formatCredit(summary.totals.theory), bold: true, size: 18 }),
      createCell(widths2[3], { text: formatCredit(summary.totals.sessional), bold: true, size: 18 }),
      createCell(widths2[4], { text: formatCredit(summary.totals.credit), bold: true, size: 18 }),
    ],
  });

  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths2,
    rows: [summaryHeaderRow0, summaryHeaderRow1, summaryHeaderRow2, ...summaryBodyRows, summaryTotalRow],
  });

  // Table 3: Teacher Details Table
  const teacherSummary = buildRoutineTeacherSummary(data, scope);
  const widths3 = [1500, 4500, 4000];
  const totalTable3Width = widths3.reduce((sum, w) => sum + w, 0);

  const teacherHeaderRow = new TableRow({
    children: [
      createCell(widths3[0], { text: "Short Form", bold: true, size: 20, fill: "4F46E5", color: "FFFFFF" }),
      createCell(widths3[1], { text: "Teachers Name", bold: true, size: 20, fill: "4F46E5", color: "FFFFFF" }),
      createCell(widths3[2], { text: "Designation", bold: true, size: 20, fill: "4F46E5", color: "FFFFFF" }),
    ],
  });

  const teacherBodyRows = teacherSummary.map((r) => {
    return new TableRow({
      children: [
        createCell(widths3[0], { text: r.teacher.short_name, size: 18 }),
        createCell(widths3[1], { text: r.teacher.name, size: 18 }),
        createCell(widths3[2], {
          text: r.teacher.department 
            ? `${r.teacher.designation} ,${r.teacher.department}` 
            : r.teacher.designation,
          size: 18,
        }),
      ],
    });
  });

  const teacherTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths3,
    rows: [teacherHeaderRow, ...teacherBodyRows],
  });

  const docChildren: any[] = [
    title1,
    title2,
    title3,
    new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun(" ")] }),
  ];

  if (table0) {
    docChildren.push(table0);
    docChildren.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun(" ")] }));
  }

  docChildren.push(routineGridTable);
  docChildren.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun(" ")] }));
  docChildren.push(summaryTable);

  if (teacherSummary.length > 0) {
    docChildren.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun(" ")] }));
    docChildren.push(teacherTable);
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: "landscape" as any },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: docChildren,
      },
    ],
  });
}



export async function exportRoutineDocx(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const doc = buildRoutineDocxDocument(data, scope);
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${info.slug}.docx`);
}

export async function exportAllRoutinesDocxZip(data: AppData) {
  const zip = new JSZip();

  const sectionsFolder = zip.folder("Sections");
  for (const s of data.sections) {
    const scope: RoutineScope = { kind: "section", section_id: s.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutineDocxDocument(data, scope);
    const blob = await Packer.toBlob(doc);
    sectionsFolder?.file(`${info.slug}.docx`, blob);
  }

  const teachersFolder = zip.folder("Teachers");
  for (const t of data.teachers) {
    const scope: RoutineScope = { kind: "teacher", teacher_id: t.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutineDocxDocument(data, scope);
    const blob = await Packer.toBlob(doc);
    teachersFolder?.file(`${info.slug}.docx`, blob);
  }

  const roomsFolder = zip.folder("Rooms");
  for (const r of data.rooms) {
    const scope: RoutineScope = { kind: "room", room_id: r.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutineDocxDocument(data, scope);
    const blob = await Packer.toBlob(doc);
    roomsFolder?.file(`${info.slug}.docx`, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "All_Routines_Docx.zip");
}

/* =============== SYNCHRONIZATION HELPERS =============== */
export interface RoutineHeaderAndMeta {
  lines: string[];
  metadata: { label: string; value: string }[];
}

export function getRoutineHeaderAndMeta(data: AppData, scope: RoutineScope): RoutineHeaderAndMeta {
  const semName = data.semesters.find(s => s.id === data.active_semester_id)?.name || "Winter-2026";
  const lines: string[] = [];
  const metadata: { label: string; value: string }[] = [];

  if (scope.kind === "section") {
    const sec = data.sections.find(x => x.id === scope.section_id);
    const levelTermStr = sec ? `${sec.level}-${sec.term}` : "";
    const secName = sec ? sec.name : "";
    const sectionDept = sec && sec.department_id
      ? data.departments.find((d) => d.id === sec.department_id)?.short_name ?? DEFAULT_DEPT
      : DEFAULT_DEPT;
    
    lines.push("Bangladesh Army University of Science and Technology (BAUST), Saidpur");
    lines.push("Department of Computer Science and Engineering (CSE)");
    lines.push(`Batchwise Class Routine, ${semName}`);

    metadata.push({ label: "Department", value: sectionDept });
    metadata.push({ label: "Level-Term", value: levelTermStr });
    metadata.push({ label: "Section", value: secName });
  } else if (scope.kind === "room") {
    const r = data.rooms.find(x => x.id === scope.room_id);
    const roomName = r ? r.name : "";

    lines.push("Bangladesh Army University of Science and Technology (BAUST)");
    lines.push("Department of Computer Science and Engineering");
    lines.push(`Room-wise Class Routine for ${semName}`);

    metadata.push({ label: "Room No", value: roomName });
  } else if (scope.kind === "teacher") {
    const t = data.teachers.find(x => x.id === scope.teacher_id);
    const tName = t ? t.name : "";
    const tShort = t ? t.short_name : "";
    const designation = t ? t.designation : "";
    const dept = t ? (t.department || "CSE") : "CSE";
    
    const summary = buildRoutineCourseSummary(data, scope);
    const totalCreditHours = formatCredit(summary.totals.credit);

    lines.push("Bangladesh Army University of Science and Technology (BAUST)");
    lines.push("Department of Computer Science and Engineering");
    lines.push(`Individual Class Routine & Course Load for ${semName}`);

    metadata.push({ label: "Teacher Name", value: `${tName} (${tShort})` });
    metadata.push({ label: "Designation", value: `${designation}, ${dept}` });
    metadata.push({ label: "Total Credit Hours", value: totalCreditHours });
  } else {
    lines.push("Bangladesh Army University of Science and Technology (BAUST)");
    lines.push("Department of Computer Science and Engineering");
    lines.push(`Class Routine, ${semName}`);
  }

  return { lines, metadata };
}

/* =============== JSON =============== */
export function getRoutineJsonPayload(data: AppData, scope: RoutineScope) {
  const sync = getRoutineHeaderAndMeta(data, scope);
  const { slots, periods, days } = buildRoutineMatrix(data, scope);

  const detailedSlots = slots.map((s) => {
    const c = data.courses.find((x) => x.id === s.course_id);
    const sec = data.sections.find((x) => x.id === s.section_id);
    const room = data.rooms.find((x) => x.id === s.room_id);
    
    let teacherIds: string[] = [];
    if (s.lab_section_id) {
      const ls = data.course_lab_sections.find((x) => x.id === s.lab_section_id);
      teacherIds = ls?.teacher_ids ?? [];
    } else {
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id,
      );
      teacherIds = cst?.teacher_ids ?? [];
    }

    const teachers = teacherIds
      .map((tid) => data.teachers.find((t) => t.id === tid))
      .filter(Boolean)
      .map((t: any) => ({ short_name: t.short_name, name: t.name, designation: t.designation }));

    return {
      day: s.day,
      start: s.start,
      end: s.end,
      week: s.week,
      course: c ? { code: c.code, name: c.name, credit: c.credit, level: c.level, term: c.term } : null,
      section: sec ? { name: sec.name, total_students: sec.total_students } : null,
      room: room ? { name: room.name, capacity: room.capacity, room_type: room.room_type } : null,
      teachers,
    };
  });

  const teacherSummary = buildRoutineTeacherSummary(data, scope).map((r) => ({
    short_name: r.teacher.short_name,
    name: r.teacher.name,
    designation: r.teacher.designation,
    department: r.teacher.department,
  }));

  const courseSummary = buildRoutineCourseSummary(data, scope);
  const formattedCourses = courseSummary.rows.map((r) => ({
    code: r.course.code,
    title: r.course.name,
    theory: formatCredit(r.theory),
    sessional: formatCredit(r.sessional),
    credit: formatCredit(r.credit),
    meetings: r.meetings,
  }));

  return {
    title_lines: sync.lines,
    metadata: Object.fromEntries(sync.metadata.map((m) => [m.label, m.value])),
    periods: periods.map((p) => ({ name: p.name, start: p.start, end: p.end, kind: p.kind })),
    days: days.map((d) => d.name),
    classes: detailedSlots,
    course_summary: {
      rows: formattedCourses,
      totals: {
        theory: formatCredit(courseSummary.totals.theory),
        sessional: formatCredit(courseSummary.totals.sessional),
        credit: formatCredit(courseSummary.totals.credit),
        meetings: courseSummary.totals.meetings,
      }
    },
    teacher_details: teacherSummary,
  };
}

export function exportRoutineJson(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const payload = getRoutineJsonPayload(data, scope);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  saveAs(blob, `${info.slug}.json`);
}

export async function exportAllRoutinesJsonZip(data: AppData) {
  const zip = new JSZip();

  const sectionsFolder = zip.folder("Sections");
  for (const s of data.sections) {
    const scope: RoutineScope = { kind: "section", section_id: s.id };
    const info = getScopeInfo(data, scope);
    const payload = getRoutineJsonPayload(data, scope);
    sectionsFolder?.file(`${info.slug}.json`, JSON.stringify(payload, null, 2));
  }

  const teachersFolder = zip.folder("Teachers");
  for (const t of data.teachers) {
    const scope: RoutineScope = { kind: "teacher", teacher_id: t.id };
    const info = getScopeInfo(data, scope);
    const payload = getRoutineJsonPayload(data, scope);
    teachersFolder?.file(`${info.slug}.json`, JSON.stringify(payload, null, 2));
  }

  const roomsFolder = zip.folder("Rooms");
  for (const r of data.rooms) {
    const scope: RoutineScope = { kind: "room", room_id: r.id };
    const info = getScopeInfo(data, scope);
    const payload = getRoutineJsonPayload(data, scope);
    roomsFolder?.file(`${info.slug}.json`, JSON.stringify(payload, null, 2));
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "All_Routines_JSON.zip");
}

/* =============== EXCEL =============== */
function getExcelBuffer(data: AppData, scope: RoutineScope): ArrayBuffer {
  const { header, rows } = buildRoutineMatrix(data, scope);
  const sync = getRoutineHeaderAndMeta(data, scope);
  const aoa: (string | number)[][] = [];
  
  for (const line of sync.lines) {
    aoa.push([line]);
  }
  aoa.push([]);
  for (const m of sync.metadata) {
    aoa.push([m.label, m.value]);
  }
  aoa.push([]);
  aoa.push(header);
  for (const r of rows) {
    aoa.push(r.map(c => c === "SKIP" ? "" : c));
  }

  aoa.push([]);
  aoa.push(["Course Load Summary"]);
  aoa.push(["Course Code", "Course Title", "Theory", "Sessional", "Credit Hours", "Classes/Week"]);
  const summary = buildRoutineCourseSummary(data, scope);
  for (const row of summary.rows) {
    aoa.push([
      row.course.code,
      row.course.name,
      formatCredit(row.theory),
      formatCredit(row.sessional),
      formatCredit(row.credit),
      row.meetings
    ]);
  }
  aoa.push([
    "TOTAL",
    "",
    formatCredit(summary.totals.theory),
    formatCredit(summary.totals.sessional),
    formatCredit(summary.totals.credit),
    summary.totals.meetings
  ]);

  aoa.push([]);
  aoa.push(["Teacher Details"]);
  aoa.push(["Short Form", "Teachers Name", "Designation"]);
  const teacherSummary = buildRoutineTeacherSummary(data, scope);
  for (const row of teacherSummary) {
    aoa.push([
      row.teacher.short_name,
      row.teacher.name,
      row.teacher.department ? `${row.teacher.designation}, ${row.teacher.department}` : row.teacher.designation,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Routine");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf;
}

export function exportRoutineExcel(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const buf = getExcelBuffer(data, scope);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${info.slug}.xlsx`);
}

export async function exportAllRoutinesExcelZip(data: AppData) {
  const zip = new JSZip();

  const sectionsFolder = zip.folder("Sections");
  for (const s of data.sections) {
    const scope: RoutineScope = { kind: "section", section_id: s.id };
    const info = getScopeInfo(data, scope);
    sectionsFolder?.file(`${info.slug}.xlsx`, getExcelBuffer(data, scope));
  }

  const teachersFolder = zip.folder("Teachers");
  for (const t of data.teachers) {
    const scope: RoutineScope = { kind: "teacher", teacher_id: t.id };
    const info = getScopeInfo(data, scope);
    teachersFolder?.file(`${info.slug}.xlsx`, getExcelBuffer(data, scope));
  }

  const roomsFolder = zip.folder("Rooms");
  for (const r of data.rooms) {
    const scope: RoutineScope = { kind: "room", room_id: r.id };
    const info = getScopeInfo(data, scope);
    roomsFolder?.file(`${info.slug}.xlsx`, getExcelBuffer(data, scope));
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "All_Routines_Excel.zip");
}

/* =============== PDF =============== */
export function buildRoutinePdfDocument(data: AppData, scope: RoutineScope): jsPDF {
  const sync = getRoutineHeaderAndMeta(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });



  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  let currentY = 32;
  for (const line of sync.lines) {
    const textWidth = doc.getTextWidth(line);
    const x = (842 - textWidth) / 2;
    doc.text(line, x, currentY);
    currentY += 18;
  }
  currentY += 8;

  doc.setFontSize(10);
  for (const m of sync.metadata) {
    doc.setFont("helvetica", "bold");
    doc.text(`${m.label}:`, 40, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(String(m.value), 140, currentY);
    currentY += 14;
  }
  const startY = currentY + 6;

  const body = rows.map(r => r.map(c => ({ content: c, colSpan: 1 })));
  for (let r = 0; r < body.length; r++) {
    for (let c = 1; c < body[r].length; c++) {
      if (body[r][c].content === "SKIP") {
        let prev = c - 1;
        while (prev >= 1 && body[r][prev].content === "SKIP") prev--;
        body[r][prev].colSpan++;
      }
    }
  }
  const finalBody = body.map(r => r.filter(c => c.content !== "SKIP").map(c => {
    if (c.content === "BREAK") return { content: "BREAK", styles: { fillColor: [254, 243, 199], fontStyle: "bold", halign: "center" } };
    return c;
  }));

  autoTable(doc, {
    head: [header],
    body: finalBody as any,
    startY,
    styles: { fontSize: 7, cellPadding: 3, valign: "top", halign: "left", overflow: "linebreak" },
    theme: "grid",
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
    didParseCell: (data) => {
      if (data.section === "head") {
        if (data.column.index === 0) {
          data.cell.styles.fillColor = [79, 70, 229]; // Indigo / blue-violet
          data.cell.styles.textColor = [255, 255, 255];
        } else {
          data.cell.styles.fillColor = [5, 150, 105]; // Green/teal
          data.cell.styles.textColor = [255, 255, 255];
        }
      } else if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.fillColor = [224, 231, 255]; // Soft indigo/blue-violet
        data.cell.styles.textColor = [30, 41, 59];
      }
    }
  });

  const summary = buildRoutineCourseSummary(data, scope);
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Course Load Summary", 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [
      [
        { content: "Course No.", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        { content: "Course Title", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        { content: "Hours/Week", colSpan: 2, styles: { halign: "center" } },
        { content: "Credit Hours", rowSpan: 2, styles: { halign: "center", valign: "middle" } },
        { content: "Classes/Week", rowSpan: 2, styles: { halign: "center", valign: "middle" } }
      ],
      [
        "Theory",
        "Sessional"
      ]
    ],
    body: [
      ...summary.rows.map(r => [
        r.course.code,
        r.course.name,
        formatCredit(r.theory),
        formatCredit(r.sessional),
        formatCredit(r.credit),
        r.meetings
      ]),
      [
        { content: "TOTAL", colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        formatCredit(summary.totals.theory),
        formatCredit(summary.totals.sessional),
        formatCredit(summary.totals.credit),
        summary.totals.meetings
      ]
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
    theme: "grid",
  });

  const teacherSummary = buildRoutineTeacherSummary(data, scope);
  if (teacherSummary.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Teacher Details", 40, 40);

    autoTable(doc, {
      startY: 60,
      head: [["Short Form", "Teachers Name", "Designation"]],
      body: teacherSummary.map((r) => [
        r.teacher.short_name,
        r.teacher.name,
        r.teacher.department ? `${r.teacher.designation}, ${r.teacher.department}` : r.teacher.designation,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold" },
      theme: "grid",
    });
  }

  return doc;
}



export async function exportRoutinePdf(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const doc = buildRoutinePdfDocument(data, scope);
  doc.save(`${info.slug}.pdf`);
}

export async function exportAllRoutinesPdfZip(data: AppData) {
  const zip = new JSZip();

  const sectionsFolder = zip.folder("Sections");
  for (const s of data.sections) {
    const scope: RoutineScope = { kind: "section", section_id: s.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutinePdfDocument(data, scope);
    sectionsFolder?.file(`${info.slug}.pdf`, doc.output("arraybuffer"));
  }

  const teachersFolder = zip.folder("Teachers");
  for (const t of data.teachers) {
    const scope: RoutineScope = { kind: "teacher", teacher_id: t.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutinePdfDocument(data, scope);
    teachersFolder?.file(`${info.slug}.pdf`, doc.output("arraybuffer"));
  }

  const roomsFolder = zip.folder("Rooms");
  for (const r of data.rooms) {
    const scope: RoutineScope = { kind: "room", room_id: r.id };
    const info = getScopeInfo(data, scope);
    const doc = buildRoutinePdfDocument(data, scope);
    roomsFolder?.file(`${info.slug}.pdf`, doc.output("arraybuffer"));
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "All_Routines_PDF.zip");
}

/* =============== IMAGE (PNG via canvas) =============== */
export function buildRoutineCanvas(data: AppData, scope: RoutineScope, logoImg?: HTMLImageElement | null): HTMLCanvasElement {
  const sync = getRoutineHeaderAndMeta(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);
  const teacherSummary = buildRoutineTeacherSummary(data, scope);

  const cols = header.length;
  const rowsCount = rows.length;
  const padding = 32;
  
  const titleH = sync.lines.length * 24 + 12;
  const metaH = sync.metadata.length * 18 + (sync.metadata.length ? 16 : 0);
  
  const cellW = 170;
  const cellH = 90;
  const headerH = 44;

  const tCols = [120, 260, 320];
  const tHeaderH = 30;
  const tRowH = 26;
  const tSectionH = teacherSummary.length > 0 ? 36 + tHeaderH + teacherSummary.length * tRowH : 0;
  const tTableW = tCols.reduce((a, b) => a + b, 0);

  const W = padding * 2 + Math.max(cols * cellW, tTableW);
  const H = padding * 2 + titleH + metaH + headerH + rowsCount * cellH + tSectionH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  if (logoImg) {
    try {
      ctx.drawImage(logoImg, padding, padding, 72, 72);
    } catch (e) {
      console.error("Failed to draw logo on canvas", e);
    }
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 20px Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  
  let currentY = padding;
  for (const line of sync.lines) {
    const textX = logoImg ? (W + padding + 72) / 2 : W / 2;
    ctx.fillText(line, textX, currentY);
    currentY += 24;
  }
  currentY += 12;

  ctx.textAlign = "left";
  for (const m of sync.metadata) {
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillText(`${m.label}:`, padding, currentY);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText(String(m.value), padding + 110, currentY);
    currentY += 18;
  }
  if (sync.metadata.length) currentY += 16;

  const tableX = padding;
  let tableY = currentY;

  // Draw green gradient for time slots (headers)
  const grad = ctx.createLinearGradient(tableX + cellW, tableY, tableX + cols * cellW, tableY);
  grad.addColorStop(0, "#10b981");
  grad.addColorStop(1, "#047857");
  ctx.fillStyle = grad;
  ctx.fillRect(tableX + cellW, tableY, (cols - 1) * cellW, headerH);

  // Draw blue-violet (indigo) gradient for the Day header cell
  const dayGrad = ctx.createLinearGradient(tableX, tableY, tableX + cellW, tableY);
  dayGrad.addColorStop(0, "#4f46e5");
  dayGrad.addColorStop(1, "#6366f1");
  ctx.fillStyle = dayGrad;
  ctx.fillRect(tableX, tableY, cellW, headerH);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < cols; i++) {
    ctx.fillText(header[i], tableX + i * cellW + cellW / 2, tableY + 14);
  }
  tableY += headerH;

  ctx.textAlign = "left";
  for (let r = 0; r < rowsCount; r++) {
    for (let c = 0; c < cols; c++) {
      const content = rows[r][c];
      if (content === "SKIP") continue;

      let colSpan = 1;
      let nextC = c + 1;
      while (nextC < cols && rows[r][nextC] === "SKIP") {
        colSpan++;
        nextC++;
      }

      const x = tableX + c * cellW;
      const yy = tableY + r * cellH;
      const currentCellW = cellW * colSpan;

      const isDay = c === 0;
      ctx.fillStyle = isDay ? "#e0e7ff" : (content === "BREAK" ? "#fef3c7" : "#ffffff");
      ctx.fillRect(x, yy, currentCellW, cellH);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, yy + 0.5, currentCellW - 1, cellH - 1);
      ctx.fillStyle = "#0f172a";
      ctx.font = isDay ? "bold 13px Arial, sans-serif" : "11px Arial, sans-serif";
      const lines = String(content).split("\n");
      let ty = yy + 8;
      for (const line of lines) {
        if (ty > yy + cellH - 12) break;
        ctx.fillText(line, x + 6, ty, currentCellW - 12);
        ty += 14;
      }
    }
  }

  if (teacherSummary.length > 0) {
    let ty = tableY + rowsCount * cellH + 36;
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Teacher Details", tableX, ty);
    ty += 24;

    ctx.fillStyle = "#2563eb";
    ctx.fillRect(tableX, ty, tTableW, tHeaderH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.textAlign = "left";
    const tHeaders = ["Short Form", "Teachers Name", "Designation"];
    let tx = tableX;
    for (let i = 0; i < tHeaders.length; i++) {
      ctx.fillText(tHeaders[i], tx + 8, ty + tHeaderH / 2 - 5);
      tx += tCols[i];
    }
    ty += tHeaderH;

    ctx.font = "11px Arial, sans-serif";
    for (const row of teacherSummary) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(tableX, ty, tTableW, tRowH);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(tableX + 0.5, ty + 0.5, tTableW - 1, tRowH - 1);

      ctx.fillStyle = "#0f172a";
      const designation = row.teacher.department
        ? `${row.teacher.designation}, ${row.teacher.department}`
        : row.teacher.designation;
      const values = [row.teacher.short_name, row.teacher.name, designation];
      tx = tableX;
      for (let i = 0; i < values.length; i++) {
        ctx.fillText(values[i], tx + 8, ty + tRowH / 2 - 4, tCols[i] - 16);
        tx += tCols[i];
      }
      ty += tRowH;
    }
  }

  return canvas;
}

function loadLogoImage(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = "/BAUST.jpeg";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

export async function exportRoutineImage(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const logoImg = await loadLogoImage();
  const canvas = buildRoutineCanvas(data, scope, logoImg);
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 1) {
    const W = canvas.width;
    const H = canvas.height;
    const highCanvas = document.createElement("canvas");
    highCanvas.width = W * dpr;
    highCanvas.height = H * dpr;
    const hctx = highCanvas.getContext("2d")!;
    hctx.scale(dpr, dpr);
    hctx.drawImage(canvas, 0, 0);
    highCanvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${info.slug}.png`);
    }, "image/png");
  } else {
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${info.slug}.png`);
    }, "image/png");
  }
}

export async function exportAllRoutinesImageZip(data: AppData) {
  const zip = new JSZip();
  const logoImg = await loadLogoImage();

  const getCanvasBlob = (scope: RoutineScope): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = buildRoutineCanvas(data, scope, logoImg);
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/png");
    });
  };

  const sectionsFolder = zip.folder("Sections");
  for (const s of data.sections) {
    const scope: RoutineScope = { kind: "section", section_id: s.id };
    const info = getScopeInfo(data, scope);
    const blob = await getCanvasBlob(scope);
    sectionsFolder?.file(`${info.slug}.png`, blob);
  }

  const teachersFolder = zip.folder("Teachers");
  for (const t of data.teachers) {
    const scope: RoutineScope = { kind: "teacher", teacher_id: t.id };
    const info = getScopeInfo(data, scope);
    const blob = await getCanvasBlob(scope);
    teachersFolder?.file(`${info.slug}.png`, blob);
  }

  const roomsFolder = zip.folder("Rooms");
  for (const r of data.rooms) {
    const scope: RoutineScope = { kind: "room", room_id: r.id };
    const info = getScopeInfo(data, scope);
    const blob = await getCanvasBlob(scope);
    roomsFolder?.file(`${info.slug}.png`, blob);
  }

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "All_Routines_Image.zip");
}
