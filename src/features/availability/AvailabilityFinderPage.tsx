import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NonDepartmentalToggle } from "@/components/NonDepartmentalToggle";
import { TeacherRoutineLink, RoomRoutineLink, SectionRoutineLink } from "@/components/RoutineLink";
import { cn, compareTimeValues, fmtRange12, fmtTime12, sortDays } from "@/lib/utils";
import { timesOverlap, teacherUnavailableAt } from "@/lib/conflicts";
import { rankInfoFor } from "@/lib/teacher-rank";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import {
  CalendarClock, UserCheck, UserX, Sparkles, Users, MapPin, BookOpen, Clock, Search, X,
} from "lucide-react";
import type { ClassSlot, Period, Teacher } from "@/lib/types";

interface BusyEntry {
  teacher: Teacher;
  slot: ClassSlot;
  next: ClassSlot | null;
}

interface FreeEntry {
  teacher: Teacher;
  nextSameDay: ClassSlot | null;
  /** Set when the teacher has no class but IS marked unavailable, and the
   *  "classes only" mode is active — surfaced as a soft warning, not as busy. */
  unavailableNote: string | null;
}

interface CellInfo {
  day: string;
  period: Period;
  busy: BusyEntry[];
  free: FreeEntry[];
}

const matchesTeacher = (t: Teacher, q: string) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    t.short_name.toLowerCase().includes(s) ||
    t.name.toLowerCase().includes(s) ||
    (t.designation ?? "").toLowerCase().includes(s) ||
    (t.department ?? "").toLowerCase().includes(s)
  );
};

