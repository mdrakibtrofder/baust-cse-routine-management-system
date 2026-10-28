import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Download, DoorOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTAssignment } from "@/lib/types";
import { toast } from "sonner";
import { exportSameDayRoomCTPdf } from "@/lib/ct-export";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { filterCTsByDepartmental, sameDayRoomCTGroups } from "@/lib/ct-schedule-utils";
import { NonDepartmentalToggle } from "@/components/NonDepartmentalToggle";

/** Rooms that carry more than one class test on the same date — the double
 *  bookings a room's normal schedule hides between unrelated cohorts. */
export function CTSameDayRoomPage() {
  const store = useStore();
  const { active_semester_id, rooms, departments } = store;
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNonDepartmental, setShowNonDepartmental] = useState(false);

  const loadData = useCallback(async () => {
    if (!active_semester_id) return;
    setLoading(true);
    try {
      setAssignments(await api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`));
    } catch {
      toast.error("Failed to load CT assignments");
    } finally {
      setLoading(false);
    }
  }, [active_semester_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Everything below — including the download — works off this filtered list. */
  const visible = useMemo(
    () => filterCTsByDepartmental(assignments, showNonDepartmental),
    [assignments, showNonDepartmental],
  );

  const groups = useMemo(
    () => sameDayRoomCTGroups(visible, rooms, departments),
    [visible, rooms, departments],
  );

  /** The helper already orders rooms then dates, so grouping by room keeps both. */
  const roomBlocks = useMemo(() => {
    const map = new Map<string, { room: (typeof groups)[number]["room"]; dept: string; days: typeof groups }>();
    for (const group of groups) {
      let block = map.get(group.room.id);
      if (!block) {
        block = { room: group.room, dept: group.dept, days: [] };
        map.set(group.room.id, block);
      }
      block.days.push(group);
    }
    return Array.from(map.values());
  }, [groups]);

  const ctCount = groups.reduce((sum, g) => sum + g.rows.length, 0);

  if (loading && assignments.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Same-Day CT · Same Room"
        subtitle="Days a single room hosts more than one class test"
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-black text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Same-Day Room Bookings
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length} clash day(s) across {roomBlocks.length} room(s) — {ctCount} class tests
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NonDepartmentalToggle checked={showNonDepartmental} onChange={setShowNonDepartmental} />
            <Button
              variant="outline"
              size="sm"
              disabled={groups.length === 0}
              onClick={() => exportSameDayRoomCTPdf(store, visible)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Same-Day Room Schedule
            </Button>
          </div>
        </div>

        {roomBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/10 py-24 text-muted-foreground">
            <p className="text-lg font-medium">No room holds two class tests on the same day.</p>
          </div>
        ) : (
          roomBlocks.map(({ room, dept, days }) => (
            <div key={room.id} className="overflow-hidden rounded-2xl border-2 bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
                <DoorOpen className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-black text-primary">{room.name}</h4>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                    dept === HOME_DEPT_SHORT_NAME
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {dept}
                </span>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {room.room_type} · capacity {room.capacity}
                </span>
                <span className="ml-auto rounded-full bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-600">
                  {days.length} clash day{days.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="divide-y">
                {days.map((day) => (
                  <div key={day.date}>
                    <div className="flex flex-wrap items-center gap-2 bg-amber-500/5 px-4 py-2">
                      <span className="text-sm font-black text-amber-600">
                        {format(parseISO(day.date), "dd MMM yyyy")}
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {format(parseISO(day.date), "EEEE")}
                      </span>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-600">
                        {day.rows.length} CTs same day
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-2 border-primary/20 bg-primary/5">
                            <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">Week</TableHead>
                            <TableHead className="text-xs font-black uppercase tracking-wider text-primary">Course</TableHead>
                            <TableHead className="w-[110px] text-xs font-black uppercase tracking-wider text-primary">Level-Term</TableHead>
                            <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">CT No.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {day.rows.map((a, idx) => (
                            <TableRow key={a.id} className={cn("border-b", idx % 2 === 1 && "bg-muted/30")}>
                              <TableCell className="text-sm font-bold text-primary">Week {a.week_number}</TableCell>
                              <TableCell className="text-sm">
                                <span className="font-mono font-black">{a.course?.code}</span>
                                <span className="text-muted-foreground"> — {a.course?.name}</span>
                              </TableCell>
                              <TableCell className="text-sm font-bold">
                                {a.course?.level}-{a.course?.term}
                              </TableCell>
                              <TableCell className="text-sm font-black text-primary">CT {a.ct_number}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
