import { useState } from "react";
import { useStore } from "@/lib/store";
import { cn, compareDayNames, compareTimeValues, sortDays, fmtDayTitle, fmtRange12 } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Clock, Pencil } from "lucide-react";
import { toast } from "sonner";

type Mode = "teacher" | "room";

export function UnavailabilityDialog({
  open,
  onOpenChange,
  mode,
  entityId,
  entityLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  entityId: string | null;
  entityLabel: string;
}) {
  const data = useStore();
  const list =
    mode === "teacher"
      ? data.teacher_unavailability.filter((u) => u.teacher_id === entityId)
      : data.room_unavailability.filter((u) => u.room_id === entityId);
  const orderedDays = sortDays(data.days);
  const sortedList = [...list].sort((a, b) => {
    const dayA = mode === "teacher" ? (a as any).day : ((a as any).days?.[0] ?? "");
    const dayB = mode === "teacher" ? (b as any).day : ((b as any).days?.[0] ?? "");
    return compareDayNames(dayA, dayB) || compareTimeValues(a.start, b.start);
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [day, setDay] = useState("SUN");
  const [days, setDays] = useState<string[]>(["SUN"]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [reason, setReason] = useState("");

  const reset = () => {
    setEditingId(null);
    setDay("SUN");
    setDays(["SUN"]);
    setStart("09:00");
    setEnd("11:00");
    setReason("");
  };

  const isDuplicate = () => {
    return list.some(u => {
      if (editingId && u.id === editingId) return false;
      if (mode === "teacher") {
        return (u as any).day === day && u.start === start && u.end === end;
      } else {
        return JSON.stringify((u as any).days) === JSON.stringify(days) && u.start === start && u.end === end;
      }
    });
  };

  const add = async () => {
    if (!entityId) return;
    if (start >= end) {
      toast.error("Start time must be before end time");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (isDuplicate()) {
      toast.error("Unavailability for this time already exists");
      return;
    }

    if (mode === "teacher") {
      if (editingId) {
        await data.updateTeacherUnavailability(editingId, { day, start, end, reason: reason.trim() });
      } else {
        await data.addTeacherUnavailability({ teacher_id: entityId, day, start, end, reason: reason.trim() });
      }
    } else {
      if (days.length === 0) {
        toast.error("Pick at least one day");
        return;
      }
      if (editingId) {
        await data.updateRoomUnavailability(editingId, { days, start, end, reason: reason.trim() });
      } else {
        await data.addRoomUnavailability({ room_id: entityId, days, start, end, reason: reason.trim() });
      }
    }
    toast.success(editingId ? "Unavailability updated" : "Unavailability added");
    reset();
    data.init();
  };

  const startEdit = (u: any) => {
    setEditingId(u.id);
    setStart(u.start);
    setEnd(u.end);
    setReason(u.reason || "");
    if (mode === "teacher") {
      setDay(u.day);
    } else {
      setDays(u.days);
    }
  };

  const remove = async (id: string) => {
    if (mode === "teacher") await data.deleteTeacherUnavailability(id);
    else await data.deleteRoomUnavailability(id);
    toast.success("Removed");
    data.init();
  };

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if(!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />
            Unavailability — {entityLabel}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Recurring weekly windows when this {mode} is not available for class assignment.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border max-h-[30vh] overflow-y-auto divide-y">
            {sortedList.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No unavailability rules yet.
              </div>
            )}
            {sortedList.map((u) => (
              <div key={u.id} className={cn("flex items-center justify-between px-3 py-2 text-xs", editingId === u.id && "bg-primary/5")}>
                <div className="space-y-0.5">
                  <div className="font-mono font-semibold">
                    {mode === "teacher"
                      ? fmtDayTitle((u as any).day)
                      : [...((u as any).days as string[])]
                          .sort(compareDayNames)
                          .map(fmtDayTitle)
                          .join(", ")}{" "}
                    · {fmtRange12(u.start, u.end)}
                  </div>
                  {u.reason && (
                    <div className="text-muted-foreground italic">{u.reason}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(u)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(u.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">
              {editingId ? "Edit unavailability" : "Add new"}
            </div>
            {mode === "teacher" ? (
              <div>
                <Label className="text-xs">Day</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orderedDays.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {fmtDayTitle(d.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Days</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {orderedDays.map((d) => {
                    const active = days.includes(d.name);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDay(d.name)}
                        className={cn(
                          "px-2.5 py-1 text-[11px] font-semibold rounded-md border transition",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card hover:bg-muted border-border text-muted-foreground",
                        )}
                      >
                        {fmtDayTitle(d.name)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Office hours, Maintenance"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              {editingId && (
                <Button variant="outline" size="sm" className="flex-1" onClick={reset}>
                  Cancel
                </Button>
              )}
              <Button onClick={add} size="sm" className="flex-1"
                style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
                {editingId ? "Save changes" : <><Plus className="h-3.5 w-3.5 mr-1" /> Add window</>}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
