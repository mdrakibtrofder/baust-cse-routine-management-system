import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, isSameDay, parseISO, isValid } from "date-fns";
import { CalendarIcon, Loader2, Save, Wand2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTSetting, CTWeekConfig, CTAssignment } from "@/lib/types";
import { toast } from "sonner";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

export function CTSchedulePage() {
  const { active_semester_id, rooms } = useStore();
  const [settings, setSettings] = useState<CTSetting | null>(null);
  const [weekConfigs, setWeekConfigs] = useState<CTWeekConfig[]>([]);
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const [s, w, a] = await Promise.all([
        api.get<CTSetting>(`/ct-schedule/settings/${active_semester_id}`),
        api.get<CTWeekConfig[]>(`/ct-schedule/week-configs/${active_semester_id}`),
        api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`),
      ]);
      setSettings(s);
      setWeekConfigs(w);
      setAssignments(a);
    } catch (error) {
      toast.error("Failed to load CT schedule data");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateSettings = async () => {
    if (!settings || !active_semester_id) return;
    try {
      const updated = await api.put<CTSetting>(`/ct-schedule/settings/${active_semester_id}`, {
        total_weeks: settings.total_weeks,
        start_date: settings.start_date,
      });
      setSettings(updated);
      toast.success("Settings updated");
      // Refresh to ensure weeks are recalculated correctly
      loadData();
    } catch (error) {
      toast.error("Failed to update settings");
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

  const saveWeekConfigs = async () => {
    if (!active_semester_id) return;
    try {
      // Normalize dates before saving
      const configsToSave = weekConfigs.map(c => ({
        ...c,
        date: c.date.split('T')[0]
      }));
      await api.put(`/ct-schedule/week-configs/${active_semester_id}`, { configs: configsToSave });
      toast.success("Week configurations saved");
      loadData();
    } catch (error) {
      toast.error("Failed to save week configurations");
    }
  };

  const handleGenerate = async () => {
    if (!active_semester_id) return;
    setGenerating(true);
    try {
      const res = await api.post<CTAssignment[]>(`/ct-schedule/generate/${active_semester_id}`, {});
      setAssignments(res);
      toast.success("CT Schedule generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  const weeks = useMemo(() => {
    if (!settings?.total_weeks || !settings.start_date) return [];
    
    // Ensure we handle both ISO strings and YYYY-MM-DD
    const startDate = parseISO(settings.start_date);
    if (!isValid(startDate)) return [];

    const result = [];
    for (let i = 1; i <= settings.total_weeks; i++) {
      const weekStart = addDays(startDate, (i - 1) * 7);
      const daysInWeek = DAYS.map((_, idx) => {
        const d = addDays(weekStart, idx);
        const dateStr = format(d, "yyyy-MM-dd");
        const config = weekConfigs.find((c) => c.week_number === i && c.date.startsWith(dateStr));
        return {
          date: dateStr,
          label: format(d, "dd MMM (EEE)"),
          isAvailable: config?.is_available ?? false,
        };
      });
      result.push({ number: i, days: daysInWeek });
    }
    return result;
  }, [settings, weekConfigs]);

  const scheduleTable = useMemo(() => {
    const grouped: Record<string, Record<string, CTAssignment>> = {};
    const uniqueDates: string[] = [];
    const roomsInUseSet = new Set<string>();

    assignments.forEach((a) => {
      const dateStr = typeof a.date === 'string' ? a.date.split('T')[0] : format(new Date(a.date), "yyyy-MM-dd");
      if (!grouped[dateStr]) {
        grouped[dateStr] = {};
        uniqueDates.push(dateStr);
      }
      grouped[dateStr][a.room_id] = a;
      roomsInUseSet.add(a.room_id);
    });

    uniqueDates.sort();
    const roomsInUse = rooms.filter(r => roomsInUseSet.has(r.id));

    return { uniqueDates, roomsInUse, grouped };
  }, [assignments, rooms]);

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
      <PageHeader title="Class Test Schedule" subtitle="Configure weeks and generate random CT schedule" />
      
      <div className="p-4 sm:p-6 space-y-6">
        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end bg-card p-6 rounded-xl border">
          <div className="space-y-2">
            <Label>Total Weeks</Label>
            <Input
              type="number"
              value={settings?.total_weeks ?? 14}
              onChange={(e) => setSettings((s) => s ? { ...s, total_weeks: parseInt(e.target.value) || 0 } : null)}
            />
          </div>
          <div className="space-y-2 flex flex-col">
            <Label>Start Date (Week 1 Sunday)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("justify-start text-left font-normal", !settings?.start_date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {settings?.start_date && isValid(safeStartDate) ? format(safeStartDate!, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
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
          <div className="flex gap-2">
            <Button onClick={handleUpdateSettings} className="flex-1">
              <Save className="mr-2 h-4 w-4" /> Save Settings
            </Button>
            <Button variant="outline" onClick={loadData} title="Refresh Data">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Week Configuration */}
        {settings?.start_date && isValid(safeStartDate) && (
          <div className="bg-card p-6 rounded-xl border space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Map Available Days for CT</h3>
              <Button variant="outline" size="sm" onClick={saveWeekConfigs}>
                <Save className="mr-2 h-4 w-4" /> Save Week Mapping
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {weeks.map((w) => (
                <div key={w.number} className="p-3 border rounded-lg space-y-2">
                  <div className="font-bold text-sm text-primary">Week {w.number}</div>
                  <div className="space-y-1.5">
                    {w.days.map((d) => (
                      <div key={d.date} className="flex items-center space-x-2">
                        <Checkbox
                          id={`w${w.number}-${d.date}`}
                          checked={d.isAvailable}
                          onCheckedChange={() => toggleDayAvailability(w.number, d.date)}
                        />
                        <label htmlFor={`w${w.number}-${d.date}`} className="text-xs font-medium cursor-pointer">
                          {d.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schedule Generation */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Generated Schedule</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadData}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Reload
              </Button>
              <Button onClick={handleGenerate} disabled={generating || weekConfigs.filter(w => w.is_available).length === 0}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Generate Random Schedule
              </Button>
            </div>
          </div>

          {assignments.length > 0 ? (
            <div className="rounded-xl border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[100px]">Week No</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    {scheduleTable.roomsInUse.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[120px]">
                        {r.name} ({r.capacity})
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleTable.uniqueDates.map((dateStr) => {
                    const firstAssignment = Object.values(scheduleTable.grouped[dateStr])[0];
                    return (
                      <TableRow key={dateStr}>
                        <TableCell className="font-bold">Week {firstAssignment.week_number}</TableCell>
                        <TableCell className="font-medium">{format(parseISO(dateStr), "dd-MMM")}</TableCell>
                        {scheduleTable.roomsInUse.map((r) => {
                          const a = scheduleTable.grouped[dateStr][r.id];
                          return (
                            <TableCell key={r.id} className="text-center">
                              {a ? (
                                <div className="bg-primary/10 text-primary border border-primary/20 rounded-full py-1 px-3 text-xs font-bold">
                                  {a.course?.code} CT {a.ct_number}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
              <p>No CT schedule generated yet.</p>
              <p className="text-sm">Configure weeks and click generate button above.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
