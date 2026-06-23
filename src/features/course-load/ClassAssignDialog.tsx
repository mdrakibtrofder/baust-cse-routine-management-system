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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
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
  Loader2,
  Split,
  UserPlus,
  X,
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
  teacherWouldExceed,
  findAllConflictFreeSlots,
  type Conflict,
} from "@/lib/conflicts";
import { toast } from "sonner";
import { cn, compareDayAndTime, compareTimeValues, sortDays, fmtRange12, fmtDayTitle, tagColorClasses, roomSupportsKind } from "@/lib/utils";
import { RankPill, TeacherChip } from "@/components/TeacherBadge";
import { TeacherDetailsDialog } from "@/components/TeacherDetailsDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { CourseDetailsDialog } from "@/components/CourseDetailsDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const isSessional3 = course.course_type === 'sessional_3.0';

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
  const [confirmSave, setConfirmSave] = useState<{ msg: string; hasConflicts: boolean } | null>(null);
  const [teacherDetailsId, setTeacherDetailsId] = useState<string | null>(null);
  const [showSectionRoutine, setShowSectionRoutine] = useState(false);
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const confirmDialog = useConfirm();

  // Split-teacher mode (only for sessional_3.0): each class has its own teacher
  const [splitMode, setSplitMode] = useState(false);
  const [slotTeacherIds, setSlotTeacherIds] = useState<string[][]>([[], []]);

  const maxTeachers = info.roomKind === "sessional" ? 2 : 1;
  const canAddTeacher = teacherIds.length < maxTeachers;

  useEffect(() => {
    if (!open) return;
    const initial: DraftClass[] = [];
    for (let i = 0; i < info.classCount; i++) {
      const e = existing[i];
      initial.push(
        e
          ? { id: e.id, day: e.day, start: e.start, end: e.end, room_id: e.room_id, week: e.week }
          : { ...EMPTY_CLASS(info), room_id: cst?.primary_room_id ?? null },
      );
    }
    setDrafts(initial);
    setStep(0);
    // Initialize split-teacher state from saved config
    const hasSplit = !!(cst?.slot_teacher_ids?.length);
    setSplitMode(hasSplit);
    setSlotTeacherIds(hasSplit ? (cst!.slot_teacher_ids as string[][]) : [[], []]);
  }, [open, course.id, section.id, info.classCount, info.classDuration, info.weekPattern]);

  const safeStep = Math.min(step, Math.max(drafts.length - 1, 0));

  // In split mode, effective teachers for the current step (used for conflict checking)
  const effectiveTeacherIds = isSessional3 && splitMode ? (slotTeacherIds[safeStep] ?? []) : teacherIds;
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
      teacherIds: effectiveTeacherIds,
      candidate: current,
      ignoreSlotId: current.id,
      siblingDrafts: siblings,
    });
  }, [data, course, section, effectiveTeacherIds, current, drafts, safeStep]);

  const availableRooms = useMemo(() => {
    if (drafts.length === 0) return [];
    const siblings = drafts.filter((_, i) => i !== safeStep).map((d) => ({
      day: d.day, start: d.start, end: d.end, week: d.week,
    }));
    return findAvailableRooms(data, course, section, current, current.id, effectiveTeacherIds, siblings);
  }, [data, course, section, current, drafts, effectiveTeacherIds, safeStep]);

  const globalSuggestions = useMemo(() => {
    if (!open || conflicts.length === 0) return [];
    const siblings = drafts.filter((_, i) => i !== safeStep).map((d) => ({
      day: d.day, start: d.start, end: d.end, week: d.week,
    }));
    return findAllConflictFreeSlots(data, course, section, effectiveTeacherIds, current.id, siblings, current.week);
  }, [data, course, section, effectiveTeacherIds, current.id, current.week, drafts, safeStep, conflicts.length, open]);

  /** Per-class status used for the stepper indicator */
  const draftStatuses = useMemo(
    () =>
      drafts.map((d, idx) => {
        const siblings = drafts.filter((_, i) => i !== idx).map((x) => ({
          day: x.day, start: x.start, end: x.end, week: x.week,
        }));
        const stepTeacherIds = isSessional3 && splitMode ? (slotTeacherIds[idx] ?? []) : teacherIds;
        const cs = checkConflicts({
          data, course, section, teacherIds: stepTeacherIds, candidate: d, ignoreSlotId: d.id, siblingDrafts: siblings,
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

  const persist = async (force = false) => {
    setSubmitting(true);
    try {
      const readySlots = drafts
        .filter((d) => d.room_id && d.day && d.start && d.end)
        .map((d) => ({ day: d.day, start: d.start, end: d.end, room_id: d.room_id!, week: d.week }));
      await data.batchReplaceClassSlots(course.id, section.id, readySlots, force);

      // Persist split-teacher config for sessional_3.0
      if (isSessional3) {
        if (splitMode) {
          const union = [...new Set(slotTeacherIds.flat())];
          await data.setCourseSectionTeachers(course.id, section.id, union, cst?.primary_room_id, slotTeacherIds);
        } else if (cst?.slot_teacher_ids?.length) {
          // Clear split config when switching back to shared mode
          await data.setCourseSectionTeachers(course.id, section.id, teacherIds, cst?.primary_room_id, null);
        }
      }

      toast.success("Schedule saved");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const save = () => {
    const incompleteCount = drafts.filter((d) => !d.room_id).length;
    const conflictCount = draftStatuses.filter((s) => s.conflicts.length > 0).length;
    const total = drafts.length;
    if (incompleteCount > 0 || conflictCount > 0) {
      const filled = total - incompleteCount;
      const parts: string[] = [];
      if (incompleteCount > 0) parts.push(`${filled}/${total} class${total > 1 ? "es" : ""} filled`);
      if (conflictCount > 0) parts.push(`${conflictCount} class${conflictCount > 1 ? "es have" : " has"} conflicts`);
      setConfirmSave({ msg: parts.join(" · "), hasConflicts: conflictCount > 0 });
      return;
    }
    persist(false);
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
        <DialogContent className="max-w-[1200px] max-h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
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
              {(() => {
                const dept = data.departments.find((d) => d.id === course.department_id);
                if (!dept) return null;
                return (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                      tagColorClasses(dept.id, dept.short_name),
                    )}
                  >
                    {dept.short_name}
                  </span>
                );
              })()}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() => setShowSectionRoutine(true)}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> Full section routine
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <span>
                {info.classCount} class{info.classCount > 1 ? "es" : ""} per week ·{" "}
                {info.classDuration % 60 === 0 ? `${info.classDuration / 60}h` : `${info.classDuration}m`} ·{" "}
                {info.teachersRequired} teacher(s)
              </span>
              {isSessional3 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !splitMode;
                    setSplitMode(next);
                    if (!next) setSlotTeacherIds([[], []]);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border transition",
                    splitMode
                      ? "bg-purple-100 text-purple-700 border-purple-300"
                      : "bg-muted text-muted-foreground border-border hover:border-primary"
                  )}
                >
                  <Split className="h-3 w-3" />
                  {splitMode ? "Split teachers (per class)" : "Split teachers"}
                </button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
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
                      isActive ? "border-primary border-2 bg-primary/5 shadow-sm" : "hover:border-primary/40",
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
                        {isSessional3 && splitMode && (() => {
                          const tid = slotTeacherIds[i]?.[0];
                          const t = tid ? data.teachers.find(x => x.id === tid) : null;
                          return t ? (
                            <span className="text-purple-700 font-bold">{t.short_name}</span>
                          ) : (
                            <span className="text-amber-600 italic">No teacher</span>
                          );
                        })()}
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

              {/* Teachers panel — split mode shows per-step picker, shared mode shows global pool */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                {isSessional3 && splitMode ? (
                  /* ── SPLIT MODE: 1 teacher per class slot ── */
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                      <Split className="h-3 w-3 text-purple-600" />
                      Teacher for Class {safeStep + 1}
                    </Label>
                    <TeacherPickerInline
                      selectedId={slotTeacherIds[safeStep]?.[0] ?? null}
                      disabledIds={slotTeacherIds.filter((_, i) => i !== safeStep).flatMap(a => a)}
                      onSelect={(tid) => {
                        setSlotTeacherIds(prev => {
                          const next = [...prev];
                          next[safeStep] = tid ? [tid] : [];
                          return next;
                        });
                      }}
                      course={course}
                      section={section}
                      onViewDetails={(tid) => setTeacherDetailsId(tid)}
                    />
                  </div>
                ) : (
                  /* ── SHARED MODE: global teacher pool ── */
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Teachers ({teachers.length}/{maxTeachers})
                        </Label>
                        {!canAddTeacher && (
                          <div className="text-[9px] text-success font-bold flex items-center gap-1 uppercase">
                            <Check className="h-3 w-3" /> Assigned
                          </div>
                        )}
                      </div>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] gap-2 font-bold bg-white hover:bg-primary hover:text-white transition-all border-slate-200"
                            disabled={!canAddTeacher}
                          >
                            <UserPlus className="h-3.5 w-3.5" /> Add Teacher
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-80 shadow-2xl border-slate-200" align="end">
                          <Command className="rounded-xl">
                            <CommandInput placeholder="Search teachers..." className="h-10 text-xs" />
                            <CommandList className="max-h-72">
                              <CommandEmpty className="py-4 text-xs text-slate-400">No teacher found.</CommandEmpty>
                              <CommandGroup className="p-2">
                                {data.teachers
                                  .sort((a, b) => a.short_name.localeCompare(b.short_name))
                                  .map((t) => {
                                    const isSelected = teacherIds.includes(t.id);
                                    const exceed = teacherWouldExceed(data, t.id, course, section, info.teachersRequired - 1);
                                    return (
                                      <CommandItem
                                        key={t.id}
                                        onSelect={() => {
                                          if (isSelected) {
                                            const next = teacherIds.filter(id => id !== t.id);
                                            data.setCourseSectionTeachers(course.id, section.id, next);
                                          } else if (canAddTeacher) {
                                            const next = [...teacherIds, t.id];
                                            data.setCourseSectionTeachers(course.id, section.id, next);
                                          }
                                        }}
                                        className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <RankPill designation={t.designation} />
                                            <span className="font-mono font-bold text-xs">{t.short_name}</span>
                                            <span className="text-muted-foreground text-[11px] truncate">{t.name}</span>
                                          </div>
                                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5 ml-[26px]">
                                            <span className="truncate">{t.designation}</span>
                                            {t.status && <Badge variant="outline" className="text-[9px] py-0 h-3.5 px-1">{t.status}</Badge>}
                                            <span className={cn("font-medium", exceed.exceeds && "text-destructive font-bold")} title="Assigned / Total">
                                              {Number(exceed.current).toFixed(2)}/{Number(exceed.assigned).toFixed(2)} cr
                                            </span>
                                            {exceed.exceeds && <AlertCircle className="h-3 w-3 text-destructive" />}
                                          </div>
                                        </div>
                                        {isSelected && <Check className="h-4 w-4 text-primary stroke-[3px] ml-2 shrink-0" />}
                                      </CommandItem>
                                    );
                                  })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {teachers.length === 0 ? (
                        <div className="text-[11px] text-slate-400 font-bold italic py-2 w-full text-center border-2 border-dashed border-slate-200 rounded-lg">
                          No teachers assigned yet.
                        </div>
                      ) : (
                        <TooltipProvider>
                          {teachers.map((t) => (
                            <div key={t.id} className="flex items-center gap-1 group animate-in fade-in zoom-in duration-200">
                              <button
                                type="button"
                                onClick={() => setTeacherDetailsId(t.id)}
                                className="hover:scale-105 transition-transform"
                              >
                                <TeacherChip teacher={t} />
                              </button>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = teacherIds.filter(id => id !== t.id);
                                      data.setCourseSectionTeachers(course.id, section.id, next);
                                    }}
                                    className="p-1 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all"
                                  >
                                    <X className="h-3.5 w-3.5 stroke-[3px]" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-slate-800 text-white text-[10px] font-bold">
                                  <p>Remove Teacher</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ))}
                        </TooltipProvider>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-start gap-3">
                <div>
                  <Label>{info.roomKind === "sessional" ? "Sessional Day" : "Theory Day"}</Label>
                  <Select value={current.day} onValueChange={(v) => setCurrent({ day: v })}>
                    <SelectTrigger className="w-[280px]">
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
                    <SelectTrigger className="w-[320px]">
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
                  <SelectTrigger className="w-[320px]">
                    <SelectValue placeholder="Pick a room" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.rooms
                      .filter((r) => roomSupportsKind(r.room_type, info.roomKind))
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
                      teacherIds={effectiveTeacherIds}
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
                  {globalSuggestions.length > 0 ? (
                    <div className="pt-3 border-t border-rose-200/50">
                      <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">
                        Suggested conflict-free slots:
                      </div>
                      <ScrollArea className="h-40">
                        <div className="grid grid-cols-1 gap-1.5 pr-3">
                          {globalSuggestions.slice(0, 40).map((s, idx) => {
                            const isCurrentTime = s.day === current.day && s.start === current.start;
                            return (
                              <button
                                key={`${s.day}-${s.start}-${s.room.id}-${idx}`}
                                onClick={() => setCurrent({ day: s.day, start: s.start, end: s.end, room_id: s.room.id })}
                                className={cn(
                                  "text-[10px] text-left px-3 py-2 rounded-md border transition-all shadow-sm flex items-center justify-between group",
                                  isCurrentTime 
                                    ? "bg-blue-50 border-blue-400 hover:bg-blue-100 text-blue-700" 
                                    : "bg-white border-blue-100 hover:border-emerald-500 hover:bg-emerald-50 text-blue-600 hover:text-emerald-700"
                                )}
                              >
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "font-bold uppercase tracking-tight",
                                      isCurrentTime ? "text-blue-800" : "text-blue-600 group-hover:text-emerald-700"
                                    )}>
                                      {fmtDayTitle(s.day)} {fmtRange12(s.start, s.end)}
                                    </span>
                                    {isCurrentTime && (
                                      <Badge variant="outline" className="text-[7px] py-0 h-3 bg-blue-100 text-blue-700 border-blue-200 uppercase font-black">
                                        Current Time
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-muted-foreground font-medium group-hover:text-emerald-600/80">
                                    Room: <span className={cn("font-bold", isCurrentTime ? "text-blue-900" : "text-foreground group-hover:text-emerald-800")}>{s.room.name}</span> (Capacity: {s.room.capacity})
                                  </span>
                                </div>
                                <Check className="h-3 w-3 opacity-0 group-hover:opacity-100 text-emerald-600" />
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      <div className="mt-2 text-[9px] text-muted-foreground italic text-center">
                        Showing top {Math.min(40, globalSuggestions.length)} out of {globalSuggestions.length} available slots.
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 text-[10px] text-rose-400 italic">
                      No conflict-free slots found for this class across any day or time.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row justify-between sm:justify-between">
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
                disabled={submitting}
                className="h-9 px-6 font-bold"
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
                const force = confirmSave?.hasConflicts ?? false;
                setConfirmSave(null);
                persist(force);
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

/** Single-teacher picker used in split mode (1 teacher per class). */
function TeacherPickerInline({
  selectedId,
  disabledIds,
  onSelect,
  course,
  section,
  onViewDetails,
}: {
  selectedId: string | null;
  disabledIds: string[];
  onSelect: (tid: string | null) => void;
  course: Course;
  section: Section;
  onViewDetails: (tid: string) => void;
}) {
  const data = useStore();
  const selected = selectedId ? data.teachers.find(t => t.id === selectedId) : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 text-[11px] gap-2 font-bold w-full justify-start border-slate-200",
            selected ? "bg-purple-50 border-purple-300 text-purple-800" : "border-dashed text-muted-foreground"
          )}
        >
          {selected ? (
            <>
              <RankPill designation={selected.designation} />
              <span className="font-mono">{selected.short_name}</span>
              <span className="text-muted-foreground truncate font-normal">{selected.name}</span>
            </>
          ) : (
            <><UserPlus className="h-3.5 w-3.5" /> Assign teacher</>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-80 shadow-2xl border-slate-200" align="start">
        <Command className="rounded-xl">
          <CommandInput placeholder="Search teachers..." className="h-10 text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-xs text-slate-400">No teacher found.</CommandEmpty>
            <CommandGroup className="p-2">
              {selected && (
                <CommandItem
                  onSelect={() => onSelect(null)}
                  className="text-destructive text-xs font-bold mb-1"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" /> Clear selection
                </CommandItem>
              )}
              {data.teachers
                .sort((a, b) => a.short_name.localeCompare(b.short_name))
                .map((t) => {
                  const isSelected = t.id === selectedId;
                  const isDisabled = disabledIds.includes(t.id);
                  const exceed = teacherWouldExceed(data, t.id, course, section, 0);
                  return (
                    <CommandItem
                      key={t.id}
                      disabled={isDisabled}
                      onSelect={() => { if (!isDisabled) onSelect(t.id); }}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer",
                        isDisabled && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RankPill designation={t.designation} />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onViewDetails(t.id); }}
                            className="font-mono font-bold text-xs hover:underline"
                          >
                            {t.short_name}
                          </button>
                          <span className="text-muted-foreground text-[11px] truncate">{t.name}</span>
                          {isDisabled && <Badge variant="secondary" className="text-[9px] py-0 h-3.5 px-1">other class</Badge>}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5 ml-[26px]">
                          <span className="truncate">{t.designation}</span>
                          {t.status && <Badge variant="outline" className="text-[9px] py-0 h-3.5 px-1">{t.status}</Badge>}
                          <span className={cn("font-medium", exceed.exceeds && "text-destructive font-bold")} title="Assigned / Total">
                            {Number(exceed.current).toFixed(2)}/{Number(exceed.assigned).toFixed(2)} cr
                          </span>
                          {exceed.exceeds && <AlertCircle className="h-3 w-3 text-destructive" />}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-purple-600 stroke-[3px] ml-2 shrink-0" />}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
    .filter((r) => roomSupportsKind(r.room_type, info.roomKind))
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
    <div className="overflow-auto max-h-[50vh] border rounded-md">
      <table className="w-full text-xs table-fixed border-collapse">
        <thead className="sticky top-0 bg-muted z-20 shadow-sm">
          <tr>
            <th className="sticky left-0 top-0 z-30 text-left px-2 py-1.5 font-bold border-b border-r w-[100px] min-w-[100px] max-w-[100px] bg-muted shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Room</th>
            {periods.map((p) => {
              const status = teacherStatusByPeriod.get(p.id);
              const dup = siblingDuplicate(p);
              const issueCount = (status?.busy ? 1 : 0) + (status?.unavailable ? 1 : 0) + (dup ? 1 : 0);
              return (
                <th
                  key={p.id}
                  className={cn(
                    "text-center px-1.5 py-2 font-bold border-b border-r w-[180px] min-w-[180px] max-w-[180px] whitespace-normal align-top break-words",
                    issueCount === 1 && "bg-red-200/40",
                    issueCount >= 2 && "bg-red-500/30",
                  )}
                >
                  <div className="font-mono text-[11px] mb-1">{fmtRange12(p.start, p.end)}</div>
                  {status?.busy && (
                    <div className="text-[10px] font-bold text-destructive font-mono leading-tight mb-1">
                      {status.busy.teacherShort} assigned in {status.busy.courseCode}
                    </div>
                  )}
                  {status?.unavailable && (
                    <div className="text-[10px] font-bold text-warning font-mono leading-tight mb-1">
                      {status.unavailable.teacherShort} unavailable
                    </div>
                  )}
                  {dup && (
                    <div className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Duplicate</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className={cn("sticky left-0 z-10 px-2 py-2 border-r w-[100px] min-w-[100px] max-w-[100px] bg-muted font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]", currentRoomId === r.id && "bg-primary/10")}>
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
                    <div className={cn("w-full h-full min-h-[44px] flex items-center justify-center rounded border px-1.5 py-1.5 text-[10px] font-black transition uppercase", tone)}>
                      Free
                    </div>
                  );
                } else {
                  inner = (
                    <div className={cn("w-full h-full min-h-[44px] rounded border px-2 py-2 text-[10px] cursor-pointer transition space-y-1.5 whitespace-normal break-words", tone)}>
                      {booking && (
                        <div className="font-black text-xs leading-tight">
                          {bookedCourse?.code} · Sec {bookedSec?.name}
                        </div>
                      )}
                      {teacherBusy && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">{teacherBusy.teacherShort} assigned in {teacherBusy.courseCode}</div>
                      )}
                      {teacherUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">{teacherUnavail.teacherShort} is Unavailable</div>
                      )}
                      {roomUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">Room {r.name} is Unavailable</div>
                      )}
                      {dup && !booking && !teacherBusy && !teacherUnavail && !roomUnavail && (
                        <div className="font-bold leading-tight text-[9px] opacity-90">Another class for this section is already on {day} {fmtRange12(p.start, p.end)}</div>
                      )}  
                      {dup && (booking || teacherBusy || teacherUnavail || roomUnavail) && (
                        <div className="font-black text-[8px] uppercase tracking-tighter opacity-70">+ Duplicate</div>
                      )}
                    </div>
                  );
                }

                return (
                  <td key={p.id} className="border-r p-1 w-[180px] min-w-[180px] max-w-[180px] align-top">
                    <button
                      type="button"
                      onClick={() => handlePick(r.id, p, issues)}
                      className={cn(
                        "block w-full h-full text-left rounded transition-all hover:scale-[0.98]",
                        isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg",
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
