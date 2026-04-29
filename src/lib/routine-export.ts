import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel, AlignmentType } from "docx";
import type { AppData, ClassSlot } from "@/lib/types";
import { timesOverlap } from "@/lib/conflicts";
import type { RoutineScope } from "@/components/RoutineView";

const DEFAULT_DEPT = "CSE";

function isBreak(name: string) {
  return /break/i.test(name);
}

/** Build a 2D matrix [day][period] => string for the routine. */
export function buildRoutineMatrix(data: AppData, scope: RoutineScope) {
  const periods = [...data.periods].sort((a, b) => a.start.localeCompare(b.start));
  const days = data.days;

  const slots = data.class_slots.filter((s) => {
    if (s.semester_id !== data.active_semester_id) return false;
    if (scope.kind === "all") return true;
    if (scope.kind === "room") return s.room_id === scope.room_id;
    if (scope.kind === "section") return s.section_id === scope.section_id;
    const cst = data.course_section_teachers.find(
      (x) =>
        x.semester_id === data.active_semester_id &&
        x.course_id === s.course_id &&
        x.section_id === s.section_id,
    );
    return !!cst && cst.teacher_ids.includes(scope.teacher_id);
  });

  const cellText = (slot: ClassSlot) => {
    const c = data.courses.find((x) => x.id === slot.course_id);
    const sec = data.sections.find((x) => x.id === slot.section_id);
    const room = data.rooms.find((x) => x.id === slot.room_id);
    const cst = data.course_section_teachers.find(
      (x) =>
        x.semester_id === data.active_semester_id &&
        x.course_id === slot.course_id &&
        x.section_id === slot.section_id,
    );
    const teachers = (cst?.teacher_ids ?? [])
      .map((tid) => data.teachers.find((t) => t.id === tid)?.short_name)
      .filter(Boolean)
      .join(", ");
    const sectionTag = sec && c ? `${DEFAULT_DEPT} ${c.level}-${c.term} ${sec.name}` : "";
    return [c?.code ?? "", teachers, room?.name ?? "", sectionTag].filter(Boolean).join("\n");
  };

  const header = ["Day", ...periods.map((p) => `${p.start}-${p.end}`)];
  const rows = days.map((d) => {
    const row: string[] = [d.name];
    for (const p of periods) {
      if (isBreak(p.name)) {
        row.push("BREAK");
        continue;
      }
      const cellSlots = slots.filter(
        (s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end) && s.start === p.start,
      );
      if (cellSlots.length === 0) {
        const spanning = slots.find(
          (s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end) && s.start < p.start,
        );
        row.push(spanning ? "↑" : "");
      } else {
        row.push(cellSlots.map(cellText).join("\n---\n"));
      }
    }
    return row;
  });

  return { header, rows };
}

export function exportRoutineExcel(data: AppData, scope: RoutineScope, filename: string) {
  const { header, rows } = buildRoutineMatrix(data, scope);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Routine");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportRoutinePdf(data: AppData, scope: RoutineScope, title: string, filename: string) {
  const { header, rows } = buildRoutineMatrix(data, scope);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(title, 40, 30);
  autoTable(doc, {
    head: [header],
    body: rows,
    startY: 45,
    styles: { fontSize: 7, cellPadding: 3, valign: "top" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [219, 234, 254] } },
  });
  doc.save(`${filename}.pdf`);
}

export async function exportRoutineDocx(data: AppData, scope: RoutineScope, title: string, filename: string) {
  const { header, rows } = buildRoutineMatrix(data, scope);
  const headerRow = new TableRow({
    children: header.map(
      (h) =>
        new TableCell({
          width: { size: Math.floor(9000 / header.length), type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true })] })],
        }),
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (cell, i) =>
            new TableCell({
              width: { size: Math.floor(9000 / header.length), type: WidthType.DXA },
              children: cell.split("\n").map(
                (line) =>
                  new Paragraph({
                    children: [new TextRun({ text: line, bold: i === 0 })],
                  }),
              ),
            }),
        ),
      }),
  );
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 15840, height: 12240, orientation: "landscape" as any } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(title)] }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: header.map(() => Math.floor(9000 / header.length)),
            rows: [headerRow, ...bodyRows],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}
