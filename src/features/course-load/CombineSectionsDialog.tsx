/**
 * CombineSectionsDialog — configure one teacher to teach multiple sections together.
 *
 * The primary section "owns" the class slots. Secondary sections' cst records are set with
 * combined_section_ids = null (they don't get their own slots).
 * The primary section's cst.combined_section_ids lists the secondary section IDs.
 */
import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import type { Course, Section } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GitMerge, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  course: Course;
  primarySection: Section;
  allSections: Section[];
  open: boolean;
  onClose: () => void;
}

export function CombineSectionsDialog({ course, primarySection, allSections, open, onClose }: Props) {
  const data = useStore();
  const { setCourseSectionTeachers } = useStore();

  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === course.id &&
      x.section_id === primarySection.id,
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(cst?.combined_section_ids ?? []);
  const [saving, setSaving] = useState(false);

  const otherSections = allSections.filter((s) => s.id !== primarySection.id);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setCourseSectionTeachers(
        course.id,
        primarySection.id,
        cst?.teacher_ids ?? [],
        cst?.primary_room_id ?? null,
        cst?.slot_teacher_ids ?? null,
        selectedIds.length > 0 ? selectedIds : null,
      );
      toast.success(
        selectedIds.length > 0
          ? `Section ${primarySection.name} will teach combined with ${selectedIds.map((id) => allSections.find((s) => s.id === id)?.name ?? "?").join(", ")}.`
          : "Combined sections cleared.",
      );
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitMerge className="h-4 w-4 text-indigo-600" />
            Combine Sections — {course.code}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2.5 mb-3">
          Select which other sections are taught together with{" "}
          <strong>Section {primarySection.name}</strong> in a single combined class. This section's
          schedule and teacher will cover all selected sections.
        </div>

        <div className="space-y-2">
          {otherSections.map((s) => {
            const selected = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors text-left",
                  selected
                    ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                    : "border-border hover:border-indigo-300",
                )}
              >
                <div className={cn(
                  "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0",
                  selected ? "border-indigo-600 bg-indigo-600" : "border-muted-foreground",
                )}>
                  {selected && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="font-semibold">Section {s.name}</div>
                  <div className="text-xs text-muted-foreground">Level {s.level} Term {s.term}</div>
                </div>
              </button>
            );
          })}
        </div>

        {selectedIds.length > 0 && (
          <div className="text-xs bg-indigo-50 border border-indigo-200 rounded p-2 text-indigo-800">
            Section {primarySection.name} + {selectedIds.map((id) => allSections.find((s) => s.id === id)?.name ?? "?").join(" + ")} will share the same class schedule.
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
