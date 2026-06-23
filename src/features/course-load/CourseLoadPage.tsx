import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, AlertCircle, Check, Users, FlaskConical, GitMerge } from "lucide-react";
import { cn, compareDayAndTime, fmtRange12, tagColorClasses } from "@/lib/utils";
import type { Course, Section, Department } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import { TeacherPicker } from "./TeacherPicker";
import { RoomPicker } from "./RoomPicker";
import { ClassAssignDialog } from "./ClassAssignDialog";
import { LabSectionsPanel } from "./LabSectionsPanel";
import { checkConflicts } from "@/lib/conflicts";
import { RoutineDialog } from "@/components/RoutineDialog";
import { CourseDetailsDialog } from "@/components/CourseDetailsDialog";
import { CombineSectionsDialog } from "./CombineSectionsDialog";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { toast } from "sonner";

const TERM_ORDER = ["I", "II"];

export function CourseLoadPage() {
  const data = useStore();
  const [openAssign, setOpenAssign] = useState<{ course: Course; section: Section } | null>(null);
  const [routineSection, setRoutineSection] = useState<Section | null>(null);
  const [courseDetails, setCourseDetails] = useState<Course | null>(null);

  const activeSemester = useMemo(() =>
    data.semesters.find(s => s.id === data.active_semester_id),
  [data.semesters, data.active_semester_id]);

  const homeDept = useMemo(
    () => data.departments.find((d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME),
    [data.departments],
  );

  /** Every course's columns are limited to its own department's sections for that
   *  level-term — never another department's, even though they share the level-term.
   *  This applies to Departmental and Non-Departmental courses alike: a course owned by
   *  e.g. CE, EEE, or DBA uses that department's own sections (configured on the Sections
   *  page), not CSE's. Blocks are still labeled/grouped per department, shown after every
   *  CSE-departmental block. */
  const grouped = useMemo(() => {
    const deptKey = (id: string | null | undefined) => id || homeDept?.id || "__none__";

    const deptMap = new Map<string, {
      level: number; term: string; departmental_type: string;
      department: Department | null; courses: Course[]; sections: Section[];
    }>();

    for (const c of data.courses) {
      const dk = deptKey(c.department_id);
      const k = `${c.level}|${c.term}|${c.departmental_type}|${dk}`;
      if (!deptMap.has(k)) {
        const department = c.department_id
          ? data.departments.find((d) => d.id === c.department_id) ?? null
          : homeDept ?? null;
        deptMap.set(k, {
          level: c.level, term: c.term, departmental_type: c.departmental_type,
          department,
          courses: [],
          sections: data.sections
            .filter((s) => s.level === c.level && s.term === c.term && deptKey(s.department_id) === dk)
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
      deptMap.get(k)!.courses.push(c);
    }

    const result = Array.from(deptMap.values())
      .filter((g) => g.sections.length > 0)
      .sort((a, b) => {
        const aCseDept = a.departmental_type === "Departmental" && (!homeDept || a.department?.id === homeDept.id);
        const bCseDept = b.departmental_type === "Departmental" && (!homeDept || b.department?.id === homeDept.id);
        return (
          (aCseDept === bCseDept ? 0 : aCseDept ? -1 : 1) ||
          a.level - b.level ||
          TERM_ORDER.indexOf(a.term) - TERM_ORDER.indexOf(b.term) ||
          (a.department?.short_name ?? "").localeCompare(b.department?.short_name ?? "") ||
          (a.departmental_type === b.departmental_type ? 0 : a.departmental_type === "Departmental" ? -1 : 1)
        );
      });

    for (const g of result) {
      g.courses.sort((a, b) => a.code.localeCompare(b.code));
    }

    return result;
  }, [data.courses, data.sections, data.departments, homeDept]);

  return (
    <div>
      <PageHeader
        title={`Course Load · ${activeSemester?.name ?? "..."}`}
        subtitle="Assign teachers, rooms, and class times for each course-section"
        showReset
      />
      <div className="p-4 sm:p-6 space-y-6">
        {grouped.map((g) => (
          <LevelTermBlock
            key={`${g.level}-${g.term}-${g.department?.id ?? "none"}-${g.departmental_type}`}
            level={g.level}
            term={g.term}
            departmental_type={g.departmental_type as any}
            department={g.department}
            courses={g.courses}
            sections={g.sections}
            onAssign={(c, s) => setOpenAssign({ course: c, section: s })}
            onSectionRoutine={(s) => setRoutineSection(s)}
            onCourseDetails={(c) => setCourseDetails(c)}
          />
        ))}
      </div>
      {openAssign && (
        <ClassAssignDialog
          open={!!openAssign}
          onOpenChange={(v) => !v && setOpenAssign(null)}
          course={openAssign.course}
          section={openAssign.section}
        />
      )}
      <RoutineDialog
        open={!!routineSection}
        onOpenChange={(v) => !v && setRoutineSection(null)}
        scope={routineSection ? { kind: "section", section_id: routineSection.id } : null}
        title={routineSection ? `Section ${routineSection.name} · Level ${routineSection.level}, Term ${routineSection.term}` : ""}
        subtitle="Full section routine"
      />
      <CourseDetailsDialog
        course={courseDetails}
        open={!!courseDetails}
        onOpenChange={(v) => !v && setCourseDetails(null)}
      />
    </div>
  );
}

function LevelTermBlock({ level, term, departmental_type, department, courses, sections, onAssign, onSectionRoutine, onCourseDetails }: {
  level: number; term: string; departmental_type: "Departmental" | "Non-Departmental"; department: Department | null;
  courses: Course[]; sections: Section[];
  onAssign: (c: Course, s: Section) => void;
  onSectionRoutine: (s: Section) => void;
  onCourseDetails: (c: Course) => void;
}) {
  const totalCredit = courses.reduce((s, c) => s + (Number(c.credit) || 0), 0);
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
      >
        <div>
          <h2 className="font-bold text-base flex items-center gap-2">
            {departmental_type === "Departmental" ? `Level ${level}, Term ${term}` : `Non-Departmental · Level ${level}, Term ${term}`}
            {department && (
              <span className={cn(
                "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold",
                tagColorClasses(department.id, department.short_name),
              )}>
                {department.short_name}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs opacity-90">
              {courses.length} courses · {sections.length} section{sections.length !== 1 ? "s" : ""} · {totalCredit.toFixed(2)} credits
            </p>
            <Badge variant="outline" className="bg-white/20 border-white/30 text-white text-[10px] py-0 h-4 backdrop-blur-sm">
              {departmental_type}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => onSectionRoutine(s)}
              title="View full section routine"
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-white/20 text-white border border-white/30 hover:bg-white/30 transition"
            >
              <span>Section {s.name}</span>
              <span className="inline-flex items-center gap-0.5 opacity-90">
                <Users className="h-3 w-3" />
                {s.total_students}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium min-w-[200px]">Title</th>
              <th className="text-center px-3 py-2 font-medium">Credit</th>
              <th className="text-center px-3 py-2 font-medium">Total Hours</th>
              {sections.map(s => (
                <th key={s.id} className="text-left px-3 py-2 font-medium border-l min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <span>Section {s.name}</span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-normal">
                      <Users className="h-3 w-3" />
                      {s.total_students}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {courses.map((c, idx) => (
              <CourseRow key={c.id} course={c} sections={sections} onAssign={onAssign} alt={idx % 2 === 1} onCourseDetails={onCourseDetails} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseRow({ course, sections, onAssign, alt, onCourseDetails }: {
  course: Course; sections: Section[]; onAssign: (c: Course, s: Section) => void; alt: boolean;
  onCourseDetails: (c: Course) => void;
}) {
  const data = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];
  const isSessional = info.roomKind === "sessional";
  const [labSectionsOpen, setLabSectionsOpen] = useState(false);

  const labSectionCount = data.course_lab_sections.filter(
    (g) => g.course_id === course.id && g.semester_id === data.active_semester_id,
  ).length;

  return (
    <>
      <tr className={cn("border-b", alt && "bg-muted/20")}>
        <td className="px-3 py-2 align-top">
          <div className="space-y-1">
            <button onClick={() => onCourseDetails(course)} className="font-mono text-xs font-medium hover:text-primary hover:underline" title="View course details">
              {course.code}
            </button>
            {isSessional && (
              <button
                onClick={() => setLabSectionsOpen(true)}
                className={cn(
                  "flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border transition-colors",
                  labSectionCount > 0
                    ? "border-purple-400 bg-purple-50 text-purple-700 hover:bg-purple-100"
                    : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-purple-400 hover:text-purple-600",
                )}
              >
                <FlaskConical className="h-2.5 w-2.5" />
                {labSectionCount > 0 ? `${labSectionCount} lab sections` : "Lab sections"}
              </button>
            )}
          </div>
        </td>
        <td className="px-3 py-2 align-top">
          <button onClick={() => onCourseDetails(course)} className="text-left hover:text-primary hover:underline" title="View course details">
            {course.name}
          </button>
        </td>
        <td className="px-3 py-2 text-center align-top font-medium">{course.credit}</td>
        <td className="px-3 py-2 text-center align-top">
          <Badge variant={course.sessional > 0 ? "default" : "secondary"} className="text-[10px] whitespace-nowrap">
            {info.classCount}×{info.classDuration % 60 === 0 ? `${info.classDuration / 60}h` : `${info.classDuration}m`}
          </Badge>
        </td>
        {(() => {
          // A section combined into another's cst.combined_section_ids is rendered
          // merged into the primary section's cell (colSpan), not as its own column.
          const hiddenSecondaryIds = new Set<string>();
          for (const s of sections) {
            const cst = data.course_section_teachers.find(
              (x) => x.semester_id === data.active_semester_id && x.course_id === course.id && x.section_id === s.id,
            );
            cst?.combined_section_ids?.forEach((id) => {
              if (sections.some((sec) => sec.id === id)) hiddenSecondaryIds.add(id);
            });
          }
          return sections
            .filter((s) => !hiddenSecondaryIds.has(s.id))
            .map((s) => {
              const cst = data.course_section_teachers.find(
                (x) => x.semester_id === data.active_semester_id && x.course_id === course.id && x.section_id === s.id,
              );
              const combinedWith = (cst?.combined_section_ids ?? [])
                .map((id) => sections.find((sec) => sec.id === id))
                .filter(Boolean) as Section[];
              return (
                <SectionCell
                  key={s.id}
                  course={course}
                  section={s}
                  sections={sections}
                  onAssign={onAssign}
                  onManageLabSections={() => setLabSectionsOpen(true)}
                  combinedWith={combinedWith}
                  colSpan={1 + combinedWith.length}
                />
              );
            });
        })()}
      </tr>
      {isSessional && labSectionsOpen && (
        <LabSectionsPanel
          course={course}
          sections={sections}
          open={labSectionsOpen}
          onClose={() => setLabSectionsOpen(false)}
        />
      )}
    </>
  );
}

function SectionCell({ course, section, sections, onAssign, onManageLabSections, combinedWith = [], colSpan = 1 }: {
  course: Course; section: Section; sections: Section[]; onAssign: (c: Course, s: Section) => void;
  onManageLabSections?: () => void;
  combinedWith?: Section[];
  colSpan?: number;
}) {
  const [combineOpen, setCombineOpen] = useState(false);
  const [uncombining, setUncombining] = useState(false);
  const data = useStore();
  const { setCourseSectionTeachers } = useStore();
  const info = COURSE_TYPE_INFO[course.course_type];

  // If this course has lab sections mapped to this actual section, the cell splits into
  // one sub-block per lab section instead of a single teacher/room/schedule block.
  const labSections = data.course_lab_sections.filter(
    (g) =>
      g.course_id === course.id &&
      g.semester_id === data.active_semester_id &&
      g.section_ids.includes(section.id),
  );
  if (labSections.length > 0) {
    return (
      <td className="px-3 py-2 border-l align-top">
        <div className="space-y-2">
          {labSections.map((g) => {
            const gSlots = data.class_slots
              .filter((s) => s.lab_section_id === g.id)
              .sort(compareDayAndTime);
            return (
              <div key={g.id} className="rounded-md border border-purple-200 bg-purple-50/40 px-2 py-1.5 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-purple-700 uppercase">
                    <FlaskConical className="h-2.5 w-2.5" /> {g.label}
                  </span>
                  <div className="flex gap-1">
                    {g.teacher_ids.map((tid) => {
                      const t = data.teachers.find((x) => x.id === tid);
                      return t ? (
                        <Badge key={tid} variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                          {t.short_name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
                {gSlots.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground">No schedule yet</div>
                ) : (
                  gSlots.map((slot) => {
                    const room = data.rooms.find((r) => r.id === slot.room_id);
                    return (
                      <div key={slot.id} className="flex items-center gap-1 font-mono text-[10px]">
                        <span className="font-semibold">{slot.day}</span>
                        <span>{fmtRange12(slot.start, slot.end)}</span>
                        {room && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{room.name}</Badge>}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
          <Button variant="outline" size="sm" className="w-full h-6 text-[10px] gap-1" onClick={onManageLabSections}>
            <FlaskConical className="h-2.5 w-2.5" /> Manage lab sections
          </Button>
        </div>
      </td>
    );
  }

  const cst = data.course_section_teachers.find(
    x => x.semester_id === data.active_semester_id && x.course_id === course.id && x.section_id === section.id
  );
  const teacherIds = cst?.teacher_ids ?? [];
  const slots = data.class_slots
    .filter(s => s.semester_id === data.active_semester_id && s.course_id === course.id && s.section_id === section.id)
    .sort(compareDayAndTime);

  // gather conflicts on existing slots
  const allConflicts = slots.flatMap(slot =>
    checkConflicts({
      data, course, section, teacherIds,
      candidate: { day: slot.day, start: slot.start, end: slot.end, room_id: slot.room_id, week: slot.week },
      ignoreSlotId: slot.id,
    })
  );

  const teachersOk = teacherIds.length > 0;
  const slotsOk = slots.length === info.classCount;
  const allOk = teachersOk && slotsOk && allConflicts.length === 0;

  const handleUncombine = async () => {
    setUncombining(true);
    try {
      await setCourseSectionTeachers(
        course.id,
        section.id,
        cst?.teacher_ids ?? [],
        cst?.primary_room_id ?? null,
        cst?.slot_teacher_ids ?? null,
        null,
      );
      toast.success("Sections uncombined.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to uncombine sections.");
    } finally {
      setUncombining(false);
    }
  };

  return (
    <td className="px-3 py-2 border-l align-top" colSpan={colSpan}>
      <div className="space-y-1.5">
        {combinedWith.length > 0 && (
          <div className="flex items-center justify-between gap-1.5 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-1">
            <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700">
              <GitMerge className="h-2.5 w-2.5" />
              Combined: Sec {section.name} + {combinedWith.map((s) => s.name).join(" + ")}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100"
              onClick={handleUncombine}
              disabled={uncombining}
            >
              Uncombine
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: info.teachersRequired }).map((_, i) => (
            <TeacherPicker key={i} course={course} section={section} slotIndex={i} />
          ))}
          <RoomPicker course={course} section={section} />
        </div>
        <button
          onClick={() => onAssign(course, section)}
          className={cn(
            "w-full text-left rounded-md border px-2 py-1.5 text-[11px] hover:border-primary transition-colors",
            allOk && "border-success/50 bg-success/5",
            allConflicts.length > 0 && "border-destructive/50 bg-destructive/5",
            !slotsOk && allConflicts.length === 0 && "border-dashed text-muted-foreground"
          )}
        >
          {slots.length === 0 ? (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Class Schedule — assign {info.classCount} class{info.classCount > 1 ? "es" : ""}
            </span>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Calendar className="h-3 w-3" /> Class Schedule
              </div>
              {slots.map(slot => {
                const room = data.rooms.find(r => r.id === slot.room_id);
                return (
                  <div key={slot.id} className="flex items-center gap-1.5 font-mono">
                    <span className="font-semibold">{slot.day}</span>
                    <span>{fmtRange12(slot.start, slot.end)}</span>
                    {room ? <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{room.name}</Badge> :
                      <span className="text-destructive">no room</span>}
                    {slot.week !== "EVERY" && <span className="text-[9px] text-muted-foreground">#{slot.week}</span>}
                  </div>
                );
              })}
              <div className="flex items-center gap-1 pt-0.5">
                {allOk && <span className="flex items-center gap-1 text-success"><Check className="h-3 w-3" /> Completed</span>}
                {allConflicts.length > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-3 w-3" /> {allConflicts.length} conflict{allConflicts.length>1?"s":""}
                  </span>
                )}
                {!slotsOk && (
                  <span className="text-warning">{slots.length}/{info.classCount} classes</span>
                )}
              </div>
            </div>
          )}
        </button>
        {/* Combine sections — only show if there are multiple sections in the level-term
            and this section isn't already combined (use "Uncombine" above instead) */}
        {sections.length > 1 && combinedWith.length === 0 && (
          <>
            <button
              onClick={() => setCombineOpen(true)}
              className="flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border transition-colors w-full border-dashed border-muted-foreground/40 text-muted-foreground hover:border-indigo-400 hover:text-indigo-600"
            >
              <GitMerge className="h-2.5 w-2.5" />
              Combine sections
            </button>
            {combineOpen && (
              <CombineSectionsDialog
                course={course}
                primarySection={section}
                allSections={sections}
                open={combineOpen}
                onClose={() => setCombineOpen(false)}
              />
            )}
          </>
        )}
      </div>
    </td>
  );
}
