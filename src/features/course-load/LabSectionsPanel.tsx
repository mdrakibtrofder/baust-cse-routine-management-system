import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { Course, Section, WeekPattern } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FlaskConical,
  Plus,
  Trash2,
  Users,
  MapPin,
  Calendar,
  Check,
  AlertCircle,
  X,
  Lock,
  Unlock,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Table as TableIcon
} from "lucide-react";
import {
  cn,
  sortDays,
  fmtDayTitle,
  roomSupportsKind,
  fmtRange12,
  compareDayAndTime,
  compareTimeValues,
} from "@/lib/utils";
import { partitionRoomsForCourse, roomAllowedForCourse } from "@/lib/room-dept";
import { Checkbox } from "@/components/ui/checkbox";
import {
  roomUnavailableAt,
  teacherUnavailableAt,
  timesOverlap,
  weeksOverlap,
} from "@/lib/conflicts";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { RankPill, TeacherChip } from "@/components/TeacherBadge";
import { useConfirm } from "@/components/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RoomPicker } from "./RoomPicker";

interface SlotDraft {
  id?: string;
  day: string;
  start: string;
  end: string;
  room_id: string;
  week: WeekPattern;
  locked?: boolean;
}

interface LabSectionDraft {
  id?: string;
  label: string;
  section_ids: string[];
  teacher_ids: string[];
  primary_room_id: string | null;
  slots: SlotDraft[];
}

interface Props {
  course: Course;
  sections: Section[];
  open: boolean;
  onClose: () => void;
}

