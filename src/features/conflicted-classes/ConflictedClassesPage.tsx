import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin } from "lucide-react";
import { cn, compareDayAndTime, fmtRange12, tagColorClasses } from "@/lib/utils";
import type { Course, Section, Department, ClassSlot } from "@/lib/types";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { checkConflicts, type Conflict } from "@/lib/conflicts";

const TERM_ORDER = ["I", "II"];

export function ConflictedClassesPage() {
  const data = useStore();
  const homeDept = useMemo(
    () => data.departments.find((d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME),
    [data.departments]
  );

  // Get all slots for active semester
  const semesterSlots = useMemo(
    () =>
      data.class_slots
        .filter((slot) => slot.semester_id === data.active_semester_id)
        .sort(compareDayAndTime),
    [data.class_slots, data.active_semester_id]
  );

  // Find slots that have conflicts
  const conflictedSlots = useMemo(() => {
    const csts = data.course_section_teachers.filter(
      (c) => c.semester_id === data.active_semester_id
    );

    const results: { slot: ClassSlot; course: Course; section: Section | null; conflicts: Conflict[] }[] = [];

    for (const slot of semesterSlots) {
      const course = data.courses.find((c) => c.id === slot.course_id);
      if (!course) continue;

      const section = slot.section_id
        ? data.sections.find((s) => s.id === slot.section_id) ?? null
        : null;

      // Find teachers assigned to this course-section
      const cst = csts.find(
        (x) => x.course_id === slot.course_id && x.section_id === slot.section_id
      );
      const teacherIds = cst?.teacher_ids ?? [];

      if (!section) continue;

      const conflicts = checkConflicts({
        data,
        course,
        section,
        teacherIds,
        candidate: {
          day: slot.day,
          start: slot.start,
          end: slot.end,
          room_id: slot.room_id,
          week: slot.week,
        },
        ignoreSlotId: slot.id,
      });

      if (conflicts.length > 0) {
        results.push({ slot, course, section, conflicts });
      }
    }

    return results;
  }, [semesterSlots, data]);

  // Group by dept, level, term
  const grouped = useMemo(() => {
    const deptKey = (deptId: string | null | undefined) => deptId || homeDept?.id || "__none__";

    const map = new Map<string, {
      level: number;
      term: string;
      department: Department | null;
      entries: {
        course: Course;
        section: Section | null;
        labSection: any | null;
        slots: (ClassSlot & { conflicts: Conflict[] })[];
      }[];
    }>();

    for (const { slot, course, section, conflicts } of conflictedSlots) {
      const dk = deptKey(course.department_id);
      const key = `${course.level}|${course.term}|${dk}`;

      if (!map.has(key)) {
        const dept = course.department_id
          ? data.departments.find((d) => d.id === course.department_id) ?? null
          : homeDept ?? null;
        map.set(key, {
          level: course.level,
          term: course.term,
          department: dept,
          entries: [],
        });
      }

      const group = map.get(key)!;

      // Find if entry exists for course and section/lab
      let labSection: any | null = null;
      if (slot.lab_section_id) {
        labSection = data.course_lab_sections.find((ls) => ls.id === slot.lab_section_id) ?? null;
      }

      let entry = group.entries.find(
        (e) =>
          e.course.id === course.id &&
          (slot.lab_section_id
            ? e.labSection?.id === slot.lab_section_id
            : e.section?.id === slot.section_id)
      );

      if (!entry) {
        entry = {
          course,
          section,
          labSection,
          slots: [],
        };
        group.entries.push(entry);
      }

      entry.slots.push({ ...slot, conflicts });
    }

    // Sort entries
    return Array.from(map.values())
      .sort((a, b) => {
        const aHome = a.department?.id === homeDept?.id;
        const bHome = b.department?.id === homeDept?.id;
        if (aHome && !bHome) return -1;
        if (!aHome && bHome) return 1;
        return (
          a.level - b.level ||
          TERM_ORDER.indexOf(a.term) - TERM_ORDER.indexOf(b.term) ||
          (a.department?.short_name ?? "").localeCompare(b.department?.short_name ?? "")
        );
      })
      .map((g) => ({
        ...g,
        entries: g.entries.sort((a, b) => a.course.code.localeCompare(b.course.code)),
      }));
  }, [conflictedSlots, data.departments, data.course_lab_sections, homeDept]);

  const totalConflictCount = conflictedSlots.reduce((sum, s) => sum + s.conflicts.length, 0);

  return (
    <div>
      <PageHeader
        title="Conflicted Classes"
        subtitle="View all class slots with scheduling conflicts organized by department, level, and term"
      />
      <div className="p-4 sm:p-6 space-y-6">
        {conflictedSlots.length > 0 && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {totalConflictCount} conflict{totalConflictCount !== 1 ? "s" : ""} across{" "}
                {conflictedSlots.length} class slot{conflictedSlots.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No conflicted classes</h3>
            <p className="text-sm text-muted-foreground mt-1">
              There are currently no scheduling conflicts in the active semester.
            </p>
          </div>
        ) : (
          grouped.map((group) => (
            <LevelTermBlock key={`${group.level}-${group.term}-${group.department?.id ?? "none"}`} {...group} />
          ))
        )}
      </div>
    </div>
  );
}

function LevelTermBlock({ level, term, department, entries }: any) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
        <h2 className="font-bold text-base">
          Level {level}, Term {term}
        </h2>
        {department && (
          <Badge className={cn(tagColorClasses(department.id, department.short_name), "text-white border-white/30 bg-opacity-20")}>
            {department.short_name}
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Course</th>
              <th className="text-left px-3 py-2 font-medium">Section / Lab</th>
              <th className="text-left px-3 py-2 font-medium">Conflicted Slots</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry: any) => (
              <CourseRow key={`${entry.course.id}-${entry.section?.id ?? entry.labSection?.id}`} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CourseRow({ entry }: { entry: any }) {
  const data = useStore();

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-3 py-2 align-top">
        <div className="font-mono text-sm font-medium">{entry.course.code}</div>
        <div className="text-sm text-muted-foreground">{entry.course.name}</div>
      </td>
      <td className="px-3 py-2 align-top">
        {entry.section ? (
          <span className="font-medium">Section {entry.section.name}</span>
        ) : entry.labSection ? (
          <span className="font-medium text-purple-700">{entry.labSection.label}</span>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="space-y-2">
          {entry.slots.map((slot: any) => {
            const room = data.rooms.find((r: any) => r.id === slot.room_id);
            return (
              <div key={slot.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="font-mono font-semibold">{slot.day}</span>
                  <span className="font-mono">{fmtRange12(slot.start, slot.end)}</span>
                  {room && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      <MapPin className="h-2.5 w-2.5 mr-0.5" /> {room.name}
                    </Badge>
                  )}
                  {slot.week !== "EVERY" && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      #{slot.week}
                    </Badge>
                  )}
                </div>
                <div className="pl-5 space-y-0.5">
                  {slot.conflicts.map((c: Conflict, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700">
                      <ConflictTypeBadge type={c.type} />
                      <span>{c.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </td>
    </tr>
  );
}

function ConflictTypeBadge({ type }: { type: Conflict["type"] }) {
  const labels: Record<Conflict["type"], string> = {
    room_double: "Room",
    room_capacity: "Capacity",
    room_type: "Room Type",
    teacher_double: "Teacher",
    section_double: "Section",
    teacher_credit: "Credit",
    self_duplicate: "Duplicate",
    teacher_unavailable: "Unavailable",
    room_unavailable: "Room N/A",
  };

  return (
    <Badge
      variant="outline"
      className="text-[9px] px-1 py-0 h-3.5 shrink-0 border-red-300 text-red-700 bg-red-50"
    >
      {labels[type] ?? type}
    </Badge>
  );
}
