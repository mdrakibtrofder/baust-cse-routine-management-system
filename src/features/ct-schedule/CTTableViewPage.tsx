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
      <PageHeader title="CT Schedule Table" subtitle="Room vs Date view of all class tests" />
      
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
             Assignments View
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Reload
            </Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              Generate Random Schedule
            </Button>
          </div>
        </div>

        {assignments.length > 0 ? (
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[100px] font-bold">Week</TableHead>
                    <TableHead className="w-[120px] font-bold">Date</TableHead>
                    {scheduleTable.roomsInUse.map((r) => (
                      <TableHead key={r.id} className="text-center min-w-[140px] font-bold">
                        {r.name} <span className="text-[10px] text-muted-foreground">({r.capacity})</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduleTable.uniqueDates.map((dateStr) => {
                    const firstAssignment = Object.values(scheduleTable.grouped[dateStr])[0];
                    return (
                      <TableRow key={dateStr} className="hover:bg-muted/30">
                        <TableCell className="font-bold text-primary">Week {firstAssignment.week_number}</TableCell>
                        <TableCell className="font-medium">{format(parseISO(dateStr), "dd-MMM (EEE)")}</TableCell>
                        {scheduleTable.roomsInUse.map((r) => {
                          const a = scheduleTable.grouped[dateStr][r.id];
                          return (
                            <TableCell key={r.id} className="p-1">
                              {a ? (
                                <button
                                  onClick={() => setEditingAssignment(a)}
                                  className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg py-2 px-1 transition-all flex flex-col items-center justify-center gap-1"
                                >
                                  <span className="text-[10px] font-bold uppercase tracking-tight">CT {a.ct_number}</span>
                                  <span className="text-[11px] font-mono font-black">{a.course?.code}</span>
                                </button>
                              ) : (
                                <div className="h-10 flex items-center justify-center text-muted-foreground/20">—</div>
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

      <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && setEditingAssignment(null)}>
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
                <div className="text-sm font-medium">Section {editingAssignment.section?.name}</div>
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
                      onSelect={(date) => date && setEditingAssignment({ ...editingAssignment, date: format(date, "yyyy-MM-dd") })}
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
    </div>
  );
}
