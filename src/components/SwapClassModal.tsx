import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { cn, fmtRange12 } from "@/lib/utils";
import { checkConflicts, type Conflict } from "@/lib/conflicts";
import { filterScopeSlots } from "@/lib/routine-scope";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ClassCard, ConflictIcon, conflictSeverity, conflictTypeLabel, DAY_FULL,
} from "@/components/SwapRoomModal";
import {
  ArrowLeftRight, AlertTriangle, CheckCircle2, X, Search, Repeat2, ShieldAlert, Lock, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import type { ClassSlot } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";

/** One problem to show the user before swapping — either a real scheduling
 *  conflict from `checkConflicts`, or a swap-specific rule (week pattern,
 *  locked class). */
interface Issue {
  severity: "error" | "warning";
  label: string;
  message: string;
  side: "A" | "B" | "both";
  type?: Conflict["type"];
}

const weekLabel = (w: string) => (w === "EVERY" ? "every week" : `${w.toLowerCase()} weeks`);

function TimeSwapLine({ from, to }: { from: ClassSlot; to: ClassSlot }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="line-through text-rose-500 font-semibold">
        {DAY_FULL[from.day] ?? from.day} · {fmtRange12(from.start, from.end)}
      </span>
      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-emerald-600 font-bold">
        {DAY_FULL[to.day] ?? to.day} · {fmtRange12(to.start, to.end)}
      </span>
    </div>
  );
}

/**
 * Swap two classes of ONE section's routine.
 *
 * Each class keeps its course, teachers, room and week pattern and only trades
 * WHEN it meets, so the two routine cells exchange places whole. Candidates are
 * restricted to the same kind (theory ↔ theory, sessional ↔ sessional) so a lab
 * never lands in a theory period, and a week-pattern mismatch (the ODD/EVEN
 * alternation used by 0.75-credit sessionals) is surfaced as a warning.
 */
