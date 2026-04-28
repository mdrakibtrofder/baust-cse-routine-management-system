import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Table as TableIcon,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { COURSE_TYPE_INFO, type Course, type Section, type WeekPattern } from "@/lib/types";
import {
  checkConflicts,
  findAvailableRooms,
  teachersBusyAt,
  timesOverlap,
  weeksOverlap,
  type Conflict,
} from "@/lib/conflicts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TeacherChip } from "@/components/TeacherBadge";
import { TeacherDetailsDialog } from "@/components/TeacherDetailsDialog";
import { useConfirm } from "@/components/ConfirmDialog";

interface DraftClass {
  id?: string;
  day: string;
  start: string;
  end: string;
  room_id: string | null;
  week: WeekPattern;
}

const EMPTY_CLASS = (info: ReturnType<typeof courseInfo>): DraftClass => ({
  day: "SUN",
  start: "08:00",
  end: info.classDuration === 60 ? "09:00" : "11:00",
  room_id: null,
  week: info.weekPattern,
});

function courseInfo(course: Course) {
  return COURSE_TYPE_INFO[course.course_type];
}

export function ClassAssignDialog({
  open,
  onOpenChange,
  course,
  section,
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
  const teachers = teacherIds.map((tid) => data.teachers.find((t) => t.id === tid)).filter(Boolean) as NonNullable<
    ReturnType<typeof data.teachers.find>
  >[];
  const info = courseInfo(course);

  const existing = useMemo(
    () => data.class_slots.filter((s) => s.course_id === course.id && s.section_id === section.id),
    [data.class_slots, course.id, section.id],
  );

  const [drafts, setDrafts] = useState<DraftClass[]>([]);
  const [step, setStep] = useState(0);
  const [showRoomTable, setShowRoomTable] = useState(true);
  const [confirmSave, setConfirmSave] = useState<{ msg: string } | null>(null);
  const [teacherDetailsId, setTeacherDetailsId] = useState<string | null>(null);
  const confirmDialog = useConfirm();

  useEffect(() => {
    if (!open) return;
    const initial: DraftClass[] = [];
    for (let i = 0; i < info.classCount; i++) {
      const e = existing[i];
      initial.push(
        e
          ? { id: e.id, day: e.day, start: e.start, end: e.end, room_id: e.room_id, week: e.week }
          : EMPTY_CLASS(info),
      );
    }
    setDrafts(initial);
    setStep(0);
  }, [open, course.id, section.id, info.classCount, info.classDuration, info.weekPattern]);

  const safeStep = Math.min(step, Math.max(drafts.length - 1, 0));
  const current: DraftClass = drafts[safeStep] ?? EMPTY_CLASS(info);

  const applicablePeriods = useMemo(
    () => data.periods.filter((p) => p.kind === info.roomKind),
    [data.periods, info.roomKind],
  );

  const conflicts: Conflict[] = useMemo(() => {
    if (drafts.length === 0) return [];
    const siblings = drafts.filter((_, i) => i !== safeStep).map((d) => ({
      day: d.day, start: d.start, end: d.end, week: d.week,
    }));
    return checkConflicts({
      data,
      course,
      section,
      teacherIds,
      candidate: current,
      ignoreSlotId: current.id,
      siblingDrafts: siblings,
    });
  }, [data, course, section, teacherIds, current, drafts, safeStep]);

  const availableRooms = useMemo(() => {
    if (drafts.length === 0) return [];
    return findAvailableRooms(data, course, section, current, current.id, teacherIds);
  }, [data, course, section, current, drafts.length, teacherIds]);

  /** Per-class status used for the stepper indicator */
  const draftStatuses = useMemo(
    () =>
      drafts.map((d, idx) => {
        const siblings = drafts.filter((_, i) => i !== idx).map((x) => ({
          day: x.day, start: x.start, end: x.end, week: x.week,
        }));
        const cs = checkConflicts({
          data, course, section, teacherIds, candidate: d, ignoreSlotId: d.id, siblingDrafts: siblings,
        });
        const incomplete = !d.room_id;
        return { conflicts: cs, incomplete };
      }),
    [drafts, data, course, section, teacherIds],
  );

  const setCurrent = (patch: Partial<DraftClass>) => {
    setDrafts((prev) => prev.map((d, i) => (i === safeStep ? { ...d, ...patch } : d)));
  };

  const setPeriod = (id: string) => {
    const p = data.periods.find((x) => x.id === id);
    if (p) setCurrent({ start: p.start, end: p.end });
  };

  const matchedPeriodId = applicablePeriods.find(
    (p) => p.start === current.start && p.end === current.end,
  )?.id ?? "";

  const persist = () => {
    data.deleteClassSlotsForCourseSection(course.id, section.id);
    for (const d of drafts) {
      if (!d.room_id) continue; // skip incomplete
      data.upsertClassSlot({
        course_id: course.id,
        section_id: section.id,
        day: d.day,
        start: d.start,
        end: d.end,
        room_id: d.room_id,
        week: d.week,
      });
    }
    toast.success("Schedule saved");
    onOpenChange(false);
  };

  const save = () => {
    if (teacherIds.length < info.teachersRequired) {
      toast.error(`Assign ${info.teachersRequired} teacher(s) first.`);
      return;
    }
    const incompleteCount = drafts.filter((d) => !d.room_id).length;
    const conflictCount = draftStatuses.filter((s) => s.conflicts.length > 0).length;
    const total = drafts.length;
    if (incompleteCount > 0 || conflictCount > 0) {
      const filled = total - incompleteCount;
      const parts: string[] = [];
      if (incompleteCount > 0) parts.push(`${filled}/${total} class${total > 1 ? "es" : ""} filled`);
      if (conflictCount > 0) parts.push(`${conflictCount} class${conflictCount > 1 ? "es have" : " has"} conflicts`);
      setConfirmSave({ msg: parts.join(" · ") });
      return;
    }
    persist();
  };

  /** Delete one class (reset its draft to empty) */
  const deleteOne = async (idx: number) => {
    const d = drafts[idx];
    const ok = await confirmDialog({
      title: `Delete Class ${idx + 1}?`,
      description: d?.room_id
        ? `This will clear the assigned room and time for Class ${idx + 1}.`
        : `Reset Class ${idx + 1} to default values.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    if (d?.id) data.deleteClassSlot(d.id);
    setDrafts((prev) => prev.map((x, i) => (i === idx ? EMPTY_CLASS(info) : x)));
    toast.success(`Class ${idx + 1} cleared`);
  };

  const clearAll = async () => {
    const ok = await confirmDialog({
      title: "Clear all classes?",
      description: `This will remove all ${info.classCount} class assignments for ${course.code} (Section ${section.name}).`,
      destructive: true,
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    data.deleteClassSlotsForCourseSection(course.id, section.id);
    setDrafts(Array.from({ length: info.classCount }, () => EMPTY_CLASS(info)));
    setStep(0);
    toast.success("All classes cleared");
  };

  if (drafts.length === 0) return null;

  const stepperItems = drafts.map((_, i) => ({
    label: `Class ${i + 1}`,
    hasIssue: draftStatuses[i].conflicts.length > 0 || draftStatuses[i].incomplete,
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>
                {course.code} — {course.name}
              </span>
              <Badge variant="outline">Section {section.name}</Badge>
              <Badge>{info.label}</Badge>
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {section.total_students} students
              </Badge>
            </DialogTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {info.classCount} class{info.classCount > 1 ? "es" : ""} per week ·{" "}
              {info.classDuration % 60 === 0 ? `${info.classDuration / 60}h` : `${info.classDuration}m`} ·{" "}
              {info.teachersRequired} teacher(s)
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-[180px_1fr] gap-4">
            {/* Left: list view */}
            <div className="space-y-2 md:border-r md:pr-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Classes
              </div>
              {drafts.map((d, i) => {
                const room = data.rooms.find((r) => r.id === d.room_id);
                const st = draftStatuses[i];
                const isActive = i === safeStep;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs transition group",
                      isActive ? "border-primary bg-primary/5" : "hover:border-primary/40",
                      st.conflicts.length > 0 && "border-destructive/50",
                    )}
                  >
                    <button onClick={() => setStep(i)} className="w-full text-left">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">Class {i + 1}</div>
                        {(d.id || d.room_id) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOne(i);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition text-destructive hover:text-destructive/80"
                            title="Delete this class"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="font-mono text-[11px]">
                        {d.day} {d.start}–{d.end}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {room ? room.name : <span className="text-warning">no room</span>}
                        {st.conflicts.length > 0 && (
                          <span className="text-destructive"> · {st.conflicts.length} issue</span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right: form */}
            <div className="space-y-4">
              {info.classCount > 1 && (
                <div className="px-2 py-3 rounded-md" style={{ background: "var(--gradient-soft)" }}>
                  <Stepper steps={stepperItems} current={safeStep} onSelect={setStep} />
                </div>
              )}

              {/* Teachers + section info — read-only label */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground m-0">
                      {teachers.length > 1 ? "Teachers" : "Teacher"}
                    </Label>
                    {teachers.length === 0 && (
                      <span className="text-xs text-destructive">Not assigned — set in Course Load grid</span>
                    )}
                    {teachers.map((t) => (
                      <TeacherChip key={t.id} teacher={t} className="bg-card border rounded px-1.5 py-0.5" />
                    ))}
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <Users className="h-3 w-3" />
                    Section {section.name}: {section.total_students}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Day</Label>
                  <Select value={current.day} onValueChange={(v) => setCurrent({ day: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.days.map((d) => (
                        <SelectItem key={d.id} value={d.name}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Time slot</Label>
                  <Select value={matchedPeriodId} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a period" />
                    </SelectTrigger>
                    <SelectContent>
                      {applicablePeriods.map((p) => (
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <span className="text-xs text-muted-foreground">{availableRooms.length} available</span>
                </div>
                <Select value={current.room_id ?? ""} onValueChange={(v) => setCurrent({ room_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a room" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.rooms
                      .filter((r) => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
                      .map((r) => {
                        const ok = availableRooms.some((ar) => ar.id === r.id);
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

              {/* Embedded room availability table */}
              <div className="rounded-lg border overflow-hidden">
                <button
                  onClick={() => setShowRoomTable((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 hover:bg-muted transition"
                >
                  <span className="flex items-center gap-2">
                    <TableIcon className="h-3.5 w-3.5" />
                    Room availability — {current.day} (rooms × periods, includes teacher availability)
                  </span>
                  {showRoomTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showRoomTable && (
                  <RoomDayGrid
                    course={course}
                    section={section}
                    teacherIds={teacherIds}
                    day={current.day}
                    currentSlotId={current.id}
                    week={current.week}
                    onPick={(roomId, start, end) => setCurrent({ room_id: roomId, start, end })}
                  />
                )}
              </div>

              {conflicts.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-destructive text-sm">
                    <AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict
                    {conflicts.length > 1 ? "s" : ""} detected
                  </div>
                  <ul className="text-xs text-destructive space-y-1">
                    {conflicts.map((c, i) => (
                      <li key={i}>• {c.message}</li>
                    ))}
                  </ul>
                  {availableRooms.length > 0 && (
                    <div className="pt-2 border-t border-destructive/20">
                      <div className="text-xs font-medium mb-1.5">Suggested available rooms:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableRooms.slice(0, 8).map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setCurrent({ room_id: r.id })}
                            className="text-xs font-mono px-2 py-1 rounded bg-card border hover:border-primary"
                          >
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
            <div className="flex gap-2">
              {existing.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Clear all
                </Button>
              )}
              {(current.id || current.room_id) && (
                <Button variant="ghost" size="sm" onClick={() => deleteOne(safeStep)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Delete this class
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {info.classCount > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeStep === 0}
                    onClick={() => setStep((s) => s - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  {safeStep < info.classCount - 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep((s) => s + 1)}
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
              <Button
                size="sm"
                onClick={save}
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                Save Schedule
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmSave} onOpenChange={(v) => !v && setConfirmSave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Save with warnings?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSave?.msg}. Classes without a room will be left unscheduled. You can come back any time to fix
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSave(null);
                persist();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Inline room × period grid for a given day (also greys-out periods where the
 * assigned teacher(s) are busy elsewhere). */
function RoomDayGrid({
  course,
  section,
  teacherIds,
  day,
  currentSlotId,
  week,
  onPick,
}: {
  course: Course;
  section: Section;
  teacherIds: string[];
  day: string;
  currentSlotId?: string;
  week: WeekPattern;
  onPick: (roomId: string, start: string, end: string) => void;
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];

  const rooms = data.rooms
    .filter((r) => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
    .filter((r) => r.capacity >= section.total_students)
    .sort((a, b) => a.name.localeCompare(b.name));

  const periods = data.periods.filter((p) => p.kind === info.roomKind).sort((a, b) => a.start.localeCompare(b.start));

  const teacherBusyByPeriod = useMemo(() => {
    const map = new Map<string, { teacherId: string; courseCode?: string; sectionName?: string }>();
    for (const p of periods) {
      const busy = teachersBusyAt(
        data,
        teacherIds,
        { day, start: p.start, end: p.end, week },
        currentSlotId,
        { course_id: course.id, section_id: section.id },
      );
      if (busy) {
        const c = data.courses.find((x) => x.id === busy.slot.course_id);
        const s = data.sections.find((x) => x.id === busy.slot.section_id);
        map.set(p.id, { teacherId: busy.teacherId, courseCode: c?.code, sectionName: s?.name });
      }
    }
    return map;
  }, [data, periods, teacherIds, day, week, currentSlotId, course.id, section.id]);

  function findBooking(roomId: string, p: { start: string; end: string }) {
    return data.class_slots.find((slot) => {
      if (slot.id === currentSlotId) return false;
      if (slot.room_id !== roomId) return false;
      if (slot.day !== day) return false;
      if (!timesOverlap(slot.start, slot.end, p.start, p.end)) return false;
      if (!weeksOverlap(slot.week, week)) return false;
      return true;
    });
  }

  return (
    <div className="overflow-auto max-h-[40vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium border-b border-r min-w-[90px]">Room</th>
            {periods.map((p) => {
              const teacherBusy = teacherBusyByPeriod.get(p.id);
              return (
                <th
                  key={p.id}
                  className={cn(
                    "text-center px-1.5 py-1.5 font-medium border-b border-r min-w-[100px]",
                    teacherBusy && "bg-warning/10",
                  )}
                >
                  <div className="font-mono">
                    {p.start}–{p.end}
                  </div>
                  {teacherBusy && (
                    <div className="text-[9px] font-normal text-warning">
                      teacher busy ({teacherBusy.courseCode})
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="px-2 py-1 border-r">
                <div className="font-mono font-semibold">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">cap {r.capacity}</div>
              </td>
              {periods.map((p) => {
                const teacherBusy = teacherBusyByPeriod.get(p.id);
                const booking = findBooking(r.id, p);
                if (booking) {
                  const c = data.courses.find((c) => c.id === booking.course_id);
                  const s = data.sections.find((s) => s.id === booking.section_id);
                  return (
                    <td key={p.id} className="border-r p-0.5">
                      <div className="rounded bg-destructive/10 border border-destructive/30 px-1.5 py-1 text-[10px] text-destructive">
                        <div className="font-semibold">{c?.code}</div>
                        <div className="opacity-80">Sec {s?.name}</div>
                      </div>
                    </td>
                  );
                }
                if (teacherBusy) {
                  return (
                    <td key={p.id} className="border-r p-0.5">
                      <div className="rounded bg-warning/10 border border-warning/30 px-1.5 py-1 text-[10px] text-warning-foreground/80">
                        teacher busy
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={p.id} className="border-r p-0.5">
                    <button
                      onClick={() => onPick(r.id, p.start, p.end)}
                      className="w-full h-full rounded bg-success/10 border border-success/30 hover:bg-success/25 px-1.5 py-1.5 text-[10px] text-success font-medium transition"
                    >
                      Free
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td colSpan={periods.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                No rooms match the type ({info.roomKind}) and capacity (≥ {section.total_students}).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
