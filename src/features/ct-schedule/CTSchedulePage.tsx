import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { format, addDays, parseISO, isValid, startOfWeek, isBefore } from "date-fns";
import { CalendarIcon, Loader2, Save, RefreshCw, Search, DoorOpen } from "lucide-react";
import { CTGenerateButton } from "@/components/CTGenerateButton";
import { cn } from "@/lib/utils";
import { roomDeptShort } from "@/lib/room-dept";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import api from "@/lib/api";
import { CTSetting, CTWeekConfig, CTLevelTermDayMapping, CTLevelTermRoomMapping, CTLevelTermBucket } from "@/lib/types";
import { toast } from "sonner";

const DAYS = [
  { code: "SUN", label: "Sunday" },
  { code: "MON", label: "Monday" },
  { code: "TUE", label: "Tuesday" },
  { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" },
];

function bucketKey(b: CTLevelTermBucket) {
  return `${b.level}|${b.term}|${b.departmental_type}|${b.department_id || ""}`;
}

export function CTScheduleConfigPage() {
  const { active_semester_id, courses, course_section_teachers, departments, rooms } = useStore();
  const [settings, setSettings] = useState<CTSetting | null>(null);
  const [weekConfigs, setWeekConfigs] = useState<CTWeekConfig[]>([]);
  const [dayMappings, setDayMappings] = useState<Record<string, string[]>>({});
  const [roomMappings, setRoomMappings] = useState<Record<string, string[]>>({});
  const [showAllRoomsByBucket, setShowAllRoomsByBucket] = useState<Record<string, boolean>>({});
  const [roomSearchByBucket, setRoomSearchByBucket] = useState<Record<string, string>>({});
  const [viewingRoomsBucket, setViewingRoomsBucket] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const [s, w, dm, rm, assignments] = await Promise.all([
        api.get<CTSetting>(`/ct-schedule/settings/${active_semester_id}`),
        api.get<CTWeekConfig[]>(`/ct-schedule/week-configs/${active_semester_id}`),
        api.get<CTLevelTermDayMapping[]>(`/ct-schedule/day-mappings/${active_semester_id}`),
        api.get<CTLevelTermRoomMapping[]>(`/ct-schedule/room-mappings/${active_semester_id}`),
        api.get<unknown[]>(`/ct-schedule/assignments/${active_semester_id}`),
      ]);
      setHasSchedule(assignments.length > 0);
      setSettings(s);
      setWeekConfigs(w);
      setDayMappings(Object.fromEntries(dm.map((m) => [bucketKey(m), m.days])));
      setRoomMappings(Object.fromEntries(rm.map((m) => [bucketKey(m), m.room_ids])));
    } catch (error) {
      toast.error("Failed to load CT schedule data");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Level-term buckets actually offered this semester (theory courses only)
  const buckets = useMemo(() => {
    if (!active_semester_id) return [];
    const offeredCourseIds = new Set(
      course_section_teachers
        .filter((cst) => cst.semester_id === active_semester_id)
        .map((cst) => cst.course_id),
    );
    const map = new Map<string, CTLevelTermBucket & { label: string; deptLabel: string }>();
    for (const course of courses) {
      if (!offeredCourseIds.has(course.id)) continue;
      if (!course.course_type.startsWith("theory")) continue;
      const bucket: CTLevelTermBucket = {
        level: course.level,
        term: course.term as "I" | "II",
        departmental_type: course.departmental_type,
        department_id: course.department_id,
      };
      const key = bucketKey(bucket);
      if (map.has(key)) continue;
      const deptLabel =
        course.departmental_type === "Non-Departmental"
          ? "Non-Departmental"
          : departments.find((d) => d.id === course.department_id)?.short_name ?? HOME_DEPT_SHORT_NAME;
      map.set(key, { ...bucket, label: `${course.level}-${course.term}`, deptLabel });
    }
    return Array.from(map.entries())
      .map(([key, b]) => ({ key, ...b }))
      .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.term.localeCompare(b.term)));
  }, [active_semester_id, courses, course_section_teachers, departments]);

  const handleSaveConfiguration = async () => {
    if (!settings || !active_semester_id) return;
    setSaving(true);
    try {
      await api.put<CTSetting>(`/ct-schedule/settings/${active_semester_id}`, {
        total_weeks: settings.total_weeks,
        start_date: settings.start_date,
      });
      // Send the complete grid currently on screen, not the rows that happened to be
      // loaded. The server replaces the semester's calendar with exactly this payload,
      // so anything left over from a previous start date is dropped instead of
      // lingering invisibly and polluting generation.
      const configsToSave = weeks.flatMap((w) =>
        w.days
          .filter((d) => !d.isBeforeStart)
          .map((d) => ({
            week_number: w.number,
            date: d.date,
            is_available: d.isAvailable,
          })),
      );
      await api.put(`/ct-schedule/week-configs/${active_semester_id}`, { configs: configsToSave });
      toast.success("Configuration saved");
      loadData();
    } catch (error) {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const toggleDayAvailability = (weekNum: number, date: string) => {
    setWeekConfigs((prev) => {
      const existing = prev.find((w) => w.week_number === weekNum && w.date.startsWith(date));
      if (existing) {
        return prev.map((w) =>
          w.week_number === weekNum && w.date.startsWith(date) ? { ...w, is_available: !w.is_available } : w
        );
      } else {
        return [...prev, { id: "", semester_id: active_semester_id!, week_number: weekNum, date, is_available: true }];
      }
    });
  };

  const weeks = useMemo(() => {
    if (!settings?.total_weeks || !settings.start_date) return [];

    const startDate = parseISO(settings.start_date);
    if (!isValid(startDate)) return [];

    // Week 1 is anchored to the Sunday of the week containing the start date, so
    // every column below lines up with its real weekday (DAYS[0]=SUN … DAYS[4]=THU).
    // Offsetting blindly from an arbitrary start date would label e.g. a Tuesday as
    // "Sunday", and the generator (which reads the stored date's actual weekday)
    // would then place CTs on days the configuration never selected.
    const firstWeekSunday = startOfWeek(startDate, { weekStartsOn: 0 });

    const result = [];
    for (let i = 1; i <= settings.total_weeks; i++) {
      const weekStart = addDays(firstWeekSunday, (i - 1) * 7);
      const daysInWeek = DAYS.map((_, idx) => {
        const d = addDays(weekStart, idx);
        const dateStr = format(d, "yyyy-MM-dd");
        const config = weekConfigs.find((c) => c.week_number === i && c.date.startsWith(dateStr));
        return {
          date: dateStr,
          label: format(d, "dd MMM (EEE)"),
          isAvailable: config?.is_available ?? false,
          // Days in week 1 that fall before the semester start date cannot be used.
          isBeforeStart: isBefore(d, startDate),
        };
      });
      result.push({ number: i, days: daysInWeek });
    }
    return result;
  }, [settings, weekConfigs]);

  const toggleMappedDay = (key: string, code: string) => {
    setDayMappings((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
      return { ...prev, [key]: next };
    });
  };

  const saveDayMappings = async () => {
    if (!active_semester_id) return;
    try {
      const mappings = buckets.map((b) => ({
        level: b.level,
        term: b.term,
        departmental_type: b.departmental_type,
        department_id: b.department_id,
        days: dayMappings[b.key] ?? [],
      }));
      await api.put(`/ct-schedule/day-mappings/${active_semester_id}`, { mappings });
      toast.success("Day mapping saved");
    } catch (error) {
      toast.error("Failed to save day mapping");
    }
  };

  const toggleMappedRoom = (key: string, roomId: string) => {
    setRoomMappings((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(roomId) ? current.filter((id) => id !== roomId) : [...current, roomId];
      return { ...prev, [key]: next };
    });
  };

  const roomsForBucket = (key: string) => {
    if (showAllRoomsByBucket[key]) return rooms;
    return rooms.filter((r) => roomDeptShort(r, departments) === HOME_DEPT_SHORT_NAME);
  };

  const saveRoomMappings = async () => {
    if (!active_semester_id) return;
    try {
      const mappings = buckets.map((b) => ({
        level: b.level,
        term: b.term,
        departmental_type: b.departmental_type,
        department_id: b.department_id,
        room_ids: roomMappings[b.key] ?? [],
      }));
      await api.put(`/ct-schedule/room-mappings/${active_semester_id}`, { mappings });
      toast.success("Room mapping saved");
    } catch (error) {
      toast.error("Failed to save room mapping");
    }
  };

  const handleGenerateMap = async () => {
    if (!active_semester_id) return;
    try {
      await api.post(`/ct-schedule/generate/${active_semester_id}`, {});
      setHasSchedule(true);
      toast.success("CT Map generated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate CT map");
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const safeStartDate = settings?.start_date ? parseISO(settings.start_date) : undefined;

  return (
    <div className="pb-10">
      <PageHeader
        title="CT Configuration"
        subtitle="Configure semester weeks, level-term day/room mapping, and generate Class Tests"
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Settings */}
        <div className="bg-gradient-to-br from-primary/15 to-primary/10 p-6 rounded-2xl border-2 border-primary/30 shadow-lg">
          <h3 className="text-lg font-black text-primary mb-5 flex items-center gap-2">
            ⚙️ Semester Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-wider text-primary/70">Total Weeks</Label>
              <Input
                type="number"
                value={settings?.total_weeks ?? 14}
                onChange={(e) => setSettings((s) => s ? { ...s, total_weeks: parseInt(e.target.value) || 0 } : null)}
                className="font-bold text-base h-10 border-primary/30 focus:border-primary/60 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2 flex flex-col">
              <Label className="text-xs font-black uppercase tracking-wider text-primary/70">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-bold h-10 border-primary/30 hover:border-primary/60 hover:bg-primary/20",
                      !settings?.start_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {settings?.start_date && isValid(safeStartDate) ? format(safeStartDate!, "MMM dd, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={isValid(safeStartDate) ? safeStartDate : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setSettings((s) => s ? { ...s, start_date: format(date, "yyyy-MM-dd") } : null);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2 items-end">
              <Button
                onClick={handleSaveConfiguration}
                disabled={saving}
                className="flex-1 font-black h-10 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Configuration
              </Button>
              <Button
                variant="outline"
                onClick={loadData}
                title="Refresh Data"
                className="h-10 border-primary/30 hover:border-primary/60 hover:bg-primary/10"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Week Configuration */}
        {settings?.start_date && isValid(safeStartDate) && (
          <div className="bg-gradient-to-br from-success/10 to-success/5 p-6 rounded-2xl border-2 border-success/30 shadow-lg space-y-6">
            <div className="pb-4 border-b-2 border-success/20">
              <h3 className="text-xl font-black text-success flex items-center gap-2">
                📅 Map Available Days
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select days when CTs can be scheduled
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {weeks.map((w) => (
                <div
                  key={w.number}
                  className={cn(
                    "p-5 rounded-xl border-2 space-y-4 transition-all hover:shadow-md",
                    w.days.some(d => d.isAvailable)
                      ? "bg-gradient-to-br from-success/15 to-success/5 border-success/40 hover:border-success/60"
                      : "bg-muted/30 border-border hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center font-black text-sm">
                        {w.number}
                      </div>
                      <span className="font-black text-sm text-foreground">WEEK</span>
                    </div>
                    <div className={cn(
                      "px-2.5 py-1 rounded-full text-[9px] font-bold",
                      w.days.some(d => d.isAvailable)
                        ? "bg-success/30 text-success"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {w.days.filter(d => d.isAvailable).length}/{w.days.length}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {w.days.map((d) => (
                      <div
                        key={d.date}
                        className={cn(
                          "flex items-center space-x-3 p-2.5 rounded-lg transition-colors group",
                          d.isBeforeStart
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-primary/10 cursor-pointer"
                        )}
                        onClick={() => !d.isBeforeStart && toggleDayAvailability(w.number, d.date)}
                        title={d.isBeforeStart ? "Before the semester start date" : undefined}
                      >
                        <Checkbox
                          id={`w${w.number}-${d.date}`}
                          checked={d.isAvailable}
                          disabled={d.isBeforeStart}
                          onCheckedChange={() => toggleDayAvailability(w.number, d.date)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-5 w-5"
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`w${w.number}-${d.date}`}
                            className="text-xs font-bold cursor-pointer block text-foreground"
                          >
                            {d.label.split(' ')[2]} {/* Day Name */}
                          </label>
                          <span className="text-[10px] text-muted-foreground">{d.label.split(' ').slice(0, 2).join(' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Level-Term Day Mapping */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-6 rounded-2xl border-2 border-blue-500/30 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-blue-500/20">
            <div>
              <h3 className="text-xl font-black text-blue-600 flex items-center gap-2">
                🗓️ Level-Term Day Mapping
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Choose which weekday(s) each level-term tests on, e.g. Level 1-I &amp; 2-II on Sunday and Wednesday.
              </p>
            </div>
            <Button
              variant="default"
              onClick={saveDayMappings}
              className="font-black bg-blue-600 hover:bg-blue-600/90 shadow-md"
            >
              <Save className="mr-2 h-4 w-4" /> Save Day Mapping
            </Button>
          </div>

          {buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No theory courses offered this semester yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {buckets.map((b) => (
                <div key={b.key} className="p-4 rounded-xl border-2 bg-card space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm">Level {b.label}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600">
                      {b.deptLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((d) => {
                      const checked = (dayMappings[b.key] ?? []).includes(d.code);
                      return (
                        <button
                          key={d.code}
                          type="button"
                          onClick={() => toggleMappedDay(b.key, d.code)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[11px] font-bold border-2 transition-all",
                            checked
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-muted/40 text-muted-foreground border-border hover:border-blue-500/40"
                          )}
                        >
                          {d.label.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Level-Term Room Mapping */}
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6 rounded-2xl border-2 border-amber-500/30 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-amber-500/20">
            <div>
              <h3 className="text-xl font-black text-amber-600 flex items-center gap-2">
                🏫 Level-Term Room Mapping
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Select one or more rooms each level-term may use for CTs.
              </p>
            </div>
            <Button
              variant="default"
              onClick={saveRoomMappings}
              className="font-black bg-amber-600 hover:bg-amber-600/90 shadow-md"
            >
              <Save className="mr-2 h-4 w-4" /> Save Room Mapping
            </Button>
          </div>

          {buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No theory courses offered this semester yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {buckets.map((b) => {
                const search = (roomSearchByBucket[b.key] ?? "").trim().toLowerCase();
                const availableRooms = roomsForBucket(b.key).filter((r) =>
                  search ? r.name.toLowerCase().includes(search) : true
                );
                const selected = roomMappings[b.key] ?? [];
                return (
                  <div key={b.key} className="p-4 rounded-xl border-2 bg-card space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm">Level {b.label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                          {b.deptLabel}
                        </span>
                      </div>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setViewingRoomsBucket(b.key)}
                              className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-600 text-white shrink-0 hover:bg-amber-700 hover:shadow-md transition-all"
                            >
                              {selected.length} selected
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px]">
                            {selected.length === 0 ? (
                              <span>No rooms selected</span>
                            ) : (
                              <span>
                                {rooms
                                  .filter((r) => selected.includes(r.id))
                                  .map((r) => r.name)
                                  .join(", ")}
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={!!showAllRoomsByBucket[b.key]}
                        onCheckedChange={(v) =>
                          setShowAllRoomsByBucket((prev) => ({ ...prev, [b.key]: !!v }))
                        }
                      />
                      Show all rooms (default: {HOME_DEPT_SHORT_NAME} only)
                    </label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={roomSearchByBucket[b.key] ?? ""}
                        onChange={(e) =>
                          setRoomSearchByBucket((prev) => ({ ...prev, [b.key]: e.target.value }))
                        }
                        placeholder="Search rooms..."
                        className="h-8 pl-8 text-xs font-semibold border-amber-500/30 focus:border-amber-500/60 focus:ring-amber-500/20"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {availableRooms.map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 text-xs font-semibold cursor-pointer hover:bg-amber-500/10 rounded px-1.5 py-1"
                        >
                          <Checkbox
                            checked={selected.includes(r.id)}
                            onCheckedChange={() => toggleMappedRoom(b.key, r.id)}
                          />
                          {r.name}
                          <span className="text-[10px] text-muted-foreground font-normal">({r.capacity})</span>
                        </label>
                      ))}
                      {availableRooms.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {search ? "No rooms match your search." : "No rooms available."}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="flex justify-end">
          <CTGenerateButton
            hasSchedule={hasSchedule}
            onGenerate={handleGenerateMap}
            label="Generate CT Map"
            className="h-11 px-8"
          />
        </div>
      </div>

      {/* Selected Rooms Modal */}
      <Dialog open={!!viewingRoomsBucket} onOpenChange={(open) => !open && setViewingRoomsBucket(null)}>
        <DialogContent className="sm:max-w-[480px] border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-primary/10 backdrop-blur-xl overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/10 via-transparent to-primary/10" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg">
                <DoorOpen className="h-4.5 w-4.5" />
              </span>
              {(() => {
                const b = buckets.find((x) => x.key === viewingRoomsBucket);
                return b ? `Level ${b.label} · ${b.deptLabel}` : "Selected Rooms";
              })()}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 py-2">
            {(() => {
              const selectedIds = viewingRoomsBucket ? roomMappings[viewingRoomsBucket] ?? [] : [];
              const selectedRooms = rooms.filter((r) => selectedIds.includes(r.id));
              if (selectedRooms.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-8">No rooms selected for this level-term yet.</p>
                );
              }
              return selectedRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 hover:border-amber-500/40 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 font-black text-xs">
                      {r.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-bold text-sm">{r.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                    {r.capacity} seats
                  </span>
                </div>
              ));
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
