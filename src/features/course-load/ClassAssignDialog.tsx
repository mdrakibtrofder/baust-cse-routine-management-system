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
  CalendarDays,
  MapPin,
} from "lucide-react";
import { COURSE_TYPE_INFO, type Course, type Section, type WeekPattern } from "@/lib/types";
import {
  checkConflicts,
  findAvailableRooms,
  teachersBusyAt,
  teacherUnavailableAt,
  roomUnavailableAt,
  timesOverlap,
  weeksOverlap,
  type Conflict,
} from "@/lib/conflicts";
import { toast } from "sonner";
import { cn, compareDayAndTime, compareTimeValues, sortDays, fmtRange12, fmtDayTitle } from "@/lib/utils";
import { TeacherChip } from "@/components/TeacherBadge";
import { TeacherDetailsDialog } from "@/components/TeacherDetailsDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { CourseDetailsDialog } from "@/components/CourseDetailsDialog";
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
  day: "",
  start: "",
  end: "",
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
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === course.id &&
      x.section_id === section.id,
  );
  const teacherIds = cst?.teacher_ids ?? [];
  const teachers = teacherIds.map((tid) => data.teachers.find((t) => t.id === tid)).filter(Boolean) as NonNullable<
    ReturnType<typeof data.teachers.find>
  >[];
  const info = courseInfo(course);

  const existing = useMemo(
    () =>
      data.class_slots
        .filter(
          (s) =>
            s.semester_id === data.active_semester_id &&
            s.course_id === course.id &&
            s.section_id === section.id,
        )
        .sort(compareDayAndTime),
    [data.class_slots, data.active_semester_id, course.id, section.id],
  );

  const orderedDays = useMemo(() => sortDays(data.days), [data.days]);

  const [drafts, setDrafts] = useState<DraftClass[]>([]);
  const [step, setStep] = useState(0);
  const [showRoomTable, setShowRoomTable] = useState(true);
  const [confirmSave, setConfirmSave] = useState<{ msg: string } | null>(null);
  const [teacherDetailsId, setTeacherDetailsId] = useState<string | null>(null);
  const [showSectionRoutine, setShowSectionRoutine] = useState(false);
  const [showCourseDetails, setShowCourseDetails] = useState(false);
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
    () =>
      data.periods
        .filter((p) => p.kind === info.roomKind)
        .sort((a, b) => compareTimeValues(a.start, b.start)),
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
              <button
                type="button"
                onClick={() => setShowCourseDetails(true)}
                title="Click to see all sections, teachers, rooms for this course"
                className="text-left hover:text-primary transition underline-offset-4 hover:underline"
              >
                {course.code} — {course.name}
              </button>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                Level {course.level} · Term {course.term}
              </Badge>
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <button
                type="button"
                onClick={() => setShowSectionRoutine(true)}
                title="Click to view full section routine"
                className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-primary/10 hover:border-primary/40 transition"
              >
                Section {section.name}
              </button>
              <Badge>{info.label}</Badge>
              <button
                type="button"
                onClick={() => setShowSectionRoutine(true)}
                title="Click to view full section routine"
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium hover:bg-primary/10 transition"
              >
                <Users className="h-3 w-3" />
                {section.total_students} students
              </button>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() => setShowSectionRoutine(true)}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> Full section routine
              </Button>
            </div>
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
                        {fmtDayTitle(d.day)} {fmtRange12(d.start, d.end)}
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-normal leading-relaxed mt-1">
                        {room ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-bold">
                            <MapPin className="h-3 w-3" /> {room.name}
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium italic">
                            Room, Day and Time Slot are not selected
                          </span>
                        )}
                        {st.conflicts.length > 0 && (
                          <Badge variant="destructive" className="px-1.5 py-0 h-4 text-[8px] font-black mt-1.5 block w-fit">
                            {st.conflicts.length} ISSUES
                          </Badge>
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
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTeacherDetailsId(t.id)}
                        className="hover:bg-primary/10 hover:border-primary/40 transition rounded px-1.5 py-0.5 bg-card border cursor-pointer"
                        title="Click to view teacher details"
                      >
                        <TeacherChip teacher={t} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSectionRoutine(true)}
                    title="Click to view full section routine"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-primary/10 hover:border-primary/40 transition"
                  >
                    <Users className="h-3 w-3" />
                    Section {section.name}: {section.total_students}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{info.roomKind === "sessional" ? "Sessional Day" : "Theory Day"}</Label>
                  <Select value={current.day} onValueChange={(v) => setCurrent({ day: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Day" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderedDays.map((d) => (
                        <SelectItem key={d.id} value={d.name}>
                          {fmtDayTitle(d.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{info.roomKind === "sessional" ? "Sessional Timeslot" : "Theory Timeslot"}</Label>
                  <Select value={matchedPeriodId} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a period" />
                    </SelectTrigger>
                    <SelectContent>
                      {applicablePeriods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {fmtRange12(p.start, p.end)} ({p.duration % 60 === 0 ? `${p.duration / 60}h` : `${p.duration}m`})
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
                  <Label>{info.roomKind === "sessional" ? "Sessional Room" : "Theory Room"}</Label>
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
                        // "Fully booked" => every applicable period on current.day is taken (by some other slot)
                        const fullyBooked = applicablePeriods.length > 0 && applicablePeriods.every((p) => {
                          return data.class_slots.some(
                            (slot) =>
                              slot.id !== current.id &&
                              slot.room_id === r.id &&
                              slot.day === current.day &&
                              timesOverlap(slot.start, slot.end, p.start, p.end),
                          );
                        });
                        return (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono">{r.name}</span>
                              <span className="text-xs text-muted-foreground">Capacity {r.capacity}</span>
                              {!capOk && <Badge variant="destructive" className="text-[10px]">small</Badge>}
                              {fullyBooked && <Badge variant="destructive" className="text-[10px]">fully booked</Badge>}
                              {!ok && capOk && !fullyBooked && <Badge variant="outline" className="text-[10px]">conflict</Badge>}
                              {ok && capOk && <Check className="h-3 w-3 text-success" />}
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Embedded room & teacher availability table */}
              <div className="rounded-lg border overflow-hidden">
                <button
                  onClick={() => setShowRoomTable((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 hover:bg-muted transition"
                >
                  <span className="flex items-center gap-2">
                    <TableIcon className="h-3.5 w-3.5" />
                    Room & Teacher Availability
                  </span>
                  {showRoomTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showRoomTable && (
                  <div className="p-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {orderedDays.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setCurrent({ day: d.name })}
                          className={cn(
                            "px-2.5 py-1 text-[11px] font-semibold rounded-md border transition",
                            (current.day || "SUN") === d.name
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card hover:bg-muted border-border text-muted-foreground",
                          )}
                        >
                          {fmtDayTitle(d.name)}
                        </button>
                      ))}
                    </div>
                    <RoomDayGrid
                      course={course}
                      section={section}
                      teacherIds={teacherIds}
                      day={current.day || "SUN"}
                      currentSlotId={current.id}
                      currentRoomId={current.room_id}
                      currentStart={current.start}
                      currentEnd={current.end}
                      siblingDrafts={drafts.filter((_, i) => i !== safeStep).map((d) => ({
                        day: d.day, start: d.start, end: d.end, week: d.week,
                      }))}
                      week={current.week}
                      onPick={(roomId, start, end) => setCurrent({ room_id: roomId, start, end, day: current.day || "SUN" })}
                    />
                  </div>
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
              {drafts.length > 1 && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 px-3">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" /> Clear all
                </Button>
              )}
              {(current.id || current.room_id) && (
                <Button variant="ghost" size="sm" onClick={() => deleteOne(safeStep)} className="h-9 px-3">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" /> 
                  {info.classCount === 1 ? "Clear this class" : "Delete this class"}
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
                    className="h-9 px-4"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  {safeStep < info.classCount - 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep((s) => s + 1)}
                      className="h-9 px-4"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </>
              )}
              <Button
                size="sm"
                onClick={save}
                className="h-9 px-6 font-bold"
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

      <TeacherDetailsDialog
        teacherId={teacherDetailsId}
        open={!!teacherDetailsId}
        onOpenChange={(v) => !v && setTeacherDetailsId(null)}
      />

      <RoutineDialog
        open={showSectionRoutine}
        onOpenChange={setShowSectionRoutine}
        scope={{ kind: "section", section_id: section.id }}
        title={`Section ${section.name} · Level ${section.level}, Term ${section.term}`}
        subtitle={`${course.code} — ${course.name}`}
      />

      <CourseDetailsDialog
        course={showCourseDetails ? course : null}
        open={showCourseDetails}
        onOpenChange={setShowCourseDetails}
      />
    </>
  );
}

/** Inline room × period grid for a given day. Highlights the currently-selected
 * room/period with a blue border. Busy/conflicting cells are still selectable
 * (with a confirmation warning) so users can intentionally accept conflicts. */
function RoomDayGrid({
  course,
  section,
  teacherIds,
  day,
  currentSlotId,
  currentRoomId,
  currentStart,
  currentEnd,
  siblingDrafts = [],
  week,
  onPick,
}: {
  course: Course;
  section: Section;
  teacherIds: string[];
  day: string;
  currentSlotId?: string;
  currentRoomId?: string | null;
  currentStart?: string;
  currentEnd?: string;
  siblingDrafts?: { day: string; start: string; end: string; week: WeekPattern }[];
  week: WeekPattern;
  onPick: (roomId: string, start: string, end: string) => void;
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const confirmDialog = useConfirm();

  const rooms = data.rooms
    .filter((r) => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
    .filter((r) => r.capacity >= section.total_students)
    .sort((a, b) => a.name.localeCompare(b.name));

  const periods = data.periods
    .filter((p) => p.kind === info.roomKind)
    .sort((a, b) => compareTimeValues(a.start, b.start));

  const teacherStatusByPeriod = useMemo(() => {
    const map = new Map<
      string,
      {
        busy?: { teacherId: string; teacherShort?: string; teacherName?: string; courseCode?: string; sectionName?: string };
        unavailable?: { teacherId: string; teacherShort?: string; teacherName?: string; reason?: string };
      }
    >();
    for (const p of periods) {
      const entry: any = {};
      const busy = teachersBusyAt(
        data, teacherIds,
        { day, start: p.start, end: p.end, week },
        currentSlotId,
        { course_id: course.id, section_id: section.id },
      );
      if (busy) {
        const c = data.courses.find((x) => x.id === busy.slot.course_id);
        const s = data.sections.find((x) => x.id === busy.slot.section_id);
        const t = data.teachers.find((x) => x.id === busy.teacherId);
        entry.busy = {
          teacherId: busy.teacherId,
          teacherShort: t?.short_name,
          teacherName: t?.name,
          courseCode: c?.code,
          sectionName: s?.name,
        };
      }
      for (const tid of teacherIds) {
        const u = teacherUnavailableAt(data, tid, { day, start: p.start, end: p.end });
        if (u) {
          const t = data.teachers.find((x) => x.id === tid);
          entry.unavailable = { teacherId: tid, teacherShort: t?.short_name, teacherName: t?.name, reason: u.reason };
          break;
        }
      }
      if (entry.busy || entry.unavailable) map.set(p.id, entry);
    }
    return map;
  }, [data, periods, teacherIds, day, week, currentSlotId, course.id, section.id]);

  function siblingDuplicate(p: { start: string; end: string }) {
    return siblingDrafts.some(
      (sd) => sd.day === day && timesOverlap(sd.start, sd.end, p.start, p.end) && weeksOverlap(sd.week, week),
    );
  }

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

  async function handlePick(roomId: string, p: { start: string; end: string }, issues: string[]) {
    if (issues.length === 0) {
      onPick(roomId, p.start, p.end);
      return;
    }
    const ok = await confirmDialog({
      title: "Select with conflict?",
      description: (
        <div className="space-y-1.5">
          <div>This slot has the following issue{issues.length > 1 ? "s" : ""}:</div>
          <ul className="list-disc pl-5 text-sm">
            {issues.map((m, i) => (
              <li key={i} className="text-destructive">{m}</li>
            ))}
          </ul>
          <div className="text-xs text-muted-foreground pt-1">
            You can still select it — it will appear as a conflict in the error details.
          </div>
        </div>
      ),
      confirmLabel: "Select anyway",
    });
    if (ok) onPick(roomId, p.start, p.end);
  }

  function toneFor(n: number) {
    if (n <= 0) return "bg-success/10 hover:bg-success/25 border-success/30 text-success";
    if (n === 1) return "bg-red-200/70 hover:bg-red-300/70 border-red-300 text-red-900 dark:bg-red-950/40 dark:text-red-100";
    if (n === 2) return "bg-red-400/70 hover:bg-red-500/70 border-red-500 text-red-950 dark:text-red-50";
    return "bg-red-700/80 hover:bg-red-800/80 border-red-900 text-white";
  }

  return (
    <div className="overflow-auto max-h-[40vh]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium border-b border-r min-w-[90px]">Room</th>
            {periods.map((p) => {
              const status = teacherStatusByPeriod.get(p.id);
              const dup = siblingDuplicate(p);
              const issueCount = (status?.busy ? 1 : 0) + (status?.unavailable ? 1 : 0) + (dup ? 1 : 0);
              return (
                <th
                  key={p.id}
                  className={cn(
                    "text-center px-1.5 py-1.5 font-medium border-b border-r min-w-[110px]",
                    issueCount === 1 && "bg-red-200/40",
                    issueCount >= 2 && "bg-red-500/30",
                  )}
                >
                  <div className="font-mono">{fmtRange12(p.start, p.end)}</div>
                  {status?.busy && (
                    <div className="text-[9px] font-normal text-destructive font-mono leading-tight">
                      {status.busy.teacherShort} ({status.busy.teacherName}) assigned in {status.busy.courseCode}
                    </div>
                  )}
                  {status?.unavailable && (
                    <div className="text-[9px] font-normal text-warning font-mono leading-tight">
                      {status.unavailable.teacherShort} unavailable
                      {status.unavailable.reason ? ` (${status.unavailable.reason})` : ""}
                    </div>
                  )}
                  {dup && (
                    <div className="text-[9px] font-normal text-destructive">duplicate slot</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b">
              <td className={cn("px-2 py-1 border-r", currentRoomId === r.id && "bg-primary/5")}>
                <div className="font-mono font-semibold">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">Capacity {r.capacity}</div>
              </td>
              {periods.map((p) => {
                const status = teacherStatusByPeriod.get(p.id);
                const teacherBusy = status?.busy;
                const teacherUnavail = status?.unavailable;
                const booking = findBooking(r.id, p);
                const dup = siblingDuplicate(p);
                const roomUnavail = roomUnavailableAt(data, r.id, { day, start: p.start, end: p.end });
                const isCurrent =
                  currentRoomId === r.id && currentStart === p.start && currentEnd === p.end;

                const issues: string[] = [];
                if (booking) {
                  const c = data.courses.find((c) => c.id === booking.course_id);
                  const s = data.sections.find((s) => s.id === booking.section_id);
                  issues.push(`Room ${r.name} is already booked by ${c?.code} (Sec ${s?.name}) ${fmtRange12(booking.start, booking.end)}.`);
                }
                if (teacherBusy) {
                  issues.push(`${teacherBusy.teacherShort} (${teacherBusy.teacherName}) already assigned in ${teacherBusy.courseCode} (Sec ${teacherBusy.sectionName}) at this time.`);
                }
                if (teacherUnavail) {
                  issues.push(`${teacherUnavail.teacherShort} is unavailable at this time${teacherUnavail.reason ? ` (${teacherUnavail.reason})` : ""}.`);
                }
                if (roomUnavail) {
                  issues.push(`Room ${r.name} is unavailable at this time${roomUnavail.reason ? ` (${roomUnavail.reason})` : ""}.`);
                }
                if (dup) {
                  issues.push(`Another class for this section is already on ${day} ${fmtRange12(p.start, p.end)}.`);
                }

                const conflictCount =
                  (booking ? 1 : 0) + (teacherBusy ? 1 : 0) + (teacherUnavail ? 1 : 0) +
                  (roomUnavail ? 1 : 0) + (dup ? 1 : 0);
                const tone = toneFor(conflictCount);
                const bookedCourse = booking ? data.courses.find((c) => c.id === booking.course_id) : null;
                const bookedSec = booking ? data.sections.find((s) => s.id === booking.section_id) : null;

                let inner: React.ReactNode;
                if (conflictCount === 0) {
                  inner = (
                    <div className={cn("w-full h-full min-h-[44px] flex items-center justify-center rounded border px-1.5 py-1.5 text-[10px] font-medium transition", tone)}>
                      Free
                    </div>
                  );
                } else {
                  inner = (
                    <div className={cn("w-full h-full min-h-[44px] rounded border px-1.5 py-1 text-[10px] cursor-pointer transition space-y-0.5", tone)}>
                      {booking && (
                        <div className="font-semibold truncate">
                          {bookedCourse?.code} · Sec {bookedSec?.name}
                        </div>
                      )}
                      {teacherBusy && (
                        <div className="font-mono truncate">{teacherBusy.teacherShort} assigned</div>
                      )}
                      {teacherUnavail && (
                        <div className="font-mono truncate">{teacherUnavail.teacherShort} unavailable</div>
                      )}
                      {roomUnavail && (
                        <div className="font-mono truncate">room unavailable</div>
                      )}
                      {dup && !booking && !teacherBusy && !teacherUnavail && !roomUnavail && (
                        <div>duplicate</div>
                      )}
                      {dup && (booking || teacherBusy || teacherUnavail || roomUnavail) && (
                        <div className="opacity-80">+ duplicate</div>
                      )}
                    </div>
                  );
                }

                return (
                  <td key={p.id} className="border-r p-0.5 h-full">
                    <button
                      type="button"
                      onClick={() => handlePick(r.id, p, issues)}
                      className={cn(
                        "block w-full h-full text-left rounded transition",
                        isCurrent && "ring-2 ring-blue-500 ring-offset-1 ring-offset-background",
                      )}
                      title={issues.length > 0 ? issues.join(" · ") : "Free — click to select"}
                    >
                      {inner}
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
