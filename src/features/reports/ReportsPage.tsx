import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, fmtTime12 } from "@/lib/utils";
import { teacherAssignedCreditUsed, timesOverlap } from "@/lib/conflicts";
import { rankInfoFor } from "@/lib/teacher-rank";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line,
} from "recharts";
import { TrendingUp, Users, DoorOpen, CalendarDays, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#84cc16"];

export function ReportsPage() {
  const data = useStore();

  const slots = useMemo(
    () => data.class_slots.filter((s) => s.semester_id === data.active_semester_id),
    [data.class_slots, data.active_semester_id],
  );
  const csts = useMemo(
    () => data.course_section_teachers.filter((c) => c.semester_id === data.active_semester_id),
    [data.course_section_teachers, data.active_semester_id],
  );

  /** Teacher load: assigned credit & class count */
  const teacherLoad = useMemo(() => {
    return data.teachers
      .map((t) => {
        const used = teacherAssignedCreditUsed(data, t.id);
        const meetings = slots.filter((s) => {
          const cst = csts.find((x) => x.course_id === s.course_id && x.section_id === s.section_id);
          return cst?.teacher_ids.includes(t.id);
        }).length;
        return {
          id: t.id,
          name: t.short_name,
          fullName: t.name,
          used: Number(Number(used).toFixed(2)),
          assigned: t.assigned_credit,
          meetings,
          remaining: Number((Number(t.assigned_credit) - Number(used)).toFixed(2)),
          over: t.assigned_credit > 0 && used > t.assigned_credit + 0.001,
        };
      })
      .sort((a, b) => b.used - a.used);
  }, [data, slots, csts]);

  /** Room load: slots / total period-day cells */
  const periods = useMemo(() => [...data.periods].sort((a, b) => a.start.localeCompare(b.start)), [data.periods]);
  const nonBreakPeriods = useMemo(() => periods.filter((p) => !/break/i.test(p.name)), [periods]);
  const totalCells = nonBreakPeriods.length * data.days.length;

  const roomLoad = useMemo(() => {
    return data.rooms
      .map((r) => {
        const used = slots.filter((s) => s.room_id === r.id).length;
        return {
          id: r.id,
          name: r.name,
          used,
          total: totalCells,
          ratio: totalCells > 0 ? used / totalCells : 0,
          type: r.room_type,
          capacity: r.capacity,
        };
      })
      .sort((a, b) => b.used - a.used);
  }, [data.rooms, slots, totalCells]);

  /** Day-time heat: how many classes happen at each (day, period) */
  const dayTimeLoad = useMemo(() => {
    const list: { label: string; day: string; time: string; count: number }[] = [];
    for (const d of data.days) {
      for (const p of nonBreakPeriods) {
        const count = slots.filter((s) => s.day === d.name && timesOverlap(s.start, s.end, p.start, p.end)).length;
        list.push({ label: `${d.name} ${fmtTime12(p.start)}`, day: d.name, time: fmtTime12(p.start), count });
      }
    }
    return list;
  }, [data.days, nonBreakPeriods, slots]);

  const dayTotals = useMemo(() => {
    return data.days.map((d) => ({
      day: d.name,
      classes: slots.filter((s) => s.day === d.name).length,
    }));
  }, [data.days, slots]);

  /** Section coverage: each section, each course → assigned & scheduled? */
  const sectionCoverage = useMemo(() => {
    return data.sections
      .map((s) => {
        const courses = data.courses.filter((c) => c.level === s.level && c.term === s.term);
        let assigned = 0;
        let scheduled = 0;
        for (const c of courses) {
          const cst = csts.find((x) => x.course_id === c.id && x.section_id === s.id);
          if (cst && cst.teacher_ids.length > 0) assigned++;
          const has = slots.some((sl) => sl.course_id === c.id && sl.section_id === s.id);
          if (has) scheduled++;
        }
        return {
          id: s.id,
          name: `L${s.level}T${s.term}-${s.name}`,
          fullName: `Level ${s.level} Term ${s.term} · Section ${s.name}`,
          totalCourses: courses.length,
          assigned,
          scheduled,
          assignedPct: courses.length ? Math.round((assigned / courses.length) * 100) : 0,
          scheduledPct: courses.length ? Math.round((scheduled / courses.length) * 100) : 0,
        };
      })
      .sort((a, b) => a.scheduledPct - b.scheduledPct);
  }, [data, csts, slots]);

  const totals = {
    teachers: data.teachers.length,
    rooms: data.rooms.length,
    courses: data.courses.length,
    sections: data.sections.length,
    classMeetings: slots.length,
    overTeachers: teacherLoad.filter((t) => t.over).length,
    underUsedRooms: roomLoad.filter((r) => r.used === 0).length,
  };

  const mostLoadedTeacher = teacherLoad[0];
  const mostLoadedRoom = roomLoad[0];
  const mostLoadedDayTime = [...dayTimeLoad].sort((a, b) => b.count - a.count)[0];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Workload, utilization, and coverage analytics for the active semester" />
      <div className="p-4 sm:p-6 space-y-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Users} label="Teachers" value={totals.teachers} />
          <KpiCard icon={DoorOpen} label="Rooms" value={totals.rooms} />
          <KpiCard icon={CalendarDays} label="Class Meetings" value={totals.classMeetings} />
          <KpiCard
            icon={AlertTriangle}
            label="Over-credit teachers"
            value={totals.overTeachers}
            tone={totals.overTeachers > 0 ? "warn" : "ok"}
          />
        </div>

        {/* Highlight cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HighlightCard
            label="Most loaded teacher"
            value={mostLoadedTeacher?.name ?? "—"}
            sub={mostLoadedTeacher ? `${mostLoadedTeacher.fullName} · ${Number(mostLoadedTeacher.used).toFixed(2)} cr` : ""}
            color="from-fuchsia-500 to-purple-600"
          />
          <HighlightCard
            label="Most loaded room"
            value={mostLoadedRoom?.name ?? "—"}
            sub={mostLoadedRoom ? `${mostLoadedRoom.used}/${mostLoadedRoom.total} slots used` : ""}
            color="from-amber-500 to-orange-600"
          />
          <HighlightCard
            label="Busiest time slot"
            value={mostLoadedDayTime?.label ?? "—"}
            sub={mostLoadedDayTime ? `${mostLoadedDayTime.count} classes scheduled` : ""}
            color="from-sky-500 to-blue-600"
          />
        </div>

        <Tabs defaultValue="teacher">
          <TabsList>
            <TabsTrigger value="teacher" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Teacher Load</TabsTrigger>
            <TabsTrigger value="room" className="gap-1.5"><DoorOpen className="h-3.5 w-3.5" /> Room Load</TabsTrigger>
            <TabsTrigger value="time" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Day · Time</TabsTrigger>
            <TabsTrigger value="section" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Section Coverage</TabsTrigger>
          </TabsList>

          {/* TEACHER LOAD */}
          <TabsContent value="teacher" className="mt-3 space-y-3">
            <ChartCard title="Teacher credit load (assigned vs total)">
              <ResponsiveContainer width="100%" height={Math.max(300, teacherLoad.length * 22)}>
                <BarChart data={teacherLoad.slice(0, 30)} layout="vertical" margin={{ left: 30, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={70} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="used" fill="#3b82f6" name="Assigned" />
                  <Bar dataKey="remaining" fill="#10b981" name="Remaining" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Teacher</th>
                    <th className="text-left px-3 py-2">Designation</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-right px-3 py-2">Assigned</th>
                    <th className="text-right px-3 py-2">Remaining</th>
                    <th className="text-right px-3 py-2">Meetings/wk</th>
                    <th className="text-left px-3 py-2 w-40">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherLoad.map((t) => {
                    const teacher = data.teachers.find((x) => x.id === t.id)!;
                    const rank = rankInfoFor(teacher.designation);
                    const pct = t.assigned > 0 ? Math.min(150, Math.round((t.used / t.assigned) * 100)) : 0;
                    return (
                      <tr key={t.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={cn("h-6 w-7 rounded flex items-center justify-center text-[10px] font-bold border", rank.className)}>{rank.short}</span>
                            <div>
                              <div className="font-mono font-semibold">{t.name}</div>
                              <div className="text-[10px] text-muted-foreground">{t.fullName}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{teacher.designation}</td>
                        <td className="px-3 py-2 text-right">{Number(t.assigned).toFixed(2)}</td>
                        <td className={cn("px-3 py-2 text-right font-semibold", t.over && "text-destructive")}>
                          {Number(t.used).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">{Number(t.remaining).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{t.meetings}</td>
                        <td className="px-3 py-2">
                          <Progress value={Math.min(100, pct)} className={cn("h-2", t.over && "[&>div]:bg-destructive")} />
                          <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ROOM LOAD */}
          <TabsContent value="room" className="mt-3 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ChartCard title="Room utilization (slots used)">
                <ResponsiveContainer width="100%" height={Math.max(280, roomLoad.length * 22)}>
                  <BarChart data={roomLoad} layout="vertical" margin={{ left: 30, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={70} />
                    <Tooltip />
                    <Bar dataKey="used" fill="#f59e0b" name="Slots used" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Room usage share (top 8)">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={roomLoad.slice(0, 8)}
                      dataKey="used"
                      nameKey="name"
                      outerRadius={110}
                      label={(e) => `${e.name} (${e.used})`}
                    >
                      {roomLoad.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Room</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-right px-3 py-2">Capacity</th>
                    <th className="text-right px-3 py-2">Used / Total</th>
                    <th className="text-left px-3 py-2 w-40">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {roomLoad.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-mono font-semibold">{r.name}</td>
                      <td className="px-3 py-2">{r.type}</td>
                      <td className="px-3 py-2 text-right">{r.capacity}</td>
                      <td className="px-3 py-2 text-right">{r.used} / {r.total}</td>
                      <td className="px-3 py-2">
                        <Progress value={Math.round(r.ratio * 100)} className="h-2" />
                        <div className="text-[10px] text-muted-foreground mt-0.5">{Math.round(r.ratio * 100)}%</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* DAY · TIME */}
          <TabsContent value="time" className="mt-3 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <ChartCard title="Classes per day">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dayTotals}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="classes" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Day load radar">
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={dayTotals}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="day" />
                    <PolarRadiusAxis />
                    <Radar dataKey="classes" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Day × Time class density">
              <ResponsiveContainer width="100%" height={Math.max(300, nonBreakPeriods.length * 30)}>
                <LineChart data={dayTimeLoad.filter((d) => d.day === data.days[0]?.name)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {data.days.map((d, i) => (
                    <Line
                      key={d.id}
                      type="monotone"
                      data={dayTimeLoad.filter((x) => x.day === d.name)}
                      dataKey="count"
                      name={d.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          {/* SECTION COVERAGE */}
          <TabsContent value="section" className="mt-3 space-y-3">
            <ChartCard title="Section coverage (% of courses scheduled)">
              <ResponsiveContainer width="100%" height={Math.max(300, sectionCoverage.length * 22)}>
                <BarChart data={sectionCoverage} layout="vertical" margin={{ left: 60, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis dataKey="name" type="category" width={90} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="assignedPct" fill="#10b981" name="Teacher assigned %" />
                  <Bar dataKey="scheduledPct" fill="#3b82f6" name="Scheduled %" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="rounded-xl border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Section</th>
                    <th className="text-right px-3 py-2">Total Courses</th>
                    <th className="text-right px-3 py-2">Teacher Assigned</th>
                    <th className="text-right px-3 py-2">Time Scheduled</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionCoverage.map((s) => {
                    const complete = s.scheduledPct === 100;
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2 font-medium">
                          {s.fullName}
                        </td>
                        <td className="px-3 py-2 text-right">{s.totalCourses}</td>
                        <td className="px-3 py-2 text-right">{s.assigned} ({s.assignedPct}%)</td>
                        <td className="px-3 py-2 text-right">{s.scheduled} ({s.scheduledPct}%)</td>
                        <td className="px-3 py-2">
                          {complete ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700 border-amber-300">
                              {s.scheduledPct}% scheduled
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone = "ok",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center text-white",
          tone === "warn" ? "bg-gradient-to-br from-amber-500 to-rose-600" : "bg-gradient-to-br from-blue-500 to-indigo-600",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function HighlightCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={cn("rounded-xl p-4 text-white bg-gradient-to-br", color)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80 flex items-center gap-1.5">
        <TrendingUp className="h-3 w-3" /> {label}
      </div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
      <div className="text-[11px] opacity-90 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}
