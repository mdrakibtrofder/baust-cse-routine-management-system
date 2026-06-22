import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, compareTimeValues, fmtRange12, fmtTime12, sortDays, tagColorClasses } from "@/lib/utils";
import { timesOverlap, teacherUnavailableAt, roomUnavailableAt } from "@/lib/conflicts";
import {
  Users, MapPin, Clock, BookOpen, UserX, DoorClosed, Check, Search, CalendarDays, Boxes, DoorOpen
} from "lucide-react";
import type { Course, Section, Teacher, Room, Period, ClassSlot, Department } from "@/lib/types";
import { RoomPicker } from "@/features/course-load/RoomPicker";
import { Input } from "@/components/ui/input";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";

const TERM_ORDER = ["I", "II"];

export function RoomTimeMappingPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Room & Time Mapping"
        subtitle="Manage primary rooms for sections and track teacher/room availability across time slots"
      />
      <div className="p-4 sm:p-6 space-y-6">
        <Tabs defaultValue="section-room" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl">
            <TabsTrigger value="section-room" className="gap-2">
              <Boxes className="h-4 w-4" /> Section vs Room
            </TabsTrigger>
            <TabsTrigger value="teacher-time" className="gap-2">
              <Users className="h-4 w-4" /> Teacher vs Time
            </TabsTrigger>
            <TabsTrigger value="room-time" className="gap-2">
              <DoorOpen className="h-4 w-4" /> Room vs Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="section-room" className="mt-6">
            <SectionRoomMapping />
          </TabsContent>

          <TabsContent value="teacher-time" className="mt-6">
            <TeacherTimeMapping />
          </TabsContent>

          <TabsContent value="room-time" className="mt-6">
            <RoomTimeMapping />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SectionRoomMapping() {
  const data = useStore();
  const [q, setQ] = useState("");

  const homeDept = useMemo(
    () => data.departments.find((d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME),
    [data.departments],
  );

  /** Departmental courses' sections are scoped to their own department, mirroring Course
   *  Load. Non-Departmental courses are owned/offered by another department (e.g. ENG, CE,
   *  DBA) but taken by the home department's (CSE) students, so they use CSE's sections —
   *  while still being labeled and grouped separately per owning department, sorted after
   *  every CSE-departmental block instead of being merged into it or dropped for lacking
   *  their own sections. */
  const grouped = useMemo(() => {
    const deptKey = (id: string | null | undefined) => id || homeDept?.id || "__none__";

    const blockMap = new Map<string, {
      level: number; term: string; departmental_type: string; department: Department | null;
      courses: Course[]; sections: Section[];
    }>();

    for (const c of data.courses) {
      const isNonDept = c.departmental_type === "Non-Departmental";
      const sectionScopeKey = isNonDept ? (homeDept?.id || "__none__") : deptKey(c.department_id);
      const labelDeptId = c.department_id || homeDept?.id || null;
      const k = `${c.level}|${c.term}|${c.departmental_type}|${labelDeptId ?? "__none__"}`;
      if (!blockMap.has(k)) {
        const department = labelDeptId ? data.departments.find((d) => d.id === labelDeptId) ?? null : null;
        blockMap.set(k, {
          level: c.level, term: c.term, departmental_type: c.departmental_type, department,
          courses: [],
          sections: data.sections
            .filter((s) => s.level === c.level && s.term === c.term && deptKey(s.department_id) === sectionScopeKey)
            .sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
      blockMap.get(k)!.courses.push(c);
    }

    const filterByQ = (text: string) => text.toLowerCase().includes(q.toLowerCase());

    const result = Array.from(blockMap.values())
      .filter((g) => {
        if (!q) return true;
        if (filterByQ(`Level ${g.level} Term ${g.term}`) || filterByQ(g.department?.short_name ?? "")) return true;
        return g.sections.some((s) => filterByQ(s.name));
      })
      .filter((g) => g.sections.length > 0)
      .filter((g) =>
        g.sections.some((s) =>
          g.courses.some((c) =>
            data.course_section_teachers.some(
              (x) => x.semester_id === data.active_semester_id && x.course_id === c.id && x.section_id === s.id,
            ),
          ),
        ),
      )
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
  }, [data.courses, data.sections, data.departments, data.course_section_teachers, data.active_semester_id, homeDept, q]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search level, term or section..." 
          value={q} 
          onChange={e => setQ(e.target.value)}
          className="h-9"
        />
      </div>

      <div className="space-y-8">
        {grouped.map((g) => (
          <SectionRoomBlock
            key={`${g.level}-${g.term}-${g.department?.id ?? "none"}-${g.departmental_type}`}
            group={g}
          />
        ))}
      </div>
    </div>
  );
}

function SectionRoomBlock({ group }: { group: any }) {
  const data = useStore();

  const getSectionRoomSummary = (sid: string, courses: Course[]) => {
    const roomCounts: Record<string, number> = {};

    courses.forEach(c => {
      const cst = data.course_section_teachers.find(
        x => x.semester_id === data.active_semester_id && x.course_id === c.id && x.section_id === sid
      );
      if (cst?.primary_room_id) {
        const room = data.rooms.find(r => r.id === cst.primary_room_id);
        if (room) {
          roomCounts[room.name] = (roomCounts[room.name] || 0) + 1;
        }
      } else {
        roomCounts["Unassigned"] = (roomCounts["Unassigned"] || 0) + 1;
      }
    });

    return Object.entries(roomCounts)
      .map(([room, count]) => `${count} ${count > 1 ? 'courses' : 'course'} in ${room}`)
      .join(", ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="font-bold text-lg text-primary">
          Level {group.level}, Term {group.term}
        </h3>
        {group.department && (
          <span className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold",
            tagColorClasses(group.department.id),
          )}>
            {group.department.short_name}
          </span>
        )}
        {group.departmental_type === "Non-Departmental" && (
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            Non-Departmental
          </Badge>
        )}
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {group.sections.map((s: Section) => {
          // Only courses actually scheduled for this section (assignment exists).
          const courses = group.courses.filter((c: Course) =>
            data.course_section_teachers.some(
              (x) => x.semester_id === data.active_semester_id && x.course_id === c.id && x.section_id === s.id,
            ),
          );
          if (courses.length === 0) return null;
          const summary = getSectionRoomSummary(s.id, courses);

          return (
            <Card key={s.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="bg-muted/30 py-3 px-4 border-b">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">
                      Level {s.level}, Term {s.term} · Section {s.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {courses.length} Courses
                    </Badge>
                  </div>
                  {summary && (
                    <div className="text-[10px] text-muted-foreground font-medium italic">
                      {summary}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {courses.map((c: Course) => {
                    const cst = data.course_section_teachers.find(
                      x => x.semester_id === data.active_semester_id && x.course_id === c.id && x.section_id === s.id
                    );
                    return (
                      <div key={c.id} className="p-3 flex items-center justify-between gap-3 group">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-mono font-bold text-primary">{c.code}</div>
                          <div className="text-xs font-medium truncate" title={c.name}>{c.name}</div>
                        </div>
                        <div className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                          <RoomPicker course={c} section={s} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


function TeacherTimeMapping() {
  const data = useStore();
  const [selectedDay, setSelectedDay] = useState<string>("SUN");
  const [q, setQ] = useState("");

  const days = useMemo(() => sortDays(data.days), [data.days]);
  const periods = useMemo(() => {
    return data.periods
      .filter(p => !/break/i.test(p.name))
      .sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods]);

  const filteredTeachers = useMemo(() => {
    return data.teachers
      .filter(t => t.short_name.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
  }, [data.teachers, q]);

  const slotsBySemester = useMemo(
    () => data.class_slots.filter((s) => s.semester_id === data.active_semester_id),
    [data.class_slots, data.active_semester_id],
  );

  const teacherIdToSlots = useMemo(() => {
    const map = new Map<string, ClassSlot[]>();
    for (const t of data.teachers) map.set(t.id, []);
    for (const slot of slotsBySemester) {
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === slot.course_id &&
          x.section_id === slot.section_id,
      );
      if (!cst) continue;
      for (const tid of cst.teacher_ids) {
        map.get(tid)?.push(slot);
      }
    }
    return map;
  }, [data, slotsBySemester]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex bg-muted p-1 rounded-lg self-start">
          {days.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDay(d.name)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                selectedDay === d.name ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-xs flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search teacher..." 
            value={q} 
            onChange={e => setQ(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full border-collapse text-xs table-fixed min-w-[800px]">
            <thead className="sticky top-0 z-20">
              <tr style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                <th className="w-40 text-left px-4 py-3 font-bold sticky left-0 z-30" style={{ background: "var(--primary)" }}>
                  Teacher
                </th>
                {periods.map(p => (
                  <th key={p.id} className="px-2 py-3 text-center font-bold border-l border-white/10">
                    <div className="text-[10px] opacity-80 font-mono">{p.name}</div>
                    <div>{fmtTime12(p.start)} - {fmtTime12(p.end)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map(t => (
                <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="font-bold text-primary font-mono">{t.short_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{t.name}</div>
                  </td>
                  {periods.map(p => {
                    const slots = teacherIdToSlots.get(t.id) || [];
                    const assigned = slots.find(s => s.day === selectedDay && timesOverlap(s.start, s.end, p.start, p.end));
                    const unavail = teacherUnavailableAt(data, t.id, { day: selectedDay, start: p.start, end: p.end });

                    if (assigned) {
                      const c = data.courses.find(x => x.id === assigned.course_id);
                      const sec = data.sections.find(x => x.id === assigned.section_id);
                      return (
                        <td key={p.id} className="p-1 border-l">
                          <div className="h-full min-h-[50px] rounded bg-blue-50 border border-blue-100 p-1.5 flex flex-col justify-center">
                            <div className="font-bold text-blue-700 text-[10px] leading-tight truncate">
                              {c?.code}
                            </div>
                            <div className="text-[9px] text-blue-600 font-medium">
                              Sec {sec?.name}
                            </div>
                          </div>
                        </td>
                      );
                    }

                    if (unavail) {
                      return (
                        <td key={p.id} className="p-1 border-l">
                          <div className="h-full min-h-[50px] rounded bg-rose-50 border border-rose-100 p-1.5 flex items-center justify-center gap-1 text-rose-600 italic">
                            <UserX className="h-3 w-3 shrink-0" />
                            <span className="text-[9px] font-medium leading-tight truncate">{unavail.reason || "Unavailable"}</span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={p.id} className="p-1 border-l">
                        <div className="h-full min-h-[50px] rounded bg-emerald-50/30 border border-dashed border-emerald-100/50 flex items-center justify-center">
                          <Check className="h-3 w-3 text-emerald-400/50" />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoomTimeMapping() {
  const data = useStore();
  const [selectedDay, setSelectedDay] = useState<string>("SUN");
  const [q, setQ] = useState("");

  const days = useMemo(() => sortDays(data.days), [data.days]);
  const periods = useMemo(() => {
    return data.periods
      .filter(p => !/break/i.test(p.name))
      .sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods]);

  const filteredRooms = useMemo(() => {
    return data.rooms
      .filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.room_type.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.rooms, q]);

  const slotsBySemester = useMemo(
    () => data.class_slots.filter((s) => s.semester_id === data.active_semester_id),
    [data.class_slots, data.active_semester_id],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex bg-muted p-1 rounded-lg self-start">
          {days.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDay(d.name)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-md transition-all",
                selectedDay === d.name ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 max-w-xs flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search room..." 
            value={q} 
            onChange={e => setQ(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full border-collapse text-xs table-fixed min-w-[800px]">
            <thead className="sticky top-0 z-20">
              <tr style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                <th className="w-40 text-left px-4 py-3 font-bold sticky left-0 z-30" style={{ background: "var(--primary)" }}>
                  Room
                </th>
                {periods.map(p => (
                  <th key={p.id} className="px-2 py-3 text-center font-bold border-l border-white/10">
                    <div className="text-[10px] opacity-80 font-mono">{p.name}</div>
                    <div>{fmtTime12(p.start)} - {fmtTime12(p.end)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="font-bold text-orange-600 font-mono flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> {r.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{r.room_type} · Capacity: {r.capacity}</div>
                  </td>
                  {periods.map(p => {
                    const assigned = slotsBySemester.find(s => s.room_id === r.id && s.day === selectedDay && timesOverlap(s.start, s.end, p.start, p.end));
                    const unavail = roomUnavailableAt(data, r.id, { day: selectedDay, start: p.start, end: p.end });

                    if (assigned) {
                      const c = data.courses.find(x => x.id === assigned.course_id);
                      const sec = data.sections.find(x => x.id === assigned.section_id);
                      return (
                        <td key={p.id} className="p-1 border-l">
                          <div className="h-full min-h-[50px] rounded bg-orange-50 border border-orange-100 p-1.5 flex flex-col justify-center">
                            <div className="font-bold text-orange-700 text-[10px] leading-tight truncate">
                              {c?.code}
                            </div>
                            <div className="text-[9px] text-orange-600 font-medium">
                              CSE {c?.level}-{c?.term} {sec?.name}
                            </div>
                          </div>
                        </td>
                      );
                    }

                    if (unavail) {
                      return (
                        <td key={p.id} className="p-1 border-l">
                          <div className="h-full min-h-[50px] rounded bg-rose-50 border border-rose-100 p-1.5 flex items-center justify-center gap-1 text-rose-600 italic">
                            <DoorClosed className="h-3 w-3 shrink-0" />
                            <span className="text-[9px] font-medium leading-tight truncate">{unavail.reason || "Unavailable"}</span>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={p.id} className="p-1 border-l">
                        <div className="h-full min-h-[50px] rounded bg-emerald-50/30 border border-dashed border-emerald-100/50 flex items-center justify-center">
                          <Check className="h-3 w-3 text-emerald-400/50" />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