export function SwapClassModal({
  slot,
  sectionId,
  onClose,
}: {
  slot: ClassSlot;
  sectionId: string;
  onClose: () => void;
}) {
  const data = useStore();
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [target, setTarget] = useState<ClassSlot | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const section = data.sections.find((s) => s.id === sectionId) ?? null;
  const sourceCourse = data.courses.find((c) => c.id === slot.course_id);
  const sourceKind = sourceCourse ? COURSE_TYPE_INFO[sourceCourse.course_type].roomKind : "theory";

  /** Everything on this section's routine that could trade places with `slot`. */
  const candidates = useMemo(() => {
    return filterScopeSlots(data, { kind: "section", section_id: sectionId })
      .filter((s) => s.id !== slot.id)
      // Lab-group meetings are shared with other sections — moving one would move
      // it for everybody, so they are not swappable from a section routine.
      .filter((s) => !s.lab_section_id)
      .filter((s) => {
        const c = data.courses.find((x) => x.id === s.course_id);
        if (!c) return false;
        return COURSE_TYPE_INFO[c.course_type].roomKind === sourceKind;
      })
      .filter((s) => !(s.day === slot.day && s.start === slot.start && s.end === slot.end))
      .sort((a, b) => {
        const days = Object.keys(DAY_FULL);
        const d = days.indexOf(a.day) - days.indexOf(b.day);
        return d !== 0 ? d : a.start.localeCompare(b.start);
      });
  }, [data, sectionId, slot, sourceKind]);

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return candidates;
    return candidates.filter((cs) => {
      const c = data.courses.find((x) => x.id === cs.course_id);
      const room = data.rooms.find((r) => r.id === cs.room_id);
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === cs.course_id &&
          x.section_id === cs.section_id,
      );
      const teachers = (cst?.teacher_ids ?? []).map((tid) => data.teachers.find((t) => t.id === tid));
      return (
        c?.code.toLowerCase().includes(s) ||
        c?.name.toLowerCase().includes(s) ||
        room?.name.toLowerCase().includes(s) ||
        (DAY_FULL[cs.day] ?? cs.day).toLowerCase().includes(s) ||
        teachers.some((t) => t?.short_name.toLowerCase().includes(s) || t?.name.toLowerCase().includes(s))
      );
    });
  }, [candidates, q, data]);

  /** Conflicts each class would hit at the OTHER class's day/time. Both slots are
   *  ignored, because they move together — what is left is a real problem. */
  const evaluate = (a: ClassSlot, b: ClassSlot): Issue[] => {
    const found: Issue[] = [];

    const forSide = (moving: ClassSlot, destination: ClassSlot, side: "A" | "B") => {
      const course = data.courses.find((c) => c.id === moving.course_id);
      const sec = data.sections.find((s) => s.id === moving.section_id);
      if (!course || !sec) return;
      const cst = data.course_section_teachers.find(
        (x) =>
          x.semester_id === data.active_semester_id &&
          x.course_id === moving.course_id &&
          x.section_id === moving.section_id,
      );
      const conflicts = checkConflicts({
        data,
        course,
        section: sec,
        teacherIds: cst?.teacher_ids ?? [],
        candidate: {
          day: destination.day,
          start: destination.start,
          end: destination.end,
          room_id: moving.room_id,
          week: moving.week,
        },
        ignoreSlotIds: [a.id, b.id],
      });
      for (const c of conflicts) {
        found.push({
          severity: conflictSeverity(c.type),
          label: conflictTypeLabel(c.type),
          message: c.message,
          side,
          type: c.type,
        });
      }
    };

    forSide(a, b, "A");
    forSide(b, a, "B");

    // Week pattern (ODD/EVEN alternation of 0.75-credit sessionals)
    if (a.week !== b.week) {
      found.push({
        severity: "warning",
        label: "Week Pattern Differs",
        message: `This class runs ${weekLabel(a.week)} and the target runs ${weekLabel(b.week)}. Each keeps its own pattern after the swap, so the periods will alternate differently.`,
        side: "both",
      });
    }

    for (const [s, side] of [[a, "A"], [b, "B"]] as const) {
      if (s.locked) {
        found.push({
          severity: "warning",
          label: "Locked Class",
          message: `${data.courses.find((c) => c.id === s.course_id)?.code ?? "This class"} is locked — swapping moves it anyway.`,
          side,
        });
      }
    }

    return found;
  };

  const pick = (t: ClassSlot) => {
    setTarget(t);
    setIssues(evaluate(slot, t));
    setStep("review");
  };

  const hasErrors = issues.some((i) => i.severity === "error");

  const doSwap = async (force: boolean) => {
    if (!target) return;
    setLoading(true);
    try {
      await data.swapClassSlots(slot.id, target.id, force);
      toast.success(
        `Swapped: ${DAY_FULL[slot.day] ?? slot.day} ${fmtRange12(slot.start, slot.end)} ↔ ${DAY_FULL[target.day] ?? target.day} ${fmtRange12(target.start, target.end)}`,
      );
      onClose();
    } catch (err: any) {
      const detail = err?.message ?? "Unknown error";
      toast.error(force ? `Swap failed: ${detail}` : `Swap rejected: ${detail}. You can still force it.`);
      if (!force) {
        setIssues((prev) =>
          prev.some((i) => i.label === "Server Rejected")
            ? prev
            : [...prev, { severity: "error", label: "Server Rejected", message: detail, side: "both" }],
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
        <div
          className="px-6 pt-6 pb-4 shrink-0"
          style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              <Repeat2 className="h-5 w-5" />
              Swap Classes
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-sm mt-1">
            {step === "pick"
              ? `Pick another ${sourceKind === "sessional" ? "sessional" : "theory"} class of ${section ? `Section ${section.name}` : "this section"} — the two cells trade places with their course, teacher and room.`
              : "Review what changes, then confirm."}
          </p>
        </div>

        {step === "pick" && (
          <div className="flex flex-1 min-h-0 divide-x divide-border overflow-hidden">
            {/* Selected class */}
            <div className="w-72 shrink-0 p-5 flex flex-col gap-3 overflow-y-auto bg-gradient-to-b from-violet-50/60 to-indigo-50/30">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-violet-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                  Selected Class
                </span>
              </div>
              <ClassCard slot={slot} highlight />
              <div className="rounded-lg bg-white border border-violet-200 p-3 text-[11px] space-y-1">
                <div className="font-bold uppercase tracking-wider text-[9px] text-violet-600">Runs</div>
                <div className="font-semibold">{weekLabel(slot.week)}</div>
                {slot.locked && (
                  <div className="flex items-center gap-1 text-amber-700 font-semibold">
                    <Lock className="h-3 w-3" /> Locked
                  </div>
                )}
              </div>
            </div>

            {/* Candidates */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  {sourceKind === "sessional" ? "Sessional" : "Theory"} classes of this section
                </span>
                <span className="text-[10px] text-muted-foreground ml-auto">{searched.length} available</span>
              </div>
              <div className="px-4 py-2 border-b bg-card shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by course, teacher, room or day…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 pl-8 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {searched.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center">
                    <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4 bg-violet-100">
                      <Repeat2 className="h-7 w-7 text-violet-400" />
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">Nothing to swap with</p>
                    <p className="text-xs text-muted-foreground/60 mt-1 max-w-56">
                      {q.trim()
                        ? "No class matches your search."
                        : `This section has no other ${sourceKind === "sessional" ? "sessional" : "theory"} class at a different time.`}
                    </p>
                  </div>
                ) : (
                  searched.map((s) => {
                    const weekMismatch = s.week !== slot.week;
                    return (
                      <div key={s.id} className="relative group">
                        {weekMismatch && (
                          <div className="absolute -top-1.5 left-2 z-10">
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold border border-amber-200">
                              {weekLabel(s.week)}
                            </span>
                          </div>
                        )}
                        <ClassCard slot={s} compact onClick={() => pick(s)} />
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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
        )}

        {step === "review" && target && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 uppercase tracking-wide">
                    <div className="h-2 w-2 rounded-full bg-violet-500" /> Your selection
                  </div>
                  <ClassCard slot={slot} highlight />
                  <TimeSwapLine from={slot} to={target} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" /> Target class
                  </div>
                  <ClassCard slot={target} />
                  <TimeSwapLine from={target} to={slot} />
                </div>
              </div>

              {issues.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="text-xs text-emerald-800">
                    <p className="font-bold">No conflicts found.</p>
                    <p>Both teachers and both rooms are free at the new times, and neither section slot clashes.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {issues.length} issue{issues.length !== 1 ? "s" : ""} found
                  </div>
                  {issues.map((i, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border p-4 flex gap-3",
                        i.severity === "error" ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200",
                      )}
                    >
                      {i.type ? (
                        <ConflictIcon type={i.type} />
                      ) : (
                        <CalendarDays className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                            i.severity === "error" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700",
                          )}>
                            {i.label}
                          </span>
                          <span className={cn(
                            "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border",
                            i.side === "A"
                              ? "border-violet-300 text-violet-700 bg-violet-50"
                              : i.side === "B"
                                ? "border-indigo-300 text-indigo-700 bg-indigo-50"
                                : "border-border text-muted-foreground",
                          )}>
                            {i.side === "both" ? "Both" : `Class ${i.side}`}
                          </span>
                        </div>
                        <p className={cn(
                          "text-xs leading-relaxed",
                          i.severity === "error" ? "text-rose-800" : "text-amber-800",
                        )}>
                          {i.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 pt-4 border-t shrink-0 flex gap-3 justify-end">
              <Button variant="outline" size="sm" disabled={loading}
                onClick={() => { setStep("pick"); setTarget(null); setIssues([]); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              {issues.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  onClick={() => doSwap(true)}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  Swap anyway
                </Button>
              )}
              <Button
                size="sm"
                disabled={loading || hasErrors}
                onClick={() => doSwap(false)}
                className="text-white font-semibold"
                style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
                title={hasErrors ? "Conflicts must be forced" : undefined}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Swapping…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Swap
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
