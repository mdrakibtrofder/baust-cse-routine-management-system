/**
 * LabSectionsPanel — manage virtual lab sections for a sessional course within a level-term.
 *
 * A lab section is a sub-section used for scheduling when actual sections need to be
 * split differently for lab rotations (e.g. Sec A+B split into Lab A, Lab B, Lab C
 * where Lab A → Sec A, Lab B → Sec A, Lab C → Sec B, or any other mapping). A lab
 * section can map to MULTIPLE actual sections at once (e.g. Lab B → Sec A AND Sec B),
 * in which case its classes are pushed into every mapped section's routine.
 */
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Course, Section, WeekPattern } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FlaskConical, Plus, Trash2, Save, Users, MapPin, Calendar, Check, AlertCircle } from "lucide-react";
import { cn, sortDays, fmtDayTitle, roomSupportsKind } from "@/lib/utils";
import { roomUnavailableAt, teacherUnavailableAt, timesOverlap } from "@/lib/conflicts";
import { toast } from "sonner";

interface SlotDraft {
  day: string;
  start: string;
  end: string;
  room_id: string;
  week: WeekPattern;
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
  /** Sections relevant to this course's level+term */
  sections: Section[];
  open: boolean;
  onClose: () => void;
}

export function LabSectionsPanel({ course, sections, open, onClose }: Props) {
  const data = useStore();
  const { saveLabSections, deleteLabSection, batchReplaceLabSectionSlots } = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const orderedDays = useMemo(() => sortDays(data.days), [data.days]);
  // Same period list used by the normal Class Schedule assign dialog — picking a
  // period auto-fills start/end instead of typing times manually.
  const applicablePeriods = useMemo(
    () => data.periods.filter((p) => p.kind === info.roomKind).sort((a, b) => a.start.localeCompare(b.start)),
    [data.periods, info.roomKind],
  );

  const existing = useMemo(
    () =>
      data.course_lab_sections.filter(
        (g) => g.course_id === course.id && g.semester_id === data.active_semester_id,
      ),
    [data.course_lab_sections, course.id, data.active_semester_id],
  );

  const [drafts, setDrafts] = useState<LabSectionDraft[]>(() =>
    existing.length > 0
      ? existing.map((g) => ({
          id: g.id,
          label: g.label,
          section_ids: g.section_ids,
          teacher_ids: g.teacher_ids,
          primary_room_id: g.primary_room_id,
          slots: data.class_slots
            .filter((s) => s.lab_section_id === g.id)
            .map((s) => ({ day: s.day, start: s.start, end: s.end, room_id: s.room_id ?? "", week: s.week })),
        }))
      : [],
  );
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    const nextLabel = `Lab ${String.fromCharCode(65 + drafts.length)}`;
    setDrafts((d) => [
      ...d,
      { label: nextLabel, section_ids: [], teacher_ids: [], primary_room_id: null, slots: [] },
    ]);
  };

  const removeSection = (i: number) => {
    setDrafts((d) => d.filter((_, idx) => idx !== i));
  };

  const updateSection = (i: number, patch: Partial<LabSectionDraft>) => {
    setDrafts((d) => d.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  };

  const toggleSectionId = (i: number, sectionId: string) => {
    setDrafts((d) =>
      d.map((g, idx) => {
        if (idx !== i) return g;
        const has = g.section_ids.includes(sectionId);
        return { ...g, section_ids: has ? g.section_ids.filter((x) => x !== sectionId) : [...g.section_ids, sectionId] };
      }),
    );
  };

  const toggleTeacher = (i: number, tid: string) => {
    setDrafts((d) =>
      d.map((g, idx) => {
        if (idx !== i) return g;
        const has = g.teacher_ids.includes(tid);
        return { ...g, teacher_ids: has ? g.teacher_ids.filter((x) => x !== tid) : [...g.teacher_ids, tid] };
      }),
    );
  };

  const addSlot = (i: number) => {
    const firstPeriod = applicablePeriods[0];
    setDrafts((d) =>
      d.map((g, idx) =>
        idx === i
          ? {
              ...g,
              slots: [
                ...g.slots,
                {
                  day: orderedDays[0]?.name ?? "SUN",
                  start: firstPeriod?.start ?? "09:00",
                  end: firstPeriod?.end ?? "10:50",
                  room_id: "",
                  week: "EVERY" as WeekPattern,
                },
              ],
            }
          : g,
      ),
    );
  };

  const removeSlot = (i: number, slotIdx: number) => {
    setDrafts((d) =>
      d.map((g, idx) => (idx === i ? { ...g, slots: g.slots.filter((_, si) => si !== slotIdx) } : g)),
    );
  };

  const updateSlot = (i: number, slotIdx: number, patch: Partial<SlotDraft>) => {
    setDrafts((d) =>
      d.map((g, idx) =>
        idx === i ? { ...g, slots: g.slots.map((s, si) => (si === slotIdx ? { ...s, ...patch } : s)) } : g,
      ),
    );
  };

  /** Returns null when the meeting is fully filled in and conflict-free (render green),
   *  or a short reason string otherwise (render amber/destructive). Checks room/teacher
   *  unavailability, duplicate meetings within this same lab section, and double-booking
   *  against every other slot in the active semester — same checks the normal Class
   *  Schedule dialog does, just scoped down for a lab section's own (multi-)teacher set. */
  const slotIssue = (i: number, si: number): string | null => {
    const g = drafts[i];
    const slot = g.slots[si];
    if (!slot.day || !slot.start || !slot.end) return "Pick a day and period";
    if (!slot.room_id) return "Pick a room";

    if (roomUnavailableAt(data, slot.room_id, slot)) {
      return "Room is marked unavailable at this time";
    }
    for (const tid of g.teacher_ids) {
      if (teacherUnavailableAt(data, tid, slot)) {
        const t = data.teachers.find((x) => x.id === tid);
        return `${t?.short_name ?? "Teacher"} is unavailable at this time`;
      }
    }

    // Duplicate/overlapping meeting within this same lab section's own draft list.
    const hasSiblingClash = g.slots.some(
      (sib, sidx) => sidx !== si && sib.day === slot.day && sib.room_id === slot.room_id &&
        timesOverlap(sib.start, sib.end, slot.start, slot.end),
    );
    if (hasSiblingClash) return "Duplicate meeting at this day/time/room";

    // Conflict against every other slot already on the routine (excluding this lab
    // section's own existing slots, which get fully replaced on save anyway).
    for (const cs of data.class_slots) {
      if (cs.semester_id !== data.active_semester_id) continue;
      if (cs.day !== slot.day) continue;
      if (!timesOverlap(cs.start, cs.end, slot.start, slot.end)) continue;
      if (g.id && cs.lab_section_id === g.id) continue;

      if (cs.room_id === slot.room_id) return "Room is already booked at this time";

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
      if (effectiveTeacherIds.some((tid) => g.teacher_ids.includes(tid))) {
        return "Teacher already has a class at this time";
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (drafts.some((g) => !g.label.trim() || g.section_ids.length === 0)) {
      toast.error("Every lab section needs a label and at least one mapped section.");
      return;
    }
    if (drafts.some((g) => g.slots.some((s) => !s.room_id))) {
      toast.error("Every scheduled class needs a room.");
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
          return batchReplaceLabSectionSlots(
            match.id,
            g.slots.map((s) => ({ day: s.day, start: s.start, end: s.end, room_id: s.room_id, week: s.week })),
          );
        }),
      );
      toast.success("Lab sections saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save lab sections.");
    } finally {
      setSaving(false);
    }
  };

  // `status` on Teacher is a role/designation label (HoD, DPC, Librarian, ...), not an
  // active/inactive flag — list every teacher, matching the normal TeacherPicker.
  const allTeachers = [...data.teachers].sort((a, b) => a.short_name.localeCompare(b.short_name));
  const roomsForKind = data.rooms.filter((r) => roomSupportsKind(r.room_type, info.roomKind));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-purple-600" />
            Lab Sections — {course.code}
            <span className="text-sm font-normal text-muted-foreground ml-1">{course.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2.5 mb-3">
          Define lab sections to split this course's classes across different schedules. Each lab
          section can map to one or more actual sections — its classes will show up in every
          mapped section's routine, labeled with the lab section name.
        </div>

        <div className="space-y-3">
          {drafts.map((g, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-3 bg-background">
              <div className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={g.label}
                    onChange={(e) => updateSection(i, { label: e.target.value })}
                    placeholder="Lab A"
                    className="h-8 text-sm"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive mt-4"
                  onClick={() => removeSection(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Section mapping (many-to-many) */}
              <div className="space-y-1.5">
                <Label className="text-xs">Maps to Section(s)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {sections.map((s) => {
                    const selected = g.section_ids.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSectionId(i, s.id)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-bold border transition-colors",
                          selected
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-background text-muted-foreground border-border hover:border-indigo-400",
                        )}
                      >
                        Section {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Teacher picker */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="h-3 w-3" /> Teachers
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {allTeachers.map((t) => {
                    const selected = g.teacher_ids.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTeacher(i, t.id)}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-bold border transition-colors",
                          selected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-background text-muted-foreground border-border hover:border-blue-400",
                        )}
                      >
                        {t.short_name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary room (default room shown alongside this lab section) */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Primary Room
                </Label>
                <Select
                  value={g.primary_room_id ?? ""}
                  onValueChange={(v) => updateSection(i, { primary_room_id: v || null })}
                >
                  <SelectTrigger className="h-8 text-sm w-[220px]">
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomsForKind.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Class schedule */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Class Schedule
                </Label>
                <div className="space-y-1.5">
                  {g.slots.map((slot, si) => {
                    const matchedPeriodId = applicablePeriods.find(
                      (p) => p.start === slot.start && p.end === slot.end,
                    )?.id ?? "";
                    const issue = slotIssue(i, si);
                    return (
                    <div key={si} className="space-y-0.5">
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-1.5 py-1",
                        issue ? "border-destructive/40 bg-destructive/5" : "border-success/50 bg-success/5",
                      )}
                    >
                      <Select value={slot.day} onValueChange={(v) => updateSlot(i, si, { day: v })}>
                        <SelectTrigger className="h-8 text-xs w-[100px]">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent>
                          {orderedDays.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {fmtDayTitle(d.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={matchedPeriodId}
                        onValueChange={(id) => {
                          const p = data.periods.find((x) => x.id === id);
                          if (p) updateSlot(i, si, { start: p.start, end: p.end });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-[160px]">
                          <SelectValue placeholder="Pick a period" />
                        </SelectTrigger>
                        <SelectContent>
                          {applicablePeriods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.start}–{p.end}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={slot.room_id} onValueChange={(v) => updateSlot(i, si, { room_id: v })}>
                        <SelectTrigger className="h-8 text-xs w-[160px]">
                          <SelectValue placeholder="Room" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomsForKind.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span title={issue ?? "No conflicts"} className="shrink-0">
                        {issue ? (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-success" />
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeSlot(i, si)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {issue && (
                      <p className="text-[10px] text-destructive pl-1.5">{issue}</p>
                    )}
                    </div>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => addSlot(i)} className="gap-1.5 h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    Add class meeting
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {drafts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              No lab sections yet. Add one to split this course into sub-groups.
            </div>
          )}

          <Button variant="outline" size="sm" onClick={addSection} className="w-full gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Lab Section
          </Button>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save Lab Sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
