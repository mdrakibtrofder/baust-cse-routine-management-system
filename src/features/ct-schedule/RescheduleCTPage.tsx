import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { toast } from "sonner";
import { format, parseISO, isValid } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Wand2,
} from "lucide-react";
import type {
  CTRescheduleApplyResult,
  CTRescheduleGroup,
  CTReschedulePlan,
  CTRescheduleRestoreResult,
  CTRescheduleShift,
} from "@/lib/types";

/** The level-terms in each group, as the schedule splits them. */
const GROUP_LEVEL_TERMS: Record<CTRescheduleGroup, string[]> = {
  1: ["1-I", "1-II", "3-II", "4-II"],
  2: ["2-I", "2-II", "3-I", "4-I"],
};

const DAY_LABELS: Record<string, string> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

function dayCode(dateStr: string): string {
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, "EEE").toUpperCase() : "";
}

function fmtDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, "dd MMM yyyy") : dateStr;
}

export function RescheduleCTPage() {
  const { active_semester_id, rooms } = useStore();
  const confirm = useConfirm();

  const [plan, setPlan] = useState<CTReschedulePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      const res = await api.get<CTReschedulePlan>(`/ct-schedule/reschedule/${active_semester_id}`);
      setPlan(res);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build the reschedule plan");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const roomNames = useCallback(
    (ids: string[]) =>
      rooms
        .filter((r) => ids.includes(r.id))
        .map((r) => r.name)
        .join(", ") || "—",
    [rooms],
  );

  const shifts = plan?.shifts ?? [];

  const counts = useMemo(
    () => ({
      moved: shifts.filter((s) => s.status === "moved").length,
      unchanged: shifts.filter((s) => s.status === "unchanged").length,
      unplaced: shifts.filter((s) => s.status === "unplaced").length,
    }),
    [shifts],
  );

  /** Shifts grouped by group then level-term, in the order the server sends them
   *  (group, level, term, course code, CT number). */
  const groupedShifts = useMemo(() => {
    const map = new Map<
      string,
      { group: CTRescheduleGroup; level: number; term: string; rows: CTRescheduleShift[] }
    >();
    for (const s of shifts) {
      const key = `${s.group}|${s.level}|${s.term}`;
      const entry = map.get(key) ?? { group: s.group, level: s.level, term: s.term, rows: [] };
      entry.rows.push(s);
      map.set(key, entry);
    }
    return [...map.values()];
  }, [shifts]);

  /** The overflow ("Extra") class tests — those the level-term's own days could
   *  not hold, so they take the extra day of a week the group already sits. */
  const extraShifts = useMemo(() => shifts.filter((s) => s.extra), [shifts]);

  /** Week number → the two groups' sitting days (and extra days), for the
   *  reference grid. */
  const weekGrid = useMemo(() => {
    const map = new Map<
      number,
      Partial<Record<CTRescheduleGroup, { days: string[]; extra_days: string[] }>>
    >();
    for (const slot of plan?.week_slots ?? []) {
      const entry = map.get(slot.week) ?? {};
      entry[slot.group] = { days: slot.days, extra_days: slot.extra_days };
      map.set(slot.week, entry);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [plan]);

  const handleApply = async () => {
    if (!active_semester_id || !plan) return;
    const ok = await confirm({
      title: "Apply the rescheduled CT routine?",
      description:
        `Every CSE class test from week ${plan.from_week} onwards moves into weeks ` +
        `${plan.first_week}–${plan.last_week} following the group day pattern. ` +
        "You can apply again at any time — the layout is rebuilt from the original schedule — " +
        "or restore the original schedule.",
      confirmLabel: "Apply Reschedule",
    });
    if (!ok) return;

    setApplying(true);
    try {
      const res = await api.post<CTRescheduleApplyResult>(
        `/ct-schedule/reschedule/apply/${active_semester_id}`,
        {},
      );
      setPlan(res.plan);
      toast.success(
        `Rescheduled ${res.applied} class test${res.applied === 1 ? "" : "s"}` +
          (res.unplaced > 0 ? ` — ${res.unplaced} could not be placed` : ""),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply the reschedule");
    } finally {
      setApplying(false);
    }
  };

  const handleRestore = async () => {
    if (!active_semester_id || !plan?.snapshot) return;
    const ok = await confirm({
      title: "Restore the original CT schedule?",
      description:
        `All ${plan.snapshot.count} class tests go back to the dates they had before the ` +
        "reschedule, and the saved snapshot is cleared.",
      confirmLabel: "Restore Original",
      destructive: true,
    });
    if (!ok) return;

    setRestoring(true);
    try {
      const res = await api.post<CTRescheduleRestoreResult>(
        `/ct-schedule/reschedule/restore/${active_semester_id}`,
        {},
      );
      toast.success(`Restored ${res.restored} class test${res.restored === 1 ? "" : "s"}`);
      await loadPlan();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore the schedule");
    } finally {
      setRestoring(false);
    }
  };

  if (loading && !plan) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Reschedule CT"
        subtitle="Re-place every CSE class test from week 10 onwards into weeks 11–14, in two alternating groups"
        rightSlot={
          <Button variant="outline" size="sm" onClick={loadPlan} className="font-bold">
            <RefreshCw className={cn("mr-1.5 h-4 w-4", loading && "animate-spin")} /> Rebuild Plan
          </Button>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {!plan ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl text-muted-foreground bg-muted/5">
            <p className="font-bold">No plan available.</p>
            <Button variant="link" onClick={loadPlan} className="mt-2 text-primary font-bold">
              Try again
            </Button>
          </div>
        ) : (
          <>
            {/* What the feature does + the two actions */}
            <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5 p-5 shadow-lg">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1 text-sm">
                  <p className="font-bold text-foreground">
                    Weeks {plan.first_week}–{plan.last_week} · one class test per level-term per day
                  </p>
                  <p className="text-muted-foreground">
                    Only CSE departmental level-terms are moved, and only their class tests sitting in
                    week {plan.from_week} or later — week {plan.from_week} never actually runs, so those
                    tests are re-placed too. Each course keeps at least a 2-week gap between its class
                    tests, and a level-term never sits two on the same day. When a level-term has more
                    class tests than its own days can hold, the overflow takes its extra day (the
                    Thursday of a week it already sits) and is listed separately as an{" "}
                    <span className="font-bold text-foreground">Extra CT</span>. The generated layout can
                    be applied again and again; it is always rebuilt from the original schedule, which is
                    restored in one click.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleApply}
                  disabled={applying || restoring || shifts.length === 0}
                  className="font-black bg-gradient-to-r from-primary to-primary/80"
                >
                  {applying ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  {plan.snapshot ? "Re-apply Reschedule" : "Apply Reschedule"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRestore}
                  disabled={applying || restoring || !plan.snapshot}
                  title={
                    plan.snapshot
                      ? "Put every moved CT back on its original date"
                      : "Apply once first — there is nothing to restore yet"
                  }
                  className="font-bold border-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  {restoring ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Restore Original
                </Button>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-bold">
                    {counts.moved} to move
                  </Badge>
                  {counts.unchanged > 0 && (
                    <Badge variant="outline" className="font-bold text-muted-foreground">
                      {counts.unchanged} already in place
                    </Badge>
                  )}
                  {counts.unplaced > 0 && (
                    <Badge variant="outline" className="font-bold border-destructive/50 text-destructive">
                      {counts.unplaced} unplaced
                    </Badge>
                  )}
                  {extraShifts.length > 0 && (
                    <Badge
                      variant="outline"
                      className="font-bold border-amber-500/50 text-amber-700 dark:text-amber-400"
                    >
                      {extraShifts.length} extra CT{extraShifts.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-bold",
                      plan.snapshot ? "border-success/50 text-success" : "text-muted-foreground",
                    )}
                  >
                    {plan.snapshot
                      ? `Snapshot saved · ${plan.snapshot.count} CTs`
                      : "No snapshot yet"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Group definitions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {([1, 2] as CTRescheduleGroup[]).map((group) => (
                <div
                  key={group}
                  className={cn(
                    "rounded-2xl border-2 p-5 space-y-3",
                    group === 1
                      ? "border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5"
                      : "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg font-black text-sm text-white",
                        group === 1 ? "bg-blue-600" : "bg-amber-600",
                      )}
                    >
                      {group}
                    </span>
                    <span className="font-black">Group {group}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GROUP_LEVEL_TERMS[group].map((lt) => (
                      <Badge key={lt} variant="outline" className="bg-background font-bold">
                        Level {lt}
                      </Badge>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {weekGrid.map(([week, byGroup]) => {
                      const days = byGroup[group]?.days ?? [];
                      const extraDays = byGroup[group]?.extra_days ?? [];
                      return (
                        <div key={week} className="flex items-center gap-2 text-xs">
                          <span className="w-16 shrink-0 font-black text-muted-foreground">
                            Week {week}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {days.map((d) => (
                              <span
                                key={d}
                                className="rounded-full bg-background px-2 py-0.5 font-bold shadow-sm"
                              >
                                {DAY_LABELS[d] ?? d}
                              </span>
                            ))}
                            {extraDays.map((d) => (
                              <span
                                key={d}
                                className="rounded-full border border-dashed border-amber-500/60 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700 dark:text-amber-400"
                                title="Extra day — where a level-term's overflow class tests go"
                              >
                                {DAY_LABELS[d] ?? d} *
                              </span>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Extra CTs — the overflow a level-term's own days could not hold */}
            {extraShifts.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-700 dark:text-amber-400">
                  <CalendarPlus className="h-4 w-4" />
                  {extraShifts.length} Extra CT{extraShifts.length === 1 ? "" : "s"}
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  These level-terms have more class tests than their own days in weeks{" "}
                  {plan.first_week}–{plan.last_week} can hold, so the overflow sits on the level-term's
                  extra day (marked <span className="font-bold">Thursday *</span> above). That week the
                  level-term sits two class tests, on two different days — one of them here.
                </p>
                <div className="divide-y divide-amber-500/20">
                  {extraShifts.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs"
                    >
                      <Badge variant="outline" className="bg-background font-black">
                        Level {s.level}-{s.term}
                      </Badge>
                      <span className="font-mono font-bold">
                        {s.course_code} (CT{s.ct_number})
                      </span>
                      <span className="font-bold">
                        {fmtDate(s.new_date)}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          Week {s.new_week} · {DAY_LABELS[dayCode(s.new_date)] ?? dayCode(s.new_date)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {roomNames(s.room_ids)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Same-day clashes in the current schedule, per level-term */}
            {plan.conflicts.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-700 dark:text-amber-400">
                  <CalendarX2 className="h-4 w-4" />
                  {plan.conflicts.length} same-day conflict
                  {plan.conflicts.length === 1 ? "" : "s"} in the current schedule
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  A level-term sits its class tests as one cohort, so two courses can never share a
                  date. These are the clashes found now — applying the reschedule separates them.
                </p>
                <div className="divide-y divide-amber-500/20">
                  {plan.conflicts.map((c, i) => (
                    <div
                      key={`${c.level}-${c.term}-${c.date}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs"
                    >
                      <Badge variant="outline" className="bg-background font-black">
                        Level {c.level}-{c.term}
                      </Badge>
                      <span className="font-bold">
                        {fmtDate(c.date)}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          Week {c.week} · {dayCode(c.date)}
                        </span>
                      </span>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        {c.courses.map((x) => `${x.course_code} (CT${x.ct_number})`).join("  ·  ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Room clashes between two level-terms the window could not avoid */}
            {plan.overlaps.length > 0 && (
              <div className="rounded-2xl border-2 border-orange-500/40 bg-orange-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 font-black text-orange-700 dark:text-orange-400">
                  <MapPin className="h-4 w-4" />
                  {plan.overlaps.length} shared-room slot
                  {plan.overlaps.length === 1 ? "" : "s"} in the generated routine
                </div>
                <p className="text-xs font-semibold text-muted-foreground">
                  Two level-terms sit in the same room on these dates because weeks {plan.first_week}–
                  {plan.last_week} had no clash-free date left. A shared room is preferable to a class
                  test outside the window; move one of them by hand if the room has to be free.
                </p>
                <div className="divide-y divide-orange-500/20">
                  {plan.overlaps.map((o, i) => (
                    <div
                      key={`${o.date}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs"
                    >
                      <span className="font-bold">
                        {fmtDate(o.date)}
                        <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                          Week {o.week} · {dayCode(o.date)}
                        </span>
                      </span>
                      <span className="font-mono font-bold text-orange-700 dark:text-orange-400">
                        {o.entries
                          .map((e) => `L${e.level}-${e.term} ${e.course_code} (CT${e.ct_number})`)
                          .join("  ·  ")}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {roomNames(o.room_ids)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {plan.warnings.length > 0 && (
              <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4 space-y-1.5">
                <div className="flex items-center gap-2 font-black text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Could not place everything
                </div>
                {plan.warnings.map((w, i) => (
                  <p key={i} className="text-xs font-semibold text-destructive/90">
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {/* The generated layout */}
            {groupedShifts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-2xl text-muted-foreground bg-muted/5">
                <p className="font-bold">No class tests to reschedule.</p>
                <p className="text-sm mt-1">
                  Generate the CT schedule first, then come back to re-place its weeks{" "}
                  {plan.first_week}–{plan.last_week}.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedShifts.map((bucket) => (
                  <div
                    key={`${bucket.group}-${bucket.level}-${bucket.term}`}
                    className="rounded-2xl border-2 overflow-hidden shadow-md"
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 px-4 py-3 border-b",
                        bucket.group === 1 ? "bg-blue-500/10" : "bg-amber-500/10",
                      )}
                    >
                      <Badge
                        className={cn(
                          "font-black text-white",
                          bucket.group === 1 ? "bg-blue-600" : "bg-amber-600",
                        )}
                      >
                        Group {bucket.group}
                      </Badge>
                      <span className="font-black">
                        Level {bucket.level}-{bucket.term}
                      </span>
                      <span className="ml-auto text-xs font-bold text-muted-foreground">
                        {bucket.rows.length} class test{bucket.rows.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-black">Course</TableHead>
                          <TableHead className="w-16 font-black">CT</TableHead>
                          <TableHead className="font-black">Current</TableHead>
                          <TableHead className="w-10" />
                          <TableHead className="font-black">Rescheduled</TableHead>
                          <TableHead className="font-black">Rooms</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bucket.rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="font-bold text-sm">{row.course_code}</div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                {row.course_name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-black">
                                {row.ct_number}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-muted-foreground">
                              {fmtDate(row.old_date)}
                              <div className="text-[10px]">
                                Week {row.old_week} · {dayCode(row.old_date)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <ArrowRight className="h-4 w-4 text-primary" />
                            </TableCell>
                            <TableCell className="text-xs font-bold">
                              {row.status === "unplaced" ? (
                                <TooltipProvider delayDuration={150}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 text-destructive">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Left unchanged
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[280px]">
                                      <span>{row.note ?? "No free slot in the window."}</span>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <>
                                  {fmtDate(row.new_date)}
                                  <div
                                    className={cn(
                                      "text-[10px]",
                                      row.status === "moved" ? "text-success" : "text-muted-foreground",
                                    )}
                                  >
                                    Week {row.new_week} · {dayCode(row.new_date)}
                                    {row.status === "moved" ? (
                                      <CheckCircle2 className="ml-1 inline h-3 w-3" />
                                    ) : null}
                                  </div>
                                  {row.extra && (
                                    <Badge
                                      variant="outline"
                                      className="mt-1 border-amber-500/50 bg-amber-500/10 px-1.5 py-0 text-[9px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400"
                                      title="Overflow class test — placed on the level-term's extra day"
                                    >
                                      Extra
                                    </Badge>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                                <MapPin className="h-3 w-3 text-primary" />
                                {roomNames(row.room_ids)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
