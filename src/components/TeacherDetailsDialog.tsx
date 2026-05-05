import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Briefcase, Building2, Award, BookOpen } from "lucide-react";
import { teacherAssignedCreditUsed } from "@/lib/conflicts";
import { rankInfoFor } from "@/lib/teacher-rank";
import { cn } from "@/lib/utils";
import { RoutineView } from "@/components/RoutineView";

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
  const assigned = Number(teacher.assigned_credit_hours || 0);
  const remaining = assigned - used;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[92vh] overflow-y-auto">
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          <InfoCard icon={Building2} label="Department" value={teacher.department || "—"} />
          <InfoCard icon={Briefcase} label="Designation" value={teacher.designation || "—"} />
          <InfoCard
            icon={Award}
            label="Total Credit"
            value={`${Number(assigned).toFixed(2)}`}
          />
          <InfoCard
            icon={BookOpen}
            label="Assigned / Remaining"
            value={
              <span>
                <span
                  className={cn(
                    used > assigned + 0.001 && "text-destructive font-semibold",
                  )}
                >
                  {Number(used).toFixed(2)}
                </span>
                <span className="text-muted-foreground"> / {Number(remaining).toFixed(2)}</span>
              </span>
            }
          />
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Full Routine
          </div>
          <RoutineView scope={{ kind: "teacher", teacher_id: teacher.id }} />
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
