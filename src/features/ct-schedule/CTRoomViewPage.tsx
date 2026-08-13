import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { Download, DoorOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { CTAssignment } from "@/lib/types";
import { toast } from "sonner";
import { exportRoomWiseCTPdf } from "@/lib/ct-export";
import { roomDeptShort, sortHomeDeptFirst } from "@/lib/room-dept";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";
import { filterCTsByDepartmental } from "@/lib/ct-schedule-utils";
import { NonDepartmentalToggle } from "@/components/NonDepartmentalToggle";

/** CT schedule grouped by room. Home-department (CSE) rooms are listed first,
 *  then every other department grouped alphabetically. */
export function CTRoomViewPage() {
  const store = useStore();
  const { active_semester_id, rooms, departments } = store;
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNonDepartmental, setShowNonDepartmental] = useState(true);

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

  const groups = useMemo(() => {
    // A sitting occupies its level-term's whole room mapping, so it appears under
    // each of those rooms.
    const byRoom = new Map<string, CTAssignment[]>();
    for (const a of visible) {
      for (const roomId of a.room_ids ?? []) {
        if (!byRoom.has(roomId)) byRoom.set(roomId, []);
        byRoom.get(roomId)!.push(a);
      }
    }

    const used = rooms.filter((r) => byRoom.has(r.id));
    return sortHomeDeptFirst(used, (r) => roomDeptShort(r, departments)).map((room) => ({
      room,
      dept: roomDeptShort(room, departments),
      rows: byRoom
        .get(room.id)!
        .slice()
        .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.ct_number - b.ct_number)),
    }));
  }, [visible, rooms, departments]);

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
        title="Room-wise CT Schedule"
        subtitle={`Class tests grouped by room — ${HOME_DEPT_SHORT_NAME} rooms first`}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 p-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-black text-primary">
              <DoorOpen className="h-5 w-5" /> Room View
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {groups.length} room(s) in use across {visible.length} class tests
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NonDepartmentalToggle checked={showNonDepartmental} onChange={setShowNonDepartmental} />
            <Button
              variant="outline"
              size="sm"
              disabled={visible.length === 0}
              onClick={() => exportRoomWiseCTPdf(store, visible)}
              className="font-bold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Room-wise Schedule
            </Button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/10 py-24 text-muted-foreground">
            <p className="text-lg font-medium">No CT schedule generated yet.</p>
          </div>
        ) : (
          groups.map(({ room, dept, rows }) => (
            <div key={room.id} className="overflow-hidden rounded-2xl border-2 bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
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
                <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  {rows.length} CTs
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-2 border-primary/20 bg-primary/5">
                      <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">Week</TableHead>
                      <TableHead className="w-[150px] text-xs font-black uppercase tracking-wider text-primary">Date &amp; Day</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-wider text-primary">Course</TableHead>
                      <TableHead className="w-[110px] text-xs font-black uppercase tracking-wider text-primary">Level-Term</TableHead>
                      <TableHead className="w-[90px] text-xs font-black uppercase tracking-wider text-primary">CT No.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a, idx) => (
                      <TableRow key={a.id} className={cn("border-b", idx % 2 === 1 && "bg-muted/30")}>
                        <TableCell className="text-sm font-bold text-primary">Week {a.week_number}</TableCell>
                        <TableCell className="text-sm font-semibold">
                          <div className="flex flex-col">
                            <span>{format(parseISO(a.date.split("T")[0]), "dd MMM yyyy")}</span>
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {format(parseISO(a.date.split("T")[0]), "EEEE")}
                            </span>
                          </div>
                        </TableCell>
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
          ))
        )}
      </div>
    </div>
  );
}
