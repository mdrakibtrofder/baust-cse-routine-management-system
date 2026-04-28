import { useState } from "react";
import { useStore } from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, X, AlertCircle } from "lucide-react";
import type { Course, Section } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import { teacherWouldExceed } from "@/lib/conflicts";
import { cn } from "@/lib/utils";
import { RankPill } from "@/components/TeacherBadge";

export function TeacherPicker({ course, section, slotIndex }: {
  course: Course; section: Section; slotIndex: number;
}) {
  const data = useStore();
  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === course.id &&
      x.section_id === section.id,
  );
  const teacherIds = cst?.teacher_ids ?? [];
  const required = COURSE_TYPE_INFO[course.course_type].teachersRequired;
  const selectedId = teacherIds[slotIndex];
  const selected = data.teachers.find(t => t.id === selectedId);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const setSlot = (tid: string | null) => {
    const next = [...teacherIds];
    next[slotIndex] = tid as any;
    const cleaned = next.filter((x): x is string => !!x);
    data.setCourseSectionTeachers(course.id, section.id, cleaned);
  };

  const list = data.teachers
    .filter(t => {
      if (!q) return true;
      const s = q.toLowerCase();
      return t.short_name.toLowerCase().includes(s) ||
             t.name.toLowerCase().includes(s) ||
             t.designation.toLowerCase().includes(s);
    })
    .sort((a, b) => a.short_name.localeCompare(b.short_name));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-7 px-2 rounded text-xs flex items-center gap-1.5 border transition-colors min-w-[64px]",
            selected ? "bg-card hover:border-primary" : "border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
          )}
        >
          {selected ? (
            <>
              <RankPill designation={selected.designation} />
              <span className="font-mono font-medium">{selected.short_name}</span>
            </>
          ) : (
            <span>+ T{slotIndex + 1}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <Input autoFocus placeholder="Search teacher..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
        </div>
        <div className="max-h-72 overflow-auto">
          {selected && (
            <button
              onClick={() => { setSlot(null); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-muted text-destructive border-b"
            >
              <X className="h-3.5 w-3.5" /> Clear selection
            </button>
          )}
          {list.map(t => {
            const exceed = teacherWouldExceed(data, t.id, course, section, required - 1);
            const isSelected = selectedId === t.id;
            const isAlsoOnThisCourse = teacherIds.includes(t.id) && !isSelected;
            return (
              <button
                key={t.id}
                disabled={isAlsoOnThisCourse}
                onClick={() => { setSlot(t.id); setOpen(false); }}
                className={cn(
                  "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted text-xs",
                  isAlsoOnThisCourse && "opacity-40 cursor-not-allowed"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <RankPill designation={t.designation} />
                    <span className="font-mono font-semibold">{t.short_name}</span>
                    <span className="text-muted-foreground truncate">{t.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span>{t.designation}</span>
                    {t.status && <Badge variant="outline" className="text-[9px] py-0 h-3.5">{t.status}</Badge>}
                    <span className={cn(exceed.exceeds && "text-destructive font-semibold")}>
                      {exceed.current.toFixed(2)}/{exceed.assigned} cr
                    </span>
                    {exceed.exceeds && <AlertCircle className="h-3 w-3 text-destructive" />}
                  </div>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
