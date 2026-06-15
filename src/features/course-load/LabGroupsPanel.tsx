/**
 * LabGroupsPanel — manage virtual lab groups for a sessional course within a level-term.
 *
 * A lab group is a sub-section used for scheduling when actual sections need to be
 * split differently for lab rotations (e.g. Sec A+B split into Lab A, Lab B, Lab C
 * where Lab A → Sec A, Lab B → Sec A, Lab C → Sec B, or any other mapping).
 */
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Course, Section, CourseLabGroup } from "@/lib/types";
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
import { FlaskConical, Plus, Trash2, Save, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LabGroupDraft {
  label: string;
  section_id: string;
  teacher_ids: string[];
}

interface Props {
  course: Course;
  /** Sections relevant to this course's level+term */
  sections: Section[];
  open: boolean;
  onClose: () => void;
}

export function LabGroupsPanel({ course, sections, open, onClose }: Props) {
  const data = useStore();
  const { saveLabGroups, deleteLabGroup } = useStore();

  const existing = useMemo(
    () =>
      data.course_lab_groups.filter(
        (g) => g.course_id === course.id && g.semester_id === data.active_semester_id,
      ),
    [data.course_lab_groups, course.id, data.active_semester_id],
  );

  const [drafts, setDrafts] = useState<LabGroupDraft[]>(() =>
    existing.length > 0
      ? existing.map((g) => ({ label: g.label, section_id: g.section_id, teacher_ids: g.teacher_ids }))
      : [],
  );
  const [saving, setSaving] = useState(false);

  const addGroup = () => {
    const nextLabel = `Lab ${String.fromCharCode(65 + drafts.length)}`;
    setDrafts((d) => [
      ...d,
      { label: nextLabel, section_id: sections[0]?.id ?? "", teacher_ids: [] },
    ]);
  };

  const removeGroup = (i: number) => {
    setDrafts((d) => d.filter((_, idx) => idx !== i));
  };

  const updateGroup = (i: number, patch: Partial<LabGroupDraft>) => {
    setDrafts((d) => d.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
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

  const handleSave = async () => {
    if (drafts.some((g) => !g.label.trim() || !g.section_id)) {
      toast.error("Every lab group needs a label and a section mapping.");
      return;
    }
    const labels = drafts.map((g) => g.label.trim());
    if (new Set(labels).size !== labels.length) {
      toast.error("Lab group labels must be unique.");
      return;
    }
    setSaving(true);
    try {
      await saveLabGroups(
        course.id,
        drafts.map((g) => ({ ...g, label: g.label.trim() })),
      );
      toast.success("Lab groups saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save lab groups.");
    } finally {
      setSaving(false);
    }
  };

  const activeTeachers = data.teachers.filter((t) => t.status === "active" || t.status === "Active");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-purple-600" />
            Lab Groups — {course.code}
            <span className="text-sm font-normal text-muted-foreground ml-1">{course.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2.5 mb-3">
          Define virtual lab groups to split students across different schedules. Each lab group maps
          to an actual section and can have its own teacher(s) and schedule.
        </div>

        <div className="space-y-3">
          {drafts.map((g, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-3 bg-background">
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={g.label}
                      onChange={(e) => updateGroup(i, { label: e.target.value })}
                      placeholder="Lab A"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Maps to Section</Label>
                    <Select
                      value={g.section_id}
                      onValueChange={(v) => updateGroup(i, { section_id: v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            Section {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive mt-4"
                  onClick={() => removeGroup(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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
            </div>
          ))}

          {drafts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              No lab groups yet. Add one to split this course into sub-groups.
            </div>
          )}

          <Button variant="outline" size="sm" onClick={addGroup} className="w-full gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Lab Group
          </Button>
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save Lab Groups"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
