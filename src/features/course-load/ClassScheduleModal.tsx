import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  Table as TableIcon,
  Users,
  CalendarDays,
  MapPin,
  Loader2,
  FlaskConical,
  Plus,
  UserPlus,
  X,
  Lock,
  Unlock,
} from "lucide-react";
import { COURSE_TYPE_INFO, type Course, type Section, type WeekPattern, type Period } from "@/lib/types";
import {
  checkConflicts,
  findAvailableRooms,
  findAllConflictFreeSlots,
  type Conflict,
  type ConflictScope,
} from "@/lib/conflicts";
import { toast } from "sonner";
import { cn, compareDayAndTime, sortDays, fmtRange12, fmtDayTitle, tagColorClasses, roomSupportsKind } from "@/lib/utils";
import { RankPill, TeacherChip } from "@/components/TeacherBadge";
import { TeacherDetailsDialog } from "@/components/TeacherDetailsDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { CourseDetailsDialog } from "@/components/CourseDetailsDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { partitionRoomsForCourse } from "@/lib/room-dept";
import { RoomDayGrid } from "./RoomDayGrid";

/** One weekly meeting slot, shared shape for both a regular section's class
 *  meetings and a lab section's session meetings. */
interface DraftMeeting {
  id?: string;
  day: string;
  start: string;
  end: string;
  room_id: string | null;
  week: WeekPattern;
  locked?: boolean;
}

/** One schedulable entity: a single real `Section` (mode="section", always
 *  exactly one, not addable/removable) or a virtual `CourseLabSection`
 *  (mode="lab", zero or more, addable/removable/renamable). */
interface EntityDraft {
  id?: string;
  label: string;
  section_ids: string[];
  teacher_ids: string[];
  /** Per-meeting teacher override, section-mode `sessional_3.0` split mode only. */
  slot_teacher_ids?: string[][] | null;
  meetings: DraftMeeting[];
}

function emptyMeeting(course: Course): DraftMeeting {
  const info = COURSE_TYPE_INFO[course.course_type];
  return { day: "", start: "", end: "", room_id: null, week: info.weekPattern, locked: false };
}

/** How many weekly meetings each entity needs. Regular sections use the fixed
 *  per-course-type count; lab sections derive it from course credit (same
 *  formula the legacy Lab Sections panel used). */
/** Finds the period a stored meeting time belongs to.
 *
 *  A slot's start/end is always a copy of some period's, so normally the exact
 *  match wins immediately. It can miss when a period was edited before the
 *  server started carrying its classes across — the class keeps the old time
 *  (e.g. 08:00–08:50) while the period now reads 08:00–08:55, and an exact-match
 *  lookup finds nothing, which is what left the timeslot dropdown blank.
 *
 *  The fallbacks recover that class: first a period of the same kind starting at
 *  the same time, then the one overlapping it most. Returning the period (rather
 *  than just its id) lets the caller snap the draft onto the real period times,
 *  so opening and saving the class also repairs the stored row. */
