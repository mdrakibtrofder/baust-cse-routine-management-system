import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Lock, MapPin } from "lucide-react";
import { cn, compareDayAndTime, fmtRange12, tagColorClasses } from "@/lib/utils";
import type { Course, Section, Department, ClassSlot } from "@/lib/types";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { toast } from "sonner";

const TERM_ORDER = ["I", "II"];

export function LockedClassesPage() {
  const data = useStore();
  const homeDept = useMemo(
    () => data.departments.find((d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME),
    [data.departments]
  );

  // Get all locked slots
  const lockedSlots = useMemo(
    () =>
      data.class_slots
        .filter((slot) => slot.locked && slot.semester_id === data.active_semester_id)
        .sort(compareDayAndTime),
    [data.class_slots, data.active_semester_id]
  );

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
        slots: ClassSlot[];
      }[];
    }>();

    for (const slot of lockedSlots) {
      const course = data.courses.find((c) => c.id === slot.course_id);
      if (!course) continue;

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
      let entry = group.entries.find(
        (e) =>
          e.course.id === course.id &&
          (slot.lab_section_id
            ? e.labSection?.id === slot.lab_section_id
            : e.section?.id === slot.section_id)
      );

      if (!entry) {
        let section: Section | null = null;
        let labSection: any | null = null;

        if (slot.section_id) {
          section = data.sections.find((s) => s.id === slot.section_id) ?? null;
        }
        if (slot.lab_section_id) {
          labSection = data.course_lab_sections.find((ls) => ls.id === slot.lab_section_id) ?? null;
        }

        entry = {
          course,
          section,
          labSection,
          slots: [],
        };
        group.entries.push(entry);
      }

      entry.slots.push(slot);
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
  }, [lockedSlots, data.courses, data.sections, data.course_lab_sections, data.departments, homeDept]);

  const handleUnlockAll = async () => {
    for (const slot of lockedSlots) {
      await data.upsertClassSlot({ ...slot, locked: false });
    }
    toast.success("All locked slots unlocked!");
  };

  return (
    <div>
      <PageHeader
        title="Locked Classes"
        subtitle="View all locked class slots organized by department, level, and term"
      />
      <div className="p-4 sm:p-6 space-y-6">
        {lockedSlots.length > 0 && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Lock className="h-4 w-4" />
              <span className="font-medium">{lockedSlots.length} locked class slots total</span>
            </div>
            <Button variant="outline" size="sm" className="bg-white" onClick={handleUnlockAll}>
              Unlock All
            </Button>
          </div>
        )}
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No locked classes</h3>
            <p className="text-sm text-muted-foreground mt-1">
              There are currently no locked class slots in the active semester.
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
  const data = useStore();

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
              <th className="text-left px-3 py-2 font-medium">Locked Slots</th>
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

  const handleUnlockAllForEntry = async () => {
    for (const slot of entry.slots) {
      await data.upsertClassSlot({ ...slot, locked: false });
    }
  };

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
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            {entry.slots.map((slot: any) => {
              const room = data.rooms.find((r: any) => r.id === slot.room_id);
              return (
                <div key={slot.id} className="flex items-center gap-2 text-xs">
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
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
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={handleUnlockAllForEntry}>
            Unlock All
          </Button>
        </div>
      </td>
    </tr>
  );
}
