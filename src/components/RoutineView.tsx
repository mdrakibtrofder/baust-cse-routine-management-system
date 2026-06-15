import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { cn, compareTimeValues, fmtTime12, fmtRange12, sortDays, fmtDayTitle } from "@/lib/utils";
import { BookOpen, MapPin, Coffee, FlaskConical, FileSpreadsheet, FileText, FileType, FileJson, Image as ImageIcon, Eye } from "lucide-react";
import { COURSE_TYPE_INFO, type ClassSlot } from "@/lib/types";
import { timesOverlap } from "@/lib/conflicts";
import { Button } from "@/components/ui/button";
import {
  exportRoutineExcel, exportRoutinePdf, exportRoutineDocx,
  exportRoutineJson, exportRoutineImage,
} from "@/lib/routine-export";
import { toast } from "sonner";
import { RoutineCourseSummary } from "@/components/RoutineCourseSummary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DEFAULT_DEPT = "CSE";

export type RoutineScope =
  | { kind: "teacher"; teacher_id: string }
  | { kind: "room"; room_id: string }
  | { kind: "section"; section_id: string }
  | { kind: "all" };

/** A grid showing all class meetings for the active semester, filtered by scope.
 *  Days × Periods. Each cell shows: course code, teacher short, room, section.
 *
 *  Mirrors the visual style of the user's reference screenshot.
 */
