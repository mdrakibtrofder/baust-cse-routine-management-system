import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn, compareTimeValues, fmtTime12, fmtRange12, sortDays, fmtDayTitle } from "@/lib/utils";
import { BookOpen, MapPin, Coffee, FlaskConical, FileSpreadsheet, FileText, FileType, FileJson, Image as ImageIcon } from "lucide-react";
import { COURSE_TYPE_INFO, type ClassSlot } from "@/lib/types";
import { timesOverlap } from "@/lib/conflicts";
import { Button } from "@/components/ui/button";
import {
  exportRoutineExcel, exportRoutinePdf, exportRoutineDocx,
  exportRoutineJson, exportRoutineImage,
} from "@/lib/routine-export";
import { toast } from "sonner";
import { RoutineCourseSummary } from "@/components/RoutineCourseSummary";

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

  const periods = useMemo(
    () => [...data.periods].sort((a, b) => compareTimeValues(a.start, b.start)),
    [data.periods],
  );
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

  // Determine which (day, period) is a "break" — every period kind:theory has a break window
  // Heuristic: a period whose name contains "break" or whose duration <= 40 between two longer periods.
  // Simpler: any period with `name` matching /break/i.
  const isBreak = (pid: string) => {
    const p = data.periods.find((x) => x.id === pid);
    return !!p && /break/i.test(p.name);
  };

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
                {periods.map((p) => (
                  <th
                    key={p.id}
                    className={cn(
                      "px-2 py-3 text-center font-semibold whitespace-nowrap min-w-[110px] border-l border-primary-foreground/20",
                      isBreak(p.id) && "bg-amber-400/90 text-amber-950",
                    )}
                  >
                    <div>{fmtTime12(p.start)}</div>
                    <div className="opacity-70">to</div>
                    <div>{fmtTime12(p.end)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.id} className="border-t">
                  <td
                    className="px-3 py-3 font-bold text-primary-foreground align-top sticky left-0 z-10"
                    style={{ background: "var(--primary)", minWidth: 90 }}
                  >
                    <div className="text-sm uppercase">{fmtDayTitle(d.name)}</div>
                    <div className="text-[10px] font-normal opacity-80">{dayLong(d.name)}</div>
                  </td>
                  {periods.map((p) => {
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
                      (s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end),
                    );
                    // Only render when slot starts at this period (avoid duplicate rendering across spanning periods)
                    const starting = cellSlots.filter((s) => s.start === p.start);
                    if (starting.length === 0) {
                      // a class might span this period but started earlier — render empty (the start cell renders content)
                      const spanning = cellSlots.find((s) => s.start < p.start);
                      if (spanning) return <td key={p.id} className="p-1 align-top bg-muted/20" />;
                      return <td key={p.id} className="p-1 align-top" />;
                    }
                    return (
                      <td key={p.id} className="p-1 align-top">
                        <div className="space-y-1">
                          {starting.map((s) => (
                            <RoutineCell key={s.id} slot={s} />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {days.length === 0 && (
                <tr>
                  <td colSpan={periods.length + 1} className="text-center py-8 text-muted-foreground">
                    No days configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RoutineCourseSummary scope={scope} />
    </div>
  );
}

function RoutineCell({ slot }: { slot: ClassSlot }) {
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
    <div className="rounded-md border bg-background hover:shadow-sm transition px-1.5 py-1.5 text-[11px] space-y-0.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 font-bold">
          {isSessional ? (
            <FlaskConical className="h-3 w-3 text-purple-600" />
          ) : (
            <BookOpen className="h-3 w-3 text-blue-600" />
          )}
          <span className="font-mono">{course.code}</span>
        </div>
        <div className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">
          {fmtRange12(slot.start, slot.end)}
        </div>
      </div>
      {teachers.length > 0 && (
        <div className="font-semibold text-[10px] text-foreground/80 font-mono">
          {teachers.map((t) => t.short_name).join(", ")}
          {slot.week !== "EVERY" && (
            <span className="ml-1 text-fuchsia-600 font-bold">#{slot.week}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {room && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-200">
            <MapPin className="h-2.5 w-2.5" />
            {room.name}
          </span>
        )}
        {section && course && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-mono px-1 py-0.5 rounded border",
              isSessional
                ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                : "bg-sky-100 text-sky-900 border-sky-200",
            )}
          >
            {DEFAULT_DEPT} {course.level}-{course.term} {section.name}
          </span>
        )}
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