export function LabSectionsPanel({ course, sections, open, onClose }: Props) {
  const data = useStore();
  const { saveLabSections, deleteLabSection, batchReplaceLabSectionSlots, upsertClassSlot } = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const orderedDays = useMemo(() => sortDays(data.days), [data.days]);
  const confirmDialog = useConfirm();

  const maxSlotsPerSection = course.credit === 1.5 ? 1 : Math.ceil(course.credit / 3);

  const applicablePeriods = useMemo(
    () => data.periods.filter((p) => p.kind === info.roomKind && !p.is_break).sort((a, b) => a.start.localeCompare(b.start)),
    [data.periods, info.roomKind],
  );

  const existing = useMemo(
    () =>
      data.course_lab_sections.filter(
        (g) => g.course_id === course.id && g.semester_id === data.active_semester_id,
      ),
    [data.course_lab_sections, course.id, data.active_semester_id],
  );

  // Helper to construct slots padded to maxSlotsPerSection
  const buildPaddedSlots = (existingSlots: any[]) => {
    return [...Array(maxSlotsPerSection)].map((_, si) => {
      const s = existingSlots[si];
      return s
        ? { id: s.id, day: s.day, start: s.start, end: s.end, room_id: s.room_id ?? "", week: s.week, locked: s.locked }
        : { day: "", start: "", end: "", room_id: "", week: "EVERY" as WeekPattern, locked: false };
    });
  };

  const [drafts, setDrafts] = useState<LabSectionDraft[]>([]);
  const [activeSectionIdx, setActiveSectionIdx] = useState<number | null>(null);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [showRoomTable, setShowRoomTable] = useState(true);
  const [showOtherRooms, setShowOtherRooms] = useState(false);

  useEffect(() => {
    if (open) {
      const initialDrafts = existing.map((g) => {
        const slots = data.class_slots.filter((s) => s.lab_section_id === g.id);
        return {
          id: g.id,
          label: g.label,
          section_ids: g.section_ids,
          teacher_ids: g.teacher_ids,
          primary_room_id: g.primary_room_id,
          slots: buildPaddedSlots(slots),
        };
      });
      setDrafts(initialDrafts);
      if (initialDrafts.length > 0) {
        setActiveSectionIdx(0);
      } else {
        setActiveSectionIdx(null);
      }
      setActiveSlotIdx(0);
    }
  }, [open, existing, data.class_slots, maxSlotsPerSection]);

  const activeSection = activeSectionIdx !== null ? drafts[activeSectionIdx] : null;
  const currentSlot = activeSection?.slots[activeSlotIdx];

  const addSection = () => {
    const nextLabel = `Lab ${String.fromCharCode(65 + drafts.length)}`;
    const newSection: LabSectionDraft = {
      label: nextLabel,
      section_ids: [],
      teacher_ids: [],
      primary_room_id: null,
      slots: buildPaddedSlots([]),
    };
    setDrafts((prev) => [...prev, newSection]);
    setActiveSectionIdx(drafts.length);
    setActiveSlotIdx(0);
  };

  const removeSection = async (idx: number) => {
    const g = drafts[idx];
    const ok = await confirmDialog({
      title: `Delete ${g.label}?`,
      description: `Are you sure you want to delete ${g.label} and all its scheduled class meetings?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    if (g.id) {
      try {
        await deleteLabSection(g.id);
        toast.success("Lab section deleted");
      } catch (err: any) {
        toast.error(err.message || "Failed to delete lab section");
        return;
      }
    }
    setDrafts((d) => d.filter((_, i) => i !== idx));
    if (activeSectionIdx === idx) {
      setActiveSectionIdx(drafts.length > 1 ? 0 : null);
      setActiveSlotIdx(0);
    } else if (activeSectionIdx !== null && activeSectionIdx > idx) {
      setActiveSectionIdx(activeSectionIdx - 1);
    }
  };

  const updateSection = (idx: number, patch: Partial<LabSectionDraft>) => {
    setDrafts((d) => d.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const toggleSectionId = (idx: number, sectionId: string) => {
    const g = drafts[idx];
    const has = g.section_ids.includes(sectionId);
    const nextIds = has ? g.section_ids.filter((x) => x !== sectionId) : [...g.section_ids, sectionId];
    updateSection(idx, { section_ids: nextIds });
  };

  const toggleTeacher = (idx: number, tid: string) => {
    const g = drafts[idx];
    const has = g.teacher_ids.includes(tid);
    const nextIds = has ? g.teacher_ids.filter((x) => x !== tid) : [...g.teacher_ids, tid];
    updateSection(idx, { teacher_ids: nextIds });
  };

  const updateSlot = (sectionIdx: number, slotIdx: number, patch: Partial<SlotDraft>) => {
    setDrafts((prev) =>
      prev.map((g, i) =>
        i === sectionIdx
          ? {
              ...g,
              slots: g.slots.map((s, si) => (si === slotIdx ? { ...s, ...patch } : s)),
            }
          : g,
      ),
    );
  };

  const clearSlot = (sectionIdx: number, slotIdx: number) => {
    updateSlot(sectionIdx, slotIdx, { day: "", start: "", end: "", room_id: "", week: "EVERY" as WeekPattern });
  };

  const toggleLock = async (sectionIdx: number, slotIdx: number) => {
    const g = drafts[sectionIdx];
    const d = g.slots[slotIdx];
    if (!d.id) {
      toast.error("Cannot lock unsaved class");
      return;
    }
    try {
      const newLocked = !d.locked;
      await upsertClassSlot({
        id: d.id,
        locked: newLocked,
      });
      updateSlot(sectionIdx, slotIdx, { locked: newLocked });
      toast.success(newLocked ? "Class slot locked" : "Class slot unlocked");
    } catch (error: any) {
      toast.error(error.message || "Failed to update lock status");
    }
  };

  const conflictsForActiveSlot = useMemo(() => {
    if (activeSectionIdx === null || !drafts[activeSectionIdx]) return [];
    const activeSection = drafts[activeSectionIdx];
    const slot = activeSection.slots[activeSlotIdx];
    if (!slot || !slot.day || !slot.start || !slot.end) return [];

    const list: any[] = [];

    // 1. Room availability
    if (slot.room_id) {
      if (roomUnavailableAt(data, slot.room_id, slot)) {
        list.push({ type: 'room_unavailability', message: 'Room is marked unavailable at this time' });
      }
    }

    // 2. Teacher availability
    for (const tid of activeSection.teacher_ids) {
      if (teacherUnavailableAt(data, tid, slot)) {
        const t = data.teachers.find((x) => x.id === tid);
        list.push({ type: 'teacher_unavailability', message: `${t?.short_name ?? "Teacher"} is unavailable at this time` });
      }
    }

    // 3. Duplicate meetings within this same lab section draft list
    const hasSiblingClash = activeSection.slots.some(
      (sib, sidx) => sidx !== activeSlotIdx && sib.day === slot.day && sib.room_id === slot.room_id &&
        timesOverlap(sib.start, sib.end, slot.start, slot.end),
    );
    if (hasSiblingClash) {
      list.push({ type: 'sibling_clash', message: 'Duplicate meeting at this day/time/room' });
    }

    // 4. Overlap against other class slots on the routine
    for (const cs of data.class_slots) {
      if (cs.semester_id !== data.active_semester_id) continue;
      if (cs.day !== slot.day) continue;
      if (!timesOverlap(cs.start, cs.end, slot.start, slot.end)) continue;
      if (activeSection.id && cs.lab_section_id === activeSection.id) continue;
      
      if (cs.room_id === slot.room_id) {
        const otherCourse = data.courses.find((x) => x.id === cs.course_id);
        const otherSection = data.sections.find((x) => x.id === cs.section_id);
        const courseLabel = otherCourse ? `${otherCourse.code} - ${otherCourse.name}` : "Sessional";
        const sectionLabel = otherSection ? `Level ${otherSection.level} Term ${otherSection.term} Sec ${otherSection.name}` : "Lab";
        list.push({
          type: 'room_conflict',
          message: `Room is already booked at this time by ${courseLabel} (${sectionLabel})`,
        });
      }

      // Teacher clash
      let effectiveTeacherIds: string[] = [];
      if (cs.lab_section_id) {
        const other = data.course_lab_sections.find((x) => x.id === cs.lab_section_id);
        effectiveTeacherIds = other?.teacher_ids ?? [];
      } else {
        const cst = data.course_section_teachers.find(
          (x) => x.semester_id === data.active_semester_id && x.course_id === cs.course_id && x.section_id === cs.section_id,
        );
        effectiveTeacherIds = cst?.teacher_ids ?? [];
      }
      const clashingTeacherId = effectiveTeacherIds.find((tid) => activeSection.teacher_ids.includes(tid));
      if (clashingTeacherId) {
        const t = data.teachers.find((x) => x.id === clashingTeacherId);
        const otherCourse = data.courses.find((x) => x.id === cs.course_id);
        list.push({
          type: 'teacher_conflict',
          message: `Teacher ${t?.short_name || "Assigned"} already has a class at this time in ${otherCourse?.code || "Routine"}`,
        });
      }
    }

    return list;
  }, [data, drafts, activeSectionIdx, activeSlotIdx]);

  const handleSave = async () => {
    if (drafts.some((g) => !g.label.trim() || g.section_ids.length === 0)) {
      toast.error("Every lab section needs a label and at least one mapped section.");
      return;
    }
    const labels = drafts.map((g) => g.label.trim());
    if (new Set(labels).size !== labels.length) {
      toast.error("Lab section labels must be unique.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveLabSections(
        course.id,
        drafts.map((g) => ({
          label: g.label.trim(),
          section_ids: g.section_ids,
          teacher_ids: g.teacher_ids,
          primary_room_id: g.primary_room_id,
        })),
      );

      // Push each draft's schedule to its saved lab section (matched by label).
      await Promise.all(
        drafts.map((g) => {
          const match = saved.find((s) => s.label === g.label.trim());
          if (!match) return Promise.resolve();
          
          // filter out empty/unscheduled slots
          const filledSlots = g.slots
            .filter((s) => s.day && s.start && s.end && s.room_id)
            .map((s) => ({
              day: s.day,
              start: s.start,
              end: s.end,
              room_id: s.room_id,
              week: s.week,
              locked: s.locked ?? false,
            }));

          return batchReplaceLabSectionSlots(match.id, filledSlots);
        }),
      );

      toast.success("Lab sections saved successfully.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save lab sections.");
    } finally {
      setSaving(false);
    }
  };

  const allTeachers = [...data.teachers].sort((a, b) => a.short_name.localeCompare(b.short_name));

  const { allowed: allowedRooms, other: otherRooms } = partitionRoomsForCourse(
    data.rooms.filter((r) => roomSupportsKind(r.room_type, info.roomKind)),
    course,
    data.departments,
  );
  const roomsForKind = showOtherRooms ? [...allowedRooms, ...otherRooms] : allowedRooms;

  // Calculate cohort students mapped to the active lab section
  const activeCohortStudents = useMemo(() => {
    if (!activeSection) return 0;
    const cohort = sections.filter((s) => activeSection.section_ids.includes(s.id));
    const total = cohort.reduce((sum, s) => sum + s.total_students, 0);
    return drafts.length > 0 ? Math.ceil(total / drafts.length) : total;
  }, [activeSection, sections, drafts.length]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[1200px] max-h-[95vh] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-5 w-5 text-purple-600 animate-pulse" />
            Lab Sections Manager — {course.code}
            <span className="text-sm font-normal text-muted-foreground ml-1">{course.name}</span>
            <Badge variant="outline" className="ml-2 bg-indigo-50 text-indigo-700 border-indigo-200">
              {maxSlotsPerSection} Class meetings required
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Stepper list of Lab Sections */}
          <div className="w-[240px] border-r bg-muted/20 flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lab Sections</span>
              <Badge variant="secondary" className="h-5 text-[10px] font-semibold">{drafts.length} total</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {drafts.map((d, i) => {
                const isActive = i === activeSectionIdx;
                const mappedCount = d.section_ids.length;
                const isComplete = d.slots.every((s) => s.day && s.start && s.end && s.room_id);
                const hasLocked = d.slots.some((s) => s.locked);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setActiveSectionIdx(i);
                      setActiveSlotIdx(0);
                    }}
                    className={cn(
                      "rounded-lg border p-2.5 transition-all cursor-pointer relative group flex flex-col gap-1",
                      isActive
                        ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600"
                        : "hover:bg-muted border-border bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-xs truncate text-foreground">{d.label || "Untitled Lab"}</span>
                        {hasLocked && <Lock className="h-3 w-3 text-amber-600" />}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSection(i);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{mappedCount} section{mappedCount !== 1 ? "s" : ""} mapped</span>
                      {isComplete ? (
                        <span className="text-success font-semibold flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> Scheduled
                        </span>
                      ) : (
                        <span className="text-warning italic">Incomplete</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {drafts.length === 0 && (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground italic border border-dashed rounded-lg">
                  No lab sections yet. Add one to split classes.
                </div>
              )}
            </div>
            <div className="p-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center gap-1.5 h-9 font-bold bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                onClick={addSection}
              >
                <Plus className="h-4 w-4" /> Add Lab Section
              </Button>
            </div>
          </div>

          {/* Right Area: selected Lab Section settings */}
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {activeSectionIdx === null || !activeSection ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/5">
                <FlaskConical className="h-12 w-12 text-slate-300 mb-2 animate-bounce" />
                <h3 className="font-semibold text-sm text-slate-700">No active lab section</h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Select a lab section from the sidebar or click "+ Add Lab Section" to schedule it.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    {/* Lab label input */}
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Lab Section Name</Label>
                      <Input
                        value={activeSection.label}
                        onChange={(e) => updateSection(activeSectionIdx, { label: e.target.value })}
                        placeholder="e.g. Lab A"
                        className="h-8.5 text-xs bg-background"
                      />
                    </div>

                    {/* Section Mapping */}
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Maps to Section(s)</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {sections.map((s) => {
                          const selected = activeSection.section_ids.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              onClick={() => toggleSectionId(activeSectionIdx, s.id)}
                              className={cn(
                                "px-2.5 py-1 rounded text-xs font-bold border transition-colors",
                                selected
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                  : "bg-background text-muted-foreground border-border hover:border-indigo-400"
                              )}
                            >
                              Section {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Primary Room picker using generic RoomPicker */}
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Primary Room
                      </Label>
                      <div>
                        <RoomPicker
                          course={course}
                          labSection={{
                            id: activeSection.id ?? "",
                            course_id: course.id,
                            semester_id: data.active_semester_id,
                            label: activeSection.label,
                            section_ids: activeSection.section_ids,
                            teacher_ids: activeSection.teacher_ids,
                            primary_room_id: activeSection.primary_room_id,
                          }}
                          value={activeSection.primary_room_id}
                          onSelect={(rid) => updateSection(activeSectionIdx, { primary_room_id: rid })}
                        />
                      </div>
                    </div>

                    {/* Teacher assignment */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> Teachers ({activeSection.teacher_ids.length})
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1.5 font-bold bg-white hover:bg-indigo-50 border-indigo-100 hover:text-indigo-800 transition-all"
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
                                  {allTeachers.map((t) => {
                                    const selected = activeSection.teacher_ids.includes(t.id);
                                    return (
                                      <CommandItem
                                        key={t.id}
                                        onSelect={() => toggleTeacher(activeSectionIdx, t.id)}
                                        className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer"
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <RankPill designation={t.designation} />
                                            <span className="font-mono font-bold text-xs">{t.short_name}</span>
                                            <span className="text-muted-foreground text-[11px] truncate">{t.name}</span>
                                          </div>
                                        </div>
                                        {selected && <Check className="h-4 w-4 text-indigo-600 stroke-[3px] ml-2 shrink-0" />}
                                      </CommandItem>
                                    );
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-h-[36px] items-center p-2 rounded-lg border border-dashed bg-muted/10">
                        {activeSection.teacher_ids.length === 0 ? (
                          <div className="text-[10px] text-slate-400 font-medium italic w-full text-center py-1">
                            No teachers assigned yet.
                          </div>
                        ) : (
                          activeSection.teacher_ids.map((tid) => {
                            const t = data.teachers.find((x) => x.id === tid);
                            return t ? (
                              <div key={tid} className="flex items-center gap-0.5 animate-in fade-in duration-200">
                                <TeacherChip teacher={t} />
                                <button
                                  type="button"
                                  onClick={() => toggleTeacher(activeSectionIdx, tid)}
                                  className="p-1 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all"
                                >
                                  <X className="h-3 w-3 stroke-[3px]" />
                                </button>
                              </div>
                            ) : null;
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="my-1" />

                {/* Sub-stepper for meetings slots */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-indigo-600" /> Class Meetings Schedule
                    </Label>
                    <div className="flex items-center gap-1.5">
                      {[...Array(maxSlotsPerSection)].map((_, si) => {
                        const s = activeSection.slots[si];
                        const isSelected = si === activeSlotIdx;
                        const isScheduled = s && s.day && s.start && s.end && s.room_id;
                        const hasConflicts = conflictsForActiveSlot.length > 0 && isSelected;
                        return (
                          <button
                            key={si}
                            type="button"
                            onClick={() => setActiveSlotIdx(si)}
                            className={cn(
                              "px-3 py-1 text-xs font-bold rounded-md border transition-all flex items-center gap-1.5",
                              isSelected
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                : isScheduled
                                ? "bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100 text-indigo-800"
                                : "bg-muted text-muted-foreground border-border hover:bg-muted/80",
                              isScheduled && s.locked && "border-amber-400 bg-amber-50 text-amber-800"
                            )}
                          >
                            Meeting {si + 1}
                            {isScheduled && <Check className="h-3 w-3 text-success shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {currentSlot && (
                    <div className="space-y-4">
                      {/* Day and Timeslot row */}
                      <div className="flex items-start gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-muted-foreground uppercase">Day</Label>
                          <div className="flex flex-wrap gap-1">
                            {orderedDays.map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => updateSlot(activeSectionIdx, activeSlotIdx, { day: d.name })}
                                className={cn(
                                  "px-2.5 py-1 text-[11px] font-semibold rounded-md border transition",
                                  currentSlot.day === d.name
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-card hover:bg-muted border-border text-muted-foreground",
                                )}
                              >
                                {fmtDayTitle(d.name)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5 w-[240px]">
                          <Label className="text-xs font-bold text-muted-foreground uppercase">Timeslot</Label>
                          <Select
                            value={
                              applicablePeriods.find(
                                (p) => p.start === currentSlot.start && p.end === currentSlot.end,
                              )?.id ?? ""
                            }
                            onValueChange={(id) => {
                              const p = data.periods.find((x) => x.id === id);
                              if (p) updateSlot(activeSectionIdx, activeSlotIdx, { start: p.start, end: p.end });
                            }}
                          >
                            <SelectTrigger className="h-8.5 text-xs bg-background">
                              <SelectValue placeholder="Pick timeslot" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              {applicablePeriods.map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                  {fmtRange12(p.start, p.end)} ({p.duration % 60 === 0 ? `${p.duration / 60}h` : `${p.duration}m`})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5 w-[240px]">
                          <Label className="text-xs font-bold text-muted-foreground uppercase">Room</Label>
                          <Select
                            value={currentSlot.room_id}
                            onValueChange={(rid) => updateSlot(activeSectionIdx, activeSlotIdx, { room_id: rid })}
                          >
                            <SelectTrigger className="h-8.5 text-xs bg-background">
                              <SelectValue placeholder="Pick room" />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                              {roomsForKind.map((r) => {
                                const capOk = r.capacity >= activeCohortStudents;
                                const isBooked = data.class_slots.some((cs) => {
                                  if (cs.semester_id !== data.active_semester_id) return false;
                                  if (cs.day !== currentSlot.day) return false;
                                  if (cs.room_id !== r.id) return false;
                                  if (currentSlot.id && cs.id === currentSlot.id) return false;
                                  return timesOverlap(cs.start, cs.end, currentSlot.start, currentSlot.end);
                                });
                                return (
                                  <SelectItem key={r.id} value={r.id} className="text-xs">
                                    <span className="flex items-center gap-1.5">
                                      <span className="font-mono">{r.name}</span>
                                      <span className="text-[10px] text-muted-foreground">Cap {r.capacity} (per-lab: {activeCohortStudents})</span>
                                      {!capOk && <Badge variant="destructive" className="text-[8px] py-0 h-3">small</Badge>}
                                      {isBooked && <Badge variant="destructive" className="text-[8px] py-0 h-3">booked</Badge>}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Lock / Unlock and Clear slots */}
                      {currentSlot.day && currentSlot.start && currentSlot.end && currentSlot.room_id && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleLock(activeSectionIdx, activeSlotIdx)}
                            disabled={!currentSlot.id}
                            className={cn(
                              "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                              currentSlot.locked
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-white text-muted-foreground border-gray-200 hover:bg-gray-50",
                              !currentSlot.id && "opacity-50 cursor-not-allowed"
                            )}
                            title={!currentSlot.id ? "Save first to lock this meeting slot" : "Toggle lock state"}
                          >
                            {currentSlot.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            {currentSlot.locked ? "Locked" : "Unlocked"}
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-destructive hover:bg-destructive/5"
                            onClick={() => clearSlot(activeSectionIdx, activeSlotIdx)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear slot values
                          </Button>
                        </div>
                      )}

                      {/* Conflicts list */}
                      {conflictsForActiveSlot.length > 0 && (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                          <div className="flex items-center gap-2 font-semibold text-destructive text-xs uppercase">
                            <AlertCircle className="h-4 w-4" />
                            Scheduling Conflict{conflictsForActiveSlot.length > 1 ? "s" : ""} Detected
                          </div>
                          <ul className="list-disc pl-5 text-[11px] text-destructive">
                            {conflictsForActiveSlot.map((issue, idx) => (
                              <li key={idx}>{issue.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Room and Teacher Availability table */}
                      <div className="rounded-lg border overflow-hidden">
                        <button
                          onClick={() => setShowRoomTable((v) => !v)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 hover:bg-muted transition"
                        >
                          <span className="flex items-center gap-2">
                            <TableIcon className="h-3.5 w-3.5" />
                            Room & Teacher Availability Matrix
                          </span>
                          {showRoomTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                        {showRoomTable && (
                          <div className="p-3 bg-card space-y-2">
                            <RoomDayGrid
                              course={course}
                              teacherIds={activeSection.teacher_ids}
                              day={currentSlot.day || "SUN"}
                              includeOtherDeptRooms={showOtherRooms}
                              currentSlotId={currentSlot.id}
                              currentRoomId={currentSlot.room_id}
                              currentStart={currentSlot.start}
                              currentEnd={currentSlot.end}
                              siblingDrafts={activeSection.slots.filter((_, i) => i !== activeSlotIdx).map((d) => ({
                                day: d.day, start: d.start, end: d.end, week: d.week,
                              }))}
                              week={currentSlot.week}
                              onPick={(roomId, start, end) =>
                                updateSlot(activeSectionIdx, activeSlotIdx, {
                                  room_id: roomId,
                                  start,
                                  end,
                                  day: currentSlot.day || "SUN",
                                })
                              }
                              totalStudents={activeCohortStudents}
                            />
                            {otherRooms.length > 0 && (
                              <label className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1 cursor-pointer select-none">
                                <Checkbox checked={showOtherRooms} onCheckedChange={(v) => setShowOtherRooms(v === true)} />
                                Show other departments' rooms in grid ({otherRooms.length})
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Check className="h-4 w-4" />
            {saving ? "Saving…" : "Save Lab Sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomDayGrid({
  course,
  teacherIds,
  day,
  includeOtherDeptRooms = false,
  currentSlotId,
  currentRoomId,
  currentStart,
  currentEnd,
  siblingDrafts = [],
  week,
  onPick,
  totalStudents,
}: {
  course: Course;
  teacherIds: string[];
  day: string;
  includeOtherDeptRooms?: boolean;
  currentSlotId?: string;
  currentRoomId?: string | null;
  currentStart?: string;
  currentEnd?: string;
  siblingDrafts?: { day: string; start: string; end: string; week: WeekPattern }[];
  week: WeekPattern;
  onPick: (roomId: string, start: string, end: string) => void;
  totalStudents: number;
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const confirmDialog = useConfirm();

  const rooms = data.rooms
    .filter((r) => roomSupportsKind(r.room_type, info.roomKind))
    .filter((r) => r.capacity >= totalStudents)
    .filter((r) => includeOtherDeptRooms || roomAllowedForCourse(r, course, data.departments))
    .sort((a, b) => a.name.localeCompare(b.name));

  const periods = data.periods
    .filter((p) => p.kind === info.roomKind && !p.is_break)
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
      
      const busy = data.class_slots.find((cs) => {
        if (cs.semester_id !== data.active_semester_id) return false;
        if (cs.day !== day) return false;
        if (currentSlotId && cs.id === currentSlotId) return false;
        if (!timesOverlap(cs.start, cs.end, p.start, p.end)) return false;
        if (!weeksOverlap(cs.week, week)) return false;

        let slotTeacherIds: string[] = [];
        if (cs.lab_section_id) {
          const other = data.course_lab_sections.find((x) => x.id === cs.lab_section_id);
          slotTeacherIds = other?.teacher_ids ?? [];
        } else {
          const cst = data.course_section_teachers.find(
            (x) =>
              x.semester_id === data.active_semester_id &&
              x.course_id === cs.course_id &&
              x.section_id === cs.section_id,
          );
          slotTeacherIds = cst?.teacher_ids ?? [];
        }

        const clashingTid = slotTeacherIds.find((tid) => teacherIds.includes(tid));
        if (clashingTid) {
          (cs as any).clashingTid = clashingTid;
          return true;
        }
        return false;
      });

      if (busy) {
        const c = data.courses.find((x) => x.id === busy.course_id);
        const s = data.sections.find((x) => x.id === busy.section_id);
        const clashingTid = (busy as any).clashingTid;
        const t = data.teachers.find((x) => x.id === clashingTid);
        entry.busy = {
          teacherId: clashingTid,
          teacherShort: t?.short_name,
          teacherName: t?.name,
          courseCode: c?.code,
          sectionName: s?.name || "Lab",
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
  }, [data, periods, teacherIds, day, week, currentSlotId, course.id]);

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

  function getOppositeWeekBooking(roomId: string, p: { start: string; end: string }) {
    const oppositeWeek: WeekPattern = week === "EVEN" ? "ODD" : "EVEN";
    return data.class_slots.find((slot) => {
      if (slot.id === currentSlotId) return false;
      if (slot.room_id !== roomId) return false;
      if (slot.day !== day) return false;
      if (!timesOverlap(slot.start, slot.end, p.start, p.end)) return false;
      return weeksOverlap(slot.week, oppositeWeek);
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

  function toneFor(n: number, isPartial: boolean) {
    if (n <= 0 && isPartial) return "bg-yellow-200/70 hover:bg-yellow-300/70 border-yellow-300 text-yellow-900";
    if (n <= 0) return "bg-success/10 hover:bg-success/25 border-success/30 text-success";
    if (n === 1) return "bg-red-200/70 hover:bg-red-300/70 border-red-300 text-red-900";
    if (n === 2) return "bg-red-400/70 hover:bg-red-500/70 border-red-500 text-red-950";
    return "bg-red-700/80 hover:bg-red-800/80 border-red-900 text-white";
  }

  return (
    <div className="overflow-auto max-h-[32vh] border rounded-md">
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
                      {status.busy.teacherShort} busy in {status.busy.courseCode}
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
                <div className="text-[10px] text-muted-foreground">Capacity {r.capacity} (per-lab: {totalStudents})</div>
              </td>
              {periods.map((p) => {
                const status = teacherStatusByPeriod.get(p.id);
                const teacherBusy = status?.busy;
                const teacherUnavail = status?.unavailable;
                const booking = findBooking(r.id, p);
                const oppositeBooking = getOppositeWeekBooking(r.id, p);
                const dup = siblingDuplicate(p);
                const roomUnavail = roomUnavailableAt(data, r.id, { day, start: p.start, end: p.end });
                const isCurrent =
                  currentRoomId === r.id && currentStart === p.start && currentEnd === p.end;

                const issues: string[] = [];
                if (booking) {
                  const c = data.courses.find((c) => c.id === booking.course_id);
                  const s = data.sections.find((s) => s.id === booking.section_id);
                  const courseLabel = c ? `${c.code} - ${c.name}` : "Sessional";
                  const sectionLabel = s ? `Level ${s.level} Term ${s.term} Sec ${s.name}` : "Lab";
                  issues.push(`Room ${r.name} is already booked by ${courseLabel} (${sectionLabel}) ${fmtRange12(booking.start, booking.end)}.`);
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
                const isPartial = conflictCount === 0 && !!oppositeBooking;
                const tone = toneFor(conflictCount, isPartial);

                return (
                  <td
                    key={p.id}
                    className={cn(
                      "text-center p-1 border-r cursor-pointer transition-all relative font-mono text-[11px]",
                      tone,
                      isCurrent && "ring-2 ring-primary ring-inset z-10",
                    )}
                    onClick={() => handlePick(r.id, p, issues)}
                  >
                    <div className="absolute inset-0 opacity-10 bg-black hover:opacity-0 transition" />
                    {isCurrent ? (
                      <span className="font-bold text-primary">Selected</span>
                    ) : conflictCount > 0 ? (
                      <span className="font-semibold text-destructive">{conflictCount} conflict{conflictCount > 1 ? "s" : ""}</span>
                    ) : oppositeBooking ? (
                      <span className="text-yellow-800 text-[10px]">Opposite: {oppositeBooking.week}</span>
                    ) : (
                      <span className="text-success text-[10px]">Available</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
