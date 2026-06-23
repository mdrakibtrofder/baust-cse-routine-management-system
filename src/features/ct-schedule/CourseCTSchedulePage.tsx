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
import { Loader2, BookOpen, RefreshCw, CalendarIcon, MapPin, Clock, CalendarDays, Edit3, AlertCircle, Check } from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { Course, Section, CTAssignment } from "@/lib/types";
import { toast } from "sonner";

export function CourseCTSchedulePage() {
  const { active_semester_id, sections, rooms, departments } = useStore();
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLevelTerm, setSelectedLevelTerm] = useState<string>("all");
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

  // Get unique level-term combinations from assignments
  const uniqueLevelTerms = useMemo(() => {
    const ltMap = new Map<string, {
      level: number;
      term: string;
      deptType: string;
      deptId: string | null;
      deptName: string;
      deptFullName: string;
      assignment: CTAssignment | undefined;
    }>();

    assignments.forEach(a => {
      if (a.course) {
        const deptId = a.course.department_id || 'none';
        const key = `${a.course.level}-${a.course.term}-${a.course.departmental_type}-${deptId}`;

        if (!ltMap.has(key)) {
          // Get department info
          let dept = null;
          let deptName = 'CSE';
          let deptFullName = 'Computer Science & Engineering';

          if (a.course.departmental_type === 'Non-Departmental') {
            deptName = 'Non-Dept';
            deptFullName = 'Non-Departmental';
          } else if (deptId !== 'none') {
            dept = departments.find(d => d.id === deptId);
            if (dept) {
              deptName = dept.short_name;
              deptFullName = dept.full_name;
            }
          }

          ltMap.set(key, {
            level: a.course.level,
            term: a.course.term,
            deptType: a.course.departmental_type,
            deptId: deptId === 'none' ? null : deptId,
            deptName,
            deptFullName,
            assignment: a
          });
        }
      }
    });

    const ltArray = Array.from(ltMap.values());

    // Sort: Departmental first, then by level, term
    return ltArray.sort((a, b) => {
      if (a.deptType !== b.deptType) {
        return a.deptType === 'Departmental' ? -1 : 1;
      }
      if (a.level !== b.level) return a.level - b.level;
      return a.term.localeCompare(b.term);
    });
  }, [assignments, departments]);

  const filteredAssignments = useMemo(() => {
    if (selectedLevelTerm === "all") return assignments;
    return assignments.filter(a => {
      if (!a.course) return false;
      const key = `${a.course.level}-${a.course.term}-${a.course.departmental_type}-${a.course.department_id || 'none'}`;
      return key === selectedLevelTerm;
    });
  }, [assignments, selectedLevelTerm]);

  // Group by course (showing all sections in same row)
  const groupedByCourse = useMemo(() => {
    const grouped: Record<string, CTAssignment[]> = {};
    filteredAssignments.forEach(a => {
      const courseId = a.course_id;
      if (!grouped[courseId]) grouped[courseId] = [];
      grouped[courseId].push(a);
    });

    // Sort each course's CTs by number
    Object.keys(grouped).forEach(courseId => {
      grouped[courseId].sort((a, b) => a.ct_number - b.ct_number);
    });

    return grouped;
  }, [filteredAssignments]);

  // Check if a course's CTs are synced (all sections have same date for same CT number)
  const checkCTSync = (courseId: string) => {
    const courseCTs = groupedByCourse[courseId] || [];

    for (let ctNum = 1; ctNum <= 3; ctNum++) {
      const ctsForThisNum = courseCTs.filter(ct => ct.ct_number === ctNum);
      if (ctsForThisNum.length > 1) {
        const dates = new Set(ctsForThisNum.map(ct => {
          const d = typeof ct.date === 'string' ? ct.date.split('T')[0] : format(new Date(ct.date), 'yyyy-MM-dd');
          return d;
        }));
        if (dates.size > 1) return false; // Dates don't match
      }
    }
    return true;
  };

  const selectedCourseCTs = useMemo(() => {
    if (!viewingCourseKey) return [];
    const courseId = viewingCourseKey.split('|')[1];
    return groupedByCourse[courseId] || [];
  }, [viewingCourseKey, groupedByCourse]);

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
      <PageHeader title="Course-wise CT Schedule" subtitle="View and manage class test dates for each course" />
      
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <BookOpen className="h-5 w-5 text-primary" />
          <div className="flex-1 max-w-sm">
            <Select
              value={selectedLevelTerm}
              onValueChange={setSelectedLevelTerm}
            >
              <SelectTrigger className="font-medium">
                <SelectValue placeholder="Filter by Level & Term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Level & Terms</SelectItem>
                {uniqueLevelTerms.map((lt) => {
                  const key = `${lt.level}-${lt.term}-${lt.deptType}-${lt.deptId || 'none'}`;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">L{lt.level} T{lt.term}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-sm">{lt.deptName}</span>
                        {lt.deptFullName && lt.deptFullName !== lt.deptName && (
                          <span className="text-xs text-muted-foreground">({lt.deptFullName})</span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={loadAssignments} title="Refresh">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>

        {Object.keys(groupedByCourse).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedByCourse).map(([courseId, allCTs]) => {
              const course = allCTs[0]?.course;
              const isSynced = checkCTSync(courseId);

              // Group CTs by section
              const ctsBySection: Record<string, CTAssignment[]> = {};
              allCTs.forEach(ct => {
                const sectionName = ct.section?.name || "Common";
                if (!ctsBySection[sectionName]) ctsBySection[sectionName] = [];
                ctsBySection[sectionName].push(ct);
              });

              const courseKey = `${course?.code} - ${course?.name}|${courseId}`;

              return (
                <div
                  key={courseId}
                  onClick={() => setViewingCourseKey(courseKey)}
                  className={cn(
                    "rounded-2xl border-2 overflow-hidden shadow-md hover:shadow-lg transition-all cursor-pointer group",
                    isSynced
                      ? "bg-gradient-to-br from-success/5 to-success/10 border-success/30 hover:border-success/50"
                      : "bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/30 hover:border-destructive/50"
                  )}
                >
                  <div className={cn(
                    "p-4 border-b backdrop-blur-sm",
                    isSynced ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-black text-base truncate text-foreground group-hover:text-primary transition-colors">
                            {course?.code}
                          </h4>
                          {isSynced && (
                            <div className="flex items-center gap-1 px-2.5 py-1 bg-success/20 rounded-full shadow-sm" title="All sections synchronized">
                              <Check className="h-3.5 w-3.5 text-success" />
                              <span className="text-[9px] font-bold text-success uppercase">Synced</span>
                            </div>
                          )}
                          {!isSynced && (
                            <div className="flex items-center gap-1 px-2.5 py-1 bg-destructive/20 rounded-full shadow-sm" title="CT dates are not synchronized across sections">
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                              <span className="text-[9px] font-bold text-destructive uppercase">Unsync</span>
                            </div>
                          )}
                        </div>
                        <p className="text-[12px] font-semibold text-muted-foreground truncate">{course?.name}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className="text-[9px] py-1 bg-background shadow-sm">
                            L{course?.level} T{course?.term}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[9px] py-1 bg-background shadow-sm font-bold"
                            style={{
                              borderColor: "hsl(var(--primary))",
                              color: "hsl(var(--primary))"
                            }}
                          >
                            {(() => {
                              if (course?.departmental_type === 'Non-Departmental') {
                                return 'Non-Dept';
                              }
                              const dept = departments.find(d => d.id === course?.department_id);
                              return dept?.short_name || 'CSE';
                            })()}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-5">
                    {Object.entries(ctsBySection).map(([sectionName, sectionCTs]) => (
                      <div key={sectionName} className="space-y-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary/40"></div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                            {course?.departmental_type === 'Non-Departmental' ? 'Common Section' : `Section ${sectionName}`}
                          </div>
                          <div className="flex-1 h-px bg-border/50"></div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                          {sectionCTs.map(ct => (
                            <div
                              key={ct.id}
                              className={cn(
                                "p-3.5 rounded-xl border-2 backdrop-blur-sm hover:scale-105 transition-all",
                                isSynced
                                  ? "bg-success/10 border-success/40 hover:bg-success/20 hover:border-success/60"
                                  : "bg-muted/50 border-border hover:border-primary/50"
                              )}
                            >
                              <div className="flex items-center gap-2 mb-2.5">
                                <div className={cn(
                                  "w-7 h-7 rounded-lg flex items-center justify-center font-black text-[10px] shadow-sm",
                                  isSynced
                                    ? "bg-success/40 text-success-foreground"
                                    : "bg-primary/20 text-primary"
                                )}>
                                  {ct.ct_number}
                                </div>
                                <span className="font-bold text-xs tracking-tight">CT {ct.ct_number}</span>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                                  <CalendarIcon className="h-3 w-3 text-primary" />
                                  <span className="font-semibold text-foreground">{format(parseISO(ct.date), "dd MMM")}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                                  <MapPin className="h-3 w-3 text-primary" />
                                  <span className="font-mono text-foreground">{ct.room?.name}</span>
                                </div>
                              </div>
                            </div>
                          ))}
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
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              CT Schedule Timeline
            </DialogTitle>
          </DialogHeader>

          <div className="py-6 px-2 space-y-6">
            {/* Header with Course and Department Info */}
            {viewingCourseKey && selectedCourseCTs.length > 0 && (
              <div className="bg-gradient-to-r from-primary/15 to-primary/10 p-4 rounded-xl border-2 border-primary/20">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-black text-lg leading-tight text-foreground">
                      {viewingCourseKey.split('|')[0]}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedCourseCTs[0]?.course?.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="font-bold"
                    style={{
                      borderColor: "hsl(var(--primary))",
                      color: "hsl(var(--primary))"
                    }}
                  >
                    L{selectedCourseCTs[0]?.course?.level} T{selectedCourseCTs[0]?.course?.term}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-bold"
                    style={{
                      borderColor: "hsl(var(--primary))",
                      color: "hsl(var(--primary))"
                    }}
                  >
                    {selectedCourseCTs[0]?.course?.departmental_type === 'Non-Departmental'
                      ? 'Non-Dept'
                      : (() => {
                          const dept = departments.find(
                            d => d.id === selectedCourseCTs[0]?.course?.department_id
                          );
                          return dept?.short_name || 'CSE';
                        })()}
                  </Badge>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-primary/20 before:to-transparent">
              {selectedCourseCTs.map((ct, idx) => {
                const sectionLabel =
                  ct.course?.departmental_type === 'Non-Departmental'
                    ? 'Common'
                    : `${ct.course?.level}-${ct.course?.term} ${ct.section?.name}`;

                return (
                  <div key={ct.id} className="relative flex items-center justify-between group">
                    <div className="flex items-center w-full">
                      <div className="absolute left-0 w-8 h-8 rounded-full border-2 border-background bg-primary flex items-center justify-center text-primary-foreground shadow-lg z-10 transition-transform group-hover:scale-110">
                        <span className="text-[10px] font-black">{ct.ct_number}</span>
                      </div>
                      <div className="ml-12 flex-1 bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10 p-4 rounded-xl border-2 border-primary/20 hover:border-primary/40 transition-all">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-sm font-black text-primary">
                                CT {ct.ct_number}
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-bold bg-background"
                                style={{
                                  borderColor: "hsl(var(--primary))",
                                  color: "hsl(var(--primary))"
                                }}
                              >
                                {sectionLabel}
                              </Badge>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                                <CalendarIcon className="h-3 w-3 text-primary" />
                                <span className="text-foreground">
                                  {format(parseISO(ct.date), "EEE, dd MMM yyyy")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                                <MapPin className="h-3 w-3 text-primary" />
                                <span className="font-mono text-foreground">Room {ct.room?.name}</span>
                              </div>
                            </div>

                            <div className="mt-2 text-[10px] font-black text-primary/60 uppercase tracking-tight">
                              Week {ct.week_number}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-primary hover:text-primary-foreground shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAssignment(ct);
                              setViewingCourseKey(null);
                            }}
                            title="Edit CT"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingCourseKey(null)} className="font-bold">
              Close
            </Button>
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
