import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ShieldAlert } from "lucide-react";
import type { Dependency } from "@/lib/conflicts";
import type { Teacher } from "@/lib/types";

/** Shown when the user tries to delete a teacher who has assignments.
 * Lets them migrate every assignment to another teacher. The old teacher
 * record is intentionally KEPT (project rule). */
export function TeacherMoveDialog({
  open,
  onOpenChange,
  fromTeacher,
  dependencies,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromTeacher: Teacher | null;
  dependencies: Dependency[];
  onMoved?: () => void;
}) {
  const teachers = useStore((s) => s.teachers);
  const move = useStore((s) => s.moveTeacherAssignments);
  const [toId, setToId] = useState<string>("");

  if (!fromTeacher) return null;
  const candidates = teachers.filter((t) => t.id !== fromTeacher.id);

  const submit = () => {
    if (!toId) return;
    move(fromTeacher.id, toId);
    onOpenChange(false);
    onMoved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Move classes from {fromTeacher.short_name}?
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{fromTeacher.name}</span> currently teaches{" "}
            <span className="font-semibold">{dependencies.length}</span> course-section
            {dependencies.length === 1 ? "" : "s"}. Pick a teacher to take over. The original
            teacher record will be kept (you can archive them later).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 max-h-52 overflow-auto divide-y text-xs">
          {dependencies.map((d, i) => (
            <div key={i} className="px-3 py-1.5">{d.description}</div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono font-semibold text-sm bg-muted px-2 py-1.5 rounded">
            {fromTeacher.short_name}
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <Label className="text-xs">Move to teacher</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Select replacement teacher…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="font-mono mr-2">{t.short_name}</span>
                    <span className="text-muted-foreground">{t.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!toId}>Move classes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
