import { useState } from "react";
import { useStore } from "@/lib/store";
import { fmtRange12 } from "@/lib/utils";
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
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [day, setDay] = useState("SUN");
  const [days, setDays] = useState<string[]>(["SUN"]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [reason, setReason] = useState("");

  const reset = () => {
    setDay("SUN");
    setDays(["SUN"]);
    setStart("09:00");
    setEnd("11:00");
    setReason("");
  };

  const add = () => {
    if (!entityId) return;
    if (start >= end) {
      toast.error("Start time must be before end time");
      return;
    }
    if (mode === "teacher") {
      data.addTeacherUnavailability({ teacher_id: entityId, day, start, end, reason: reason.trim() || undefined });
    } else {
      if (days.length === 0) {
        toast.error("Pick at least one day");
        return;
      }
      data.addRoomUnavailability({ room_id: entityId, days, start, end, reason: reason.trim() || undefined });
    }
    toast.success("Unavailability added");
    reset();
  };

  const remove = (id: string) => {
    if (mode === "teacher") data.deleteTeacherUnavailability(id);
    else data.deleteRoomUnavailability(id);
    toast.success("Removed");
  };

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            {list.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No unavailability rules yet.
              </div>
            )}
            {list.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="space-y-0.5">
                  <div className="font-mono font-semibold">
                    {mode === "teacher"
                      ? (u as any).day
                      : ((u as any).days as string[]).join(", ")}{" "}
                    · {fmtRange12(u.start, u.end)}
                  </div>
                  {u.reason && (
                    <div className="text-muted-foreground italic">{u.reason}</div>
                  )}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(u.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase text-muted-foreground">Add new</div>
            {mode === "teacher" ? (
              <div>
                <Label className="text-xs">Day</Label>
                <Select value={day} onValueChange={setDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.days.map((d) => (
                      <SelectItem key={d.id} value={d.name}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Days</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {data.days.map((d) => {
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
                        {d.name}
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
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                placeholder="e.g. Office hours, Maintenance"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button onClick={add} size="sm" className="w-full"
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add window
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
