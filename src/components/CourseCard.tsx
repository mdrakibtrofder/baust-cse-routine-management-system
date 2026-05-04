import { useStore } from "@/lib/store";
import { BookOpen, FlaskConical, CreditCard, Users, GraduationCap } from "lucide-react";
import { COURSE_TYPE_INFO, type Course, type Section } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CourseCard({ course, section }: { course: Course; section?: Section }) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const isSessional = info.roomKind === "sessional";

  // Find all sections this course is assigned to in the active semester
  const assignedSections = data.course_section_teachers
    .filter(cst => cst.semester_id === data.active_semester_id && cst.course_id === course.id)
    .map(cst => data.sections.find(s => s.id === cst.section_id))
    .filter(Boolean) as Section[];

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className={cn(
        "px-4 py-3 border-b flex items-center justify-between gap-3",
        isSessional ? "bg-purple-50" : "bg-blue-50"
      )}>
        <div className="flex items-center gap-2">
          {isSessional ? (
            <FlaskConical className="h-4 w-4 text-purple-600" />
          ) : (
            <BookOpen className="h-4 w-4 text-blue-600" />
          )}
          <h3 className="font-bold text-sm tracking-tight">{course.code} — {course.name}</h3>
        </div>
        <Badge variant={isSessional ? "default" : "secondary"} className={cn(
          "text-[10px] font-bold uppercase",
          isSessional ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700 text-white"
        )}>
          {info.label}
        </Badge>
      </div>
      
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1">
            <GraduationCap className="h-3 w-3" /> Level-Term
          </div>
          <div className="font-semibold">{course.level}-{course.term}</div>
        </div>
        
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1">
            <CreditCard className="h-3 w-3" /> Credits
          </div>
          <div className="font-semibold text-amber-700">{Number(course.credit).toFixed(2)} CR</div>
        </div>

        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> Enrolled Sections
          </div>
          <div className="flex flex-wrap gap-1">
            {assignedSections.length > 0 ? (
              assignedSections.map(s => (
                <Badge key={s.id} variant="outline" className={cn(
                  "px-1.5 py-0 text-[10px]",
                  s.id === section?.id && "border-primary bg-primary/5 text-primary"
                )}>
                  {s.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-1">
            <BookOpen className="h-3 w-3" /> Breakdown
          </div>
          <div className="font-medium text-slate-600">
            {course.theory > 0 && `${course.theory}T`}
            {course.theory > 0 && course.sessional > 0 && " + "}
            {course.sessional > 0 && `${course.sessional}S`}
          </div>
        </div>
      </div>
    </div>
  );
}
