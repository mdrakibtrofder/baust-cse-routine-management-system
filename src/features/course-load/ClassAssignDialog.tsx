import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stepper } from "@/components/Stepper";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { COURSE_TYPE_INFO, type ClassSlot, type Course, type Section, type WeekPattern } from "@/lib/types";
import { checkConflicts, findAvailableRooms, type Conflict } from "@/lib/conflicts";
import { toast } from "sonner";

interface DraftClass {
  id?: string;
  day: string;
  start: string;
  end: string;
  room_id: string | null;
  week: WeekPattern;
}

export function ClassAssignDialog({
  open, onOpenChange, course, section,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: Course;
  section: Section;
}) {
  const data = useStore();
  const cst = data.course_section_teachers.find(
    (x) => x.course_id === course.id && x.section_id === section.id,
  );
  const teacherIds = cst?.teacher_ids ?? [];
  const info = COURSE_TYPE_INFO[course.course_type];

  const existing = useMemo(
    () => data.class_slots.filter(s => s.course_id === course.id && s.section_id === section.id),
    [data.class_slots, course.id, section.id]
  );

  const [drafts, setDrafts] = useState<DraftClass[]>([]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    const initial: DraftClass[] = [];
    for (let i = 0; i < info.classCount; i++) {
      const e = existing[i];
      initial.push(e
        ? { id: e.id, day: e.day, start: e.start, end: e.end, room_id: e.room_id, week: e.week }
        : { day: "SUN", start: info.classDuration === 60 ? "08:00" : "08:00",
            end: info.classDuration === 60 ? "09:00" : "11:00",
            room_id: null, week: info.weekPattern });
    }
    setDrafts(initial);
    setStep(0);
  }, [open, course.id, section.id]);

  const current = drafts[step];
  if (!current) return null;

  // applicable periods based on course kind
  const applicablePeriods = data.periods.filter(p => p.kind === info.roomKind);

  const setCurrent = (patch: Partial<DraftClass>) => {
    setDrafts(prev => prev.map((d, i) => i === step ? { ...d, ...patch } : d));
  };

  // candidates while excluding the slot being edited
  const conflicts: Conflict[] = useMemo(() => {
    return checkConflicts({
      data, course, section, teacherIds,
      candidate: current,
      ignoreSlotId: current.id,
    });
  }, [data, course, section, teacherIds, current]);

  const availableRooms = useMemo(() => {
    return findAvailableRooms(data, course, section, current, current.id);
  }, [data, course, section, current]);

  const setPeriod = (id: string) => {
    const p = data.periods.find(x => x.id === id);
    if (p) setCurrent({ start: p.start, end: p.end });
  };

  const matchedPeriodId = applicablePeriods.find(p => p.start === current.start && p.end === current.end)?.id ?? "";

  const save = () => {
    if (teacherIds.length < info.teachersRequired) {
      toast.error(`Assign ${info.teachersRequired} teacher(s) first.`);
      return;
    }
    // Validate all
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const cs = checkConflicts({ data, course, section, teacherIds, candidate: d, ignoreSlotId: d.id });
      if (cs.length) {
        setStep(i);
        toast.error(`Class ${i+1} has unresolved conflicts.`);
        return;
      }
      if (!d.room_id) { setStep(i); toast.error(`Class ${i+1}: pick a room.`); return; }
    }
    // Replace existing slots
    data.deleteClassSlotsForCourseSection(course.id, section.id);
    for (const d of drafts) {
      data.upsertClassSlot({
        course_id: course.id, section_id: section.id,
        day: d.day, start: d.start, end: d.end,
        room_id: d.room_id, week: d.week,
      });
    }
    toast.success("Schedule saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{course.code} — {course.name}</span>
            <Badge variant="outline">Section {section.name}</Badge>
            <Badge>{info.label}</Badge>
          </DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            {info.classCount} class{info.classCount > 1 ? "es" : ""} per week · {info.classDuration} min · {info.teachersRequired} teacher(s)
          </div>
        </DialogHeader>

        {info.classCount > 1 && (
          <div className="px-2 py-3 border-y" style={{ background: "var(--gradient-soft)" }}>
            <Stepper
              steps={Array.from({ length: info.classCount }, (_, i) => `Class ${i + 1}`)}
              current={step}
            />
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Day</Label>
              <Select value={current.day} onValueChange={(v) => setCurrent({ day: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {data.days.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time slot</Label>
              <Select value={matchedPeriodId} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue placeholder="Pick a period" /></SelectTrigger>
                <SelectContent>
                  {applicablePeriods.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.start}–{p.end} ({p.duration}m)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {info.weekPattern !== "EVERY" && (
            <div>
              <Label>Week pattern</Label>
              <Select value={current.week} onValueChange={(v: WeekPattern) => setCurrent({ week: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EVEN">Even weeks</SelectItem>
                  <SelectItem value="ODD">Odd weeks</SelectItem>
                  <SelectItem value="EVERY">Every week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Room</Label>
              <span className="text-xs text-muted-foreground">{availableRooms.length} available</span>
            </div>
            <Select value={current.room_id ?? ""} onValueChange={(v) => setCurrent({ room_id: v })}>
              <SelectTrigger><SelectValue placeholder="Pick a room" /></SelectTrigger>
              <SelectContent>
                {data.rooms
                  .filter(r => r.room_type === (info.roomKind === "sessional" ? "Sessional" : "Theory"))
                  .map(r => {
                    const ok = availableRooms.some(ar => ar.id === r.id);
                    const capOk = r.capacity >= section.total_students;
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono">{r.name}</span>
                          <span className="text-xs text-muted-foreground">cap {r.capacity}</span>
                          {!capOk && <Badge variant="destructive" className="text-[10px]">small</Badge>}
                          {!ok && capOk && <Badge variant="outline" className="text-[10px] border-warning text-warning">busy</Badge>}
                          {ok && capOk && <Check className="h-3 w-3 text-success" />}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" /> {conflicts.length} conflict{conflicts.length>1?"s":""} detected
              </div>
              <ul className="text-xs text-destructive space-y-1">
                {conflicts.map((c, i) => <li key={i}>• {c.message}</li>)}
              </ul>
              {availableRooms.length > 0 && (
                <div className="pt-2 border-t border-destructive/20">
                  <div className="text-xs font-medium mb-1.5">Suggested available rooms:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableRooms.slice(0, 8).map(r => (
                      <button key={r.id} onClick={() => setCurrent({ room_id: r.id })}
                        className="text-xs font-mono px-2 py-1 rounded bg-card border hover:border-primary">
                        {r.name} <span className="text-muted-foreground">({r.capacity})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {existing.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => {
                if (confirm("Clear all classes for this section?")) {
                  data.deleteClassSlotsForCourseSection(course.id, section.id);
                  toast.success("Cleared");
                  onOpenChange(false);
                }
              }}>
                <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Clear
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {info.classCount > 1 && (
              <>
                <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(s => s-1)}>
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                {step < info.classCount - 1 ? (
                  <Button size="sm" onClick={() => setStep(s => s+1)}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="sm" onClick={save}
                    style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                    Save Schedule
                  </Button>
                )}
              </>
            )}
            {info.classCount === 1 && (
              <Button size="sm" onClick={save}
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                Save Schedule
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
