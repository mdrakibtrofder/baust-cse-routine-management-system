import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { Download, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTAssignment } from "@/lib/types";
import { toast } from "sonner";
import { exportTeacherWiseCTPdf } from "@/lib/ct-export";
import { teacherDeptShort, sortHomeDeptFirst } from "@/lib/room-dept";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { ctRoomNames, filterCTsByDepartmental, compareCTsByLevelTerm } from "@/lib/ct-schedule-utils";
import { NonDepartmentalToggle } from "@/components/NonDepartmentalToggle";
import { TeacherRoutineLink } from "@/components/RoutineLink";

/** CT schedule grouped by teacher, resolved through course_section_teachers for the
 *  active semester. Home-department (CSE) teachers are listed first. */
export function CTTeacherViewPage() {
  const store = useStore();
  const { active_semester_id, teachers, course_section_teachers, rooms } = store;
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNonDepartmental, setShowNonDepartmental] = useState(false);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      setAssignments(await api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`));
    } catch {
      toast.error("Failed to load CT assignments");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Everything below — including the download — works off this filtered list. */
  const visible = useMemo(
    () => filterCTsByDepartmental(assignments, showNonDepartmental),
    [assignments, showNonDepartmental],
  );

  const groups = useMemo(() => {
    // course -> teachers assigned to it this semester
    const teacherIdsByCourse = new Map<string, Set<string>>();
    for (const cst of course_section_teachers) {
      if (cst.semester_id !== active_semester_id) continue;
      if (!teacherIdsByCourse.has(cst.course_id)) teacherIdsByCourse.set(cst.course_id, new Set());
      const set = teacherIdsByCourse.get(cst.course_id)!;
      for (const tid of cst.teacher_ids ?? []) set.add(tid);
    }

    const byTeacher = new Map<string, CTAssignment[]>();
    for (const a of visible) {
      for (const tid of teacherIdsByCourse.get(a.course_id) ?? []) {
        if (!byTeacher.has(tid)) byTeacher.set(tid, []);
        byTeacher.get(tid)!.push(a);
      }
    }

    const involved = teachers
      .filter((t) => byTeacher.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return sortHomeDeptFirst(involved, teacherDeptShort).map((teacher) => ({
      teacher,
      dept: teacherDeptShort(teacher),
      rows: byTeacher
        .get(teacher.id)!
        .slice()
        // Level-term order, so a reader scans the schedule cohort by cohort.
        .sort(compareCTsByLevelTerm),
    }));
  }, [visible, teachers, course_section_teachers, active_semester_id]);

  if (loading && assignments.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Teacher-wise CT Schedule"
        subtitle={`Class tests grouped by teacher — ${HOME_DEPT_SHORT_NAME} teachers first`}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-black text-primary">
              <Users className="h-5 w-5" /> Teacher View
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length} teacher(s) across {visible.length} class tests
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NonDepartmentalToggle checked={showNonDepartmental} onChange={setShowNonDepartmental} />
            <Button
              variant="outline"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => exportTeacherWiseCTPdf(store, visible)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Teacher-wise Schedule
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/10 py-24 text-muted-foreground">
            <p className="text-lg font-medium">No class tests mapped to a teacher yet.</p>
            <p className="text-sm">Generate the CT schedule and assign course teachers first.</p>
          </div>
        ) : (
          groups.map(({ teacher, dept, rows }) => (
            <div key={teacher.id} className="overflow-hidden rounded-2xl border-2 bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                <h4 className="text-sm font-black text-primary">{teacher.name}</h4>
                <TeacherRoutineLink
                  teacherId={teacher.id}
                  className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-muted-foreground hover:text-primary"
                >
                  {teacher.short_name}
                </TeacherRoutineLink>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                    dept === HOME_DEPT_SHORT_NAME
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {dept}
                </span>
                <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {rows.length} CTs
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 border-primary/20 bg-primary/5">
                      <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">Week</TableHead>
                      <TableHead className="w-[150px] text-xs font-black uppercase tracking-wider text-primary">Date &amp; Day</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-wider text-primary">Course</TableHead>
                      <TableHead className="w-[100px] text-xs font-black uppercase tracking-wider text-primary">Level-Term</TableHead>
                      <TableHead className="w-[110px] text-xs font-black uppercase tracking-wider text-primary">Room</TableHead>
                      <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">CT No.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a, idx) => (
                      <TableRow key={`${teacher.id}-${a.id}`} className={cn("border-b", idx % 2 === 1 && "bg-muted/30")}>
                        <TableCell className="text-sm font-bold text-primary">Week {a.week_number}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          <div className="flex flex-col">
                            <span>{format(parseISO(a.date.split("T")[0]), "dd MMM yyyy")}</span>
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {format(parseISO(a.date.split("T")[0]), "EEEE")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono font-black">{a.course?.code}</span>
                          <span className="text-muted-foreground"> — {a.course?.name}</span>
                        </TableCell>
                        <TableCell className="text-sm font-bold">
                          {a.course?.level}-{a.course?.term}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold">{ctRoomNames(a, rooms)}</TableCell>
                        <TableCell className="text-sm font-black text-primary">CT {a.ct_number}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
