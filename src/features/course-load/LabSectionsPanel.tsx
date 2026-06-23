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
import { FlaskConical, Plus, Trash2, Save, Users, MapPin, Calendar } from "lucide-react";
import { cn, sortDays, fmtDayTitle, roomSupportsKind } from "@/lib/utils";
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
    setDrafts((d) =>
      d.map((g, idx) =>
        idx === i
          ? { ...g, slots: [...g.slots, { day: orderedDays[0]?.name ?? "SUN", start: "09:00", end: "10:50", room_id: "", week: "EVERY" }] }
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

  const activeTeachers = data.teachers.filter((t) => t.status === "active" || t.status === "Active");
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
                  {activeTeachers.map((t) => {
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
                  {g.slots.map((slot, si) => (
                    <div key={si} className="flex items-center gap-1.5">
                      <Select value={slot.day} onValueChange={(v) => updateSlot(i, si, { day: v })}>
                        <SelectTrigger className="h-8 text-xs w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {orderedDays.map((d) => (
                            <SelectItem key={d.id} value={d.name}>
                              {fmtDayTitle(d.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateSlot(i, si, { start: e.target.value })}
                        className="h-8 text-xs w-[110px]"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateSlot(i, si, { end: e.target.value })}
                        className="h-8 text-xs w-[110px]"
                      />
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeSlot(i, si)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
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
