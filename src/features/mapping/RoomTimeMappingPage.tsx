import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, compareTimeValues, fmtTime12, sortDays } from "@/lib/utils";
import { timesOverlap, teacherUnavailableAt, roomUnavailableAt } from "@/lib/conflicts";
import {
  Users, MapPin, Clock, BookOpen, UserX, DoorClosed, Check, Search, CalendarDays, DoorOpen, Eye, EyeOff
} from "lucide-react";
import { roomDeptShort } from "@/lib/room-dept";
import type { Teacher, Room, ClassSlot } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { TeacherRoutineLink } from "@/components/RoutineLink";

export function RoomTimeMappingPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Room & Time Mapping"
        subtitle="Track teacher and room availability across time slots"
      />
      <div className="p-4 sm:p-6 space-y-6">
        <Tabs defaultValue="teacher-time" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-xl">
            <TabsTrigger value="teacher-time" className="gap-2">
              <Users className="h-4 w-4" /> Teacher vs Time
            </TabsTrigger>
            <TabsTrigger value="room-time" className="gap-2">
              <DoorOpen className="h-4 w-4" /> Room vs Time
            </TabsTrigger>
          </TabsList>

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

function TeacherTimeMapping() {
  const data = useStore();
  const [selectedDay, setSelectedDay] = useState<string>("SUN");
  const [q, setQ] = useState("");
  const [showOtherTeachers, setShowOtherTeachers] = useState(false);

  const days = useMemo(() => sortDays(data.days), [data.days]);
  // Theory time slots only — sessional periods are excluded from this view.
  const periods = useMemo(() => {
    return data.periods
      .filter(p => p.kind === "theory" && !p.is_break && !/break/i.test(p.name))
      .sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods]);

  // Department rule: home-dept (CSE) teachers by default; other departments'
  // teachers only behind the "show other teachers" toggle
  const { homeTeachers, otherTeachers } = useMemo(() => {
    const homeTeachers: Teacher[] = [];
    const otherTeachers: Teacher[] = [];
    for (const t of data.teachers) {
      ((t.department ?? "").trim().toUpperCase() === HOME_DEPT_SHORT_NAME ? homeTeachers : otherTeachers).push(t);
    }
    return { homeTeachers, otherTeachers };
  }, [data.teachers]);

  const filteredTeachers = useMemo(() => {
    const visible = showOtherTeachers ? [...homeTeachers, ...otherTeachers] : homeTeachers;
    return visible
      .filter(t => t.short_name.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
  }, [homeTeachers, otherTeachers, showOtherTeachers, q]);

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
        {otherTeachers.length > 0 && (
          <button
            onClick={() => setShowOtherTeachers((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start md:self-auto"
          >
            {showOtherTeachers ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showOtherTeachers
              ? "Hide other departments' teachers"
              : `Show other departments' teachers (${otherTeachers.length})`}
          </button>
        )}
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
                    <TeacherRoutineLink teacherId={t.id} className="block font-bold text-primary font-mono">{t.short_name}</TeacherRoutineLink>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {t.name}
                      {showOtherTeachers && t.department ? ` · ${t.department.trim().toUpperCase()}` : ""}
                    </div>
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
  const [showOtherRooms, setShowOtherRooms] = useState(false);

  const days = useMemo(() => sortDays(data.days), [data.days]);
  // Theory time slots only — sessional periods are excluded from this view.
  const periods = useMemo(() => {
    return data.periods
      .filter(p => p.kind === "theory" && !p.is_break && !/break/i.test(p.name))
      .sort((a, b) => compareTimeValues(a.start, b.start));
  }, [data.periods]);

  // Department rule: home-dept (CSE) rooms by default; other departments' rooms
  // only behind the "show other rooms" toggle
  const { homeRooms, otherRooms } = useMemo(() => {
    const homeRooms: Room[] = [];
    const otherRooms: Room[] = [];
    for (const r of data.rooms) {
      (roomDeptShort(r, data.departments) === HOME_DEPT_SHORT_NAME ? homeRooms : otherRooms).push(r);
    }
    return { homeRooms, otherRooms };
  }, [data.rooms, data.departments]);

  const filteredRooms = useMemo(() => {
    const visible = showOtherRooms ? [...homeRooms, ...otherRooms] : homeRooms;
    return visible
      .filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.room_type.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [homeRooms, otherRooms, showOtherRooms, q]);

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
        {otherRooms.length > 0 && (
          <button
            onClick={() => setShowOtherRooms((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors self-start md:self-auto"
          >
            {showOtherRooms ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showOtherRooms
              ? "Hide other departments' rooms"
              : `Show other departments' rooms (${otherRooms.length})`}
          </button>
        )}
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
                    <div className="text-[10px] text-muted-foreground truncate">
                      {r.room_type} · Capacity: {r.capacity}
                      {showOtherRooms && ` · ${roomDeptShort(r, data.departments)}`}
                    </div>
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
