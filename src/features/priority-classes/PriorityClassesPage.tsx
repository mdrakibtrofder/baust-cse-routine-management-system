import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/Stepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Calendar, MapPin, Clock, BookOpen, Building2, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn, fmtRange12 } from "@/lib/utils";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { toast } from "sonner";
import type { PriorityClass, Course, Room, Period } from "@/lib/types";
import { roomAllowedForHomeDept } from "@/lib/room-dept";

const STEPS = [
  "Department",
  "Level & Section",
  "Courses",
  "Rooms",
  "Times",
  "Days"
];

export function PriorityClassesPage() {
  const data = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Form State
  const [deptId, setDeptId] = useState("");
  const [level, setLevel] = useState("1");
  const [term, setTerm] = useState("I");
  const [sectionId, setSectionId] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Room view option
  const [showOtherRooms, setShowOtherRooms] = useState(false);

  // Set default department (CSE) on load
  const cseDept = useMemo(() => {
    return data.departments.find(
      (d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME
    );
  }, [data.departments]);

  useEffect(() => {
    if (cseDept && !deptId) {
      setDeptId(cseDept.id);
    }
  }, [cseDept, deptId]);

  // Derived sections matching selection
  const filteredSections = useMemo(() => {
    return data.sections.filter(
      (s) =>
        s.department_id === deptId &&
        s.level === Number(level) &&
        s.term === term
    );
  }, [data.sections, deptId, level, term]);

  // Derived courses matching selection
  const filteredCourses = useMemo(() => {
    return data.courses.filter(
      (c) =>
        c.department_id === deptId &&
        c.level === Number(level) &&
        c.term === term
    );
  }, [data.courses, deptId, level, term]);

  // Partition rooms into allowed (departmental/non-departmental) and other
  const partitionedRooms = useMemo(() => {
    const compatible = data.rooms;
    const allowed = compatible.filter((r) => roomAllowedForHomeDept(r, data.departments));
    const other = compatible.filter((r) => !roomAllowedForHomeDept(r, data.departments));
    return { allowed, other };
  }, [data.rooms, data.departments]);

  const activeSemesterPriorityClasses = useMemo(() => {
    return data.priority_classes.filter(
      (pc) => pc.semester_id === data.active_semester_id
    );
  }, [data.priority_classes, data.active_semester_id]);

  const handleOpen = () => {
    setIsOpen(true);
    setCurrentStep(0);
    if (cseDept) setDeptId(cseDept.id);
    setLevel("1");
    setTerm("I");
    setSectionId("");
    setSelectedCourseIds([]);
    setSelectedRoomIds([]);
    setSelectedPeriods([]);
    setSelectedDays([]);
    setShowOtherRooms(false);
  };

  const validateStep = () => {
    if (currentStep === 0 && !deptId) {
      toast.error("Please select a department");
      return false;
    }
    if (currentStep === 1) {
      if (!level || !term) {
        toast.error("Please select Level and Term");
        return false;
      }
      if (!sectionId) {
        toast.error("Please select a Section");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSkip = () => {
    // Clear selections of current optional step
    if (currentStep === 2) setSelectedCourseIds([]);
    if (currentStep === 3) setSelectedRoomIds([]);
    if (currentStep === 4) setSelectedPeriods([]);
    if (currentStep === 5) setSelectedDays([]);

    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const hasAtLeastOneOptional = useMemo(() => {
    return (
      selectedCourseIds.length > 0 ||
      selectedRoomIds.length > 0 ||
      selectedPeriods.length > 0 ||
      selectedDays.length > 0
    );
  }, [selectedCourseIds, selectedRoomIds, selectedPeriods, selectedDays]);

  const handleSave = async () => {
    if (!validateStep()) return;

    if (!hasAtLeastOneOptional) {
      toast.error("You must configure at least one optional parameter: Courses, Rooms, Times, or Days!");
      return;
    }

    try {
      const payload = {
        semester_id: data.active_semester_id,
        department_id: deptId,
        level: Number(level),
        term,
        section_id: sectionId,
        course_ids: selectedCourseIds,
        room_ids: selectedRoomIds,
        time_slots: selectedPeriods.map((p) => ({ start: p.start, end: p.end })),
        days: selectedDays,
      };

      await data.addPriorityClass(payload);
      toast.success("Priority Class configuration saved successfully!");
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save Priority Class");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this Priority Class entry?")) {
      try {
        await data.deletePriorityClass(id);
        toast.success("Priority Class configuration deleted.");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete");
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Priority Classes"
        subtitle="Manage custom priorities for class schedules. Priority classes are allocated before standard routine generation."
        rightSlot={
          <Button onClick={handleOpen} className="gap-2" style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4" /> Add Priority
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {activeSemesterPriorityClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-xl border border-dashed p-8 shadow-sm">
            <ShieldCheck className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No priority classes defined</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Priority classes allow you to force certain classes to pick specific rooms, times, or days before standard routine generation runs.
            </p>
            <Button onClick={handleOpen} className="mt-4 gap-2" variant="outline">
              <Plus className="h-4 w-4" /> Add First Priority
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[12%]">Target Section</TableHead>
                  <TableHead className="w-[20%]">Courses</TableHead>
                  <TableHead className="w-[20%]">Rooms</TableHead>
                  <TableHead className="w-[20%]">Time Slots</TableHead>
                  <TableHead className="w-[18%]">Days</TableHead>
                  <TableHead className="w-[10%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSemesterPriorityClasses.map((item) => {
                  const dept = data.departments.find((d) => d.id === item.department_id);
                  const sec = data.sections.find((s) => s.id === item.section_id);

                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium align-top">
                        <div className="font-semibold text-sm">
                          {dept?.short_name} Level {item.level} Term {item.term}
                        </div>
                        {sec && (
                          <Badge variant="secondary" className="mt-1">
                            Section {sec.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {item.course_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">All Courses</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.course_ids.map((cid) => {
                              const course = data.courses.find((c) => c.id === cid);
                              return (
                                <Badge key={cid} variant="outline" className="text-[10px] gap-1 py-0 h-5">
                                  <BookOpen className="h-2.5 w-2.5" /> {course?.code || cid}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {item.room_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Any Room</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.room_ids.map((rid) => {
                              const room = data.rooms.find((r) => r.id === rid);
                              return (
                                <Badge key={rid} variant="outline" className="text-[10px] gap-1 py-0 h-5 bg-amber-50 border-amber-200 text-amber-800">
                                  <MapPin className="h-2.5 w-2.5 text-amber-600" /> {room?.name || rid}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {(!item.time_slots || item.time_slots.length === 0) ? (
                          <span className="text-xs text-muted-foreground italic">Any Time</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.time_slots.map((ts, idx) => (
                              <Badge key={idx} variant="outline" className="text-[10px] gap-1 py-0 h-5 bg-blue-50 border-blue-200 text-blue-800">
                                <Clock className="h-2.5 w-2.5 text-blue-600" /> {fmtRange12(ts.start, ts.end)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {item.days.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Any Day</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {item.days.map((day) => (
                              <Badge key={day} variant="outline" className="text-[10px] gap-1 py-0 h-5 bg-purple-50 border-purple-200 text-purple-800 font-mono">
                                <Calendar className="h-2.5 w-2.5 text-purple-600" /> {day}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Sequential Multi-step Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50 shadow-2xl border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Configure Priority Class Settings</DialogTitle>
          </DialogHeader>

          {/* Stepper Timeline at the Top */}
          <div className="py-4 border-b border-border/60">
            <Stepper
              steps={STEPS}
              current={currentStep}
            />
          </div>

          {/* Step Contents */}
          <div className="py-6 min-h-[250px] flex flex-col justify-between">
            {currentStep === 0 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2 text-blue-800 text-xs">
                  <Building2 className="h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <span className="font-semibold">Step 1: Department (Mandatory).</span> Set the owning department of the priority rule.
                  </div>
                </div>
                <div className="space-y-2 mt-4">
                  <Label htmlFor="department">Select Department</Label>
                  <Select value={deptId} onValueChange={setDeptId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {data.departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.full_name} ({d.short_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2 text-blue-800 text-xs">
                  <Calendar className="h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <span className="font-semibold">Step 2: Level, Term, Section (Mandatory).</span> Specify the class level, term, and section.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="level">Level</Label>
                    <Select value={level} onValueChange={(v) => { setLevel(v); setSectionId(""); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["1", "2", "3", "4"].map((l) => (
                          <SelectItem key={l} value={l}>Level {l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="term">Term</Label>
                    <Select value={term} onValueChange={(v) => { setTerm(v); setSectionId(""); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["I", "II"].map((t) => (
                          <SelectItem key={t} value={t}>Term {t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  <Label htmlFor="section">Section</Label>
                  <Select value={sectionId} onValueChange={setSectionId}>
                    <SelectTrigger>
                      <SelectValue placeholder={filteredSections.length === 0 ? "No sections available" : "Select Section..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          Section {s.name} ({s.total_students} students)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <BookOpen className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 3: Course Selection (Optional).</span> Select specific courses in this section to apply priority, or skip to apply to all courses of this section.
                  </div>
                </div>
                <Label className="block text-sm font-medium mt-2">Available Courses</Label>
                {filteredCourses.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
                    No courses available for selected Level/Term/Department.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {filteredCourses.map((c) => {
                      const checked = selectedCourseIds.includes(c.id);
                      return (
                        <div key={c.id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded">
                          <Checkbox
                            id={`course-${c.id}`}
                            checked={checked}
                            onCheckedChange={(val) => {
                              setSelectedCourseIds((prev) =>
                                val ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                              );
                            }}
                          />
                          <label htmlFor={`course-${c.id}`} className="text-xs font-medium cursor-pointer leading-none">
                            {c.code} - {c.name}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 4: Room Selection (Optional).</span> Limit the rooms allowed for these classes, or skip to allow any compatible room.
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Label className="text-sm font-medium">Select Rooms</Label>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="showOtherRooms"
                      checked={showOtherRooms}
                      onCheckedChange={(v) => setShowOtherRooms(!!v)}
                    />
                    <label htmlFor="showOtherRooms" className="text-xs text-muted-foreground cursor-pointer font-medium">
                      Show other department rooms
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {partitionedRooms.allowed.map((r) => {
                    const checked = selectedRoomIds.includes(r.id);
                    return (
                      <div key={r.id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded border-border">
                        <Checkbox
                          id={`room-${r.id}`}
                          checked={checked}
                          onCheckedChange={(val) => {
                            setSelectedRoomIds((prev) =>
                              val ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                            );
                          }}
                        />
                        <label htmlFor={`room-${r.id}`} className="text-xs cursor-pointer font-medium leading-none">
                          {r.name} ({r.room_type}, cap {r.capacity})
                        </label>
                      </div>
                    );
                  })}
                  {showOtherRooms && partitionedRooms.other.map((r) => {
                    const checked = selectedRoomIds.includes(r.id);
                    return (
                      <div key={r.id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded bg-amber-50/30">
                        <Checkbox
                          id={`room-${r.id}`}
                          checked={checked}
                          onCheckedChange={(val) => {
                            setSelectedRoomIds((prev) =>
                              val ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                            );
                          }}
                        />
                        <label htmlFor={`room-${r.id}`} className="text-xs cursor-pointer font-medium leading-none text-amber-900">
                          {r.name} ({r.room_type}, cap {r.capacity}) <span className="text-[9px] text-amber-600 bg-amber-100 px-1 rounded ml-1">Other Dept</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 5: Time Slots (Optional).</span> Select periods/time slots for these classes, or skip to allow any time slot.
                  </div>
                </div>
                <Label className="block text-sm font-medium mt-2">Select Periods</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {data.periods.map((p) => {
                    const checked = selectedPeriods.some((x) => x.id === p.id);
                    return (
                      <div key={p.id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded">
                        <Checkbox
                          id={`period-${p.id}`}
                          checked={checked}
                          onCheckedChange={(val) => {
                            setSelectedPeriods((prev) =>
                              val ? [...prev, p] : prev.filter((x) => x.id !== p.id)
                            );
                          }}
                        />
                        <label htmlFor={`period-${p.id}`} className="text-xs cursor-pointer font-medium leading-none">
                          {p.name} ({fmtRange12(p.start, p.end)}) <span className="text-[9px] text-muted-foreground">({p.kind})</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <Calendar className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 6: Days of Week (Optional).</span> Select preferred days, or skip to allow any day.
                  </div>
                </div>
                <Label className="block text-sm font-medium mt-2">Select Days</Label>
                <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {data.days.map((d) => {
                    const checked = selectedDays.includes(d.name);
                    return (
                      <div key={d.id} className="flex items-center space-x-2 p-1.5 hover:bg-muted/30 rounded">
                        <Checkbox
                          id={`day-${d.id}`}
                          checked={checked}
                          onCheckedChange={(val) => {
                            setSelectedDays((prev) =>
                              val ? [...prev, d.name] : prev.filter((name) => name !== d.name)
                            );
                          }}
                        />
                        <label htmlFor={`day-${d.id}`} className="text-xs cursor-pointer font-medium leading-none">
                          {d.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t border-border/60 pt-4 mt-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={currentStep === 0}
              >
                Previous
              </Button>
              {currentStep >= 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Skip
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              {currentStep < STEPS.length - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                >
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSave}
                  className={cn(!hasAtLeastOneOptional && "opacity-50")}
                  style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
                >
                  Finish & Save
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
