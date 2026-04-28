import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Mail, Briefcase, Building2, Award, BookOpen, Calendar } from "lucide-react";
import { teacherAssignedCreditUsed } from "@/lib/conflicts";
import { rankInfoFor } from "@/lib/teacher-rank";
import { RankPill } from "@/components/TeacherBadge";
import { cn } from "@/lib/utils";

export function TeacherDetailsDialog({
  teacherId,
  open,
  onOpenChange,
}: {
  teacherId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const data = useStore();
  const teacher = teacherId ? data.teachers.find((t) => t.id === teacherId) : null;
  if (!teacher) return null;

  const rank = rankInfoFor(teacher.designation);
  const used = teacherAssignedCreditUsed(data, teacher.id);
  const remaining = teacher.assigned_credit - used;

  // collect all course-section assignments for the active semester
  const sem = data.active_semester_id;
  const assignments = data.course_section_teachers
    .filter((cst) => cst.semester_id === sem && cst.teacher_ids.includes(teacher.id))
    .map((cst) => {
      const course = data.courses.find((c) => c.id === cst.course_id);
      const section = data.sections.find((s) => s.id === cst.section_id);
      const slots = data.class_slots.filter(
        (sl) =>
          sl.semester_id === sem &&
          sl.course_id === cst.course_id &&
          sl.section_id === cst.section_id,
      );
      return { cst, course, section, slots };
    })
    .filter((x) => x.course && x.section);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center text-base font-bold",
                rank.className,
              )}
            >
              {rank.short}
            </div>
            <div>
              <div className="text-base">{teacher.name}</div>
              <div className="text-xs text-muted-foreground font-normal flex items-center gap-1.5 mt-0.5">
                <span className="font-mono">{teacher.short_name}</span> ·{" "}
                <span>{teacher.designation}</span>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <InfoCard icon={Building2} label="Department" value={teacher.department || "—"} />
          <InfoCard icon={Briefcase} label="Status" value={teacher.status || "—"} />
          <InfoCard
            icon={Award}
            label="Assigned Credit"
            value={`${teacher.assigned_credit}`}
          />
          <InfoCard
            icon={BookOpen}
            label="Used / Remaining"
            value={
              <span>
                <span
                  className={cn(
                    used > teacher.assigned_credit + 0.001 && "text-destructive font-semibold",
                  )}
                >
                  {used.toFixed(2)}
                </span>
                <span className="text-muted-foreground"> / {remaining.toFixed(2)}</span>
              </span>
            }
          />
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Teaching Load ({assignments.length})
          </div>
          {assignments.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
              Not assigned to any course yet.
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map(({ cst, course, section, slots }) => (
                <div key={cst.id} className="rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{course!.code}</span>
                      <span className="text-sm">{course!.name}</span>
                      <Badge variant="outline">Sec {section!.name}</Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {course!.credit} cr
                      </Badge>
                    </div>
                  </div>
                  {slots.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {slots.map((sl) => {
                        const room = data.rooms.find((r) => r.id === sl.room_id);
                        return (
                          <span
                            key={sl.id}
                            className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-card border"
                          >
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {sl.day} {sl.start}–{sl.end}
                            {room && <span className="text-muted-foreground">@ {room.name}</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 bg-card">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 font-medium text-sm">{value}</div>
    </div>
  );
}
