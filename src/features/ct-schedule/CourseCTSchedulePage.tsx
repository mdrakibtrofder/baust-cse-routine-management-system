import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, RefreshCw } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTAssignment } from "@/lib/types";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Edit2 } from "lucide-react";

export function CourseCTSchedulePage() {
  const { active_semester_id, sections, rooms } = useStore();
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [editingAssignment, setEditingAssignment] = useState<CTAssignment | null>(null);

  const loadAssignments = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const res = await api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`);
      setAssignments(res);
    } catch (error) {
      toast.error("Failed to load CT assignments");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  const handleUpdateAssignment = async (id: string, updates: Partial<CTAssignment>) => {
    try {
      await api.put(`/ct-schedule/assignments/${id}`, updates);
      toast.success("Assignment updated");
      loadAssignments();
      setEditingAssignment(null);
    } catch (error) {
      toast.error("Failed to update assignment");
    }
  };

  const filteredAssignments = useMemo(() => {
    if (selectedSectionId === "all") return assignments;
    return assignments.filter(a => a.section_id === selectedSectionId);
  }, [assignments, selectedSectionId]);

  const groupedAssignments = useMemo(() => {
    const grouped: Record<string, CTAssignment[]> = {};
    filteredAssignments.forEach(a => {
      const courseCode = a.course?.code || "Unknown";
      const courseName = a.course?.name || "";
      const sectionName = a.section?.name || "";
      const key = `${courseCode} - ${courseName} (Sec ${sectionName})`;
      
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });
    // Sort CTs by number
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.ct_number - b.ct_number);
    });
    return grouped;
  }, [filteredAssignments]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name));
  }, [sections]);

  const formatDate = (dateStr: string) => {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, "dd MMM yyyy") : "Invalid Date";
  };

  if (loading && assignments.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader title="Course-wise CT Schedule" subtitle="View class test dates for each course" />
      
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
          <BookOpen className="h-5 w-5 text-primary" />
          <div className="flex-1 max-w-sm">
            <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sortedSections.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    Level {s.level}, Term {s.term} · Section {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={loadAssignments} title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {Object.keys(groupedAssignments).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(groupedAssignments).map(([courseLabel, cts]) => (
              <div key={courseLabel} className="bg-card rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-muted/50 p-4 border-b">
                  <h4 className="font-bold text-sm truncate">{courseLabel}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Level {cts[0].course?.level}, Term {cts[0].course?.term} · Section {cts[0].section?.name}
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {cts.map(ct => (
                    <div key={ct.id} className="flex items-center justify-between text-sm group">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {ct.ct_number}
                        </div>
                        <span className="font-medium">Class Test {ct.ct_number}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold">{formatDate(ct.date)}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Room {ct.room?.name} · Week {ct.week_number}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setEditingAssignment(ct)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
            <p>No CT assignments found.</p>
            <Button variant="link" onClick={loadAssignments} className="mt-2">
              Try reloading
            </Button>
          </div>
        )}
      </div>

      {/* Edit Assignment Dialog */}
      <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && setEditingAssignment(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit CT Assignment</DialogTitle>
          </DialogHeader>
          {editingAssignment && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Course</Label>
                <div className="text-sm font-medium">{editingAssignment.course?.code} - {editingAssignment.course?.name}</div>
              </div>
              <div className="grid gap-2">
                <Label>Section</Label>
                <div className="text-sm font-medium">{editingAssignment.section?.name}</div>
              </div>
              <div className="grid gap-2">
                <Label>CT Number</Label>
                <div className="text-sm font-medium">CT {editingAssignment.ct_number}</div>
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
                      {formatDate(editingAssignment.date)}
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