function findPeriodForTime(
  start: string,
  end: string,
  periods: Period[],
): Period | null {
  if (!start || !end) return null;

  const exact = periods.find((p) => p.start === start && p.end === end);
  if (exact) return exact;

  const sameStart = periods.filter((p) => p.start === start);
  if (sameStart.length === 1) return sameStart[0];

  const overlapping = periods
    .map((p) => ({ p, overlap: overlapMinutes(p.start, p.end, start, end) }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  return overlapping[0]?.p ?? null;
}

/** Minutes two time ranges share; 0 when they do not overlap. */
function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const mins = (t: string) => {
    const [h, m] = t.split(":");
    return Number(h) * 60 + Number(m);
  };
  return Math.max(0, Math.min(mins(aEnd), mins(bEnd)) - Math.max(mins(aStart), mins(bStart)));
}

function meetingsRequired(course: Course, mode: "section" | "lab"): number {
  if (mode === "lab") return course.credit === 1.5 ? 1 : Math.ceil(course.credit / 3);
  return COURSE_TYPE_INFO[course.course_type].classCount;
}

function cloneEntity(e: EntityDraft): EntityDraft {
  return {
    ...e,
    section_ids: [...e.section_ids],
    teacher_ids: [...e.teacher_ids],
    slot_teacher_ids: e.slot_teacher_ids ? e.slot_teacher_ids.map((ids) => [...ids]) : e.slot_teacher_ids,
    meetings: e.meetings.map((m) => ({ ...m })),
  };
}

interface ClassScheduleModalProps {
  /** "section": schedule one real section's weekly classes (theory/sessional).
   *  "lab": manage one course's virtual lab sections and their sessions. */
  mode: "section" | "lab";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course;
  /** Required for mode="section". */
  section?: Section;
  /** Required for mode="lab" — candidate real sections lab sections can map to. */
  sections?: Section[];
  /** Lab mode only: open with this lab section (`CourseLabSection.id`) active
   *  instead of defaulting to the first one — e.g. when opened by clicking a
   *  specific lab cell on a routine grid. */
  focusEntityId?: string;
  /** Either mode: open with the meeting/session containing this persisted
   *  `ClassSlot.id` active instead of defaulting to the first one. */
  focusMeetingId?: string;
}

export function ClassScheduleModal({ mode, open, onOpenChange, course, section, sections, focusEntityId, focusMeetingId }: ClassScheduleModalProps) {
  const data = useStore();
  const confirmDialog = useConfirm();
  const info = COURSE_TYPE_INFO[course.course_type];
  const isSessional3 = mode === "section" && course.course_type === "sessional_3.0";
  const unitNoun = mode === "lab" ? "Session" : "Class";
  const meetingCount = meetingsRequired(course, mode);
  const orderedDays = useMemo(() => sortDays(data.days), [data.days]);

  /** Periods a class of this course type can actually sit in. */
  const applicablePeriods = useMemo(
    () => data.periods.filter((p) => p.kind === info.roomKind && !p.is_break).sort((a, b) => a.start.localeCompare(b.start)),
    [data.periods, info.roomKind],
  );

  const [entities, setEntities] = useState<EntityDraft[]>([]);
  const [activeEntityIdx, setActiveEntityIdx] = useState<number | null>(null);
  const [activeMeetingIdx, setActiveMeetingIdx] = useState(0);
  const [showRoomTable, setShowRoomTable] = useState(true);
  const [showOtherRooms, setShowOtherRooms] = useState(false);
  const [confirmSave, setConfirmSave] = useState<{ msg: string; hasConflicts: boolean } | null>(null);
  const [teacherDetailsId, setTeacherDetailsId] = useState<string | null>(null);
  const [showSectionRoutine, setShowSectionRoutine] = useState(false);
  const [showCourseDetails, setShowCourseDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Split-teacher mode (section mode, sessional_3.0 only): each class meeting
  // has its own teacher instead of sharing the entity's teacher pool.
  const [splitMode, setSplitMode] = useState(false);
  const [slotTeacherIds, setSlotTeacherIds] = useState<string[][]>([[], []]);

  // Snapshot of the last-saved state, captured on mount/open, before any
  // local edits. Restored in full if the modal is closed by any means other
  // than the explicit Save button, so nothing is ever persisted without an
  // explicit save — including entity add/remove for lab mode.
  const snapshotRef = useRef<{
    entities: EntityDraft[];
    activeEntityIdx: number | null;
    splitMode: boolean;
    slotTeacherIds: string[][];
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    if (mode === "section") {
      if (!section) return;
      const cst = data.course_section_teachers.find(
        (x) => x.semester_id === data.active_semester_id && x.course_id === course.id && x.section_id === section.id,
      );
      const existingSlots = data.class_slots
        .filter((s) => s.semester_id === data.active_semester_id && s.course_id === course.id && s.section_id === section.id)
        .sort(compareDayAndTime);
      const meetings: DraftMeeting[] = Array.from({ length: meetingCount }, (_, i) => {
        const e = existingSlots[i];
        if (!e) return emptyMeeting(course);
        // Snap to the period's own times so the timeslot dropdown resolves even
        // for a class stranded by an old period edit; saving then writes the
        // corrected time back.
        const period = findPeriodForTime(e.start, e.end, applicablePeriods);
        return {
          id: e.id, day: e.day,
          start: period?.start ?? e.start,
          end: period?.end ?? e.end,
          room_id: e.room_id, week: e.week, locked: e.locked,
        };
      });
      const entity: EntityDraft = {
        id: cst?.id,
        label: `Section ${section.name}`,
        section_ids: [section.id],
        teacher_ids: cst?.teacher_ids ?? [],
        slot_teacher_ids: cst?.slot_teacher_ids ?? null,
        meetings,
      };
      const hasSplit = !!cst?.slot_teacher_ids?.length;
      const focusedMeetingIdx = focusMeetingId ? meetings.findIndex((m) => m.id === focusMeetingId) : -1;
      setEntities([entity]);
      setActiveEntityIdx(0);
      setActiveMeetingIdx(focusedMeetingIdx >= 0 ? focusedMeetingIdx : 0);
      setSplitMode(hasSplit);
      setSlotTeacherIds(hasSplit ? (cst!.slot_teacher_ids as string[][]) : [[], []]);
      snapshotRef.current = {
        entities: [cloneEntity(entity)],
        activeEntityIdx: 0,
        splitMode: hasSplit,
        slotTeacherIds: hasSplit ? (cst!.slot_teacher_ids as string[][]).map((ids) => [...ids]) : [[], []],
      };
    } else {
      const existingLabs = data.course_lab_sections.filter(
        (g) => g.course_id === course.id && g.semester_id === data.active_semester_id,
      );
      const built: EntityDraft[] = existingLabs.map((g) => {
        const slots = data.class_slots.filter((s) => s.lab_section_id === g.id);
        const meetings: DraftMeeting[] = Array.from({ length: meetingCount }, (_, i) => {
          const s = slots[i];
          if (!s) return emptyMeeting(course);
          const period = findPeriodForTime(s.start, s.end, applicablePeriods);
          return {
            id: s.id, day: s.day,
            start: period?.start ?? s.start,
            end: period?.end ?? s.end,
            room_id: s.room_id, week: s.week, locked: s.locked,
          };
        });
        return {
          id: g.id,
          label: g.label,
          section_ids: g.section_ids,
          teacher_ids: g.teacher_ids,
          meetings,
        };
      });
      const focusedEntityIdx = focusEntityId ? built.findIndex((e) => e.id === focusEntityId) : -1;
      const initialEntityIdx = focusedEntityIdx >= 0 ? focusedEntityIdx : built.length > 0 ? 0 : null;
      const focusedMeetingIdx =
        initialEntityIdx !== null && focusMeetingId
          ? built[initialEntityIdx].meetings.findIndex((m) => m.id === focusMeetingId)
          : -1;
      setEntities(built);
      setActiveEntityIdx(initialEntityIdx);
      setActiveMeetingIdx(focusedMeetingIdx >= 0 ? focusedMeetingIdx : 0);
      setSplitMode(false);
      setSlotTeacherIds([[], []]);
      snapshotRef.current = {
        entities: built.map(cloneEntity),
        activeEntityIdx: initialEntityIdx,
        splitMode: false,
        slotTeacherIds: [[], []],
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, course.id, section?.id, meetingCount, data.class_slots, data.course_lab_sections, data.course_section_teachers]);

  const activeEntity = activeEntityIdx !== null ? entities[activeEntityIdx] ?? null : null;
  const safeMeetingIdx = activeEntity ? Math.min(activeMeetingIdx, Math.max(activeEntity.meetings.length - 1, 0)) : 0;
  const currentMeeting: DraftMeeting = activeEntity?.meetings[safeMeetingIdx] ?? emptyMeeting(course);

  const maxTeachers = info.roomKind === "sessional" ? 2 : 1;
  const effectiveTeacherIds = useMemo(
    () => (isSessional3 && splitMode ? slotTeacherIds[safeMeetingIdx] ?? [] : activeEntity?.teacher_ids ?? []),
    [isSessional3, splitMode, slotTeacherIds, safeMeetingIdx, activeEntity],
  );
  const canAddTeacher = (activeEntity?.teacher_ids.length ?? 0) < maxTeachers;


  // Total students the active entity's room needs to fit — the section's own
  // count in section mode, or an even split of the mapped cohort across
  // however many lab sections currently exist.
  const totalStudents = useMemo(() => {
    if (!activeEntity) return 0;
    if (mode === "section") return section?.total_students ?? 0;
    const cohort = (sections ?? []).filter((s) => activeEntity.section_ids.includes(s.id));
    const total = cohort.reduce((sum, s) => sum + s.total_students, 0);
    return entities.length > 0 ? Math.ceil(total / entities.length) : total;
  }, [activeEntity, mode, section, sections, entities.length]);

  const scope: ConflictScope | null = useMemo(() => {
    if (!activeEntity) return null;
    if (mode === "section") return section ? { kind: "section", section } : null;
    return { kind: "lab", totalStudents, sectionIds: activeEntity.section_ids, labSectionId: activeEntity.id };
  }, [mode, section, activeEntity, totalStudents]);

  const conflicts: Conflict[] = useMemo(() => {
    if (!activeEntity || !scope) return [];
    const siblings = activeEntity.meetings.filter((_, i) => i !== safeMeetingIdx).map((m) => ({
      day: m.day, start: m.start, end: m.end, week: m.week,
    }));
    return checkConflicts({
      data, course, scope, teacherIds: effectiveTeacherIds,
      candidate: currentMeeting, ignoreSlotId: currentMeeting.id, siblingDrafts: siblings,
    });
  }, [data, course, scope, effectiveTeacherIds, currentMeeting, activeEntity, safeMeetingIdx]);

  const availableRooms = useMemo(() => {
    if (!activeEntity || !scope) return [];
    const siblings = activeEntity.meetings.filter((_, i) => i !== safeMeetingIdx).map((m) => ({
      day: m.day, start: m.start, end: m.end, week: m.week,
    }));
    return findAvailableRooms(data, course, scope, currentMeeting, currentMeeting.id, effectiveTeacherIds, siblings, showOtherRooms);
  }, [data, course, scope, currentMeeting, activeEntity, effectiveTeacherIds, safeMeetingIdx, showOtherRooms]);

  const globalSuggestions = useMemo(() => {
    if (!open || !activeEntity || !scope || conflicts.length === 0) return [];
    const siblings = activeEntity.meetings.filter((_, i) => i !== safeMeetingIdx).map((m) => ({
      day: m.day, start: m.start, end: m.end, week: m.week,
    }));
    return findAllConflictFreeSlots(data, course, scope, effectiveTeacherIds, currentMeeting.id, siblings, currentMeeting.week, showOtherRooms);
  }, [data, course, scope, effectiveTeacherIds, currentMeeting, activeEntity, safeMeetingIdx, conflicts.length, open, showOtherRooms]);

  /** Meetings of every OTHER open entity (lab mode only — section mode always
   *  edits exactly one entity) so the availability grid also reflects clashes
   *  against lab sections open in the same modal session but not yet saved. */
  const otherOpenEntityDrafts = useMemo(() => {
    if (mode !== "lab" || activeEntityIdx === null) return [];
    return entities
      .filter((_, i) => i !== activeEntityIdx)
      .map((e) => ({
        label: e.label,
        teacherIds: e.teacher_ids,
        meetings: e.meetings.filter((m) => m.day && m.start && m.end).map((m) => ({ day: m.day, start: m.start, end: m.end, week: m.week })),
      }));
  }, [mode, entities, activeEntityIdx]);

  /** Per-meeting status for the stepper's issue indicators. */
  const meetingStatuses = useMemo(() => {
    if (!activeEntity || !scope) return [];
    return activeEntity.meetings.map((m, idx) => {
      const siblings = activeEntity.meetings.filter((_, i) => i !== idx).map((x) => ({
        day: x.day, start: x.start, end: x.end, week: x.week,
      }));
      const teacherIdsForIdx = isSessional3 && splitMode ? (slotTeacherIds[idx] ?? []) : activeEntity.teacher_ids;
      const cs = checkConflicts({ data, course, scope, teacherIds: teacherIdsForIdx, candidate: m, ignoreSlotId: m.id, siblingDrafts: siblings });
      return { conflicts: cs, incomplete: !m.room_id };
    });
  }, [activeEntity, scope, data, course, isSessional3, splitMode, slotTeacherIds]);

  const matchedPeriodId =
    findPeriodForTime(currentMeeting.start, currentMeeting.end, applicablePeriods)?.id ?? "";

  const updateEntity = (idx: number, patch: Partial<EntityDraft>) => {
    setEntities((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const updateMeeting = (entityIdx: number, meetingIdx: number, patch: Partial<DraftMeeting>) => {
    setEntities((prev) =>
      prev.map((e, i) =>
        i === entityIdx
          ? { ...e, meetings: e.meetings.map((m, mi) => (mi === meetingIdx ? { ...m, ...patch } : m)) }
          : e,
      ),
    );
  };

  const setCurrentMeeting = (patch: Partial<DraftMeeting>) => {
    if (activeEntityIdx === null) return;
    updateMeeting(activeEntityIdx, safeMeetingIdx, patch);
  };

  const setPeriod = (id: string) => {
    const p = data.periods.find((x) => x.id === id);
    if (p) setCurrentMeeting({ start: p.start, end: p.end });
  };

  // ---------- Entity (lab section) management — lab mode only ----------

  const addEntity = () => {
    const nextLabel = `Lab ${String.fromCharCode(65 + entities.length)}`;
    const newEntity: EntityDraft = {
      label: nextLabel,
      section_ids: [],
      teacher_ids: [],
      meetings: Array.from({ length: meetingCount }, () => emptyMeeting(course)),
    };
    setEntities((prev) => [...prev, newEntity]);
    setActiveEntityIdx(entities.length);
    setActiveMeetingIdx(0);
  };

  const removeEntity = async (idx: number) => {
    const e = entities[idx];
    const ok = await confirmDialog({
      title: `Delete ${e.label}?`,
      description: `Are you sure you want to delete ${e.label} and all its scheduled sessions? This only takes effect once you save.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    // Local-only: no backend call here. Removal is applied on Save (the save
    // payload simply omits this entity), so closing without saving leaves the
    // original lab section untouched.
    setEntities((prev) => prev.filter((_, i) => i !== idx));
    if (activeEntityIdx === idx) {
      setActiveEntityIdx(entities.length > 1 ? 0 : null);
      setActiveMeetingIdx(0);
    } else if (activeEntityIdx !== null && activeEntityIdx > idx) {
      setActiveEntityIdx(activeEntityIdx - 1);
    }
  };

  // ---------- Meeting (day/time/room) management ----------

  const clearMeeting = (entityIdx: number, meetingIdx: number) => {
    updateMeeting(entityIdx, meetingIdx, { day: "", start: "", end: "", room_id: null, week: info.weekPattern });
  };

  const deleteOneMeeting = async (idx: number) => {
    if (activeEntityIdx === null) return;
    const m = entities[activeEntityIdx].meetings[idx];
    const ok = await confirmDialog({
      title: `Delete ${unitNoun} ${idx + 1}?`,
      description: m?.room_id
        ? `This will clear the assigned room and time for ${unitNoun} ${idx + 1}.`
        : `Reset ${unitNoun} ${idx + 1} to default values.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    // Local-only: deferred to Save, same as removeEntity above.
    clearMeeting(activeEntityIdx, idx);
    toast.success(`${unitNoun} ${idx + 1} cleared`);
  };

  const clearAllMeetings = async () => {
    if (activeEntityIdx === null) return;
    const ok = await confirmDialog({
      title: `Clear all ${unitNoun.toLowerCase()}es?`,
      description: `This will remove all ${meetingCount} ${unitNoun.toLowerCase()} assignments for ${course.code}${mode === "section" ? ` (Section ${section?.name})` : ` (${activeEntity?.label})`}.`,
      destructive: true,
      confirmLabel: "Clear all",
    });
    if (!ok) return;
    updateEntity(activeEntityIdx, { meetings: Array.from({ length: meetingCount }, () => emptyMeeting(course)) });
    setActiveMeetingIdx(0);
    toast.success(`All ${unitNoun.toLowerCase()}s cleared`);
  };

  const toggleLock = async (entityIdx: number, meetingIdx: number) => {
    const m = entities[entityIdx].meetings[meetingIdx];
    if (!m.id) {
      toast.error("Cannot lock unsaved class");
      return;
    }
    try {
      const newLocked = !m.locked;
      await data.upsertClassSlot({ id: m.id, locked: newLocked });
      updateMeeting(entityIdx, meetingIdx, { locked: newLocked });
      toast.success(newLocked ? `${unitNoun} locked` : `${unitNoun} unlocked`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update lock status");
    }
  };

  const toggleLockAll = async () => {
    if (activeEntityIdx === null || !activeEntity) return;
    const savedMeetings = activeEntity.meetings.filter((m) => m.id);
    if (savedMeetings.length === 0) {
      toast.error(`No saved ${unitNoun.toLowerCase()}s to lock/unlock`);
      return;
    }
    const allLocked = savedMeetings.every((m) => m.locked);
    const targetLocked = !allLocked;
    try {
      for (const m of savedMeetings) {
        await data.upsertClassSlot({ id: m.id, locked: targetLocked });
      }
      updateEntity(activeEntityIdx, {
        meetings: activeEntity.meetings.map((m) => (m.id ? { ...m, locked: targetLocked } : m)),
      });
      toast.success(`All saved ${unitNoun.toLowerCase()}s ${targetLocked ? "locked" : "unlocked"}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update lock status");
    }
  };

  // ---------- Save / persist ----------

  const persist = async (force = false) => {
    setSubmitting(true);
    try {
      if (mode === "section") {
        if (!section || !activeEntity) return;
        const readySlots = activeEntity.meetings
          .filter((m) => m.room_id && m.day && m.start && m.end)
          .map((m) => ({ day: m.day, start: m.start, end: m.end, room_id: m.room_id!, week: m.week }));
        await data.batchReplaceClassSlots(course.id, section.id, readySlots, force);

        const finalSlotTeacherIds = isSessional3 && splitMode ? slotTeacherIds : null;
        const teacherUnion = finalSlotTeacherIds ? [...new Set(finalSlotTeacherIds.flat())] : activeEntity.teacher_ids;
        await data.setCourseSectionTeachers(course.id, section.id, teacherUnion, finalSlotTeacherIds);

        toast.success("Schedule saved");
        onOpenChange(false);
      } else {
        if (entities.some((e) => !e.label.trim() || e.section_ids.length === 0)) {
          toast.error("Every lab section needs a label and at least one mapped section.");
          setSubmitting(false);
          return;
        }
        const labels = entities.map((e) => e.label.trim());
        if (new Set(labels).size !== labels.length) {
          toast.error("Lab section labels must be unique.");
          setSubmitting(false);
          return;
        }
        const saved = await data.saveLabSections(
          course.id,
          entities.map((e) => ({
            label: e.label.trim(),
            section_ids: e.section_ids,
            teacher_ids: e.teacher_ids,
          })),
        );
        await Promise.all(
          entities.map((e) => {
            const match = saved.find((s) => s.label === e.label.trim());
            if (!match) return Promise.resolve();
            const filledMeetings = e.meetings
              .filter((m) => m.day && m.start && m.end && m.room_id)
              .map((m) => ({ day: m.day, start: m.start, end: m.end, room_id: m.room_id!, week: m.week, locked: m.locked ?? false }));
            return data.batchReplaceLabSectionSlots(match.id, filledMeetings);
          }),
        );
        toast.success("Lab sections saved successfully.");
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedule");
    } finally {
      setSubmitting(false);
    }
  };

  const save = async () => {
    if (mode === "lab") {
      if (entities.length === 0) {
        const ok = await confirmDialog({
          title: "Remove all lab sections?",
          description: "Are you sure you want to remove all lab sections for this course? This will delete all existing lab sections and their scheduled sessions.",
          confirmLabel: "Remove all",
          destructive: true,
        });
        if (!ok) return;
        persist(false);
        return;
      }
      persist(false);
      return;
    }
    if (!activeEntity) return;
    const incompleteCount = activeEntity.meetings.filter((m) => !m.room_id).length;
    const conflictCount = meetingStatuses.filter((s) => s.conflicts.length > 0).length;
    const total = activeEntity.meetings.length;
    if (incompleteCount > 0 || conflictCount > 0) {
      const filled = total - incompleteCount;
      const parts: string[] = [];
      if (incompleteCount > 0) parts.push(`${filled}/${total} ${unitNoun.toLowerCase()}${total > 1 ? "es" : ""} filled`);
      if (conflictCount > 0) parts.push(`${conflictCount} ${unitNoun.toLowerCase()}${conflictCount > 1 ? "es have" : " has"} conflicts`);
      setConfirmSave({ msg: parts.join(" · "), hasConflicts: conflictCount > 0 });
      return;
    }
    persist(false);
  };

  /** Handles every dialog-close path that is NOT the explicit Save button: the
   *  X icon, clicking outside, and Escape. Discards any unsaved local edits —
   *  including deferred meeting/entity deletions — by restoring the pre-mount
   *  snapshot. `persist()` closes the dialog itself via `onOpenChange(false)`
   *  after a successful save, bypassing this handler. */
  const handleOpenChange = (v: boolean) => {
    if (!v && snapshotRef.current) {
      setEntities(snapshotRef.current.entities.map(cloneEntity));
      setActiveEntityIdx(snapshotRef.current.activeEntityIdx);
      setSplitMode(snapshotRef.current.splitMode);
      setSlotTeacherIds(snapshotRef.current.slotTeacherIds.map((ids) => [...ids]));
      setActiveMeetingIdx(0);
    }
    onOpenChange(v);
  };

  if (mode === "section" && !section) return null;
  if (entities.length === 0 && mode === "section") return null;

  const meetingStepperItems = activeEntity
    ? activeEntity.meetings.map((_, i) => ({
        label: `${unitNoun} ${i + 1}`,
        hasIssue: (meetingStatuses[i]?.conflicts.length ?? 0) > 0 || meetingStatuses[i]?.incomplete,
      }))
    : [];

  const roomsPartition = activeEntity
    ? partitionRoomsForCourse(
        data.rooms.filter((r) => roomSupportsKind(r.room_type, info.roomKind)),
        course,
        data.departments,
      )
    : { allowed: [], other: [] };
  const roomOptions = showOtherRooms ? [...roomsPartition.allowed, ...roomsPartition.other] : roomsPartition.allowed;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[1200px] max-h-[95vh] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {mode === "lab" && <FlaskConical className="h-5 w-5 text-purple-600" />}
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
              {mode === "lab" && (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  {meetingCount} {unitNoun.toLowerCase()}{meetingCount > 1 ? "s" : ""} per lab section
                </Badge>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {mode === "section" && section ? (
                <>
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
                      <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold", tagColorClasses(dept.id, dept.short_name))}>
                        {dept.short_name}
                      </span>
                    );
                  })()}
                  <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => setShowSectionRoutine(true)}>
                    <CalendarDays className="h-3.5 w-3.5 mr-1" /> Full section routine
                  </Button>
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
                        splitMode ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-muted text-muted-foreground border-border hover:border-primary",
                      )}
                    >
                      {splitMode ? "Split teachers (per class)" : "Split teachers"}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Badge variant="secondary" className="h-5 text-[11px] font-semibold">
                    {entities.length} lab section{entities.length !== 1 ? "s" : ""}
                  </Badge>
                  {activeEntity && (
                    <Badge variant="outline" className="text-[11px]">
                      {activeEntity.section_ids.length} section{activeEntity.section_ids.length !== 1 ? "s" : ""} mapped
                    </Badge>
                  )}
                </>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            {/* Lab-section tabs — lab mode only */}
            {mode === "lab" && (
              <div className="w-[220px] border-r bg-muted/20 flex flex-col">
                <div className="p-3 border-b flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lab Sections</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {entities.map((e, i) => {
                    const isActive = i === activeEntityIdx;
                    const isComplete = e.meetings.every((m) => m.day && m.start && m.end && m.room_id);
                    const hasLocked = e.meetings.some((m) => m.locked);
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          setActiveEntityIdx(i);
                          setActiveMeetingIdx(0);
                        }}
                        className={cn(
                          "rounded-lg border p-2.5 transition-all cursor-pointer relative group flex flex-col gap-1",
                          isActive ? "border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600" : "hover:bg-muted border-border bg-card",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-bold text-xs truncate text-foreground">{e.label || "Untitled Lab"}</span>
                            {hasLocked && <Lock className="h-3 w-3 text-amber-600" />}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              removeEntity(i);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{e.section_ids.length} section{e.section_ids.length !== 1 ? "s" : ""} mapped</span>
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
                  {entities.length === 0 && (
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
                    onClick={addEntity}
                  >
                    <Plus className="h-4 w-4" /> Add Lab Section
                  </Button>
                </div>
              </div>
            )}

            {!activeEntity ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/5">
                <FlaskConical className="h-12 w-12 text-slate-300 mb-2" />
                <h3 className="font-semibold text-sm text-slate-700">No active lab section</h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Select a lab section from the sidebar or click "+ Add Lab Section" to schedule it.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid md:grid-cols-[180px_1fr] gap-4">
                  {/* Left: meeting list */}
                  <div className="space-y-2 md:border-r md:pr-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{unitNoun}es</div>
                    {activeEntity.meetings.map((m, i) => {
                      const room = data.rooms.find((r) => r.id === m.room_id);
                      const st = meetingStatuses[i];
                      const isActive = i === safeMeetingIdx;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs transition group",
                            isActive ? "border-primary border-2 bg-primary/5 shadow-sm" : "hover:border-primary/40",
                            m.locked && "border-amber-500 bg-amber-50/30",
                            (st?.conflicts.length ?? 0) > 0 && "border-destructive/50",
                          )}
                        >
                          <button onClick={() => setActiveMeetingIdx(i)} className="w-full text-left">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{unitNoun} {i + 1}</span>
                                {m.locked && <Lock className="h-3 w-3 text-amber-600" />}
                              </div>
                              <div className="flex items-center gap-1">
                                {(m.id || m.room_id) && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); deleteOneMeeting(i); }}
                                    className="opacity-0 group-hover:opacity-100 transition text-destructive hover:text-destructive/80"
                                    title={`Delete this ${unitNoun.toLowerCase()}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                                {m.id && (
                                  <button
                                    onClick={(ev) => { ev.stopPropagation(); toggleLock(activeEntityIdx!, i); }}
                                    className="opacity-0 group-hover:opacity-100 transition text-amber-600 hover:text-amber-800"
                                    title={m.locked ? "Unlock" : "Lock"}
                                  >
                                    {m.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="font-mono text-[11px]">{fmtDayTitle(m.day)} {fmtRange12(m.start, m.end)}</div>
                            <div className="text-[10px] text-muted-foreground whitespace-normal leading-relaxed mt-1">
                              {room ? (
                                <span className="text-emerald-600 flex items-center gap-1 font-bold">
                                  <MapPin className="h-3 w-3" /> {room.name}
                                </span>
                              ) : (
                                <span className="text-amber-600 font-medium italic">Room, Day and Time Slot are not selected</span>
                              )}
                              {(st?.conflicts.length ?? 0) > 0 && (
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
                    {activeEntity.meetings.length > 1 && (
                      <div className="px-2 py-3 rounded-md" style={{ background: "var(--gradient-soft)" }}>
                        <Stepper steps={meetingStepperItems} current={safeMeetingIdx} onSelect={setActiveMeetingIdx} />
                      </div>
                    )}

                    {mode === "lab" && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Lab Section Name</Label>
                          <Input
                            value={activeEntity.label}
                            onChange={(e) => updateEntity(activeEntityIdx!, { label: e.target.value })}
                            placeholder="e.g. Lab A"
                            className="h-8.5 text-xs bg-background"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs uppercase tracking-widest text-slate-500 font-bold">Maps to Section(s)</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {(sections ?? []).map((s) => {
                              const selected = activeEntity.section_ids.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  onClick={() => {
                                    const next = selected
                                      ? activeEntity.section_ids.filter((x) => x !== s.id)
                                      : [...activeEntity.section_ids, s.id];
                                    updateEntity(activeEntityIdx!, { section_ids: next });
                                  }}
                                  className={cn(
                                    "px-2.5 py-1 rounded text-xs font-bold border transition-colors",
                                    selected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-background text-muted-foreground border-border hover:border-indigo-400",
                                  )}
                                >
                                  Section {s.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Teachers panel — split mode shows per-meeting picker, shared mode shows global pool */}
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                      {isSessional3 && splitMode ? (
                        <div className="space-y-2">
                          <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Teacher for Class {safeMeetingIdx + 1}</Label>
                          <TeacherPickerInline
                            selectedId={slotTeacherIds[safeMeetingIdx]?.[0] ?? null}
                            disabledIds={slotTeacherIds.filter((_, i) => i !== safeMeetingIdx).flatMap((a) => a)}
                            onSelect={(tid) => {
                              setSlotTeacherIds((prev) => {
                                const next = [...prev];
                                next[safeMeetingIdx] = tid ? [tid] : [];
                                return next;
                              });
                            }}
                            course={course}
                            section={section}
                            onViewDetails={(tid) => setTeacherDetailsId(tid)}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                              Teachers ({activeEntity.teacher_ids.length}/{maxTeachers})
                            </Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-[10px] gap-2 font-bold bg-white hover:bg-primary hover:text-white transition-all border-slate-200" disabled={!canAddTeacher}>
                                  <UserPlus className="h-3.5 w-3.5" /> Add Teacher
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-80 shadow-2xl border-slate-200" align="end">
                                <Command className="rounded-xl">
                                  <CommandInput placeholder="Search teachers..." className="h-10 text-xs" />
                                  <CommandList className="max-h-72">
                                    <CommandEmpty className="py-4 text-xs text-slate-400">No teacher found.</CommandEmpty>
                                    <CommandGroup className="p-2">
                                      {[...data.teachers].sort((a, b) => a.short_name.localeCompare(b.short_name)).map((t) => {
                                        const isSelected = activeEntity.teacher_ids.includes(t.id);
                                        return (
                                          <CommandItem
                                            key={t.id}
                                            onSelect={() => {
                                              if (isSelected) {
                                                updateEntity(activeEntityIdx!, { teacher_ids: activeEntity.teacher_ids.filter((id) => id !== t.id) });
                                              } else if (canAddTeacher) {
                                                updateEntity(activeEntityIdx!, { teacher_ids: [...activeEntity.teacher_ids, t.id] });
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
                            {activeEntity.teacher_ids.length === 0 ? (
                              <div className="text-[11px] text-slate-400 font-bold italic py-2 w-full text-center border-2 border-dashed border-slate-200 rounded-lg">
                                No teachers assigned yet.
                              </div>
                            ) : (
                              <TooltipProvider>
                                {activeEntity.teacher_ids.map((tid) => {
                                  const t = data.teachers.find((x) => x.id === tid);
                                  if (!t) return null;
                                  return (
                                    <div key={tid} className="flex items-center gap-1 group animate-in fade-in zoom-in duration-200">
                                      <button type="button" onClick={() => setTeacherDetailsId(t.id)} className="hover:scale-105 transition-transform">
                                        <TeacherChip teacher={t} />
                                      </button>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={() => updateEntity(activeEntityIdx!, { teacher_ids: activeEntity.teacher_ids.filter((id) => id !== tid) })}
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
                                  );
                                })}
                              </TooltipProvider>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-start gap-3">
                      <div>
                        <Label>{info.roomKind === "sessional" ? "Sessional Day" : "Theory Day"}</Label>
                        <Select value={currentMeeting.day} onValueChange={(v) => setCurrentMeeting({ day: v })}>
                          <SelectTrigger className="w-[280px]">
                            <SelectValue placeholder="Select Day" />
                          </SelectTrigger>
                          <SelectContent>
                            {orderedDays.map((d) => (
                              <SelectItem key={d.id} value={d.name}>{fmtDayTitle(d.name)}</SelectItem>
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
                        <Select value={currentMeeting.week} onValueChange={(v: WeekPattern) => setCurrentMeeting({ week: v })}>
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
                        <Label>{info.roomKind === "sessional" ? "Sessional Room" : "Theory Room"}</Label>
                        <span className="text-xs text-muted-foreground">{availableRooms.length} available</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select value={currentMeeting.room_id ?? ""} onValueChange={(v) => setCurrentMeeting({ room_id: v })}>
                          <SelectTrigger className="w-[320px]">
                            <SelectValue placeholder="Pick a room" />
                          </SelectTrigger>
                          <SelectContent>
                            {roomOptions.map((r) => {
                              const ok = availableRooms.some((ar) => ar.id === r.id);
                              const capOk = r.capacity >= totalStudents;
                              const fullyBooked = applicablePeriods.length > 0 && applicablePeriods.every((p) =>
                                data.class_slots.some((slot) => slot.id !== currentMeeting.id && slot.room_id === r.id && slot.day === currentMeeting.day && p.start < slot.end && slot.start < p.end),
                              );
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
                        {/* Widens the dropdown above to rooms outside this course's
                            department. Kept beside the dropdown it modifies rather than
                            pinned to the far right of the field header. */}
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                          <Checkbox
                            checked={showOtherRooms}
                            onCheckedChange={(v) => setShowOtherRooms(v === true)}
                            className="h-3.5 w-3.5"
                          />
                          Show other departments' rooms
                        </label>
                      </div>
                    </div>

                    {currentMeeting.id && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Locked</Label>
                        <button
                          type="button"
                          onClick={() => toggleLock(activeEntityIdx!, safeMeetingIdx)}
                          className={cn(
                            "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition",
                            currentMeeting.locked ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-white text-muted-foreground border border-gray-200 hover:bg-gray-50",
                          )}
                        >
                          {currentMeeting.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          {currentMeeting.locked ? "Locked" : "Unlocked"}
                        </button>
                      </div>
                    )}

                    {/* Embedded room & teacher availability table */}
                    <div className="rounded-lg border overflow-hidden">
                      <button
                        onClick={() => setShowRoomTable((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 hover:bg-muted transition"
                      >
                        <span className="flex items-center gap-2">
                          <TableIcon className="h-3.5 w-3.5" /> Room & Teacher Availability
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
                                onClick={() => setCurrentMeeting({ day: d.name })}
                                className={cn(
                                  "px-2.5 py-1 text-[11px] font-semibold rounded-md border transition",
                                  (currentMeeting.day || "SUN") === d.name ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border text-muted-foreground",
                                )}
                              >
                                {fmtDayTitle(d.name)}
                              </button>
                            ))}
                          </div>
                          <RoomDayGrid
                            course={course}
                            teacherIds={effectiveTeacherIds}
                            day={currentMeeting.day || "SUN"}
                            includeOtherDeptRooms={showOtherRooms}
                            currentSlotId={currentMeeting.id}
                            currentRoomId={currentMeeting.room_id}
                            currentStart={currentMeeting.start}
                            currentEnd={currentMeeting.end}
                            siblingDrafts={activeEntity.meetings.filter((_, i) => i !== safeMeetingIdx).map((m) => ({ day: m.day, start: m.start, end: m.end, week: m.week }))}
                            week={currentMeeting.week}
                            onPick={(roomId, start, end) => setCurrentMeeting({ room_id: roomId, start, end, day: currentMeeting.day || "SUN" })}
                            totalStudents={totalStudents}
                            ignoreEntity={mode === "section" ? { section_id: section!.id } : { lab_section_id: activeEntity.id }}
                            otherOpenEntityDrafts={otherOpenEntityDrafts}
                          />
                        </div>
                      )}
                    </div>

                    {conflicts.length > 0 && (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-destructive text-sm">
                          <AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} detected
                        </div>
                        <ul className="text-xs text-destructive space-y-1">
                          {conflicts.map((c, i) => <li key={i}>• {c.message}</li>)}
                        </ul>
                        {globalSuggestions.length > 0 ? (
                          <div className="pt-3 border-t border-rose-200/50">
                            <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">Suggested conflict-free slots:</div>
                            <ScrollArea className="h-40">
                              <div className="grid grid-cols-1 gap-1.5 pr-3">
                                {globalSuggestions.slice(0, 40).map((s, idx) => {
                                  const isCurrentTime = s.day === currentMeeting.day && s.start === currentMeeting.start;
                                  return (
                                    <button
                                      key={`${s.day}-${s.start}-${s.room.id}-${idx}`}
                                      onClick={() => setCurrentMeeting({ day: s.day, start: s.start, end: s.end, room_id: s.room.id })}
                                      className={cn(
                                        "text-[10px] text-left px-3 py-2 rounded-md border transition-all shadow-sm flex items-center justify-between group",
                                        isCurrentTime ? "bg-blue-50 border-blue-400 hover:bg-blue-100 text-blue-700" : "bg-white border-blue-100 hover:border-emerald-500 hover:bg-emerald-50 text-blue-600 hover:text-emerald-700",
                                      )}
                                    >
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          <span className={cn("font-bold uppercase tracking-tight", isCurrentTime ? "text-blue-800" : "text-blue-600 group-hover:text-emerald-700")}>
                                            {fmtDayTitle(s.day)} {fmtRange12(s.start, s.end)}
                                          </span>
                                          {isCurrentTime && (
                                            <Badge variant="outline" className="text-[7px] py-0 h-3 bg-blue-100 text-blue-700 border-blue-200 uppercase font-black">Current Time</Badge>
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
                          <div className="pt-2 text-[10px] text-rose-400 italic">No conflict-free slots found for this {unitNoun.toLowerCase()} across any day or time.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/20 flex-row justify-between sm:justify-between">
            <div className="flex gap-2">
              {activeEntity?.meetings.some((m) => m.id) && (
                <Button variant="ghost" size="sm" onClick={toggleLockAll} className="h-9 px-3">
                  {(() => {
                    const savedMeetings = activeEntity.meetings.filter((m) => m.id);
                    const allLocked = savedMeetings.every((m) => m.locked);
                    return allLocked ? (
                      <><Unlock className="h-3.5 w-3.5 mr-1.5 text-amber-600" /> Unlock {unitNoun.toLowerCase()}</>
                    ) : (
                      <><Lock className="h-3.5 w-3.5 mr-1.5 text-amber-600" /> Lock {unitNoun.toLowerCase()}</>
                    );
                  })()}
                </Button>
              )}
              {activeEntity && activeEntity.meetings.length > 1 && (
                <Button variant="ghost" size="sm" onClick={clearAllMeetings} className="h-9 px-3">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" /> Clear all
                </Button>
              )}
              {activeEntity && (currentMeeting.id || currentMeeting.room_id) && (
                <Button variant="ghost" size="sm" onClick={() => deleteOneMeeting(safeMeetingIdx)} className="h-9 px-3">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
                  {meetingCount === 1 ? `Clear this ${unitNoun.toLowerCase()}` : `Delete this ${unitNoun.toLowerCase()}`}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting} className="h-9 px-4">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={submitting || (mode === "section" && !activeEntity) || (mode === "lab" && entities.length > 0 && !activeEntity)}
                className="h-9 px-6 font-bold"
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {mode === "lab" ? "Save Lab Sections" : "Save Schedule"}
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
              {confirmSave?.msg}. {unitNoun}es without a room will be left unscheduled. You can come back any time to fix them.
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

      <TeacherDetailsDialog teacherId={teacherDetailsId} open={!!teacherDetailsId} onOpenChange={(v) => !v && setTeacherDetailsId(null)} />

      {mode === "section" && section && (
        <RoutineDialog
          open={showSectionRoutine}
          onOpenChange={setShowSectionRoutine}
          scope={{ kind: "section", section_id: section.id }}
          title={`Section ${section.name} · Level ${section.level}, Term ${section.term}`}
          subtitle={`${course.code} — ${course.name}`}
        />
      )}

      <CourseDetailsDialog course={showCourseDetails ? course : null} open={showCourseDetails} onOpenChange={setShowCourseDetails} />
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
  section?: Section;
  onViewDetails: (tid: string) => void;
}) {
  const data = useStore();
  const selected = selectedId ? data.teachers.find((t) => t.id === selectedId) : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 text-[11px] gap-2 font-bold w-full justify-start border-slate-200",
            selected ? "bg-purple-50 border-purple-300 text-purple-800" : "border-dashed text-muted-foreground",
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
                <CommandItem onSelect={() => onSelect(null)} className="text-destructive text-xs font-bold mb-1">
                  <X className="h-3.5 w-3.5 mr-1.5" /> Clear selection
                </CommandItem>
              )}
              {[...data.teachers].sort((a, b) => a.short_name.localeCompare(b.short_name)).map((t) => {
                const isSelected = t.id === selectedId;
                const isDisabled = disabledIds.includes(t.id);
                return (
                  <CommandItem
                    key={t.id}
                    disabled={isDisabled}
                    onSelect={() => { if (!isDisabled) onSelect(t.id); }}
                    className={cn("flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer", isDisabled && "opacity-40 cursor-not-allowed")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <RankPill designation={t.designation} />
                        <button type="button" onClick={(e) => { e.stopPropagation(); onViewDetails(t.id); }} className="font-mono font-bold text-xs hover:underline">
                          {t.short_name}
                        </button>
                        <span className="text-muted-foreground text-[11px] truncate">{t.name}</span>
                        {isDisabled && <Badge variant="secondary" className="text-[9px] py-0 h-3.5 px-1">other class</Badge>}
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
