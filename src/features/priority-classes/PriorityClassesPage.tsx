import { useState, useMemo, useEffect } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/Stepper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Edit2, Calendar, MapPin, Clock, BookOpen, Building2, ShieldCheck, FlaskConical, Copy, ListChecks } from "lucide-react";
import { cn, fmtRange12, fmtDayTitle } from "@/lib/utils";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { toast } from "sonner";
import type { PriorityClass, Course, Room, Period } from "@/lib/types";
import { roomAllowedForHomeDept } from "@/lib/room-dept";
import { useConfirm } from "@/components/ConfirmDialog";


const STEPS = [
  "Department",
  "Level & Section",
  "Course Type",
  "Courses",
  "Rooms",
  "Times",
  "Days"
];

export function PriorityClassesPage() {
  const data = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const confirm = useConfirm();

  // Form State
  const [deptId, setDeptId] = useState("");
  const [level, setLevel] = useState("1");
  const [term, setTerm] = useState("I");
  const [sectionId, setSectionId] = useState("");
  const [courseType, setCourseType] = useState<'Theory' | 'Sessional'>('Theory');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Room view option
  const [showOtherRooms, setShowOtherRooms] = useState(false);

  // Filters State
  const [filterDeptId, setFilterDeptId] = useState("ALL");
  const [filterSectionId, setFilterSectionId] = useState("ALL");
  const [filterCourseId, setFilterCourseId] = useState("ALL");
  const [filterRoomId, setFilterRoomId] = useState("ALL");
  const [filterPeriodId, setFilterPeriodId] = useState("ALL");
  const [filterDay, setFilterDay] = useState("ALL");

  const hasActiveFilters = useMemo(() => {
    return (
      filterDeptId !== "ALL" ||
      filterSectionId !== "ALL" ||
      filterCourseId !== "ALL" ||
      filterRoomId !== "ALL" ||
      filterPeriodId !== "ALL" ||
      filterDay !== "ALL"
    );
  }, [filterDeptId, filterSectionId, filterCourseId, filterRoomId, filterPeriodId, filterDay]);

  const handleResetFilters = () => {
    setFilterDeptId("ALL");
    setFilterSectionId("ALL");
    setFilterCourseId("ALL");
    setFilterRoomId("ALL");
    setFilterPeriodId("ALL");
    setFilterDay("ALL");
  };

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

  // Auto-select first available section when Level/Term/Dept changes (or on dialog open)
  useEffect(() => {
    if (filteredSections.length > 0) {
      const exists = filteredSections.some((s) => s.id === sectionId);
      if (!exists) setSectionId(filteredSections[0].id);
    } else if (sectionId) {
      setSectionId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSections]);

  const filteredFilterSectionsOptions = useMemo(() => {
    let secs = [...data.sections];
    if (filterDeptId !== "ALL") {
      secs = secs.filter((s) => s.department_id === filterDeptId);
    }
    // Sort sections: department first (CSE first, then alphabetical), then level, then term, then section name
    return secs.sort((a, b) => {
      const deptA = data.departments.find((d) => d.id === a.department_id);
      const deptB = data.departments.find((d) => d.id === b.department_id);
      const nameA = deptA?.short_name.trim().toUpperCase() || "";
      const nameB = deptB?.short_name.trim().toUpperCase() || "";

      if (nameA !== nameB) {
        if (nameA === HOME_DEPT_SHORT_NAME) return -1;
        if (nameB === HOME_DEPT_SHORT_NAME) return 1;
        return nameA.localeCompare(nameB);
      }

      if (a.level !== b.level) {
        return a.level - b.level;
      }
      if (a.term !== b.term) {
        return a.term.localeCompare(b.term);
      }
      return a.name.localeCompare(b.name);
    });
  }, [data.sections, data.departments, filterDeptId]);

  // Derived courses matching selection & Course Type selection
  const filteredCourses = useMemo(() => {
    return data.courses.filter(
      (c) =>
        c.department_id === deptId &&
        c.level === Number(level) &&
        c.term === term &&
        c.course_type.startsWith(courseType === 'Theory' ? 'theory_' : 'sessional_')
    );
  }, [data.courses, deptId, level, term, courseType]);

  // Partition rooms into allowed (departmental/non-departmental) and other, and filtered by Course Type
  const partitionedRooms = useMemo(() => {
    const compatible = data.rooms.filter(
      (r) => r.room_type === courseType || r.room_type === "Both"
    );
    const allowed = compatible.filter((r) => roomAllowedForHomeDept(r, data.departments));
    const other = compatible.filter((r) => !roomAllowedForHomeDept(r, data.departments));
    return { allowed, other };
  }, [data.rooms, data.departments, courseType]);

  // Derived periods matching Course Type
  const filteredPeriods = useMemo(() => {
    return data.periods.filter(
      (p) => p.kind === courseType.toLowerCase() && !p.is_break
    );
  }, [data.periods, courseType]);

  const activeSemesterPriorityClasses = useMemo(() => {
    let filtered = data.priority_classes.filter(
      (pc) => pc.semester_id === data.active_semester_id
    );

    // Apply filters
    if (filterDeptId !== "ALL") {
      filtered = filtered.filter((pc) => pc.department_id === filterDeptId);
    }
    if (filterSectionId !== "ALL") {
      filtered = filtered.filter((pc) => pc.section_id === filterSectionId);
    }
    if (filterCourseId !== "ALL") {
      filtered = filtered.filter((pc) => pc.course_ids && pc.course_ids.includes(filterCourseId));
    }
    if (filterRoomId !== "ALL") {
      filtered = filtered.filter((pc) => pc.room_ids && pc.room_ids.includes(filterRoomId));
    }
    if (filterPeriodId !== "ALL") {
      const targetPeriod = data.periods.find((p) => p.id === filterPeriodId);
      if (targetPeriod) {
        filtered = filtered.filter((pc) => 
          pc.time_slots && pc.time_slots.some((ts) => ts.start === targetPeriod.start && ts.end === targetPeriod.end)
        );
      }
    }
    if (filterDay !== "ALL") {
      filtered = filtered.filter((pc) => pc.days && pc.days.includes(filterDay));
    }

    return [...filtered].sort((a, b) => {
      const deptA = data.departments.find((d) => d.id === a.department_id);
      const deptB = data.departments.find((d) => d.id === b.department_id);
      const nameA = deptA?.short_name.trim().toUpperCase() || "";
      const nameB = deptB?.short_name.trim().toUpperCase() || "";

      // 1. Department: CSE first, then alphabetical
      if (nameA !== nameB) {
        if (nameA === HOME_DEPT_SHORT_NAME) return -1;
        if (nameB === HOME_DEPT_SHORT_NAME) return 1;
        return nameA.localeCompare(nameB);
      }

      // 2. Level: numeric ascending
      if (a.level !== b.level) {
        return a.level - b.level;
      }

      // 3. Term: ascending ("I" before "II", or localeCompare)
      if (a.term !== b.term) {
        return a.term.localeCompare(b.term);
      }

      // 4. Section: alphabetical ascending
      const secA = data.sections.find((s) => s.id === a.section_id);
      const secB = data.sections.find((s) => s.id === b.section_id);
      const secNameA = secA?.name || "";
      const secNameB = secB?.name || "";
      return secNameA.localeCompare(secNameB);
    });
  }, [
    data.priority_classes, 
    data.active_semester_id, 
    data.departments, 
    data.sections, 
    data.periods,
    filterDeptId,
    filterSectionId,
    filterCourseId,
    filterRoomId,
    filterPeriodId,
    filterDay
  ]);

  const activeSemesterPriorityClassesRaw = useMemo(() => {
    return data.priority_classes.filter(
      (pc) => pc.semester_id === data.active_semester_id
    );
  }, [data.priority_classes, data.active_semester_id]);

  const handleOpen = () => {
    setEditingId(null);
    setIsOpen(true);
    setCurrentStep(0);
    if (cseDept) setDeptId(cseDept.id);
    setLevel("1");
    setTerm("I");
    setSectionId("");
    setCourseType("Theory");
    setSelectedCourseIds([]);
    setSelectedRoomIds([]);
    setSelectedPeriods([]);
    setSelectedDays([]);
    setShowOtherRooms(false);
  };

  const handleEdit = (item: PriorityClass) => {
    setEditingId(item.id);
    setDeptId(item.department_id);
    setLevel(String(item.level));
    setTerm(item.term);
    setSectionId(item.section_id);
    setCourseType(item.course_type || "Theory");
    setSelectedCourseIds(item.course_ids || []);
    setSelectedRoomIds(item.room_ids || []);

    const matchedPeriods = data.periods.filter((p) =>
      item.time_slots?.some((ts) => ts.start === p.start && ts.end === p.end)
    );
    setSelectedPeriods(matchedPeriods);
    setSelectedDays(item.days || []);
    setCurrentStep(0);
    setIsOpen(true);
  };

  const handleDuplicate = (item: PriorityClass) => {
    setEditingId(null);
    setDeptId(item.department_id);
    setLevel(String(item.level));
    setTerm(item.term);
    setSectionId(item.section_id);
    setCourseType(item.course_type || "Theory");
    setSelectedCourseIds(item.course_ids || []);
    setSelectedRoomIds(item.room_ids || []);

    const matchedPeriods = data.periods.filter((p) =>
      item.time_slots?.some((ts) => ts.start === p.start && ts.end === p.end)
    );
    setSelectedPeriods(matchedPeriods);
    setSelectedDays(item.days || []);
    setCurrentStep(0);
    setIsOpen(true);
    toast.success("Duplicated priority class - ready to save as new!");
  };

  const validateStepAt = (step: number) => {
    if (step === 0 && !deptId) {
      toast.error("Please select a department");
      return false;
    }
    if (step === 1) {
      if (!level || !term) {
        toast.error("Please select Level and Term");
        return false;
      }
      if (!sectionId) {
        toast.error("Please select a Section");
        return false;
      }
    }
    if (step === 2 && !courseType) {
      toast.error("Please select a Course Type");
      return false;
    }
    return true;
  };

  const validateStep = () => validateStepAt(currentStep);

  const handleNext = () => {
    if (!validateStep()) return;
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSkip = () => {
    // Clear selections of current optional step
    if (currentStep === 3) setSelectedCourseIds([]);
    if (currentStep === 4) setSelectedRoomIds([]);
    if (currentStep === 5) setSelectedPeriods([]);
    if (currentStep === 6) setSelectedDays([]);

    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  // Click handler for Stepper circles. Backward navigation is unrestricted;
  // forward navigation validates every step between current and target,
  // stopping at the first invalid step (consistent with Next-button behavior).
  const handleStepSelect = (targetStep: number) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      return;
    }
    for (let s = currentStep; s <= targetStep; s++) {
      if (!validateStepAt(s)) {
        setCurrentStep(s);
        return;
      }
    }
    setCurrentStep(targetStep);
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
      const dept = data.departments.find(d => d.id === deptId);
      const section = data.sections.find(s => s.id === sectionId);
      const deptShortName = dept?.short_name || "Dept";
      const sectionName = section?.name || "Sec";
      
      const payload = {
        semester_id: data.active_semester_id,
        department_id: deptId,
        level: Number(level),
        term,
        section_id: sectionId,
        course_type: courseType,
        course_ids: selectedCourseIds,
        room_ids: selectedRoomIds,
        time_slots: selectedPeriods.map((p) => ({ start: p.start, end: p.end })),
        days: selectedDays,
      };

      const messageBase = `Priority Class for ${deptShortName} Level ${level} Term ${term} Section ${sectionName}`;

      if (editingId) {
        await data.updatePriorityClass(editingId, payload);
        toast.success(`${messageBase} updated successfully!`);
      } else {
        await data.addPriorityClass(payload);
        toast.success(`${messageBase} saved successfully!`);
      }
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save Priority Class");
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Priority Class",
      description: "Are you sure you want to delete this priority class?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });

    if (ok) {
      try {
        await data.deletePriorityClass(id);
        toast.success("Priority Class configuration deleted successfully.");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete Priority Class");
      }
    }
  };



  // Select-all helpers for optional multi-select steps
  const allCourseIds = useMemo(() => filteredCourses.map((c) => c.id), [filteredCourses]);
  const allPeriodIds = useMemo(() => filteredPeriods.map((p) => p.id), [filteredPeriods]);
  const allDayNames = useMemo(() => data.days.map((d) => d.name), [data.days]);

  const toggleSelectAll = (
    allIds: string[],
    selected: string[],
    setter: (next: string[]) => void,
    label: string,
  ) => {
    if (selected.length === allIds.length && allIds.length > 0) {
      setter([]);
      toast.message(`Cleared all ${label}.`);
    } else {
      setter([...allIds]);
      toast.success(`Selected all ${allIds.length} ${label}.`);
    }
  };

  const toggleAllCourses = () =>
    toggleSelectAll(allCourseIds, selectedCourseIds, setSelectedCourseIds, "courses");
  const toggleAllPeriods = () =>
    toggleSelectAll(allPeriodIds, selectedPeriods.map((p) => p.id), (ids) => {
      setSelectedPeriods(filteredPeriods.filter((p) => ids.includes(p.id)));
    }, "periods");
  const toggleAllDays = () => toggleSelectAll(allDayNames, selectedDays, setSelectedDays, "days");

  const isAllCourses = allCourseIds.length > 0 && selectedCourseIds.length === allCourseIds.length;
  const isAllPeriods = allPeriodIds.length > 0 && selectedPeriods.length === allPeriodIds.length;
  const isAllDays = allDayNames.length > 0 && selectedDays.length === allDayNames.length;

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
        {activeSemesterPriorityClassesRaw.length === 0 ? (
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
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-2 border-border/60">
                <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground/80">
                  Filter Priority Rules
                </h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFilters}
                    className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Department</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Departments" },
                      ...data.departments.map((d) => ({ value: d.id, label: d.short_name })),
                    ]}
                    value={filterDeptId}
                    onValueChange={(val) => {
                      setFilterDeptId(val);
                      if (val !== "ALL") {
                        const sec = data.sections.find((s) => s.id === filterSectionId);
                        if (sec && sec.department_id !== val) {
                          setFilterSectionId("ALL");
                        }
                      }
                    }}
                    placeholder="All Departments"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Section</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Sections" },
                      ...filteredFilterSectionsOptions.map((s) => {
                        const dept = data.departments.find((d) => d.id === s.department_id);
                        const deptLabel = dept?.short_name || "CSE";
                        return {
                          value: s.id,
                          label: `${deptLabel} L${s.level}T${s.term} ${s.name}`,
                          group: deptLabel,
                        };
                      }),
                    ]}
                    value={filterSectionId}
                    onValueChange={setFilterSectionId}
                    placeholder="All Sections"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Course</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Courses" },
                      ...data.courses.map((c) => ({ value: c.id, label: `${c.code} - ${c.name}` })),
                    ]}
                    value={filterCourseId}
                    onValueChange={setFilterCourseId}
                    placeholder="All Courses"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Room</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Rooms" },
                      ...data.rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.room_type})` })),
                    ]}
                    value={filterRoomId}
                    onValueChange={setFilterRoomId}
                    placeholder="All Rooms"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Time Slot</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Time Slots" },
                      ...data.periods.filter(p => !p.is_break).map((p) => ({ value: p.id, label: `${p.name} (${fmtRange12(p.start, p.end)})` })),
                    ]}
                    value={filterPeriodId}
                    onValueChange={setFilterPeriodId}
                    placeholder="All Time Slots"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground uppercase font-semibold">Day</Label>
                  <Combobox
                    options={[
                      { value: "ALL", label: "All Days" },
                      ...data.days.map((d) => ({ value: d.name, label: d.name })),
                    ]}
                    value={filterDay}
                    onValueChange={setFilterDay}
                    placeholder="All Days"
                    className="h-9 text-xs w-full bg-background"
                  />
                </div>
              </div>
            </div>

            {activeSemesterPriorityClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-xl border border-dashed p-8 shadow-sm">
                <ShieldCheck className="h-10 w-10 text-muted-foreground opacity-40 mb-3" />
                <h4 className="text-md font-medium text-muted-foreground">No matching priority rules found</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Try adjusting or clearing your filters to see the full list of priority class configurations.
                </p>
                <Button onClick={handleResetFilters} className="mt-4 text-xs" variant="outline" size="sm">
                  Clear Filters
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
                        <div className="flex flex-wrap gap-1 mt-1">
                          {sec && (
                            <Badge variant="secondary">
                              Section {sec.name}
                            </Badge>
                          )}
                          {item.course_type && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                item.course_type === "Theory"
                                  ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-50"
                                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              )}
                            >
                              {item.course_type}
                            </Badge>
                          )}
                        </div>
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
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(item)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
          </div>
        )}
      </div>

      {/* Sequential Multi-step Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-50 shadow-2xl border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingId ? "Edit Priority Class Settings" : "Configure Priority Class Settings"}
            </DialogTitle>
          </DialogHeader>

          {/* Stepper Timeline at the Top */}
          <div className="py-4 border-b border-border/60">
            <Stepper
              steps={STEPS}
              current={currentStep}
              onSelect={handleStepSelect}
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
                  <Combobox
                    options={data.departments.map((d) => ({ value: d.id, label: `${d.full_name} (${d.short_name})` }))}
                    value={deptId}
                    onValueChange={setDeptId}
                    placeholder="Choose department..."
                    className="w-full bg-background"
                  />
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
                    <Combobox
                      options={["1", "2", "3", "4"].map((l) => ({ value: l, label: `Level ${l}` }))}
                      value={level}
                      onValueChange={(v) => { setLevel(v); setSectionId(""); }}
                      placeholder="Select Level..."
                      className="w-full bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="term">Term</Label>
                    <Combobox
                      options={["I", "II"].map((t) => ({ value: t, label: `Term ${t}` }))}
                      value={term}
                      onValueChange={(v) => { setTerm(v); setSectionId(""); }}
                      placeholder="Select Term..."
                      className="w-full bg-background"
                    />
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  <Label htmlFor="section">Section</Label>
                  <Combobox
                    options={filteredSections.map((s) => ({ value: s.id, label: `Section ${s.name} (${s.total_students} students)` }))}
                    value={sectionId}
                    onValueChange={setSectionId}
                    placeholder={filteredSections.length === 0 ? "No sections available" : "Select Section..."}
                    disabled={filteredSections.length === 0}
                    className="w-full bg-background"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2 text-blue-800 text-xs">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <span className="font-semibold">Step 3: Course Type (Mandatory).</span> Select the category of classes.
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setCourseType("Theory")}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 rounded-xl border-2 text-center transition-all duration-200 space-y-3 cursor-pointer",
                      courseType === "Theory"
                        ? "border-blue-600 bg-blue-50/50 shadow-md scale-[1.02]"
                        : "border-border hover:border-muted-foreground hover:bg-muted/10"
                    )}
                  >
                    <BookOpen className={cn("h-10 w-10", courseType === "Theory" ? "text-blue-600" : "text-muted-foreground")} />
                    <div>
                      <h3 className="font-semibold text-sm">Theory</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Filters downstream selections to Theory courses, theory rooms, and matching time slots.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCourseType("Sessional")}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 rounded-xl border-2 text-center transition-all duration-200 space-y-3 cursor-pointer",
                      courseType === "Sessional"
                        ? "border-emerald-600 bg-emerald-50/30 shadow-md scale-[1.02]"
                        : "border-border hover:border-muted-foreground hover:bg-muted/10"
                    )}
                  >
                    <FlaskConical className={cn("h-10 w-10", courseType === "Sessional" ? "text-emerald-600" : "text-muted-foreground")} />
                    <div>
                      <h3 className="font-semibold text-sm">Sessional</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Filters downstream selections to Sessional/Lab courses, lab rooms, and sessional time slots.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <BookOpen className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 4: Course Selection (Optional).</span> Select specific courses in this section to apply priority, or skip to apply to all courses of this section.
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Label className="text-sm font-medium">Available Courses</Label>
                  {filteredCourses.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllCourses}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition",
                        isAllCourses
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "text-primary bg-primary/10 hover:bg-primary/20"
                      )}
                    >
                      <ListChecks className="h-3 w-3" />
                      {isAllCourses ? "Unselect all" : "Select all"}
                    </button>
                  )}
                </div>
                {filteredCourses.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
                    No courses available for selected Level/Term/Department/Type.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
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

            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 5: Room Selection (Optional).</span> Limit the rooms allowed for these classes, or skip to allow any compatible room.
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

                <div className="flex flex-col gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
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

            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 6: Time Slots (Optional).</span> Select periods/time slots for these classes, or skip to allow any time slot.
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Label className="text-sm font-medium">Select Periods</Label>
                  {filteredPeriods.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllPeriods}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition",
                        isAllPeriods
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "text-primary bg-primary/10 hover:bg-primary/20"
                      )}
                    >
                      <ListChecks className="h-3 w-3" />
                      {isAllPeriods ? "Unselect all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {filteredPeriods.map((p) => {
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

            {currentStep === 6 && (
              <div className="space-y-4">
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-amber-800 text-xs">
                  <Calendar className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Step 7: Days of Week (Optional).</span> Select preferred days, or skip to allow any day.
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Label className="text-sm font-medium">Select Days</Label>
                  {data.days.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAllDays}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition",
                        isAllDays
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "text-primary bg-primary/10 hover:bg-primary/20"
                      )}
                    >
                      <ListChecks className="h-3 w-3" />
                      {isAllDays ? "Unselect all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
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
              {currentStep >= 3 && (
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
