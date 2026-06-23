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
import { format, parseISO, isValid } from "date-fns";
import { Loader2, CalendarIcon, RefreshCw, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTSetting, CTAssignment } from "@/lib/types";
import { toast } from "sonner";

export function CTTableViewPage() {
  const { active_semester_id, rooms } = useStore();
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<CTAssignment | null>(null);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const a = await api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`);
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
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={loadData}
              className="flex-1 sm:flex-none"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Reload
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 sm:flex-none bg-gradient-to-r from-primary to-primary/80"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate
            </Button>
          </div>
        </div>

        {assignments.length > 0 ? (
          <div className="rounded-2xl border-2 bg-card overflow-hidden shadow-lg hover:shadow-xl transition-all">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 border-b border-primary/10">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-primary">CT Schedule Grid</h4>
                <span className="text-xs font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {assignments.length} CTs across {scheduleTable.uniqueDates.length} dates
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
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
                                  <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    {a.course?.departmental_type === 'Non-Departmental' ? 'Common' : `Sec ${a.section?.name}`}
                                  </span>
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
                <Label>Section</Label>
                <div className="text-sm font-medium">
                  {editingAssignment.course?.departmental_type === 'Non-Departmental' ? 'Common' : `Section ${editingAssignment.section?.name}`}
                </div>
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
                <Label>Room</Label>
                <Select
                  value={editingAssignment.room_id}
                  onValueChange={(v) => setEditingAssignment({ ...editingAssignment, room_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({r.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(parseISO(editingAssignment.date), "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseISO(editingAssignment.date)}
                      onSelect={(date) => date && handleDateChange(format(date, "yyyy-MM-dd"))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAssignment(null)}>Cancel</Button>
            <Button onClick={() => editingAssignment && handleUpdateAssignment(editingAssignment.id, {
              room_id: editingAssignment.room_id,
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
                        {ct.course?.departmental_type === 'Non-Departmental' ? 'Common' : `Section ${ct.section?.name}`} • {ct.room?.name}
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