export function RoutineView({
  scope,
  title,
  subtitle,
}: {
  scope: RoutineScope;
  title?: string;
  subtitle?: string;
}) {
  const data = useStore();

  const [showPreview, setShowPreview] = useState(false);

  const theoryPeriods = useMemo(() => {
    const configured = [...data.periods]
      .filter(p => p.kind === "theory")
      .sort((a, b) => compareTimeValues(a.start, b.start));

    // Find slot times that don't overlap any configured period — synthesize virtual columns
    const allSlots = data.class_slots.filter(s => s.semester_id === data.active_semester_id);
    const synthetic: typeof configured = [];
    const seen = new Set<string>();
    for (const s of allSlots) {
      const key = `${s.start}|${s.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const covered = configured.some(p => timesOverlap(p.start, p.end, s.start, s.end));
      if (!covered) {
        synthetic.push({ id: `__syn__${key}`, name: `${s.start}–${s.end}`, kind: "theory", start: s.start, end: s.end } as any);
      }
    }

    return [...configured, ...synthetic].sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods, data.class_slots, data.active_semester_id]);

  const days = useMemo(() => sortDays(data.days), [data.days]);

  const slots = useMemo(() => {
    return data.class_slots.filter((s) => {
      if (s.semester_id !== data.active_semester_id) return false;
      if (scope.kind === "all") return true;
      if (scope.kind === "room") return s.room_id === scope.room_id;
      if (scope.kind === "section") return s.section_id === scope.section_id;
      // teacher scope: needs cst lookup
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id,
      );
      return !!cst && cst.teacher_ids.includes(scope.teacher_id);
    });
  }, [data, scope]);

  const isBreak = (pid: string) => {
    const p = data.periods.find((x) => x.id === pid);
    return !!p && /break/i.test(p.name);
  };

  // Scale down cell width and font when extra columns are needed
  const BASE_PERIOD_COUNT = 6;
  const totalCount = theoryPeriods.length;
  const needsScale = totalCount > BASE_PERIOD_COUNT;
  const scale = needsScale ? BASE_PERIOD_COUNT / totalCount : 1;
  const colMinWidth = Math.max(72, Math.round(110 * scale));
  const cellFontSize = needsScale ? `${Math.max(9, Math.round(11 * scale))}px` : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        {(title || subtitle) && (
          <div>
            {title && <h2 className="text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <div className="flex gap-1.5 ml-auto flex-wrap">
          <Button size="sm" variant="outline" className="h-7 text-xs bg-primary/5 border-primary/20 text-primary hover:bg-primary/10"
            onClick={() => setShowPreview(true)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { try { exportRoutinePdf(data, scope); } catch (e: any) { toast.error(e.message); } }}>
            <FileText className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { try { exportRoutineExcel(data, scope); } catch (e: any) { toast.error(e.message); } }}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={async () => { try { await exportRoutineDocx(data, scope); } catch (e: any) { toast.error(e.message); } }}>
            <FileType className="h-3.5 w-3.5 mr-1" /> DOCX
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { try { exportRoutineJson(data, scope); } catch (e: any) { toast.error(e.message); } }}>
            <FileJson className="h-3.5 w-3.5 mr-1" /> JSON
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { try { exportRoutineImage(data, scope); } catch (e: any) { toast.error(e.message); } }}>
            <ImageIcon className="h-3.5 w-3.5 mr-1" /> Image
          </Button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border bg-card shadow-sm">
        <div className="overflow-auto">
          <table className="w-full border-collapse text-xs [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
            <thead>
              <tr style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                <th className="text-left px-3 py-3 font-semibold sticky left-0 z-10 border-r-2 border-primary-foreground/20" style={{ background: "var(--primary)" }}>
                  Day
                </th>
                {theoryPeriods.map((p) => (
                  <th
                    key={p.id}
                    className={cn(
                      "px-2 py-3 text-center font-semibold whitespace-nowrap border-l border-primary-foreground/20",
                      isBreak(p.id) && "bg-amber-400/90 text-amber-950",
                    )}
                    style={{ minWidth: colMinWidth, fontSize: cellFontSize }}
                  >
                    <div>{fmtTime12(p.start)}</div>
                    <div className="opacity-70">to</div>
                    <div>{fmtTime12(p.end)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                let skipCount = 0;
                return (
                  <tr key={d.id} className="border-t">
                    <td
                      className="px-3 py-3 font-bold text-primary-foreground align-top sticky left-0 z-10"
                      style={{ background: "var(--primary)", minWidth: 90 }}
                    >
                      <div className="text-sm uppercase">{fmtDayTitle(d.name)}</div>
                      <div className="text-[10px] font-normal opacity-80">{dayLong(d.name)}</div>
                    </td>
                    {theoryPeriods.map((p) => {
                      if (skipCount > 0) {
                        skipCount--;
                        return null;
                      }

                      if (isBreak(p.id)) {
                        return (
                          <td key={p.id} className="bg-amber-100/70 align-middle text-center p-2">
                            <Coffee className="h-4 w-4 mx-auto text-amber-700" />
                            <div className="text-[10px] font-bold text-amber-900 mt-1">BREAK</div>
                            <div className="text-[9px] text-amber-700">
                              {fmtRange12(p.start, p.end)}
                            </div>
                          </td>
                        );
                      }

                      const cellSlots = slots.filter(
                        (s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end)
                      );

                      // Only render when slot starts at this period (avoid duplicate rendering across spanning periods)
                      const starting = cellSlots.filter((s) => s.start === p.start);
                      
                      if (starting.length === 0) {
                        // Check if any class spans this period but started earlier
                        const spanning = cellSlots.find((s) => s.start < p.start);
                        if (spanning) return null; // Should be handled by skipCount or return null
                        return <td key={p.id} className="p-1 align-top" />;
                      }

                      // Calculate colspan
                      const maxColSpan = Math.max(1, ...starting.map(s => {
                        return theoryPeriods.filter(tp => timesOverlap(s.start, s.end, tp.start, tp.end)).length;
                      }));
                      skipCount = maxColSpan - 1;

                      return (
                        <td key={p.id} colSpan={maxColSpan} className="p-1 align-top" style={{ fontSize: cellFontSize }}>
                          <div className="space-y-1">
                            {starting.map((s) => (
                              <RoutineCell key={s.id} slot={s} compact={needsScale} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {days.length === 0 && (
                <tr>
                  <td colSpan={theoryPeriods.length + 1} className="text-center py-8 text-muted-foreground">
                    No days configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoutineCourseSummary scope={scope} />

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto p-0">
          <div className="p-6 space-y-6 bg-white">
            <div className="text-center space-y-1 border-b pb-6">
              <h1 className="text-2xl font-bold uppercase tracking-wider">{title || "Class Routine"}</h1>
              {subtitle && <p className="text-sm text-muted-foreground font-medium uppercase">{subtitle}</p>}
              <p className="text-xs text-muted-foreground mt-2">Generated on {new Date().toLocaleDateString()} · {DEFAULT_DEPT} Department</p>
            </div>
            
            <div className="overflow-x-auto border rounded-lg shadow-sm">
              <table className="w-full border-collapse text-[10px] leading-tight [&_th]:border [&_td]:border [&_th]:border-slate-300 [&_td]:border-slate-300">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-4 font-bold text-center uppercase tracking-wider w-20">Day</th>
                    {theoryPeriods.map((p) => (
                      <th key={p.id} className="px-2 py-4 text-center font-bold min-w-[120px]">
                        <div className="text-[11px] mb-1">{fmtTime12(p.start)} - {fmtTime12(p.end)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    let skipCount = 0;
                    return (
                      <tr key={d.id}>
                        <td className="bg-slate-100 px-3 py-4 font-bold text-center border-r-2 border-slate-300">
                          <div className="text-sm">{fmtDayTitle(d.name)}</div>
                          <div className="text-[8px] font-normal opacity-60 uppercase">{dayLong(d.name)}</div>
                        </td>
                        {theoryPeriods.map((p) => {
                          if (skipCount > 0) { skipCount--; return null; }
                          if (isBreak(p.id)) {
                            return (
                              <td key={p.id} className="bg-amber-50 text-center p-2 align-middle opacity-80">
                                <Coffee className="h-4 w-4 mx-auto text-amber-600 mb-1 opacity-50" />
                                <div className="font-bold text-amber-900 tracking-widest text-[9px]">BREAK</div>
                              </td>
                            );
                          }
                          const cellSlots = slots.filter(s => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end));
                          const starting = cellSlots.filter(s => s.start === p.start);
                          if (starting.length === 0) {
                            if (cellSlots.find(s => s.start < p.start)) return null;
                            return <td key={p.id} className="p-1" />;
                          }
                          const colSpan = Math.max(1, ...starting.map(s => theoryPeriods.filter(tp => timesOverlap(s.start, s.end, tp.start, tp.end)).length));
                          skipCount = colSpan - 1;
                          return (
                            <td key={p.id} colSpan={colSpan} className="p-2 align-top">
                              <div className="space-y-2">
                                {starting.map(s => {
                                  const course = data.courses.find(c => c.id === s.course_id);
                                  const sec = data.sections.find(sec => sec.id === s.section_id);
                                  const room = data.rooms.find(r => r.id === s.room_id);
                                  const cst = data.course_section_teachers.find(x => x.semester_id === data.active_semester_id && x.course_id === s.course_id && x.section_id === s.section_id);
                                  const tshorts = (cst?.teacher_ids ?? []).map(tid => data.teachers.find(t => t.id === tid)?.short_name).filter(Boolean);
                                  return (
                                    <div key={s.id} className="p-2 border rounded bg-slate-50 shadow-sm space-y-1.5 border-slate-200">
                                      <div className="flex justify-between items-start gap-1">
                                        <span className="font-bold text-slate-900">{course?.code}</span>
                                        <div className="flex gap-1">
                                          {tshorts.map(ts => <span key={ts} className="px-1 py-0.5 bg-blue-600 text-white font-bold rounded-[2px] text-[8px]">{ts}</span>)}
                                        </div>
                                      </div>
                                      <div className="text-slate-700 font-medium text-[9px] truncate">{course?.name}</div>
                                      <div className="flex gap-1.5 pt-1">
                                        <span className="px-1.5 py-0.5 bg-orange-500 text-white font-bold rounded-[2px] text-[8px] flex items-center gap-0.5">
                                          <MapPin className="h-2 w-2" /> {room?.name}
                                        </span>
                                        <span className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold rounded-[2px] text-[8px]">
                                          {sec?.name}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-6 border-t">
              <div className="text-lg font-bold text-slate-800 mb-4 uppercase tracking-tight flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Course Load Summary
              </div>
              <RoutineCourseSummary scope={scope} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoutineCell({ slot, compact }: { slot: ClassSlot; compact?: boolean }) {
  const data = useStore();
  const course = data.courses.find((c) => c.id === slot.course_id);
  const section = data.sections.find((s) => s.id === slot.section_id);
  const room = data.rooms.find((r) => r.id === slot.room_id);
  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === slot.course_id &&
      x.section_id === slot.section_id,
  );
  const teachers = (cst?.teacher_ids ?? [])
    .map((tid) => data.teachers.find((t) => t.id === tid))
    .filter(Boolean) as { short_name: string }[];

  if (!course) return null;
  const info = COURSE_TYPE_INFO[course.course_type];
  const isSessional = info.roomKind === "sessional";

  return (
    <div className={cn("rounded-lg border bg-background hover:shadow-md transition-all border-border/60", compact ? "px-1 py-1 text-[9px] space-y-1" : "px-2 py-2 text-[11px] space-y-2")}>
      <div className="flex items-start justify-between gap-1">
        <div className={cn("flex items-center gap-1 font-bold", compact ? "text-xs" : "text-sm")}>
          {isSessional ? (
            <FlaskConical className={compact ? "h-2.5 w-2.5 text-purple-600" : "h-3.5 w-3.5 text-purple-600"} />
          ) : (
            <BookOpen className={compact ? "h-2.5 w-2.5 text-blue-600" : "h-3.5 w-3.5 text-blue-600"} />
          )}
          <span className="font-mono">{course.code}</span>
        </div>
        <div className="flex flex-col gap-0.5 items-end">
          {teachers.map((t) => (
            <span key={t.short_name} className={cn("rounded bg-blue-100 text-blue-800 font-bold uppercase", compact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[9px]")}>
              {t.short_name}
            </span>
          ))}
          {slot.week !== "EVERY" && (
            <span className={cn("rounded bg-fuchsia-100 text-fuchsia-800 font-bold uppercase", compact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[9px]")}>
              #{slot.week}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap pt-0.5">
        {room && (
          <span className={cn("inline-flex items-center gap-0.5 font-bold rounded bg-orange-500 text-white shadow-sm", compact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[10px]")}>
            <MapPin className={compact ? "h-1.5 w-1.5" : "h-2.5 w-2.5"} />
            {room.name}
          </span>
        )}
        {section && course && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-bold rounded shadow-sm",
              compact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[10px]",
              isSessional ? "bg-emerald-500 text-white" : "bg-sky-500 text-white",
            )}
          >
            {DEFAULT_DEPT} {course.level}-{course.term} {section.name}
          </span>
        )}
      </div>
      <div className={cn("font-mono text-muted-foreground border-t border-dashed", compact ? "text-[7px] pt-0.5" : "text-[9px] pt-1")}>
        {fmtRange12(slot.start, slot.end)}
      </div>
    </div>
  );
}

function dayLong(d: string) {
  const map: Record<string, string> = {
    SUN: "Sunday",
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
  };
  return map[d.toUpperCase()] ?? d;
}
