import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight, AlertTriangle, Repeat2, CheckCircle2, X, ShieldAlert,
  CalendarIcon, MapPin, Search, Layers, BookOpen,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";
import api from "@/lib/api";
import type { CTAssignment, Course } from "@/lib/types";
import { ctRoomNames } from "@/lib/ct-schedule-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What the user clicked "swap" on.
 *
 *  `all`    — the course card header: every CT of this course trades places with
 *             the same-numbered CT of another course.
 *  `single` — one CT tile: that sitting alone trades places with the *same* CT
 *             number of another course (CT1 with CT1, CT2 with CT2). */
export type SwapCTSource =
  | { mode: "all"; courseId: string; cts: CTAssignment[] }
  | { mode: "single"; assignment: CTAssignment };

/** One candidate the user can swap with — a whole course in `all` mode, a single
 *  sitting in `single` mode. Both carry the CTs shown on the card. */
type Candidate = {
  key: string;
  course: Course | undefined;
  cts: CTAssignment[];
  /** Set for `single` mode: the one sitting that would actually move. */
  assignment?: CTAssignment;
};

type SwapPreviewSide = {
  id: string;
  course_id: string;
  course_code: string | null;
  date: string;
  week_number: number;
  room_ids: string[];
};

type SwapPreview = {
  pairs: { ct_number: number; a: SwapPreviewSide; b: SwapPreviewSide }[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtDateShort = (value: string) => {
  const d = parseISO(value.split("T")[0]);
  return isValid(d) ? format(d, "dd MMM") : value;
};

/** Two courses can only trade CTs when the cohort taking them is the same — the
 *  level-term bucket is what owns the CT weekday and room mapping, so a swap
 *  across buckets would land a test on a day its cohort does not test on. */
function sameBucket(a?: Course, b?: Course) {
  if (!a || !b) return false;
  return (
    a.level === b.level &&
    a.term === b.term &&
    a.departmental_type === b.departmental_type &&
    (a.department_id ?? null) === (b.department_id ?? null)
  );
}

function bucketLabel(course?: Course) {
  if (!course) return "";
  return `Level ${course.level} Term ${course.term}`;
}

// ---------------------------------------------------------------------------
// CT card — one course with its whole CT series
// ---------------------------------------------------------------------------

function CTCard({
  course,
  cts,
  highlight = false,
  compact = false,
  onClick,
  /** Only this CT number is emphasised; the rest are dimmed context. */
  focusCTNumber,
}: {
  course?: Course;
  cts: CTAssignment[];
  highlight?: boolean;
  compact?: boolean;
  onClick?: () => void;
  focusCTNumber?: number;
}) {
  const { rooms, departments } = useStore();
  const deptShort =
    course?.departmental_type === "Non-Departmental"
      ? "Non-Dept"
      : (departments.find((d) => d.id === course?.department_id)?.short_name ?? "CSE");

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
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={cn("flex items-center gap-1.5 font-bold font-mono", compact ? "text-sm" : "text-base")}>
          <BookOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className={highlight ? "text-violet-800" : "text-foreground"}>{course?.code}</span>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold">
            L{course?.level} T{course?.term}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">{deptShort}</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-bold">
            {course?.credit} cr
          </span>
        </div>
      </div>

      <div className={cn("text-muted-foreground leading-tight mb-2 truncate", compact ? "text-[10px]" : "text-xs")}>
        {course?.name}
      </div>

      <div className="space-y-1 border-t border-dashed pt-1.5">
        {cts.map((ct) => {
          const dimmed = focusCTNumber !== undefined && ct.ct_number !== focusCTNumber;
          return (
            <div
              key={ct.id}
              className={cn("flex items-center gap-1.5 text-[10px] font-mono", dimmed ? "opacity-40" : "opacity-100")}
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 font-black",
                  dimmed ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
                )}
              >
                CT{ct.ct_number}
              </span>
              <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-foreground font-semibold">{fmtDateShort(ct.date)}</span>
              <span className="text-muted-foreground">· Wk {ct.week_number}</span>
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
              <span className="text-muted-foreground truncate max-w-28">{ctRoomNames(ct, rooms)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before / after column on the confirmation step
// ---------------------------------------------------------------------------

function SwapSideDetail({
  label,
  accent,
  course,
  moves,
}: {
  label: string;
  accent: "violet" | "indigo";
  course?: Course;
  moves: { ct_number: number; from: { date: string; week_number: number }; to: { date: string; week_number: number } }[];
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        accent === "violet"
          ? "border-violet-300 bg-gradient-to-br from-violet-50 to-violet-100/50"
          : "border-indigo-300 bg-gradient-to-br from-indigo-50 to-indigo-100/50",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
          accent === "violet" ? "text-violet-700" : "text-indigo-700",
        )}
      >
        <div className={cn("h-2 w-2 rounded-full", accent === "violet" ? "bg-violet-500" : "bg-indigo-500")} />
        {label}
      </div>

      <div>
        <div className="text-xs font-bold font-mono text-foreground">{course?.code}</div>
        <div className="text-[10px] text-muted-foreground leading-tight">{course?.name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {bucketLabel(course)} · {course?.credit} credit
        </div>
      </div>

      <div className="space-y-1.5 border-t border-dashed pt-2">
        {moves.map((m) => (
          <div key={m.ct_number} className="text-[10px] space-y-0.5">
            <div className="font-black text-primary">CT {m.ct_number}</div>
            <div className="flex items-center gap-1.5 flex-wrap font-mono">
              <span className="line-through text-rose-500 font-bold">
                {fmtDateShort(m.from.date)} (wk {m.from.week_number})
              </span>
              <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-emerald-600 font-bold">
                {fmtDateShort(m.to.date)} (wk {m.to.week_number})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Warning step
// ---------------------------------------------------------------------------

function SwapWarningModal({
  warnings,
  onClose,
  onProceed,
}: {
  warnings: string[];
  onClose: () => void;
  onProceed: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }}>
        <div
          className="px-6 pt-6 pb-4 shrink-0"
          style={{ background: "linear-gradient(135deg, oklch(0.48 0.20 15), oklch(0.42 0.22 0))" }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-lg">
              <ShieldAlert className="h-5 w-5 text-yellow-300" />
              Schedule Warnings
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/70 text-sm mt-1">
            This swap would leave the CT schedule in a state the generator would not produce. Review before proceeding.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5" />
            {warnings.length} issue{warnings.length !== 1 ? "s" : ""} found
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed text-rose-800">{w}</p>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 pt-4 border-t shrink-0 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose} size="sm">
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button
            onClick={onProceed}
            size="sm"
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            <ShieldAlert className="h-3.5 w-3.5 mr-1" />
            Proceed Anyway (Force)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function SwapCTModal({
  source,
  assignments,
  onClose,
  onSwapped,
}: {
  source: SwapCTSource;
  /** Every CT assignment loaded for the active semester — the candidate pool. */
  assignments: CTAssignment[];
  onClose: () => void;
  /** Called after a successful swap so the page can reload its assignments. */
  onSwapped: () => void;
}) {
  const { courses, active_semester_id } = useStore();
  const [step, setStep] = useState<"pick" | "warn" | "confirm">("pick");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const isAll = source.mode === "all";
  const sourceCourseId = source.mode === "all" ? source.courseId : source.assignment.course_id;
  const sourceCTNumber = source.mode === "all" ? undefined : source.assignment.ct_number;
  const sourceAssignmentId = source.mode === "all" ? undefined : source.assignment.id;

  const sourceCourse = useMemo(() => courses.find((c) => c.id === sourceCourseId), [courses, sourceCourseId]);

  /** Every CT of the source course, in CT order — shown as context even in
   *  `single` mode so the user can see where the moved sitting sits in the series. */
  const sourceCTs = useMemo(
    () => assignments.filter((a) => a.course_id === sourceCourseId).sort((a, b) => a.ct_number - b.ct_number),
    [assignments, sourceCourseId],
  );

  /** Candidates, grouped by course.
   *
   *  `all`    — courses in the same level-term with equal credit and the exact
   *             same set of CT numbers, so every sitting has a partner.
   *  `single` — courses in the same level-term that have a CT with the same
   *             number as the one being moved. Credit may differ here: a 2-credit
   *             and a 3-credit course both have a CT1, and trading only CT1 leaves
   *             the rest of both series untouched. */
  const candidates = useMemo<Candidate[]>(() => {
    const byCourse = new Map<string, CTAssignment[]>();
    for (const a of assignments) {
      if (a.course_id === sourceCourseId) continue;
      if (!byCourse.has(a.course_id)) byCourse.set(a.course_id, []);
      byCourse.get(a.course_id)!.push(a);
    }

    const sourceNumbers = sourceCTs
      .map((c) => c.ct_number)
      .sort((m, n) => m - n)
      .join(",");

    const out: Candidate[] = [];
    for (const [courseId, cts] of byCourse.entries()) {
      const course = courses.find((c) => c.id === courseId) ?? cts[0]?.course;
      if (!sameBucket(sourceCourse, course)) continue;
      cts.sort((a, b) => a.ct_number - b.ct_number);

      if (isAll) {
        if (Number(course?.credit) !== Number(sourceCourse?.credit)) continue;
        const numbers = cts
          .map((c) => c.ct_number)
          .sort((m, n) => m - n)
          .join(",");
        if (numbers !== sourceNumbers) continue;
        out.push({ key: courseId, course, cts });
      } else {
        const match = cts.find((c) => c.ct_number === sourceCTNumber);
        if (!match) continue;
        out.push({ key: match.id, course, cts, assignment: match });
      }
    }

    return out.sort((a, b) => (a.course?.code ?? "").localeCompare(b.course?.code ?? ""));
  }, [assignments, sourceCourseId, sourceCTs, courses, sourceCourse, isAll, sourceCTNumber]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.course?.code.toLowerCase().includes(q) || c.course?.name.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  /** Request body shared by the preview and the swap itself. */
  const payloadFor = (target: Candidate, force: boolean) =>
    isAll
      ? { mode: "all", course_a_id: sourceCourseId, course_b_id: target.course?.id, force }
      : {
          mode: "single",
          assignment_a_id: sourceAssignmentId,
          assignment_b_id: target.assignment?.id,
          force,
        };

  /** Ask the server what the swap would do before committing to it. Warnings step
   *  in front of the confirmation; a hard rejection (wrong CT number, different
   *  credit, different level-term) surfaces as an error and keeps the picker open. */
  const handleSelect = async (target: Candidate) => {
    if (!active_semester_id) return;
    setChecking(target.key);
    try {
      const res = await api.post<SwapPreview>(
        `/ct-schedule/swap-preview/${active_semester_id}`,
        payloadFor(target, false),
      );
      setSelected(target);
      setPreview(res);
      setStep(res.warnings.length > 0 ? "warn" : "confirm");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cannot swap with this course");
    } finally {
      setChecking(null);
    }
  };

  const handleConfirm = async () => {
    if (!selected || !active_semester_id) return;
    setLoading(true);
    try {
      const forced = (preview?.warnings.length ?? 0) > 0;
      await api.post(`/ct-schedule/swap/${active_semester_id}`, payloadFor(selected, forced));
      toast.success(
        isAll
          ? `Swapped all CTs: ${sourceCourse?.code} ↔ ${selected.course?.code}`
          : `Swapped CT${sourceCTNumber}: ${sourceCourse?.code} ↔ ${selected.course?.code}`,
      );
      onSwapped();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? `Swap failed: ${err.message}` : "Swap failed");
    } finally {
      setLoading(false);
    }
  };

  /** Turns the server's pair list into per-side "was → becomes" rows. */
  const moves = useMemo(() => {
    if (!preview) return { a: [], b: [] };
    return {
      a: preview.pairs.map((p) => ({
        ct_number: p.ct_number,
        from: { date: p.a.date, week_number: p.a.week_number },
        to: { date: p.b.date, week_number: p.b.week_number },
      })),
      b: preview.pairs.map((p) => ({
        ct_number: p.ct_number,
        from: { date: p.b.date, week_number: p.b.week_number },
        to: { date: p.a.date, week_number: p.a.week_number },
      })),
    };
  }, [preview]);

  const title = isAll ? "Swap All CTs" : `Swap CT ${sourceCTNumber}`;
  const subtitle = isAll
    ? "Every CT of this course trades its date, week and rooms with the same-numbered CT of the course you pick."
    : `Only CT ${sourceCTNumber} moves — it can only trade places with CT ${sourceCTNumber} of another course.`;

  return (
    <>
      {/* ---- Step: pick a course ---- */}
      {step === "pick" && (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
            <div
              className="px-6 pt-6 pb-4 shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white text-lg">
                  <Repeat2 className="h-5 w-5" />
                  {title}
                </DialogTitle>
              </DialogHeader>
              <p className="text-white/70 text-sm mt-1">{subtitle}</p>
            </div>

            <div className="flex flex-1 min-h-0 divide-x divide-border overflow-hidden">
              {/* LEFT — the source */}
              <div className="w-80 shrink-0 p-5 flex flex-col gap-3 overflow-y-auto bg-gradient-to-b from-violet-50/60 to-indigo-50/30">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-violet-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
                    {isAll ? "Selected Course" : "Selected CT"}
                  </span>
                </div>

                <CTCard course={sourceCourse} cts={sourceCTs} highlight focusCTNumber={sourceCTNumber} />

                <div className="rounded-lg bg-white border border-violet-200 p-3 space-y-1.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-violet-600">Swap rules</div>
                  <ul className="text-[10px] text-muted-foreground space-y-1 list-disc pl-3.5">
                    <li>Same level-term only — {bucketLabel(sourceCourse)}.</li>
                    {isAll ? (
                      <li>Same credit only — {sourceCourse?.credit} credit courses.</li>
                    ) : (
                      <li>
                        CT {sourceCTNumber} can only swap with CT {sourceCTNumber}.
                      </li>
                    )}
                    <li>Dates, week numbers and rooms are exchanged; courses stay put.</li>
                  </ul>
                </div>
              </div>

              {/* RIGHT — candidates */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2 shrink-0">
                  <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 shrink-0">
                    Eligible courses
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {bucketLabel(sourceCourse)}
                    {isAll && ` · ${sourceCourse?.credit} credit`}
                  </span>
                </div>

                <div className="px-4 py-2 border-b bg-card shrink-0">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by course code or title..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 pl-8 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {searched.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-52 text-center">
                      <div
                        className="h-16 w-16 rounded-full flex items-center justify-center mb-4"
                        style={{ background: "linear-gradient(135deg, oklch(0.93 0.04 290), oklch(0.90 0.05 260))" }}
                      >
                        <Repeat2 className="h-7 w-7 text-violet-400" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground">No eligible course found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1 max-w-56">
                        {query.trim()
                          ? "Try adjusting your search keywords"
                          : isAll
                            ? `No other ${sourceCourse?.credit}-credit course in ${bucketLabel(sourceCourse)} has a matching CT series.`
                            : `No other course in ${bucketLabel(sourceCourse)} has a CT ${sourceCTNumber}.`}
                      </p>
                    </div>
                  ) : (
                    searched.map((c) => (
                      <div key={c.key} className="relative group">
                        <CTCard
                          course={c.course}
                          cts={c.cts}
                          compact
                          focusCTNumber={sourceCTNumber}
                          onClick={() => !checking && handleSelect(c)}
                        />
                        <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                          <div className="bg-violet-600/90 text-white text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm">
                            {checking === c.key ? (
                              <>
                                <span className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                Checking…
                              </>
                            ) : (
                              <>
                                <ArrowLeftRight className="h-3 w-3" />
                                Click to swap
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ---- Step: warnings ---- */}
      {step === "warn" && preview && (
        <SwapWarningModal
          warnings={preview.warnings}
          onClose={() => {
            setStep("pick");
            setSelected(null);
            setPreview(null);
          }}
          onProceed={() => setStep("confirm")}
        />
      )}

      {/* ---- Step: confirm ---- */}
      {step === "confirm" && selected && preview && (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <div
              className="px-6 pt-6 pb-4"
              style={{ background: "linear-gradient(135deg, oklch(0.50 0.18 290), oklch(0.42 0.20 260))" }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <AlertTriangle className="h-5 w-5 text-yellow-300" />
                  Confirm {isAll ? "Full CT Swap" : `CT ${sourceCTNumber} Swap`}
                </DialogTitle>
              </DialogHeader>
              <p className="text-white/70 text-sm mt-1">
                {preview.pairs.length} sitting{preview.pairs.length !== 1 ? "s" : ""} on each side will exchange date,
                week and rooms.
              </p>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4">
              <SwapSideDetail label="Your selection" accent="violet" course={sourceCourse} moves={moves.a} />
              <SwapSideDetail label="Target course" accent="indigo" course={selected.course} moves={moves.b} />
            </div>

            <div className="px-6 pb-6 space-y-4">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">
                  {preview.warnings.length > 0
                    ? "You are forcing a swap that raised warnings. Both courses will be updated immediately."
                    : "Both courses will be updated immediately. Rooms travel with the dates, so no new room clash is introduced."}
                </p>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("pick");
                    setSelected(null);
                    setPreview(null);
                  }}
                  disabled={loading}
                  size="sm"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Back
                </Button>
                <Button
                  onClick={handleConfirm}
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
      )}
    </>
  );
}
