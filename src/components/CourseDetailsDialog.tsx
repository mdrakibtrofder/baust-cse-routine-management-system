import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, MapPin, Calendar, Clock, GraduationCap, Sparkles } from "lucide-react";
import type { Course } from "@/lib/types";
import { TeacherChip } from "@/components/TeacherBadge";
import { cn } from "@/lib/utils";

const DEFAULT_DEPT = "CSE";

const SECTION_GRADIENTS = [
  "from-indigo-500/15 via-purple-500/10 to-pink-500/15 border-indigo-300/40",
  "from-emerald-500/15 via-teal-500/10 to-cyan-500/15 border-emerald-300/40",
  "from-amber-500/15 via-orange-500/10 to-rose-500/15 border-amber-300/40",
  "from-sky-500/15 via-blue-500/10 to-violet-500/15 border-sky-300/40",
  "from-fuchsia-500/15 via-pink-500/10 to-red-500/15 border-fuchsia-300/40",
];

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Hero header */}
        <div
          className="px-6 py-5 rounded-t-lg"
          style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap text-primary-foreground">
              <Sparkles className="h-5 w-5" />
              <span className="font-mono text-lg">{course.code}</span>
              <span className="text-lg font-normal opacity-95">— {course.name}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap mt-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                <GraduationCap className="h-3 w-3" />
                Level {course.level} · Term {course.term}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                {course.credit} cr
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                {course.theory > 0 && `${course.theory}h theory`}
                {course.theory > 0 && course.sessional > 0 && " · "}
                {course.sessional > 0 && `${course.sessional}h lab`}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur">
                {sections.length} section{sections.length === 1 ? "" : "s"}
              </span>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-4">
          {sections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No sections exist for Level {course.level}, Term {course.term}.
            </div>
          )}
          {sections.map((sec, idx) => {
            const cst = data.course_section_teachers.find(
              (x) =>
                x.semester_id === data.active_semester_id &&
                x.course_id === course.id &&
                x.section_id === sec.id,
            );
            const teachers = (cst?.teacher_ids ?? [])
              .map((tid) => data.teachers.find((t) => t.id === tid))
              .filter(Boolean) as any[];
            const slots = data.class_slots
              .filter(
                (s) =>
                  s.semester_id === data.active_semester_id &&
                  s.course_id === course.id &&
                  s.section_id === sec.id,
              )
              .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start));
            const gradient = SECTION_GRADIENTS[idx % SECTION_GRADIENTS.length];

            return (
              <div
                key={sec.id}
                className={cn(
                  "rounded-xl border bg-gradient-to-br p-4 space-y-3 shadow-sm transition hover:shadow-md",
                  gradient,
                )}
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-white/70 backdrop-blur font-bold text-base shadow-sm">
                      {sec.name}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">
                        {DEFAULT_DEPT} {course.level}-{course.term} · Section {sec.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {sec.total_students} students
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white/60 backdrop-blur">
                    {slots.length} class{slots.length === 1 ? "" : "es"}/wk
                  </Badge>
                </div>

                {/* Teachers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Teachers
                  </span>
                  {teachers.length === 0 ? (
                    <Badge variant="destructive" className="text-[10px]">Not assigned</Badge>
                  ) : (
                    teachers.map((t) => (
                      <div key={t.id} className="bg-white/70 backdrop-blur rounded px-1.5 py-0.5 border">
                        <TeacherChip teacher={t} />
                        <span className="ml-1 text-[10px] text-muted-foreground">{t.designation}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Class list */}
                <div className="space-y-1.5">
                  {slots.length === 0 && (
                    <div className="text-xs text-muted-foreground italic px-2 py-3 text-center bg-white/40 rounded-md">
                      No classes scheduled yet.
                    </div>
                  )}
                  {slots.map((s) => {
                    const room = data.rooms.find((r) => r.id === s.room_id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 flex-wrap bg-white/70 backdrop-blur rounded-lg px-3 py-2 text-xs border border-white/60 hover:bg-white/90 transition"
                      >
                        <span className="inline-flex items-center gap-1 font-bold text-primary">
                          <Calendar className="h-3 w-3" />
                          {s.day}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3" />
                          {s.start}–{s.end}
                        </span>
                        {room ? (
                          <span className="inline-flex items-center gap-1 font-mono px-1.5 py-0.5 rounded bg-orange-100/80 text-orange-900 border border-orange-200">
                            <MapPin className="h-3 w-3" />
                            {room.name}
                          </span>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">no room</Badge>
                        )}
                        {s.week !== "EVERY" && (
                          <Badge variant="outline" className="text-[10px] bg-fuchsia-100/70 border-fuchsia-300 text-fuchsia-900">
                            {s.week} weeks
                          </Badge>
                        )}
                        {teachers.length > 0 && (
                          <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                            {teachers.map((t) => t.short_name).join(", ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
