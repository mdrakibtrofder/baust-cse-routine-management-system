import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, RefreshCw, CalendarIcon, MapPin, Clock, CalendarDays, Edit3 } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Course, Section, CTAssignment } from "@/lib/types";
import { toast } from "sonner";

export function CourseCTSchedulePage() {
  const { active_semester_id, sections, rooms } = useStore();
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [viewingCourseKey, setViewingCourseKey] = useState<string | null>(null);
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
      const isNonDept = a.course?.departmental_type === "Non-Departmental";
      const sectionName = a.section?.name || "";
      const key = isNonDept 
        ? `${courseCode} - ${courseName} (Common)|${a.course_id}|common`
        : `${courseCode} - ${courseName} (Sec ${sectionName})|${a.course_id}|${a.section_id}`;
      
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });

    // Sort courses by departmental_type, level and term
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      const firstA = grouped[a][0];
      const firstB = grouped[b][0];
      if (!firstA.course || !firstB.course) return 0;
      
      if (firstA.course.departmental_type !== firstB.course.departmental_type) {
        return firstA.course.departmental_type === "Departmental" ? -1 : 1;
      }
      if (firstA.course.level !== firstB.course.level) return firstA.course.level - firstB.course.level;
      if (firstA.course.term !== firstB.course.term) return firstA.course.term.localeCompare(firstB.course.term);
      return firstA.course.code.localeCompare(firstB.course.code);
    });

    const sortedGrouped: Record<string, CTAssignment[]> = {};
    sortedKeys.forEach(key => {
      // Ensure CTs within a course are sorted by number
      sortedGrouped[key] = grouped[key].sort((a, b) => a.ct_number - b.ct_number);
    });

    return sortedGrouped;
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

  const selectedCourseCTs = viewingCourseKey ? groupedAssignments[viewingCourseKey] : [];

  return (
    <div className="pb-10">
      <PageHeader title="Course-wise CT Schedule" subtitle="View and manage class test dates for each course" />
      
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <BookOpen className="h-5 w-5 text-primary" />
          <div className="flex-1 max-w-sm">
            <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
              <SelectTrigger className="font-medium">
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
            {Object.entries(groupedAssignments).map(([courseKey, cts]) => {
              const label = courseKey.split('|')[0];
              const course = cts[0].course;
              const section = cts[0].section;
              return (
                <div 
                  key={courseKey} 
                  onClick={() => setViewingCourseKey(courseKey)}
                  className="bg-card rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group border-l-4 border-l-primary/30 hover:border-l-primary"
                >
                  <div className="bg-muted/50 p-4 border-b">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-black text-sm truncate text-primary group-hover:text-primary/80 transition-colors">{label}</h4>
                      <Badge variant="outline" className="text-[10px] py-0 h-4 bg-background shadow-sm">
                        {course?.departmental_type}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-bold text-muted-foreground mt-1 uppercase tracking-tight">
                      L{course?.level} T-{course?.term} · Section {section?.name}
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    {cts.map(ct => (
                      <div key={ct.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-[10px]">
                            {ct.ct_number}
                          </div>
                          <span className="font-bold text-xs">CT {ct.ct_number}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-xs">{format(parseISO(ct.date), "dd MMM")}</div>
                          <div className="text-[9px] text-muted-foreground font-bold uppercase">Room {ct.room?.name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl text-muted-foreground bg-muted/5">
            <p className="font-bold">No CT assignments found.</p>
            <Button variant="link" onClick={loadAssignments} className="mt-2 text-primary font-bold">
              Try reloading
            </Button>
          </div>
        )}
      </div>

      {/* Timeline View Dialog */}
      <Dialog open={!!viewingCourseKey} onOpenChange={(open) => !open && setViewingCourseKey(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              CT Schedule Timeline
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-6 px-2">
             {viewingCourseKey && (
                <div className="mb-6">
                   <h3 className="font-black text-lg leading-tight">{viewingCourseKey.split('|')[0]}</h3>
                   <div className="flex gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px]">{selectedCourseCTs[0]?.course?.departmental_type}</Badge>
                      <Badge variant="outline" className="text-[10px]">Level {selectedCourseCTs[0]?.course?.level} Term {selectedCourseCTs[0]?.course?.term}</Badge>
                   </div>
                </div>
             )}

            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-primary/20 before:to-transparent">
              {selectedCourseCTs.map((ct, idx) => (
                <div key={ct.id} className="relative flex items-center justify-between group">
                  <div className="flex items-center w-full">
                    <div className="absolute left-0 w-8 h-8 rounded-full border-2 border-background bg-primary flex items-center justify-center text-primary-foreground shadow-lg z-10 transition-transform group-hover:scale-110">
                      <span className="text-[10px] font-black">{ct.ct_number}</span>
                    </div>
                    <div className="ml-12 flex-1 bg-muted/30 hover:bg-muted/50 p-4 rounded-xl border border-transparent hover:border-primary/20 transition-all">
                      <div className="flex justify-between items-start">
                         <div>
                            <div className="text-sm font-black text-primary">Class Test {ct.ct_number}</div>
                            <div className="flex items-center gap-4 mt-2">
                               <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                                  <CalendarIcon className="h-3 w-3" />
                                  {format(parseISO(ct.date), "EEEE, dd MMMM")}
                               </div>
                               <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  Room {ct.room?.name}
                               </div>
                            </div>
                            <div className="mt-1 text-[10px] font-black text-primary/60 uppercase">Week {ct.week_number}</div>
                         </div>
                         <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 rounded-full hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                               e.stopPropagation();
                               setEditingAssignment(ct);
                               setViewingCourseKey(null);
                            }}
                         >
                            <Edit3 className="h-3.5 w-3.5" />
                         </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingCourseKey(null)} className="font-bold">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Assignment Dialog */}
      <Dialog open={!!editingAssignment} onOpenChange={(open) => !open && setEditingAssignment(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <Edit3 className="h-5 w-5 text-primary" />
               Update CT Assignment
            </DialogTitle>
          </DialogHeader>
          {editingAssignment && (
            <div className="grid gap-6 py-6">
              <div className="bg-muted/30 p-4 rounded-lg border space-y-1">
                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Selected Course</div>
                <div className="text-sm font-black">{editingAssignment.course?.code} - {editingAssignment.course?.name}</div>
                <div className="text-[11px] font-bold text-primary">Section {editingAssignment.section?.name} · CT {editingAssignment.ct_number}</div>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Select Room</Label>
                <Select
                  value={editingAssignment.room_id}
                  onValueChange={(v) => setEditingAssignment({ ...editingAssignment, room_id: v })}
                >
                  <SelectTrigger className="font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="font-medium">
                        {r.name} <span className="text-[10px] opacity-50 ml-1">({r.capacity} seats)</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Select Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-bold border-2">
                      <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                      {format(parseISO(editingAssignment.date), "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
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
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingAssignment(null)} className="font-bold">Cancel</Button>
            <Button className="font-black" onClick={() => editingAssignment && handleUpdateAssignment(editingAssignment.id, {
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
