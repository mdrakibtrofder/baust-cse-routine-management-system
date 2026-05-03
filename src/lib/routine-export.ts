import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType, HeadingLevel, AlignmentType,
} from "docx";
import type { AppData, ClassSlot } from "@/lib/types";
import { timesOverlap } from "@/lib/conflicts";
import { fmtRange12 } from "@/lib/utils";
import type { RoutineScope } from "@/components/RoutineView";

const DEFAULT_DEPT = "CSE";

function isBreak(name: string) {
  return /break/i.test(name);
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
      slug: `${sentenceCaseDashed(t.name)}-Routine`,
      meta: [
        { label: "Teacher Name", value: t.name },
        { label: "Short Name", value: t.short_name },
        { label: "Designation", value: t.designation },
        { label: "Department", value: t.department },
        { label: "Status", value: t.status },
        { label: "Total Credit", value: Number(t.assigned_credit_hours).toFixed(2) },
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
    return {
      title: `Routine of Level ${s.level} Term ${termRoman} Section ${s.name}`,
      slug: `Level-${s.level}-Term-${termRoman}-Section-${sentenceCaseDashed(s.name)}-Routine`,
      meta: [
        { label: "Department", value: DEFAULT_DEPT },
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

  const header = ["Day", ...periods.map((p) => fmtRange12(p.start, p.end))];
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

  return { header, rows, periods, days, slots };
}

/* =============== EXCEL =============== */
export function exportRoutineExcel(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);

  const aoa: (string | number)[][] = [];
  aoa.push([info.title]);
  aoa.push([]);
  for (const m of info.meta) aoa.push([m.label, m.value]);
  aoa.push([]);
  aoa.push(header);
  for (const r of rows) aoa.push(r);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map(() => ({ wch: 24 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Routine");
  XLSX.writeFile(wb, `${info.slug}.xlsx`);
}

/* =============== PDF =============== */
export function exportRoutinePdf(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(info.title, 40, 32);

  // Metadata block
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  let y = 50;
  for (const m of info.meta) {
    doc.setFont("helvetica", "bold");
    doc.text(`${m.label}:`, 40, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(m.value), 140, y);
    y += 14;
  }
  const startY = y + 6;

  autoTable(doc, {
    head: [header],
    body: rows,
    startY,
    styles: { fontSize: 7, cellPadding: 3, valign: "top" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", fillColor: [219, 234, 254] } },
  });
  doc.save(`${info.slug}.pdf`);
}

/* =============== DOCX =============== */
export async function exportRoutineDocx(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);

  const headerRow = new TableRow({
    children: header.map(
      (h) =>
        new TableCell({
          width: { size: Math.floor(9000 / header.length), type: WidthType.DXA },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: h, bold: true })],
            }),
          ],
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

  const metaParas: Paragraph[] = info.meta.map(
    (m) =>
      new Paragraph({
        children: [
          new TextRun({ text: `${m.label}: `, bold: true }),
          new TextRun({ text: String(m.value) }),
        ],
      }),
  );

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 15840, height: 12240, orientation: "landscape" as any } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(info.title)] }),
          ...metaParas,
          new Paragraph({ children: [new TextRun(" ")] }),
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
  saveAs(blob, `${info.slug}.docx`);
}

/* =============== JSON =============== */
export function exportRoutineJson(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const { slots, periods, days } = buildRoutineMatrix(data, scope);

  const detailedSlots = slots.map((s) => {
    const c = data.courses.find((x) => x.id === s.course_id);
    const sec = data.sections.find((x) => x.id === s.section_id);
    const room = data.rooms.find((x) => x.id === s.room_id);
    const cst = data.course_section_teachers.find(
      (x) =>
        x.semester_id === data.active_semester_id &&
        x.course_id === s.course_id &&
        x.section_id === s.section_id,
    );
    const teachers = (cst?.teacher_ids ?? [])
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

  const payload = {
    title: info.title,
    metadata: Object.fromEntries(info.meta.map((m) => [m.label, m.value])),
    periods: periods.map((p) => ({ name: p.name, start: p.start, end: p.end, kind: p.kind })),
    days: days.map((d) => d.name),
    classes: detailedSlots,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  saveAs(blob, `${info.slug}.json`);
}

/* =============== IMAGE (PNG via canvas) =============== */
export function exportRoutineImage(data: AppData, scope: RoutineScope) {
  const info = getScopeInfo(data, scope);
  const { header, rows } = buildRoutineMatrix(data, scope);

  const cols = header.length;
  const rowsCount = rows.length;
  const padding = 32;
  const titleH = 40;
  const metaLineH = 18;
  const metaH = info.meta.length * metaLineH + (info.meta.length ? 16 : 0);
  const cellW = 170;
  const cellH = 90;
  const headerH = 44;

  const W = padding * 2 + cols * cellW;
  const H = padding * 2 + titleH + metaH + headerH + rowsCount * cellH;

  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(info.title, padding, padding);

  // Metadata
  let y = padding + titleH;
  ctx.font = "12px Arial, sans-serif";
  for (const m of info.meta) {
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillText(`${m.label}:`, padding, y);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px Arial, sans-serif";
    ctx.fillText(String(m.value), padding + 110, y);
    y += metaLineH;
  }
  if (info.meta.length) y += 16;

  // Header row
  const tableX = padding;
  let tableY = y;
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(tableX, tableY, cols * cellW, headerH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < cols; i++) {
    ctx.fillText(header[i], tableX + i * cellW + cellW / 2, tableY + 14);
  }
  tableY += headerH;

  // Body rows
  ctx.textAlign = "left";
  for (let r = 0; r < rowsCount; r++) {
    for (let c = 0; c < cols; c++) {
      const x = tableX + c * cellW;
      const yy = tableY + r * cellH;
      // Cell background
      const isDay = c === 0;
      ctx.fillStyle = isDay ? "#dbeafe" : (rows[r][c] === "BREAK" ? "#fef3c7" : "#ffffff");
      ctx.fillRect(x, yy, cellW, cellH);
      // Border
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, yy + 0.5, cellW - 1, cellH - 1);
      // Text
      ctx.fillStyle = "#0f172a";
      ctx.font = isDay ? "bold 13px Arial, sans-serif" : "11px Arial, sans-serif";
      const lines = String(rows[r][c]).split("\n");
      let ty = yy + 8;
      for (const line of lines) {
        if (ty > yy + cellH - 12) break;
        ctx.fillText(line, x + 6, ty, cellW - 12);
        ty += 14;
      }
    }
  }

  canvas.toBlob((blob) => {
    if (blob) saveAs(blob, `${info.slug}.png`);
  }, "image/png");
}
