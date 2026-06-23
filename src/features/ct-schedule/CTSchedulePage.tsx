import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, parseISO, isValid } from "date-fns";
import { CalendarIcon, Loader2, Save, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTSetting, CTWeekConfig } from "@/lib/types";
import { toast } from "sonner";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

export function CTScheduleConfigPage() {
  const { active_semester_id } = useStore();
  const [settings, setSettings] = useState<CTSetting | null>(null);
  const [weekConfigs, setWeekConfigs] = useState<CTWeekConfig[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const [s, w] = await Promise.all([
        api.get<CTSetting>(`/ct-schedule/settings/${active_semester_id}`),
        api.get<CTWeekConfig[]>(`/ct-schedule/week-configs/${active_semester_id}`),
      ]);
      setSettings(s);
      setWeekConfigs(w);
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
        start_week: settings.start_week,
        start_date: settings.start_date,
      });
      setSettings(updated);
      toast.success("Settings updated");
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
      const configsToSave = weekConfigs.map(c => ({
        week_number: c.week_number,
        date: c.date.split('T')[0],
        is_available: c.is_available
      }));
      await api.put(`/ct-schedule/week-configs/${active_semester_id}`, { configs: configsToSave });
      toast.success("Week configurations saved");
      loadData();
    } catch (error) {
      toast.error("Failed to save week configurations");
    }
  };

  const weeks = useMemo(() => {
    if (!settings?.total_weeks || !settings.start_date) return [];
    
    const startDate = parseISO(settings.start_date);
    if (!isValid(startDate)) return [];

    const result = [];
    for (let i = 1; i <= settings.total_weeks; i++) {
      // Filter weeks based on start_week configuration
      if (i < settings.start_week) continue;

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
        subtitle="Configure semester weeks and map available dates for Class Tests generation"
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Settings */}
        <div className="bg-gradient-to-br from-primary/15 to-primary/10 p-6 rounded-2xl border-2 border-primary/30 shadow-lg">
          <h3 className="text-lg font-black text-primary mb-5 flex items-center gap-2">
            ⚙️ Semester Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-wider text-primary/70">Total Weeks</Label>
              <Input
                type="number"
                value={settings?.total_weeks ?? 14}
                onChange={(e) => setSettings((s) => s ? { ...s, total_weeks: parseInt(e.target.value) || 0 } : null)}
                className="font-bold text-base h-10 border-primary/30 focus:border-primary/60 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-wider text-primary/70">CT Start Week</Label>
              <Input
                type="number"
                value={settings?.start_week ?? 4}
                onChange={(e) => setSettings((s) => s ? { ...s, start_week: parseInt(e.target.value) || 0 } : null)}
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
                onClick={handleUpdateSettings}
                className="flex-1 font-black h-10 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                <Save className="mr-2 h-4 w-4" /> Save Settings
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-success/20">
              <div>
                <h3 className="text-xl font-black text-success flex items-center gap-2">
                  📅 Map Available Days
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Select days when CTs can be scheduled
                  <span className="font-bold text-foreground"> (Weeks {settings.start_week}–{settings.total_weeks})</span>
                </p>
              </div>
              <Button
                variant="default"
                onClick={saveWeekConfigs}
                className="font-black bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 shadow-md"
              >
                <Save className="mr-2 h-4 w-4" /> Save Mapping
              </Button>
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
                        className="flex items-center space-x-3 p-2.5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer group"
                        onClick={() => toggleDayAvailability(w.number, d.date)}
                      >
                        <Checkbox
                          id={`w${w.number}-${d.date}`}
                          checked={d.isAvailable}
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
      </div>
    </div>
  );
}