/** Shared search field so the page toolbar and the details dialog behave alike. */
function TeacherSearch({
  value,
  onChange,
  placeholder = "Search teacher by short form, name or designation…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative flex-1 min-w-[220px]", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8 h-9 text-xs"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function AvailabilityFinderPage() {
  const data = useStore();
  const [selected, setSelected] = useState<CellInfo | null>(null);
  const [q, setQ] = useState("");
  const [showOtherDepts, setShowOtherDepts] = useState(false);
  /** false (default) = a teacher counts as busy only when they actually have a
   *  class at that time. true = marked unavailability counts as busy too. */
  const [includeUnavailability, setIncludeUnavailability] = useState(false);

  const periods = useMemo(() => {
    const theory = data.periods
      .filter((p) => p.kind === "theory")
      .sort((a, b) => compareTimeValues(a.start, b.start));

    const sessionalExtra = data.periods
      .filter((p) => p.kind === "sessional")
      .filter((sp) => !theory.some((tp) => timesOverlap(sp.start, sp.end, tp.start, tp.end)))
      .sort((a, b) => compareTimeValues(a.start, b.start));

    return [...theory, ...sessionalExtra].sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods]);
  const days = useMemo(() => sortDays(data.days), [data.days]);

  /** Department rule mirrors Routine View / CT View: home-dept (CSE) teachers by
   *  default, other departments only when the toggle is on. */
  const { homeTeachers, otherTeachers } = useMemo(() => {
    const home: Teacher[] = [];
    const other: Teacher[] = [];
    for (const t of data.teachers) {
      ((t.department ?? "").trim().toUpperCase() === HOME_DEPT_SHORT_NAME ? home : other).push(t);
    }
    return { homeTeachers: home, otherTeachers: other };
  }, [data.teachers]);

  /** The pool every count and list on this page is computed from — department
   *  toggle first, then the search box. */
  const pool = useMemo(() => {
    const visible = showOtherDepts ? [...homeTeachers, ...otherTeachers] : homeTeachers;
    return visible
      .filter((t) => matchesTeacher(t, q))
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
  }, [homeTeachers, otherTeachers, showOtherDepts, q]);

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
      return {
        day,
        period: p,
        busy: [],
        free: pool.map((t) => ({ teacher: t, nextSameDay: null, unavailableNote: null })),
      };
    }
    const busy: BusyEntry[] = [];
    const freeOnes: FreeEntry[] = [];
    for (const t of pool) {
      const teacherSlots = teacherIdToCstSlots.get(t.id) ?? [];
      const conflicting = teacherSlots.find(
        (s) => s.day === day && timesOverlap(s.start, s.end, p.start, p.end),
      );
      const unavail = teacherUnavailableAt(data, t.id, { day, start: p.start, end: p.end });
      if (conflicting) {
        busy.push({ teacher: t, slot: conflicting, next: null });
      } else if (unavail && includeUnavailability) {
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
            locked: false,
          },
          next: null,
        });
      } else {
        const next = teacherSlots
          .filter((s) => s.day === day && s.start >= p.end)
          .sort((a, b) => compareTimeValues(a.start, b.start))[0] ?? null;
        freeOnes.push({
          teacher: t,
          nextSameDay: next,
          unavailableNote: unavail
            ? `Marked unavailable ${fmtRange12(unavail.start, unavail.end)}${unavail.reason ? ` · ${unavail.reason}` : ""}`
            : null,
        });
      }
    }
    return { day, period: p, busy, free: freeOnes };
  };

  const singleTeacher = pool.length === 1 ? pool[0] : null;

  return (
    <div>
      <PageHeader
        title="Teacher Availability"
        subtitle="Find teachers free at a given time — useful for proxy classes & emergency coverage"
      />
      <div className="p-4 sm:p-6 space-y-4">
        {/* Toolbar — search + department scope + live counts */}
        <div className="rounded-xl border bg-card p-3 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <TeacherSearch value={q} onChange={setQ} />
            <NonDepartmentalToggle
              checked={showOtherDepts}
              onChange={setShowOtherDepts}
              label="Show other departments' teachers"
              hint={otherTeachers.length ? `(${otherTeachers.length})` : ""}
              title="Include teachers whose department is not CSE — affects every count and list on this page"
            />
            <NonDepartmentalToggle
              checked={includeUnavailability}
              onChange={setIncludeUnavailability}
              label="Count marked unavailability as busy"
              hint="(default: classes only)"
              title="Off — a teacher is busy only when they have a class at that time. On — manually marked unavailable windows count as busy too."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-semibold">
              <Users className="h-3 w-3 text-primary" />
              In view: <span className="text-foreground">{pool.length}</span>
              <span className="opacity-60">/ {data.teachers.length}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-semibold">
              {HOME_DEPT_SHORT_NAME}: <span className="text-foreground">{homeTeachers.length}</span>
            </span>
            {showOtherDepts && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-semibold">
                Other depts: <span className="text-foreground">{otherTeachers.length}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-primary" />
              {singleTeacher
                ? `Showing ${singleTeacher.short_name} only — green means free, red means busy.`
                : "Click any cell for who is free (with their next class) and who is busy (with their current class)."}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 font-semibold">
              Busy means:{" "}
              <span className="text-foreground">
                {includeUnavailability ? "classes + marked unavailability" : "classes only"}
              </span>
            </span>
          </div>
        </div>

        {pool.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/10 py-16 text-center text-sm text-muted-foreground">
            No teacher matches “{q}”.
            {!showOtherDepts && otherTeachers.length > 0 && (
              <div className="mt-1 text-xs">
                Try turning on “Show other departments' teachers”.
              </div>
            )}
          </div>
        ) : (
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
                      const total = pool.length;
                      const busyN = info.busy.length;
                      const freeN = info.free.length;
                      const ratio = total === 0 ? 0 : busyN / total;
                      const bg =
                        ratio >= 0.8 ? "bg-rose-50 hover:bg-rose-100" :
                        ratio >= 0.5 ? "bg-orange-50 hover:bg-orange-100" :
                        ratio >= 0.25 ? "bg-amber-50 hover:bg-amber-100" :
                        "bg-emerald-50 hover:bg-emerald-100";
                      return (
                        <td
                          key={p.id}
                          className={cn("p-1.5 cursor-pointer transition-all", bg)}
                          onClick={() => setSelected(info)}
                          title={`${freeN} free · ${busyN} busy`}
                        >
                          {singleTeacher ? (
                            <div className={cn(
                              "flex flex-col items-center justify-center h-full min-h-[72px] rounded-lg shadow-sm font-black uppercase tracking-wider text-[11px]",
                              freeN ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white",
                            )}>
                              {freeN ? "Free" : "Busy"}
                              <span className="text-[9px] font-bold opacity-80 normal-case tracking-normal">
                                {singleTeacher.short_name}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full min-h-[72px] rounded-lg transition-all shadow-sm bg-white/50 px-1.5 py-2 gap-1.5">
                              <div className="flex items-baseline gap-1">
                                <span className="text-[15px] font-black text-emerald-700 leading-none">{freeN}</span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600/80">free</span>
                              </div>
                              {/* Load bar — how much of the visible pool is busy */}
                              <div className="w-full h-1.5 rounded-full bg-emerald-200/70 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    ratio >= 0.8 ? "bg-rose-500" : ratio >= 0.5 ? "bg-orange-500" : ratio >= 0.25 ? "bg-amber-500" : "bg-emerald-500",
                                  )}
                                  style={{ width: `${Math.round(ratio * 100)}%` }}
                                />
                              </div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-rose-600/70">
                                {busyN} busy
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      <CellDetailsDialog cell={selected} poolSize={pool.length} onOpenChange={(v) => !v && setSelected(null)} />
    </div>
  );
}

function CellDetailsDialog({
  cell,
  poolSize,
  onOpenChange,
}: {
  cell: CellInfo | null;
  poolSize: number;
  onOpenChange: (v: boolean) => void;
}) {
  const [q, setQ] = useState("");

  const free = (cell?.free ?? [])
    .filter((f) => matchesTeacher(f.teacher, q))
    .sort((a, b) => a.teacher.short_name.localeCompare(b.teacher.short_name));
  const busy = (cell?.busy ?? [])
    .filter((b) => matchesTeacher(b.teacher, q))
    .sort((a, b) => a.teacher.short_name.localeCompare(b.teacher.short_name));

  return (
    <Dialog
      open={!!cell}
      onOpenChange={(v) => {
        if (!v) setQ("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        {cell && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {cell.day} · {fmtRange12(cell.period.start, cell.period.end)}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {cell.free.length} available · {cell.busy.length} busy out of {poolSize} teachers in view
              </p>
            </DialogHeader>

            <div className="mt-2 flex items-center gap-2">
              <TeacherSearch value={q} onChange={setQ} placeholder="Filter these teachers…" />
            </div>

            <Tabs defaultValue="free" className="mt-3">
              <TabsList>
                <TabsTrigger value="free" className="gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Available ({free.length})
                </TabsTrigger>
                <TabsTrigger value="busy" className="gap-1.5">
                  <UserX className="h-3.5 w-3.5" /> Busy ({busy.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="free" className="mt-3">
                {free.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {q ? `No available teacher matches “${q}”.` : "No teachers free."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {free.map((f) => (
                      <FreeRow key={f.teacher.id} entry={f} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="busy" className="mt-3">
                {busy.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {q ? `No busy teacher matches “${q}”.` : "No teachers busy."}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {busy.map((b) => (
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

/** Room chip — click opens the room's full routine. */
function RoomChip({ roomId, name }: { roomId: string; name: string }) {
  return (
    <RoomRoutineLink
      roomId={roomId}
      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-orange-900 hover:bg-orange-200"
    >
      <MapPin className="h-2.5 w-2.5" />
      {name}
    </RoomRoutineLink>
  );
}

/** Section chip — click opens the section's full routine. */
function SectionChip({ sectionId, label }: { sectionId: string; label: string }) {
  return (
    <SectionRoutineLink
      sectionId={sectionId}
      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-sky-900 hover:bg-sky-200"
    >
      <Users className="h-2.5 w-2.5" />
      {label}
    </SectionRoutineLink>
  );
}

function TeacherChipBig({ teacher }: { teacher: Teacher }) {
  const rank = rankInfoFor(teacher.designation);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={cn(
          "h-7 w-8 shrink-0 rounded-md flex items-center justify-center text-[11px] font-bold border",
          rank.className,
        )}
        title={rank.label}
      >
        {rank.short}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">
          <TeacherRoutineLink teacherId={teacher.id} className="font-mono text-primary hover:text-primary/80">
            {teacher.short_name}
          </TeacherRoutineLink>
          <span className="text-muted-foreground/60"> · </span>
          <TeacherRoutineLink teacherId={teacher.id} className="hover:text-primary">
            {teacher.name}
          </TeacherRoutineLink>
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {teacher.designation}
          {teacher.department ? ` · ${teacher.department.trim().toUpperCase()}` : ""}
        </div>
      </div>
    </div>
  );
}

function FreeRow({ entry }: { entry: FreeEntry }) {
  const { teacher, nextSameDay, unavailableNote } = entry;
  const data = useStore();
  const c = nextSameDay ? data.courses.find((x) => x.id === nextSameDay.course_id) : null;
  const room = nextSameDay ? data.rooms.find((x) => x.id === nextSameDay.room_id) : null;
  const sec = nextSameDay ? data.sections.find((x) => x.id === nextSameDay.section_id) : null;
  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2 transition hover:shadow-sm",
      unavailableNote ? "border-amber-300 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60",
    )}>
      <TeacherChipBig teacher={teacher} />
      {unavailableNote && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-300/70 bg-amber-100/70 px-2 py-1 text-[10px] font-semibold text-amber-900">
          <UserX className="h-3 w-3 mt-px shrink-0" />
          <span>No class, but {unavailableNote.charAt(0).toLowerCase() + unavailableNote.slice(1)}</span>
        </div>
      )}
      <div className="text-[11px] text-muted-foreground border-t border-emerald-200/70 pt-2 flex items-center gap-1.5 flex-wrap">
        <Clock className="h-3 w-3" />
        {nextSameDay ? (
          <>
            Next class:
            <span className="font-mono font-semibold text-foreground">{c?.code}</span>
            <span className="text-foreground">· {fmtRange12(nextSameDay.start, nextSameDay.end)}</span>
            {room && <RoomChip roomId={room.id} name={`Room ${room.name}`} />}
            {sec && c && <SectionChip sectionId={sec.id} label={`CSE ${c.level}-${c.term} ${sec.name}`} />}
          </>
        ) : (
          <span className="font-semibold text-emerald-700">No more classes today</span>
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
    <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2 transition hover:shadow-sm">
      <TeacherChipBig teacher={entry.teacher} />
      <div className="text-[11px] text-muted-foreground border-t border-rose-200/70 pt-2 space-y-1.5">
        {isUnavail ? (
          <div className="flex items-center gap-1.5 text-rose-700 font-medium">
            <UserX className="h-3 w-3" />
            Marked unavailable {fmtRange12(entry.slot.start, entry.slot.end)}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-3 w-3 text-blue-600 shrink-0" />
              <span className="font-mono font-semibold text-foreground">{c?.code}</span>
              <span className="text-foreground/80 truncate">{c?.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-[9px] py-0 h-4">
                <Clock className="h-2.5 w-2.5 mr-0.5" /> {fmtRange12(entry.slot.start, entry.slot.end)}
              </Badge>
              {room && <RoomChip roomId={room.id} name={`Room ${room.name}`} />}
              {sec && c && <SectionChip sectionId={sec.id} label={`CSE ${c.level}-${c.term} ${sec.name}`} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
