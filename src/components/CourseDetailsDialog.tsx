import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, MapPin } from "lucide-react";
import type { Course } from "@/lib/types";

export function CourseDetailsDialog({
  course,
  open,
  onOpenChange,
}: {
  course: Course | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const data = useStore();
  if (!course) return null;

  const sections = data.sections
    .filter((s) => s.level === course.level && s.term === course.term)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-mono">{course.code}</span> — {course.name}
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              Level {course.level} · Term {course.term} · {course.credit} cr
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {sections.map((sec) => {
            const cst = data.course_section_teachers.find(
              (x) =>
                x.semester_id === data.active_semester_id &&
                x.course_id === course.id &&
                x.section_id === sec.id,
            );
            const teachers = (cst?.teacher_ids ?? [])
              .map((tid) => data.teachers.find((t) => t.id === tid))
              .filter(Boolean);
            const slots = data.class_slots
              .filter(
                (s) =>
                  s.semester_id === data.active_semester_id &&
                  s.course_id === course.id &&
                  s.section_id === sec.id,
              )
              .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));

            return (
              <div key={sec.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>Section {sec.name}</Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    {sec.total_students} students
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Teachers:</span>
                  {teachers.length === 0 && (
                    <span className="text-xs text-destructive">Not assigned</span>
                  )}
                  {teachers.map((t: any) => (
                    <Badge key={t.id} variant="outline" className="font-mono text-xs">
                      {t.short_name} <span className="text-muted-foreground ml-1">{t.name}</span>
                    </Badge>
                  ))}
                </div>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Day</th>
                        <th className="text-left px-2 py-1.5 font-medium">Time</th>
                        <th className="text-left px-2 py-1.5 font-medium">Room</th>
                        <th className="text-left px-2 py-1.5 font-medium">Week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slots.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-3 text-muted-foreground">
                            No classes scheduled
                          </td>
                        </tr>
                      )}
                      {slots.map((s) => {
                        const room = data.rooms.find((r) => r.id === s.room_id);
                        return (
                          <tr key={s.id} className="border-t">
                            <td className="px-2 py-1.5 font-semibold">{s.day}</td>
                            <td className="px-2 py-1.5 font-mono">
                              {s.start}–{s.end}
                            </td>
                            <td className="px-2 py-1.5">
                              {room ? (
                                <span className="inline-flex items-center gap-1 font-mono">
                                  <MapPin className="h-3 w-3" />
                                  {room.name}
                                </span>
                              ) : (
                                <span className="text-destructive text-xs">no room</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5">{s.week}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
