import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoutineView, type RoutineScope } from "@/components/RoutineView";

export function RoutineDialog({
  open,
  onOpenChange,
  scope,
  title,
  subtitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: RoutineScope | null;
  title: string;
  subtitle?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </DialogHeader>
        {scope && <RoutineView scope={scope} />}
      </DialogContent>
    </Dialog>
  );
}
