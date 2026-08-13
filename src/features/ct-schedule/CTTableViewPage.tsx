import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { Loader2, CalendarIcon, Download, ChevronDown, X, FileArchive } from "lucide-react";
import { CTGenerateButton } from "@/components/CTGenerateButton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTAssignment, CTWeekConfig, Room } from "@/lib/types";
import { toast } from "sonner";
import {
  exportCourseWiseCTPdf,
  exportWeekWiseCTPdf,
  exportTeacherWiseCTPdf,
  exportRoomWiseCTPdf,
  exportAllCTSchedulesZip,
} from "@/lib/ct-export";
import { roomDeptShort } from "@/lib/room-dept";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { ctRoomNames, filterCTsByDepartmental } from "@/lib/ct-schedule-utils";
import { NonDepartmentalToggle } from "@/components/NonDepartmentalToggle";

export function CTTableViewPage() {
  const store = useStore();
  const { active_semester_id, rooms, departments } = store;
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<CTAssignment | null>(null);
  const [zipping, setZipping] = useState(false);

  const [weekConfigs, setWeekConfigs] = useState<CTWeekConfig[]>([]);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`),
        api.get<CTWeekConfig[]>(`/ct-schedule/week-configs/${active_semester_id}`),
      ]);
      setAssignments(a);
      setWeekConfigs(w);
    } catch (error) {
      toast.error("Failed to load CT schedule data");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  /** date (YYYY-MM-DD) -> week number, straight from the saved CT calendar.
   *  Only these dates may be picked when editing an assignment. */
  const availableDates = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of weekConfigs) {
      if (!c.is_available) continue;
      map.set(c.date.split("T")[0], c.week_number);
    }
    return map;
  }, [weekConfigs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [suggestedCTsToUpdate, setSuggestedCTsToUpdate] = useState<CTAssignment[]>([]);
  const [selectedCTsToUpdate, setSelectedCTsToUpdate] = useState<Set<string>>(new Set());
  const [showDateChangeModal, setShowDateChangeModal] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<{ assignment: CTAssignment; updates: Partial<CTAssignment> } | null>(null);

  const handleUpdateAssignment = async (id: string, updates: Partial<CTAssignment>) => {
    try {
      await api.put(`/ct-schedule/assignments/${id}`, updates);
      toast.success("Assignment updated");
      loadData();
      setEditingAssignment(null);
    } catch (error) {
      toast.error("Failed to update assignment");
    }
  };

  const handleDateChange = (newDate: string) => {
    if (!editingAssignment) return;

    const originalDate = typeof editingAssignment.date === 'string'
      ? editingAssignment.date.split('T')[0]
      : format(new Date(editingAssignment.date), 'yyyy-MM-dd');

    const newDateStr = newDate.split('T')[0];

    // Only show modal if date actually changed (not just room)
    if (originalDate !== newDateStr) {
      // Find all CTs on the original date (excluding this one)
      const otherCTsOnDate = assignments.filter(a =>
        a.id !== editingAssignment.id &&
        (typeof a.date === 'string' ? a.date.split('T')[0] : format(new Date(a.date), 'yyyy-MM-dd')) === originalDate
      );

      if (otherCTsOnDate.length > 0) {
        setSuggestedCTsToUpdate(otherCTsOnDate);
        setSelectedCTsToUpdate(new Set());
        setShowDateChangeModal(true);
        setPendingUpdates({ assignment: editingAssignment, updates: { date: newDate } });
        return;
      }
    }

    // If no other CTs on that date, just update
    setEditingAssignment({ ...editingAssignment, date: newDate });
  };

  const handleGenerate = async () => {
    if (!active_semester_id) return;
    try {
      const res = await api.post<CTAssignment[]>(`/ct-schedule/generate/${active_semester_id}`, {});
      setAssignments(res);
      toast.success("CT Schedule generated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate schedule");
    }
  };

  // ---- Filters -------------------------------------------------------------
  // Default view: home-department (CSE) rooms only — Theory, Sessional and Both.
  const [showOtherDeptRooms, setShowOtherDeptRooms] = useState(false);
  const [showNonDepartmental, setShowNonDepartmental] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedLevelTerms, setSelectedLevelTerms] = useState<string[]>([]);

  const isHomeRoom = useCallback(
    (r: Room) => roomDeptShort(r, departments) === HOME_DEPT_SHORT_NAME,
    [departments],
  );

  /** Rooms grouped for the room picker: home department first, then other departments. */
  const roomGroups = useMemo(() => {
    const home: Room[] = [];
    const other: Room[] = [];
    for (const r of rooms) (isHomeRoom(r) ? home : other).push(r);
    return { home, other };
  }, [rooms, isHomeRoom]);

  /** Level-Term buckets present in the schedule, split departmental / non-departmental. */
  const levelTermOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; deptLabel: string; nonDept: boolean }>();
    for (const a of assignments) {
      const c = a.course;
      if (!c) continue;
      const nonDept = c.departmental_type === "Non-Departmental";
      const deptLabel = nonDept
        ? "Non-Departmental"
        : departments.find((d) => d.id === c.department_id)?.short_name ?? HOME_DEPT_SHORT_NAME;
      const key = `${c.level}-${c.term}|${deptLabel}`;
      if (!map.has(key)) map.set(key, { key, label: `${c.level}-${c.term}`, deptLabel, nonDept });
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(a.nonDept) - Number(b.nonDept) || a.label.localeCompare(b.label),
    );
  }, [assignments, departments]);

  const levelTermKeyOf = useCallback(
    (a: CTAssignment) => {
      const c = a.course;
      if (!c) return "";
      const deptLabel =
        c.departmental_type === "Non-Departmental"
          ? "Non-Departmental"
          : departments.find((d) => d.id === c.department_id)?.short_name ?? HOME_DEPT_SHORT_NAME;
      return `${c.level}-${c.term}|${deptLabel}`;
    },
    [departments],
  );

  /** The list every download is built from, so anything hidden here stays out of
   *  the exported schedules too. */
  const visibleAssignments = useMemo(() => {
    const ltFilter = new Set(selectedLevelTerms);
    const roomFilter = new Set(selectedRoomIds);

    return filterCTsByDepartmental(assignments, showNonDepartmental).filter((a) => {
      if (ltFilter.size > 0 && !ltFilter.has(levelTermKeyOf(a))) return false;

      // A sitting spans every room mapped to its level-term, so it stays visible as
      // long as at least one of those rooms passes the room filters.
      const sittingRooms = rooms.filter((r) => (a.room_ids ?? []).includes(r.id));
      if (sittingRooms.length === 0) return false;
      // An explicitly picked room always shows, even if it belongs to another department.
      if (roomFilter.size > 0) return sittingRooms.some((r) => roomFilter.has(r.id));
      return showOtherDeptRooms || sittingRooms.some(isHomeRoom);
    });
  }, [
    assignments,
    rooms,
    selectedRoomIds,
    selectedLevelTerms,
    showOtherDeptRooms,
    showNonDepartmental,
    isHomeRoom,
    levelTermKeyOf,
  ]);

  const scheduleTable = useMemo(() => {
    const roomFilter = new Set(selectedRoomIds);

    const grouped: Record<string, Record<string, CTAssignment>> = {};
    const uniqueDates: string[] = [];
    const roomsInUseSet = new Set<string>();

    visibleAssignments.forEach((a) => {
      const dateStr = typeof a.date === 'string' ? a.date.split('T')[0] : format(new Date(a.date), "yyyy-MM-dd");
      if (!grouped[dateStr]) {
        grouped[dateStr] = {};
        uniqueDates.push(dateStr);
      }
      // One cell per room the sitting occupies, so the grid shows the CT filling
      // its whole level-term room mapping. Columns hidden by a filter are skipped.
      for (const room of rooms) {
        if (!(a.room_ids ?? []).includes(room.id)) continue;
        if (roomFilter.size > 0 ? !roomFilter.has(room.id) : !(showOtherDeptRooms || isHomeRoom(room))) {
          continue;
        }
        grouped[dateStr][room.id] = a;
        roomsInUseSet.add(room.id);
      }
    });

    uniqueDates.sort();
    const roomsInUse = rooms.filter(r => roomsInUseSet.has(r.id));

    return { uniqueDates, roomsInUse, grouped, visibleCount: visibleAssignments.length };
  }, [visibleAssignments, rooms, selectedRoomIds, showOtherDeptRooms, isHomeRoom]);

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const filtersActive =
    showOtherDeptRooms ||
    !showNonDepartmental ||
    selectedRoomIds.length > 0 ||
    selectedLevelTerms.length > 0;

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
        title="CT Schedule Table"
        subtitle="Room vs Date view of all class tests with Level, Term & Section details"
      />

      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-xl border border-primary/20">
          <div>
            <h3 className="text-xl font-black text-primary flex items-center gap-2">
              📅 CT Schedule View
            </h3>
            <p className="text-sm text-muted-foreground mt-1">All class tests organized by date and room</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={visibleAssignments.length === 0}
              onClick={() => exportCourseWiseCTPdf(store, visibleAssignments)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Course-wise Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={visibleAssignments.length === 0}
              onClick={() => exportWeekWiseCTPdf(store, visibleAssignments)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Week-wise Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={visibleAssignments.length === 0}
              onClick={() => exportTeacherWiseCTPdf(store, visibleAssignments)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Teacher-wise Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={visibleAssignments.length === 0}
              onClick={() => exportRoomWiseCTPdf(store, visibleAssignments)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Room-wise Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={visibleAssignments.length === 0 || zipping}
              onClick={async () => {
                setZipping(true);
                const t = toast.loading("Building all CT schedules...");
                try {
                  await exportAllCTSchedulesZip(store, visibleAssignments);
                  toast.success("All CT schedules downloaded", { id: t });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to build zip", { id: t });
                } finally {
                  setZipping(false);
                }
              }}
              className="font-bold border-primary/40 text-primary"
            >
              {zipping ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileArchive className="mr-1.5 h-3.5 w-3.5" />
              )}
              All CT Schedule (.zip)
            </Button>
            <CTGenerateButton
              hasSchedule={assignments.length > 0}
              onGenerate={handleGenerate}
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        {assignments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground mr-1">Filters</span>

            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer rounded-lg border px-3 py-2 hover:bg-muted/50">
              <Checkbox
                checked={showOtherDeptRooms}
                onCheckedChange={(v) => setShowOtherDeptRooms(!!v)}
              />
              Show other departments&apos; rooms
              <span className="text-[10px] font-semibold text-muted-foreground">
                (default: {HOME_DEPT_SHORT_NAME} only)
              </span>
            </label>

            <NonDepartmentalToggle checked={showNonDepartmental} onChange={setShowNonDepartmental} />


            {/* Rooms multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="font-bold">
                  Rooms
                  {selectedRoomIds.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-black text-primary">
                      {selectedRoomIds.length}
                    </span>
                  )}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-black uppercase text-muted-foreground">Rooms</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-bold"
                    disabled={selectedRoomIds.length === 0}
                    onClick={() => setSelectedRoomIds([])}
                  >
                    <X className="mr-1 h-3 w-3" /> Clear
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {([
                    [`${HOME_DEPT_SHORT_NAME} rooms`, roomGroups.home],
                    ["Other department rooms", roomGroups.other],
                  ] as const).map(([groupLabel, list]) =>
                    list.length === 0 ? null : (
                      <div key={groupLabel}>
                        <div className="px-1 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {groupLabel}
                        </div>
                        {list.map((r) => (
                          <label
                            key={r.id}
                            className="flex items-center gap-2 rounded px-1.5 py-1 text-xs font-semibold cursor-pointer hover:bg-muted"
                          >
                            <Checkbox
                              checked={selectedRoomIds.includes(r.id)}
                              onCheckedChange={() => setSelectedRoomIds((p) => toggleIn(p, r.id))}
                            />
                            {r.name}
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                              {r.room_type} · {r.capacity}
                            </span>
                          </label>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Level-Term multi-select */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="font-bold">
                  Level-Term
                  {selectedLevelTerms.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-black text-primary">
                      {selectedLevelTerms.length}
                    </span>
                  )}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60 p-3">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-black uppercase text-muted-foreground">Level-Term</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] font-bold"
                    disabled={selectedLevelTerms.length === 0}
                    onClick={() => setSelectedLevelTerms([])}
                  >
                    <X className="mr-1 h-3 w-3" /> Clear
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {([
                    ["Departmental", levelTermOptions.filter((o) => !o.nonDept)],
                    ["Non-Departmental", levelTermOptions.filter((o) => o.nonDept)],
                  ] as const).map(([groupLabel, list]) =>
                    list.length === 0 ? null : (
                      <div key={groupLabel}>
                        <div className="px-1 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {groupLabel}
                        </div>
                        {list.map((o) => (
                          <label
                            key={o.key}
                            className="flex items-center gap-2 rounded px-1.5 py-1 text-xs font-semibold cursor-pointer hover:bg-muted"
                          >
                            <Checkbox
                              checked={selectedLevelTerms.includes(o.key)}
                              onCheckedChange={() => setSelectedLevelTerms((p) => toggleIn(p, o.key))}
                            />
                            {o.label}
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                              {o.deptLabel}
                            </span>
                          </label>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                className="font-bold text-muted-foreground"
                onClick={() => {
                  setShowOtherDeptRooms(false);
                  setShowNonDepartmental(true);
                  setSelectedRoomIds([]);
                  setSelectedLevelTerms([]);
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear all filters
              </Button>
            )}
          </div>
        )}

        {assignments.length > 0 ? (
          <div className="rounded-2xl border-2 bg-card overflow-hidden shadow-lg hover:shadow-xl transition-all">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 border-b border-primary/10">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-primary">CT Schedule Grid</h4>
                <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {scheduleTable.visibleCount} of {assignments.length} CTs across {scheduleTable.uniqueDates.length} dates
                </span>
              </div>
            </div>
            {scheduleTable.visibleCount === 0 && (
              <div className="py-16 text-center text-sm font-semibold text-muted-foreground">
                No CTs match the current filters.
              </div>
            )}
            <div className={cn("overflow-x-auto", scheduleTable.visibleCount === 0 && "hidden")}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-primary/5 to-primary/10 border-b-2 border-primary/20 hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/15">
                    <TableHead className="w-[80px] font-black text-primary text-xs uppercase tracking-wider">Week</TableHead>
                    <TableHead className="w-[140px] font-black text-primary text-xs uppercase tracking-wider">Date & Day</TableHead>
                    {scheduleTable.roomsInUse.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[160px] font-black text-primary text-xs uppercase tracking-wider py-3">
                        <div className="flex flex-col items-center gap-1">
                          <span>{r.name}</span>
                          <span className="text-[9px] font-bold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                            Cap: {r.capacity}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleTable.uniqueDates.map((dateStr, idx) => {
                    const firstAssignment = Object.values(scheduleTable.grouped[dateStr])[0];
                    return (
                      <TableRow
                        key={dateStr}
                        className={cn(
                          "border-b transition-all hover:bg-primary/5",
                          idx % 2 === 0 ? "bg-background" : "bg-muted/30"
                        )}
                      >
                        <TableCell className="font-black text-primary text-sm py-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20 text-primary font-bold">
                            {firstAssignment.week_number}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-sm py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-primary">{format(parseISO(dateStr), "dd MMM")}</span>
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                              {format(parseISO(dateStr), "EEE")}
                            </span>
                          </div>
                        </TableCell>
                        {scheduleTable.roomsInUse.map((r) => {
                          const a = scheduleTable.grouped[dateStr][r.id];
                          return (
                            <TableCell key={r.id} className="p-2 align-middle">
                              {a ? (
                                <button
                                  onClick={() => setEditingAssignment(a)}
                                  className={cn(
                                    "w-full rounded-xl py-2.5 px-2 transition-all border-2 flex flex-col items-center justify-center gap-1",
                                    "bg-gradient-to-br from-primary/15 to-primary/10 border-primary/30 hover:from-primary/25 hover:to-primary/15 hover:border-primary/50 hover:shadow-md"
                                  )}
                                >
                                  <span className="text-[11px] font-black uppercase tracking-tight text-primary">CT {a.ct_number}</span>
                                  <span className="text-[10px] font-mono font-black text-foreground">{a.course?.code}</span>
                                  <div className="text-[9px] font-semibold text-muted-foreground flex items-center gap-1.5">
                                    <span>L{a.course?.level}</span>
                                    <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
                                    <span>T{a.course?.term}</span>
                                  </div>
                                </button>
                              ) : (
                                <div className="h-24 flex items-center justify-center text-muted-foreground/30 rounded-lg bg-muted/20 border-2 border-dashed border-muted/40">
                                  <span className="text-[11px] font-bold uppercase tracking-tight">—</span>
                                </div>
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
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed rounded-2xl text-muted-foreground bg-muted/10">
            <p className="text-lg font-medium">No CT schedule generated yet.</p>
            <p className="text-sm">Configure weeks and click generate button above.</p>
          </div>
        )}
      </div>

      <Dialog open={!!editingAssignment && !showDateChangeModal} onOpenChange={(open) => !open && setEditingAssignment(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit CT Assignment</DialogTitle>
          </DialogHeader>
          {editingAssignment && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Course</Label>
                <div className="text-sm font-bold text-primary">{editingAssignment.course?.code} - {editingAssignment.course?.name}</div>
              </div>
              <div className="grid gap-2">
                <Label>Level & Term</Label>
                <div className="text-sm font-medium">Level {editingAssignment.course?.level}, Term {editingAssignment.course?.term}</div>
              </div>
              <div className="grid gap-2">
                <Label>CT Number</Label>
                <div className="text-sm font-bold">Class Test {editingAssignment.ct_number}</div>
              </div>
              <div className="grid gap-2">
                <Label>Rooms</Label>
                {/* A sitting occupies every room mapped to its level-term, so this is a
                    multi-select rather than a single room picker. */}
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {rooms.map((r) => {
                    const selected = (editingAssignment.room_ids ?? []).includes(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs font-semibold hover:bg-muted"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() =>
                            setEditingAssignment({
                              ...editingAssignment,
                              room_ids: selected
                                ? (editingAssignment.room_ids ?? []).filter((id) => id !== r.id)
                                : [...(editingAssignment.room_ids ?? []), r.id],
                            })
                          }
                        />
                        {r.name}
                        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                          {r.room_type} · {r.capacity}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {ctRoomNames(editingAssignment, rooms)}
                </span>
              </div>
              <div className="grid gap-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(parseISO(editingAssignment.date.split("T")[0]), "PPP")}
                      <span className="ml-auto text-xs text-muted-foreground">
                        Week {availableDates.get(editingAssignment.date.split("T")[0]) ?? editingAssignment.week_number}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseISO(editingAssignment.date.split("T")[0])}
                      // Only dates marked available in the CT configuration are selectable,
                      // so an edited CT can never land outside the configured calendar.
                      disabled={(date) =>
                        availableDates.size > 0 && !availableDates.has(format(date, "yyyy-MM-dd"))
                      }
                      onSelect={(date) => date && handleDateChange(format(date, "yyyy-MM-dd"))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-[11px] text-muted-foreground">
                  Only dates enabled in CT Configuration can be selected.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAssignment(null)}>Cancel</Button>
            <Button onClick={() => editingAssignment && handleUpdateAssignment(editingAssignment.id, {
              room_ids: editingAssignment.room_ids,
              date: editingAssignment.date
            })}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDateChangeModal} onOpenChange={(open) => !open && setShowDateChangeModal(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Update Other CTs on This Date?</DialogTitle>
          </DialogHeader>
          {pendingUpdates && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-900 font-medium">
                  You're moving <strong>{pendingUpdates.assignment.course?.code} CT{pendingUpdates.assignment.ct_number}</strong> to a different date.
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  There are <strong>{suggestedCTsToUpdate.length}</strong> other CT(s) on the original date. Would you like to also move them?
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {suggestedCTsToUpdate.map((ct) => (
                  <label key={ct.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCTsToUpdate.has(ct.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedCTsToUpdate);
                        if (e.target.checked) {
                          newSet.add(ct.id);
                        } else {
                          newSet.delete(ct.id);
                        }
                        setSelectedCTsToUpdate(newSet);
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">
                        {ct.course?.code} CT{ct.ct_number}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {ctRoomNames(ct, rooms)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                // Just update the current CT
                if (pendingUpdates && editingAssignment) {
                  handleUpdateAssignment(editingAssignment.id, pendingUpdates.updates);
                }
                setShowDateChangeModal(false);
                setEditingAssignment(null);
              }}
            >
              Update Only This CT
            </Button>
            <Button
              onClick={async () => {
                if (pendingUpdates && editingAssignment) {
                  // Update main assignment
                  try {
                    await api.put(`/ct-schedule/assignments/${editingAssignment.id}`, pendingUpdates.updates);

                    // Update selected CTs
                    for (const ctId of selectedCTsToUpdate) {
                      await api.put(`/ct-schedule/assignments/${ctId}`, pendingUpdates.updates);
                    }

                    toast.success(selectedCTsToUpdate.size > 0 ? `Updated ${selectedCTsToUpdate.size + 1} CTs` : "Assignment updated");
                    loadData();
                  } catch (error) {
                    toast.error("Failed to update assignments");
                  }
                }
                setShowDateChangeModal(false);
                setEditingAssignment(null);
              }}
            >
              Update All Selected ({selectedCTsToUpdate.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
