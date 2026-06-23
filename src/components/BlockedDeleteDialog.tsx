import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { Dependency } from "@/lib/conflicts";

/** Modal shown when a delete is blocked because the entity is referenced
 * by class_slots or assignments. Lists the dependencies and tells the user
 * what to remove first. */
export function BlockedDeleteDialog({
  open,
  onOpenChange,
  title,
  entityLabel,
  dependencies,
  hint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  entityLabel: string;
  dependencies: Dependency[];
  hint?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cannot delete {title}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{entityLabel}</span> is still used by{" "}
            <span className="font-semibold text-destructive">{dependencies.length}</span>{" "}
            item{dependencies.length === 1 ? "" : "s"}. Remove the dependencies first, then try again.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/30 max-h-72 overflow-auto divide-y">
          {dependencies.slice(0, 200).map((d, i) => (
            <div key={i} className="px-3 py-1.5 text-xs flex items-start gap-2">
              <span className="text-[10px] uppercase text-muted-foreground mt-0.5 shrink-0">
                {d.kind === "class_slot" ? "Class"
                  : d.kind === "assignment" ? "Assign"
                  : d.kind === "course" ? "Course"
                  : d.kind === "section" ? "Section"
                  : "Room"}
              </span>
              <span>{d.description}</span>
            </div>
          ))}
          {dependencies.length > 200 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              … and {dependencies.length - 200} more
            </div>
          )}
        </div>

        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
