import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Trash2, Table as TableIcon, X } from "lucide-react";
import { COURSE_TYPE_INFO, type Course, type Section, type WeekPattern } from "@/lib/types";
import { checkConflicts, findAvailableRooms, timesOverlap, weeksOverlap, type Conflict } from "@/lib/conflicts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DraftClass {
  id?: string;
  day: string;
  start: string;
  end: string;
  room_id: string | null;
  week: WeekPattern;
}

export function ClassAssignDialog({
  open, onOpenChange, course, section,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: Course;
  section: Section;
}) {
  const data = useStore();
  const cst = data.course_section_teachers.find(
    (x) => x.course_id === course.id && x.section_id === section.id,
  );
  const teacherIds = cst?.teacher_ids ?? [];
  const info = COURSE_TYPE_INFO[course.course_type];

  const existing = useMemo(
    () => data.class_slots.filter(s => s.course_id === course.id && s.section_id === section.id),
    [data.class_slots, course.id, section.id]
  );

  const [drafts, setDrafts] = useState<DraftClass[]>([]);
  const [step, setStep] = useState(0);
  const [showRoomTable, setShowRoomTable] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defStart = "08:00";
    const defEnd = info.classDuration === 60 ? "09:00" : "11:00";
    const initial: DraftClass[] = [];
    for (let i = 0; i < info.classCount; i++) {
      const e = existing[i];
      initial.push(e
        ? { id: e.id, day: e.day, start: e.start, end: e.end, room_id: e.room_id, week: e.week }
        : { day: "SUN", start: defStart, end: defEnd, room_id: null, week: info.weekPattern });
    }
    setDrafts(initial);
    setStep(0);
  }, [open, course.id, section.id, info.classCount, info.classDuration, info.weekPattern]);

  // Always compute hooks, even when drafts empty — guard with safe fallback
  const safeStep = Math.min(step, Math.max(drafts.length - 1, 0));
  const current: DraftClass = drafts[safeStep] ?? {
    day: "SUN", start: "08:00", end: "09:00", room_id: null, week: "EVERY",
  };

  const applicablePeriods = useMemo(
    () => data.periods.filter(p => p.kind === info.roomKind),
    [data.periods, info.roomKind]
  );

  const conflicts: Conflict[] = useMemo(() => {
    if (drafts.length === 0) return [];
    return checkConflicts({
      data, course, section, teacherIds,
      candidate: current,
      ignoreSlotId: current.id,
    });
  }, [data, course, section, teacherIds, current, drafts.length]);

  const availableRooms = useMemo(() => {
    if (drafts.length === 0) return [];
    return findAvailableRooms(data, course, section, current, current.id);
  }, [data, course, section, current, drafts.length]);

  const setCurrent = (patch: Partial<DraftClass>) => {
    setDrafts(prev => prev.map((d, i) => i === safeStep ? { ...d, ...patch } : d));
  };

  const setPeriod = (id: string) => {
    const p = data.periods.find(x => x.id === id);
    if (p) setCurrent({ start: p.start, end: p.end });
  };

  const matchedPeriodId = applicablePeriods.find(p => p.start === current.start && p.end === current.end)?.id ?? "";

  const save = () => {
    if (teacherIds.length < info.teachersRequired) {
      toast.error(`Assign ${info.teachersRequired} teacher(s) first.`);
      return;
    }
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const cs = checkConflicts({ data, course, section, teacherIds, candidate: d, ignoreSlotId: d.id });
      if (cs.length) {
        setStep(i);
        toast.error(`Class ${i+1} has unresolved conflicts.`);
        return;
      }
      if (!d.room_id) { setStep(i); toast.error(`Class ${i+1}: pick a room.`); return; }
    }
    data.deleteClassSlotsForCourseSection(course.id, section.id);
    for (const d of drafts) {
      data.upsertClassSlot({
        course_id: course.id, section_id: section.id,
        day: d.day, start: d.start, end: d.end,
        room_id: d.room_id, week: d.week,
      });
    }
    toast.success("Schedule saved");
    onOpenChange(false);
  };

  if (drafts.length === 0) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{course.code} — {course.name}</span>
              <Badge variant="outline">Section {section.name}</Badge>
              <Badge>{info.label}</Badge>
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {info.classCount} class{info.classCount > 1 ? "es" : ""} per week ·{" "}
              {info.classDuration % 60 === 0 ? `${info.classDuration / 60}h` : `${info.classDuration}m`} ·{" "}
              {info.teachersRequired} teacher(s)
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-[180px_1fr] gap-4">
            {/* Left: list view of all classes */}
            <div className="space-y-2 border-r pr-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classes</div>
              {drafts.map((d, i) => {
                const room = data.rooms.find(r => r.id === d.room_id);
                const cs = checkConflicts({ data, course, section, teacherIds, candidate: d, ignoreSlotId: d.id });
                const isActive = i === safeStep;
                return (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={cn(
                      "w-full text-left rounded-md border px-2 py-1.5 text-xs transition",
                      isActive ? "border-primary bg-primary/5" : "hover:border-primary/40",
                      cs.length > 0 && "border-destructive/50"
                    )}
                  >
                    <div className="font-semibold">Class {i + 1}</div>
                    <div className="font-mono text-[11px]">{d.day} {d.start}–{d.end}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {room ? room.name : "no room"}
                      {cs.length > 0 && <span className="text-destructive"> · {cs.length} issue</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: stepper + form */}
            <div className="space-y-4">
              {info.classCount > 1 && (
                <div className="px-2 py-3 rounded-md" style={{ background: "var(--gradient-soft)" }}>
                  <Stepper
                    steps={Array.from({ length: info.classCount }, (_, i) => `Class ${i + 1}`)}
                    current={safeStep}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Day</Label>
                  <Select value={current.day} onValueChange={(v) => setCurrent({ day: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {data.days.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Time slot</Label>
                  <Select value={matchedPeriodId} onValueChange={setPeriod}>
                    <SelectTrigger><SelectValue placeholder="Pick a period" /></SelectTrigger>
                    <SelectContent>
                      {applicablePeriods.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.start}–{p.end} ({p.duration % 60 === 0 ? `${p.duration / 60}h` : `${p.duration}m`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {info.weekPattern !== "EVERY" && (
                <div>
                  <Label>Week pattern</Label>
                  <Select value={current.week} onValueChange={(v: WeekPattern) => setCurrent({ week: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EVEN">Even weeks</SelectItem>
                      <SelectItem value="ODD">Odd weeks</SelectItem>
                      <SelectItem value="EVERY">Every week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Room</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{availableRooms.length} available</span>
                    <Button type="button" variant="outline" size="sm" className="h-6 text-[10px]"
                      onClick={() => setShowRoomTable(true)}>
                      <TableIcon className="h-3 w-3 mr-1" /> Day view
                    </Button>
                  </div>
                </div>
                <Select value={current.room_id ?? ""} onValueChange={(v) => setCurrent({ room_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick a room" /></SelectTrigger>
                  <SelectContent>
                    {data.rooms
                      .filter(r => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
                      .map(r => {
                        const ok = availableRooms.some(ar => ar.id === r.id);
                        const capOk = r.capacity >= section.total_students;
                        return (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono">{r.name}</span>
                              <span className="text-xs text-muted-foreground">cap {r.capacity}</span>
                              {!capOk && <Badge variant="destructive" className="text-[10px]">small</Badge>}
                              {!ok && capOk && <Badge variant="outline" className="text-[10px]">busy</Badge>}
                              {ok && capOk && <Check className="h-3 w-3 text-success" />}
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {conflicts.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict{conflicts.length>1?"s":""} detected
                  </div>
                  <ul className="text-xs text-destructive space-y-1">
                    {conflicts.map((c, i) => <li key={i}>• {c.message}</li>)}
                  </ul>
                  {availableRooms.length > 0 && (
                    <div className="pt-2 border-t border-destructive/20">
                      <div className="text-xs font-medium mb-1.5">Suggested available rooms:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableRooms.slice(0, 8).map(r => (
                          <button key={r.id} onClick={() => setCurrent({ room_id: r.id })}
                            className="text-xs font-mono px-2 py-1 rounded bg-card border hover:border-primary">
                            {r.name} <span className="text-muted-foreground">({r.capacity})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <div>
              {existing.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => {
                  if (confirm("Clear all classes for this section?")) {
                    data.deleteClassSlotsForCourseSection(course.id, section.id);
                    toast.success("Cleared");
                    onOpenChange(false);
                  }
                }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Clear
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {info.classCount > 1 && (
                <>
                  <Button variant="outline" size="sm" disabled={safeStep === 0} onClick={() => setStep(s => s-1)}>
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  {safeStep < info.classCount - 1 ? (
                    <Button size="sm" onClick={() => setStep(s => s+1)}
                      style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={save}
                      style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                      Save Schedule
                    </Button>
                  )}
                </>
              )}
              {info.classCount === 1 && (
                <Button size="sm" onClick={save}
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                  Save Schedule
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RoomDayTableDialog
        open={showRoomTable}
        onOpenChange={setShowRoomTable}
        course={course}
        section={section}
        currentDay={current.day}
        currentSlotId={current.id}
        onPick={(roomId, periodStart, periodEnd, day) => {
          setCurrent({ room_id: roomId, start: periodStart, end: periodEnd, day });
          setShowRoomTable(false);
        }}
      />
    </>
  );
}

/** Day-grid: rooms × periods for the selected day; click any free cell to assign */
function RoomDayTableDialog({
  open, onOpenChange, course, section, currentDay, currentSlotId, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: Course;
  section: Section;
  currentDay: string;
  currentSlotId?: string;
  onPick: (roomId: string, start: string, end: string, day: string) => void;
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const [day, setDay] = useState(currentDay);
  useEffect(() => { if (open) setDay(currentDay); }, [open, currentDay]);

  const rooms = data.rooms
    .filter(r => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
    .filter(r => r.capacity >= section.total_students)
    .sort((a, b) => a.name.localeCompare(b.name));

  const periods = data.periods
    .filter(p => p.kind === info.roomKind)
    .sort((a, b) => a.start.localeCompare(b.start));

  function findBooking(roomId: string, p: { start: string; end: string }) {
    return data.class_slots.find(slot => {
      if (slot.id === currentSlotId) return false;
      if (slot.room_id !== roomId) return false;
      if (slot.day !== day) return false;
      if (!timesOverlap(slot.start, slot.end, p.start, p.end)) return false;
      if (!weeksOverlap(slot.week, "EVERY")) return false;
      return true;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="h-4 w-4" /> Room availability — full day
            <Badge variant="outline">{info.roomKind === "sessional" ? "Sessional" : "Theory"}</Badge>
            <Badge variant="secondary">≥ {section.total_students} seats</Badge>
          </DialogTitle>
          <div className="flex items-center gap-2 mt-2">
            <Label className="text-xs">Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {data.days.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-2">
              Click a green cell to assign that room & time. Red = busy.
            </span>
          </div>
        </DialogHeader>

        <div className="overflow-auto max-h-[60vh] border rounded-md">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-2 py-2 font-medium border-b border-r min-w-[100px]">Room</th>
                {periods.map(p => (
                  <th key={p.id} className="text-center px-2 py-2 font-medium border-b border-r min-w-[110px]">
                    <div className="font-mono">{p.start}–{p.end}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {p.duration % 60 === 0 ? `${p.duration / 60}h` : `${p.duration}m`}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="px-2 py-1.5 border-r">
                    <div className="font-mono font-semibold">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">cap {r.capacity}</div>
                  </td>
                  {periods.map(p => {
                    const booking = findBooking(r.id, p);
                    if (booking) {
                      const c = data.courses.find(c => c.id === booking.course_id);
                      const s = data.sections.find(s => s.id === booking.section_id);
                      return (
                        <td key={p.id} className="border-r p-0.5">
                          <div className="rounded bg-destructive/10 border border-destructive/30 px-1.5 py-1 text-[10px] text-destructive">
                            <div className="font-semibold">{c?.code}</div>
                            <div className="opacity-80">Sec {s?.name}</div>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={p.id} className="border-r p-0.5">
                        <button
                          onClick={() => onPick(r.id, p.start, p.end, day)}
                          className="w-full h-full rounded bg-success/10 border border-success/30 hover:bg-success/25 px-1.5 py-2 text-[10px] text-success font-medium transition"
                        >
                          Free
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rooms.length === 0 && (
                <tr><td colSpan={periods.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  No rooms match the type ({info.roomKind}) and capacity (≥ {section.total_students}).
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
