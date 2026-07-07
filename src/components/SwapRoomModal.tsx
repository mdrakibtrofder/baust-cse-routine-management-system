import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn, fmtRange12, fmtDayTitle } from "@/lib/utils";
import { timesOverlap, checkConflicts, type Conflict } from "@/lib/conflicts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BookOpen, FlaskConical, MapPin, ArrowLeftRight, AlertTriangle,
  Repeat2, CheckCircle2, X, Eye, EyeOff, ShieldAlert, Clock,
  User, GraduationCap, CalendarDays, Building2, AlertCircle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import type { ClassSlot } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_FULL: Record<string, string> = {
  SUN: "Sunday", MON: "Monday", TUE: "Tuesday",
  WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday",
};

function useSectionLabel() {
  const data = useStore();
  return (sectionId: string | null) => {
    if (!sectionId) return "";
    const s = data.sections.find((x) => x.id === sectionId);
    if (!s) return "";
    const dept = s.department_id
      ? (data.departments.find((d) => d.id === s.department_id)?.short_name ?? "CSE")
      : "CSE";
    return `${dept} Level ${s.level} Term ${s.term} Section ${s.name}`;
  };
}

// ---------------------------------------------------------------------------
// ClassCard
// ---------------------------------------------------------------------------

function ClassCard({
  slot,
  highlight = false,
  compact = false,
  onClick,
}: {
  slot: ClassSlot;
  highlight?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const data = useStore();
  const getSectionLabel = useSectionLabel();

  const course = data.courses.find((c) => c.id === slot.course_id);
  const room = data.rooms.find((r) => r.id === slot.room_id);
  const section = data.sections.find((s) => s.id === slot.section_id);

  const cst = data.course_section_teachers.find(
    (x) =>
      x.semester_id === data.active_semester_id &&
      x.course_id === slot.course_id &&
      x.section_id === slot.section_id,
  );
  const teachers = (cst?.teacher_ids ?? [])
    .map((tid) => data.teachers.find((t) => t.id === tid))
    .filter(Boolean) as { short_name: string; name: string }[];

  const labSection = slot.lab_section_id
    ? data.course_lab_sections.find((g) => g.id === slot.lab_section_id)
    : null;
  const labTeachers = labSection
    ? (labSection.teacher_ids
        .map((tid) => data.teachers.find((t) => t.id === tid))
        .filter(Boolean) as { short_name: string; name: string }[])
    : [];

  const effectiveTeachers = labSection ? labTeachers : teachers;

  if (!course) return null;
  const info = COURSE_TYPE_INFO[course.course_type];
  const isSessional = info.roomKind === "sessional";

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border transition-all duration-200 select-none",
        compact ? "p-3" : "p-4",
        highlight
          ? "border-violet-400 bg-gradient-to-br from-violet-50 to-indigo-50 shadow-lg shadow-violet-100/60"
          : "border-border bg-card hover:border-violet-300 hover:shadow-md",
        onClick && "cursor-pointer active:scale-[0.99]",
      )}
    >
      {/* Course code + teachers */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={cn("flex items-center gap-1.5 font-bold font-mono", compact ? "text-sm" : "text-base")}>
          {isSessional ? (
            <FlaskConical className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          ) : (
            <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          )}
          <span className={highlight ? "text-violet-800" : "text-foreground"}>{course.code}</span>
          {labSection && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">
              {labSection.label}
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {effectiveTeachers.map((t) => (
            <span
              key={t.short_name}
              className="text-[9px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold"
            >
              {t.short_name}
            </span>
          ))}
        </div>
      </div>

      {/* Course name */}
      <div className={cn("text-muted-foreground leading-tight mb-2 truncate", compact ? "text-[10px]" : "text-xs")}>
        {course.name}
      </div>

      {/* Room + Section */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {room ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white font-bold text-[10px] shadow-sm">
            <MapPin className="h-2.5 w-2.5" />
            {room.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium text-[10px]">
            No room
          </span>
        )}
        {section && (
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] text-white",
            isSessional ? "bg-emerald-500" : "bg-sky-500",
          )}>
            {getSectionLabel(section.id)}
          </span>
        )}
        {labSection && labSection.section_ids.map((sid) => (
          <span key={sid} className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white font-bold text-[10px]">
            {getSectionLabel(sid)}
          </span>
        ))}
      </div>

      {/* Day + Time */}
      <div className={cn(
        "flex items-center gap-1.5 font-mono text-muted-foreground border-t border-dashed pt-1.5",
        compact ? "text-[9px]" : "text-[10px]",
      )}>
        <span className="font-semibold text-foreground">{DAY_FULL[slot.day] ?? slot.day}</span>
        <span>·</span>
        <span>{fmtRange12(slot.start, slot.end)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConflictIcon helper
// ---------------------------------------------------------------------------
function ConflictIcon({ type }: { type: Conflict["type"] }) {
  if (type === "room_double") return <Building2 className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
  if (type === "room_capacity") return <GraduationCap className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />;
  if (type === "room_type") return <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />;
  if (type === "teacher_double") return <User className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
  if (type === "teacher_unavailable") return <CalendarDays className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  if (type === "room_unavailable") return <Clock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  if (type === "section_double") return <GraduationCap className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
  return <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />;
}

function conflictTypeLabel(type: Conflict["type"]) {
  const labels: Record<Conflict["type"], string> = {
    room_double: "Room Double-Booking",
    room_capacity: "Room Capacity Exceeded",
    room_type: "Wrong Room Type",
    teacher_double: "Teacher Double-Booking",
    section_double: "Section Double-Booking",
    teacher_credit: "Teacher Credit Overload",
    self_duplicate: "Self-Duplicate",
    teacher_unavailable: "Teacher Unavailable",
    room_unavailable: "Room Unavailable",
  };
  return labels[type] ?? type;
}

function conflictSeverity(type: Conflict["type"]): "error" | "warning" {
  if (type === "room_capacity" || type === "teacher_unavailable" || type === "room_unavailable") return "warning";
  return "error";
}

// ---------------------------------------------------------------------------
// Slot Detail Card (for conflict modal)
// ---------------------------------------------------------------------------
function SlotDetailCard({
  slot,
  newRoomId,
  label,
  accent,
}: {
  slot: ClassSlot;
  newRoomId: string | null;
  label: string;
  accent: "violet" | "indigo";
}) {
  const data = useStore();
  const course = data.courses.find((c) => c.id === slot.course_id);
  const oldRoom = data.rooms.find((r) => r.id === slot.room_id);
  const newRoom = data.rooms.find((r) => r.id === newRoomId);
  const section = data.sections.find((s) => s.id === slot.section_id);
  const cst = data.course_section_teachers.find(
    (x) => x.semester_id === data.active_semester_id &&
      x.course_id === slot.course_id && x.section_id === slot.section_id,
  );
  const teachers = (cst?.teacher_ids ?? [])
    .map((tid) => data.teachers.find((t) => t.id === tid))
    .filter(Boolean) as { short_name: string; name: string }[];

  const dept = section?.department_id
    ? (data.departments.find((d) => d.id === section.department_id)?.short_name ?? "CSE")
    : "CSE";

  const accentColor = accent === "violet" ? "violet" : "indigo";

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      accent === "violet"
        ? "border-violet-300 bg-gradient-to-br from-violet-50 to-violet-100/50"
        : "border-indigo-300 bg-gradient-to-br from-indigo-50 to-indigo-100/50",
    )}>
      <div className={cn(
        "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
        `text-${accentColor}-700`,
      )}>
        <div className={cn("h-2 w-2 rounded-full", `bg-${accentColor}-500`)} />
        {label}
      </div>

      {course && (
        <div className="space-y-2">
          {/* Course */}
          <div className="flex items-start gap-2">
            <BookOpen className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-bold text-foreground font-mono">{course.code}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{course.name}</div>
            </div>
          </div>

          {/* Teachers */}
          {teachers.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <div className="flex gap-1 flex-wrap">
                {teachers.map((t) => (
                  <span key={t.short_name} className="text-[10px] font-semibold">
                    <span className="font-bold text-blue-700">{t.short_name}</span>
                    <span className="text-muted-foreground ml-1">({t.name})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Section */}
          {section && (
            <div className="flex items-center gap-2">
              <GraduationCap className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground">{dept}</span>
                {" "}Level {section.level} Term {section.term} Section {section.name}
              </span>
            </div>
          )}

          {/* Day + Time */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-[10px]">
              <span className="font-semibold text-foreground">{DAY_FULL[slot.day] ?? slot.day}</span>
              <span className="text-muted-foreground"> · {fmtRange12(slot.start, slot.end)}</span>
            </span>
          </div>

          {/* Room change */}
          <div className="flex items-center gap-2 pt-1 border-t border-dashed">
            <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="line-through text-rose-500 font-bold font-mono">{oldRoom?.name ?? "—"}</span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-emerald-600 font-bold font-mono">{newRoom?.name ?? "No room"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict Detection Modal
// ---------------------------------------------------------------------------

function SwapConflictModal({
  slotA,
  slotB,
  conflictsA,
  conflictsB,
  onClose,
  onProceed,
}: {
  slotA: ClassSlot;
  slotB: ClassSlot;
  conflictsA: Conflict[];
  conflictsB: Conflict[];
  onClose: () => void;
  onProceed: () => void;
}) {
  const allConflicts = [
    ...conflictsA.map((c) => ({ ...c, side: "A" as const })),
    ...conflictsB.map((c) => ({ ...c, side: "B" as const })),
  ];
  const hasErrors = allConflicts.some((c) => conflictSeverity(c.type) === "error");

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }}>
        {/* Header */}
        <div
          className="px-6 pt-6 pb-4 shrink-0"
          style={{ background: "linear-gradient(135deg, oklch(0.48 0.20 15), oklch(0.42 0.22 0))" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              <ShieldAlert className="h-5 w-5 text-yellow-300" />
              Conflicts Detected
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-sm mt-1">
            {hasErrors
              ? "Critical conflicts were found. Review them before proceeding."
              : "Non-critical warnings were found. You may proceed with caution."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Slot detail cards */}
          <div className="grid grid-cols-2 gap-4">
            <SlotDetailCard slot={slotA} newRoomId={slotB.room_id} label="Your Selection (Class A)" accent="violet" />
            <SlotDetailCard slot={slotB} newRoomId={slotA.room_id} label="Target Class (Class B)" accent="indigo" />
          </div>

          {/* Conflict list */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5" />
              {allConflicts.length} conflict{allConflicts.length !== 1 ? "s" : ""} found
            </div>

            {allConflicts.map((c, i) => {
              const severity = conflictSeverity(c.type);
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-4 flex gap-3",
                    severity === "error"
                      ? "bg-rose-50 border-rose-200"
                      : "bg-amber-50 border-amber-200",
                  )}
                >
                  <ConflictIcon type={c.type} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                        severity === "error"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700",
                      )}>
                        {conflictTypeLabel(c.type)}
                      </span>
                      <span className={cn(
                        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border",
                        c.side === "A"
                          ? "border-violet-300 text-violet-700 bg-violet-50"
                          : "border-indigo-300 text-indigo-700 bg-indigo-50",
                      )}>
                        Class {c.side}
                      </span>
                    </div>
                    <p className={cn(
                      "text-xs leading-relaxed",
                      severity === "error" ? "text-rose-800" : "text-amber-800",
                    )}>
                      {c.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-6 pt-4 border-t shrink-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} size="sm">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          {hasErrors ? (
            <Button
              onClick={onProceed}
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              <ShieldAlert className="h-3.5 w-3.5 mr-1" />
              Proceed Anyway (Force)
            </Button>
          ) : (
            <Button
              onClick={onProceed}
              size="sm"
              className="text-white"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Proceed with Swap
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Confirm Swap Modal
// ---------------------------------------------------------------------------

function SwapConfirmModal({
  slotA,
  slotB,
  onClose,
  onConfirm,
  loading,
}: {
  slotA: ClassSlot;
  slotB: ClassSlot;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const data = useStore();
  const roomA = data.rooms.find((r) => r.id === slotA.room_id);
  const roomB = data.rooms.find((r) => r.id === slotB.room_id);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div
          className="px-6 pt-6 pb-4"
          style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-300" />
              Confirm Room Swap
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-sm mt-1">
            These two classes will have their rooms exchanged.
          </p>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 uppercase tracking-wide">
              <div className="h-2 w-2 rounded-full bg-violet-500" />
              Your selection
            </div>
            <ClassCard slot={slotA} highlight />
            <div className="flex items-center gap-2 text-xs">
              <span className="line-through text-red-500 font-mono font-bold">{roomA?.name ?? "—"}</span>
              <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-emerald-600 font-bold font-mono">{roomB?.name ?? "No room"}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wide">
              <div className="h-2 w-2 rounded-full bg-indigo-500" />
              Target class
            </div>
            <ClassCard slot={slotB} />
            <div className="flex items-center gap-2 text-xs">
              <span className="line-through text-red-500 font-mono font-bold">{roomB?.name ?? "—"}</span>
              <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-emerald-600 font-bold font-mono">{roomA?.name ?? "No room"}</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              Are you sure you want to swap these rooms? Both classes will be updated immediately.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading} size="sm">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={loading}
              size="sm"
              className="text-white font-semibold"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Swapping…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirm Swap
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main SwapRoomModal
// ---------------------------------------------------------------------------

export function SwapRoomModal({ slot, onClose }: { slot: ClassSlot; onClose: () => void }) {
  const data = useStore();
  const [showOtherDepts, setShowOtherDepts] = useState(false);
  // null = no target chosen yet
  // "conflict" step shows conflict details
  // "confirm" step shows final confirm
  const [step, setStep] = useState<"pick" | "conflict" | "confirm">("pick");
  const [selectedTarget, setSelectedTarget] = useState<ClassSlot | null>(null);
  const [conflictsA, setConflictsA] = useState<Conflict[]>([]);
  const [conflictsB, setConflictsB] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(false);

  const sourceRoom = data.rooms.find((r) => r.id === slot.room_id);

  // Home department of source slot's section
  const homeDeptId = useMemo(() => {
    const section = data.sections.find((s) => s.id === slot.section_id);
    return section?.department_id ?? null;
  }, [data.sections, slot.section_id]);

  const isOtherDept = (s: ClassSlot) => {
    const section = data.sections.find((x) => x.id === s.section_id);
    if (section?.department_id && homeDeptId && section.department_id !== homeDeptId) return true;
    if (s.lab_section_id) {
      const ls = data.course_lab_sections.find((g) => g.id === s.lab_section_id);
      if (ls) {
        const labSec = data.sections.find((x) => ls.section_ids.includes(x.id));
        if (labSec?.department_id && homeDeptId && labSec.department_id !== homeDeptId) return true;
      }
    }
    return false;
  };

  const sourceCourse = useMemo(() => {
    return data.courses.find((c) => c.id === slot.course_id);
  }, [data.courses, slot.course_id]);

  const sourceIsSessional = sourceCourse?.course_type.startsWith("sessional") ?? false;

  const candidates = useMemo(() => {
    return data.class_slots.filter((s) => {
      if (s.semester_id !== data.active_semester_id) return false;
      if (s.id === slot.id) return false;
      if (s.day !== slot.day) return false;
      if (!timesOverlap(s.start, s.end, slot.start, slot.end)) return false;

      // Filter: Match theory-to-theory and sessional-to-sessional
      const c = data.courses.find((x) => x.id === s.course_id);
      if (!c) return false;
      const isSessional = c.course_type.startsWith("sessional");
      if (sourceIsSessional !== isSessional) return false;

      return true;
    });
  }, [data.class_slots, data.active_semester_id, slot, sourceIsSessional, data.courses]);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredCandidates = showOtherDepts
    ? candidates
    : candidates.filter((s) => !isOtherDept(s));

  const searchedCandidates = useMemo(() => {
    if (!searchQuery.trim()) return filteredCandidates;

    const query = searchQuery.toLowerCase().trim();

    return filteredCandidates.filter((s) => {
      const course = data.courses.find((c) => c.id === s.course_id);
      const room = data.rooms.find((r) => r.id === s.room_id);
      const section = data.sections.find((sec) => sec.id === s.section_id);

      // Resolve teachers
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === s.course_id &&
          x.section_id === s.section_id,
      );
      const teacherList = (cst?.teacher_ids ?? [])
        .map((tid) => data.teachers.find((t) => t.id === tid))
        .filter(Boolean);

      const labSection = s.lab_section_id
        ? data.course_lab_sections.find((g) => g.id === s.lab_section_id)
        : null;
      const labTeacherList = labSection
        ? labSection.teacher_ids
            .map((tid) => data.teachers.find((t) => t.id === tid))
            .filter(Boolean)
        : [];

      const effectiveTeachers = labSection ? labTeacherList : teacherList;

      // Match course code
      if (course?.code.toLowerCase().includes(query)) return true;
      // Match course name
      if (course?.name.toLowerCase().includes(query)) return true;
      // Match room name
      if (room?.name.toLowerCase().includes(query)) return true;
      // Match teacher short name or full name
      if (effectiveTeachers.some(t => 
        t?.short_name.toLowerCase().includes(query) || 
        t?.name.toLowerCase().includes(query)
      )) return true;
      // Match section label
      if (section) {
        const sectLabel = `level ${section.level} term ${section.term} section ${section.name}`.toLowerCase();
        if (sectLabel.includes(query)) return true;
        if (`l${section.level}t${section.term} sec ${section.name}`.toLowerCase().includes(query)) return true;
      }
      if (labSection) {
        if (labSection.label.toLowerCase().includes(query)) return true;
      }

      return false;
    });
  }, [filteredCandidates, searchQuery, data, data.courses, data.rooms, data.sections, data.course_section_teachers, data.course_lab_sections, data.active_semester_id]);

  // When a candidate is selected: run conflict detection
  const handleSelectCandidate = (target: ClassSlot) => {
    setSelectedTarget(target);

    // --- Conflict check for slot A with target's room ---
    const courseA = data.courses.find((c) => c.id === slot.course_id);
    const sectionA = data.sections.find((s) => s.id === slot.section_id);
    const cstA = data.course_section_teachers.find(
      (x) => x.semester_id === data.active_semester_id &&
        x.course_id === slot.course_id && x.section_id === slot.section_id,
    );
    const cA = courseA && sectionA
      ? checkConflicts({
          data,
          course: courseA,
          section: sectionA,
          teacherIds: cstA?.teacher_ids ?? [],
          candidate: {
            day: slot.day,
            start: slot.start,
            end: slot.end,
            room_id: target.room_id, // NEW room for A
            week: slot.week,
          },
          ignoreSlotIds: [slot.id, target.id],
        })
      : [];

    // --- Conflict check for target slot B with source's room ---
    const courseB = data.courses.find((c) => c.id === target.course_id);
    const sectionB = data.sections.find((s) => s.id === target.section_id);
    const cstB = data.course_section_teachers.find(
      (x) => x.semester_id === data.active_semester_id &&
        x.course_id === target.course_id && x.section_id === target.section_id,
    );
    const cB = courseB && sectionB
      ? checkConflicts({
          data,
          course: courseB,
          section: sectionB,
          teacherIds: cstB?.teacher_ids ?? [],
          candidate: {
            day: target.day,
            start: target.start,
            end: target.end,
            room_id: slot.room_id, // NEW room for B
            week: target.week,
          },
          ignoreSlotIds: [target.id, slot.id],
        })
      : [];

    setConflictsA(cA);
    setConflictsB(cB);

    if (cA.length > 0 || cB.length > 0) {
      setStep("conflict");
    } else {
      setStep("confirm");
    }
  };

  // Perform the swap — 3-step via a temporary null room to avoid backend
  // room-double conflicts when both rooms are occupied at the same time.
  // localStorage acts as a safety buffer: if the network drops mid-swap,
  // the pending key shows which slots were being moved and their original rooms.
  const handleConfirm = async () => {
    if (!selectedTarget) return;
    setLoading(true);

    const SWAP_BUFFER_KEY = "swapRoom:pending";

    // Snapshot room IDs BEFORE any mutation
    const originalRoomA = slot.room_id;           // e.g. Room 205
    const originalRoomB = selectedTarget.room_id; // e.g. Room 306
    const roomAName = data.rooms.find((r) => r.id === originalRoomA)?.name ?? "—";
    const roomBName = data.rooms.find((r) => r.id === originalRoomB)?.name ?? "—";

    try {
      // ── Step 1: Save swap context to localStorage as a safety buffer ──────
      localStorage.setItem(
        SWAP_BUFFER_KEY,
        JSON.stringify({
          slotAId: slot.id,
          slotBId: selectedTarget.id,
          originalRoomA,
          originalRoomB,
          startedAt: new Date().toISOString(),
        }),
      );

      // ── Step 2: Free Slot A's room (set to null) ──────────────────────────
      // Room 205 is now unoccupied at this day+time slot.
      await data.upsertClassSlot({
        id: slot.id,
        semester_id: slot.semester_id,
        course_id: slot.course_id,
        section_id: slot.section_id,
        day: slot.day,
        start: slot.start,
        end: slot.end,
        room_id: null,        // ← temporarily freed
        week: slot.week,
        locked: slot.locked,
      });

      // ── Step 3: Move Slot B into Room A (now free, no conflict) ──────────
      // Room 306 is now unoccupied. Room 205 is taken by Slot B.
      await data.upsertClassSlot({
        id: selectedTarget.id,
        semester_id: selectedTarget.semester_id,
        course_id: selectedTarget.course_id,
        section_id: selectedTarget.section_id,
        day: selectedTarget.day,
        start: selectedTarget.start,
        end: selectedTarget.end,
        room_id: originalRoomA, // ← Slot B moves into Slot A's old room
        week: selectedTarget.week,
        locked: selectedTarget.locked,
      });

      // ── Step 4: Move Slot A into Room B (now free, no conflict) ──────────
      // Both rooms are now fully swapped.
      await data.upsertClassSlot({
        id: slot.id,
        semester_id: slot.semester_id,
        course_id: slot.course_id,
        section_id: slot.section_id,
        day: slot.day,
        start: slot.start,
        end: slot.end,
        room_id: originalRoomB, // ← Slot A moves into Slot B's old room
        week: slot.week,
        locked: slot.locked,
      });

      // ── Step 5: Clear the buffer (swap fully complete) ────────────────────
      localStorage.removeItem(SWAP_BUFFER_KEY);

      toast.success(`Rooms swapped: ${roomAName} ↔ ${roomBName}`);
      onClose();
    } catch (err: any) {
      // Buffer intentionally left in localStorage on failure so the in-flight
      // state is visible for debugging / manual recovery.
      toast.error(
        err.message
          ? `Swap failed: ${err.message}`
          : `Swap failed — rooms ${roomAName} & ${roomBName} may be inconsistent. Please refresh.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ---- Step: pick candidate ---- */}
      {step === "pick" && (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div
              className="px-6 pt-6 pb-4 shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white text-lg">
                  <Repeat2 className="h-5 w-5" />
                  Swap Room
                </DialogTitle>
              </DialogHeader>
              <p className="text-white/70 text-sm mt-1">
                Select a class from the list to swap rooms with your selected class.
              </p>
            </div>

            {/* Two-panel body */}
            <div className="flex flex-1 min-h-0 divide-x divide-border overflow-hidden">
              {/* LEFT — selected class */}
              <div className="w-72 shrink-0 p-5 flex flex-col gap-3 overflow-y-auto bg-gradient-to-b from-violet-50/60 to-indigo-50/30">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                    Selected Class
                  </span>
                </div>

                <ClassCard slot={slot} highlight />

                <div className="rounded-lg bg-white border border-violet-200 p-3 space-y-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600">
                    Current Room
                  </div>
                  {sourceRoom ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500 text-white font-bold text-xs shadow-sm">
                        <MapPin className="h-3 w-3" />
                        {sourceRoom.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{sourceRoom.room_type}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No room assigned</span>
                  )}
                </div>
              </div>

              {/* RIGHT — candidates */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 shrink-0">
                      Same time slot
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {DAY_FULL[slot.day] ?? slot.day} · {fmtRange12(slot.start, slot.end)}
                    </span>
                  </div>

                  <button
                    onClick={() => setShowOtherDepts((v) => !v)}
                    className={cn(
                      "shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-200",
                      showOtherDepts
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                        : "border-border text-muted-foreground hover:border-indigo-400 hover:text-indigo-600",
                    )}
                  >
                    {showOtherDepts ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    Other dept
                  </button>
                </div>

                {/* Search Bar */}
                <div className="px-4 py-2 border-b bg-card shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by course code, title, teacher, room..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 pl-8 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {searchedCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-52 text-center">
                      <div
                        className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
                        style={{ background: "linear-gradient(135deg, oklch(0.93 0.04 290), oklch(0.90 0.05 260))" }}
                      >
                        <Repeat2 className="h-7 w-7 text-violet-400" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground">No classes found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1 max-w-48">
                        {searchQuery.trim() 
                          ? "Try adjusting your search keywords" 
                          : showOtherDepts
                            ? "No other classes of this category at this time"
                            : 'Enable "Other dept" or adjust search keywords'}
                      </p>
                    </div>
                  ) : (
                    searchedCandidates.map((s) => {
                      const otherDept = isOtherDept(s);
                      return (
                        <div key={s.id} className="relative group">
                          {otherDept && (
                            <div className="absolute -top-1.5 left-2 z-10">
                              <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200">
                                Other Dept
                              </span>
                            </div>
                          )}
                          <ClassCard slot={s} compact onClick={() => handleSelectCandidate(s)} />
                          {/* Swap hint overlay on hover */}
                          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                            <div className="bg-violet-600/90 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm">
                              <ArrowLeftRight className="h-3 w-3" />
                              Click to swap
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ---- Step: conflict warning ---- */}
      {step === "conflict" && selectedTarget && (
        <SwapConflictModal
          slotA={slot}
          slotB={selectedTarget}
          conflictsA={conflictsA}
          conflictsB={conflictsB}
          onClose={() => { setStep("pick"); setSelectedTarget(null); }}
          onProceed={() => setStep("confirm")}
        />
      )}

      {/* ---- Step: confirm swap ---- */}
      {step === "confirm" && selectedTarget && (
        <SwapConfirmModal
          slotA={slot}
          slotB={selectedTarget}
          onClose={() => { setStep("pick"); setSelectedTarget(null); }}
          onConfirm={handleConfirm}
          loading={loading}
        />
      )}
    </>
  );
}
