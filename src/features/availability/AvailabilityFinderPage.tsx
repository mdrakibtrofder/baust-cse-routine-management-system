import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn, fmtRange12, fmtTime12 } from "@/lib/utils";
import { timesOverlap, teacherUnavailableAt } from "@/lib/conflicts";
import { rankInfoFor } from "@/lib/teacher-rank";
import {
  CalendarClock, UserCheck, UserX, Sparkles, Users, MapPin, BookOpen, Clock,
} from "lucide-react";
import type { ClassSlot, Period, Teacher } from "@/lib/types";

interface BusyEntry {
  teacher: Teacher;
  slot: ClassSlot;
  next: ClassSlot | null;
}

interface CellInfo {
  day: string;
  period: Period;
  busy: BusyEntry[];
  free: { teacher: Teacher; nextSameDay: ClassSlot | null }[];
}

export function AvailabilityFinderPage() {
  const data = useStore();
  const [selected, setSelected] = useState<CellInfo | null>(null);

  const periods = useMemo(
    () => [...data.periods].sort((a, b) => a.start.localeCompare(b.start)),
    [data.periods],
  );
  const days = data.days;

  const slotsBySemester = useMemo(
    () => data.class_slots.filter((s) => s.semester_id === data.active_semester_id),
    [data.class_slots, data.active_semester_id],
  );

  const teacherIdToCstSlots = useMemo(() => {
    const map = new Map<string, ClassSlot[]>();
    for (const t of data.teachers) map.set(t.id, []);
    for (const slot of slotsBySemester) {
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === slot.course_id &&
          x.section_id === slot.section_id,
      );
      if (!cst) continue;
      for (const tid of cst.teacher_ids) {
        map.get(tid)?.push(slot);
      }
    }
    return map;
  }, [data, slotsBySemester]);

  const computeCell = (day: string, p: Period): CellInfo => {
    if (/break/i.test(p.name)) {
      return { day, period: p, busy: [], free: data.teachers.map((t) => ({ teacher: t, nextSameDay: null })) };
    }
    const busy: BusyEntry[] = [];
    const freeOnes: { teacher: Teacher; nextSameDay: ClassSlot | null }[] = [];
    for (const t of data.teachers) {
      const teacherSlots = teacherIdToCstSlots.get(t.id) ?? [];
      const conflicting = teacherSlots.find(
        (s) => s.day === day && timesOverlap(s.start, s.end, p.start, p.end),
      );
      const unavail = teacherUnavailableAt(data, t.id, { day, start: p.start, end: p.end });
      if (conflicting) {
        busy.push({ teacher: t, slot: conflicting, next: null });
      } else if (unavail) {
        busy.push({
          teacher: t,
          slot: {
            id: "u-" + unavail.id,
            semester_id: data.active_semester_id,
            course_id: "",
            section_id: "",
            day,
            start: unavail.start,
            end: unavail.end,
            room_id: null,
            week: "EVERY",
          },
          next: null,
        });
      } else {
        const next = teacherSlots
          .filter((s) => s.day === day && s.start >= p.end)
          .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
        freeOnes.push({ teacher: t, nextSameDay: next });
      }
    }
    return { day, period: p, busy, free: freeOnes };
  };

  return (
    <div>
      <PageHeader
        title="Teacher Availability"
        subtitle="Find teachers free at a given time — useful for proxy classes & emergency coverage"
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="rounded-xl border bg-card p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Click any cell to see who is busy (with their current class) and who is free (with their next class).
          Total teachers: <Badge variant="outline" className="ml-1">{data.teachers.length}</Badge>
        </div>

        <div className="rounded-xl overflow-hidden border bg-card shadow-sm">
          <div className="overflow-auto">
            <table className="w-full border-collapse text-xs [&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border">
              <thead>
                <tr style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                  <th
                    className="text-left px-3 py-3 font-semibold sticky left-0 z-10 border-r-2 border-primary-foreground/20"
                    style={{ background: "var(--primary)" }}
                  >
                    Day
                  </th>
                  {periods.map((p) => (
                    <th
                      key={p.id}
                      className={cn(
                        "px-2 py-3 text-center font-semibold whitespace-nowrap min-w-[120px] border-l border-primary-foreground/20",
                        /break/i.test(p.name) && "bg-amber-400/90 text-amber-950",
                      )}
                    >
                      <div>{fmtTime12(p.start)}</div>
                      <div className="opacity-70 text-[10px]">to</div>
                      <div>{fmtTime12(p.end)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td
                      className="px-3 py-3 font-bold text-primary-foreground align-middle sticky left-0 z-10"
                      style={{ background: "var(--primary)", minWidth: 90 }}
                    >
                      {d.name}
                    </td>
                    {periods.map((p) => {
                      const isBreak = /break/i.test(p.name);
                      if (isBreak) {
                        return (
                          <td key={p.id} className="bg-amber-100/70 text-center p-2 text-amber-900 font-semibold text-[11px]">
                            BREAK
                          </td>
                        );
                      }
                      const info = computeCell(d.name, p);
                      const total = data.teachers.length;
                      const busyN = info.busy.length;
                      const freeN = info.free.length;
                      const ratio = total === 0 ? 0 : busyN / total;
                      const bg =
                        ratio >= 0.8 ? "bg-red-100/80 hover:bg-red-200/80" :
                        ratio >= 0.5 ? "bg-orange-50 hover:bg-orange-100" :
                        ratio >= 0.25 ? "bg-yellow-50 hover:bg-yellow-100" :
                        "bg-emerald-50 hover:bg-emerald-100";
                      return (
                        <td
                          key={p.id}
                          className={cn("p-0 cursor-pointer transition-colors", bg)}
                          onClick={() => setSelected(info)}
                        >
                          <div className="flex flex-col items-center justify-center h-full min-h-[64px] py-2 gap-1">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                              <UserCheck className="h-3 w-3" /> {freeN} free
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
                              <UserX className="h-3 w-3" /> {busyN} busy
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CellDetailsDialog cell={selected} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}

function CellDetailsDialog({
  cell,
  onOpenChange,
}: {
  cell: CellInfo | null;
  onOpenChange: (v: boolean) => void;
}) {
  const data = useStore();
  return (
    <Dialog open={!!cell} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        {cell && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {cell.day} · {fmtRange12(cell.period.start, cell.period.end)}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {cell.free.length} available · {cell.busy.length} busy out of {data.teachers.length} teachers
              </p>
            </DialogHeader>

            <Tabs defaultValue="free" className="mt-2">
              <TabsList>
                <TabsTrigger value="free" className="gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Available ({cell.free.length})
                </TabsTrigger>
                <TabsTrigger value="busy" className="gap-1.5">
                  <UserX className="h-3.5 w-3.5" /> Busy ({cell.busy.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="free" className="mt-3">
                {cell.free.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No teachers free.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {cell.free
                      .sort((a, b) => a.teacher.short_name.localeCompare(b.teacher.short_name))
                      .map(({ teacher, nextSameDay }) => (
                        <FreeRow key={teacher.id} teacher={teacher} nextSameDay={nextSameDay} />
                      ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="busy" className="mt-3">
                {cell.busy.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No teachers busy.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {cell.busy
                      .sort((a, b) => a.teacher.short_name.localeCompare(b.teacher.short_name))
                      .map((b) => (
                        <BusyRow key={teacherKey(b)} entry={b} />
                      ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function teacherKey(b: BusyEntry) {
  return `${b.teacher.id}-${b.slot.id}`;
}

function TeacherChipBig({ teacher }: { teacher: Teacher }) {
  const rank = rankInfoFor(teacher.designation);
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "h-7 w-8 rounded-md flex items-center justify-center text-[11px] font-bold border",
          rank.className,
        )}
      >
        {rank.short}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{teacher.short_name} · {teacher.name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{teacher.designation}</div>
      </div>
    </div>
  );
}

function FreeRow({ teacher, nextSameDay }: { teacher: Teacher; nextSameDay: ClassSlot | null }) {
  const data = useStore();
  const c = nextSameDay ? data.courses.find((x) => x.id === nextSameDay.course_id) : null;
  const room = nextSameDay ? data.rooms.find((x) => x.id === nextSameDay.room_id) : null;
  const sec = nextSameDay ? data.sections.find((x) => x.id === nextSameDay.section_id) : null;
  return (
    <div className="rounded-lg border bg-emerald-50/60 p-3 space-y-2">
      <TeacherChipBig teacher={teacher} />
      <div className="text-[11px] text-muted-foreground border-t pt-2 flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        {nextSameDay ? (
          <>
            Next class:{" "}
            <span className="font-mono text-foreground">{c?.code}</span>
            <span className="text-foreground">· {fmtRange12(nextSameDay.start, nextSameDay.end)}</span>
            {room && <Badge variant="outline" className="text-[9px] py-0 h-4">Room {room.name}</Badge>}
            {sec && c && <Badge variant="outline" className="text-[9px] py-0 h-4">CSE {c.level}-{c.term} {sec.name}</Badge>}
          </>
        ) : (
          <span className="text-emerald-700">No more classes today</span>
        )}
      </div>
    </div>
  );
}

function BusyRow({ entry }: { entry: BusyEntry }) {
  const data = useStore();
  const c = data.courses.find((x) => x.id === entry.slot.course_id);
  const sec = data.sections.find((x) => x.id === entry.slot.section_id);
  const room = data.rooms.find((x) => x.id === entry.slot.room_id);
  const isUnavail = entry.slot.id.startsWith("u-");
  return (
    <div className="rounded-lg border bg-rose-50/60 p-3 space-y-2">
      <TeacherChipBig teacher={entry.teacher} />
      <div className="text-[11px] text-muted-foreground border-t pt-2 space-y-1">
        {isUnavail ? (
          <div className="flex items-center gap-1.5 text-rose-700 font-medium">
            <UserX className="h-3 w-3" />
            Marked unavailable {fmtRange12(entry.slot.start, entry.slot.end)}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-blue-600" />
              <span className="font-mono font-semibold text-foreground">{c?.code}</span>
              <span className="text-foreground/80 truncate">{c?.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[9px] py-0 h-4">
                <Clock className="h-2.5 w-2.5 mr-0.5" /> {fmtRange12(entry.slot.start, entry.slot.end)}
              </Badge>
              {room && (
                <Badge variant="outline" className="text-[9px] py-0 h-4">
                  <MapPin className="h-2.5 w-2.5 mr-0.5" /> Room {room.name}
                </Badge>
              )}
              {sec && c && (
                <Badge variant="outline" className="text-[9px] py-0 h-4">
                  <Users className="h-2.5 w-2.5 mr-0.5" /> CSE {c.level}-{c.term} {sec.name}
                </Badge>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
