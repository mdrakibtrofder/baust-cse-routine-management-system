import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepInfo {
  label: string;
  /** optional issue marker (red dot) */
  hasIssue?: boolean;
}

export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: (string | StepInfo)[];
  current: number;
  onSelect?: (index: number) => void;
}) {
  const items: StepInfo[] = steps.map((s) => (typeof s === "string" ? { label: s } : s));
  return (
    <div className="flex items-center w-full">
      {items.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = !!onSelect;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(i)}
                className={cn(
                  "relative h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  clickable && "cursor-pointer hover:scale-105",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
                style={
                  done || active
                    ? { background: done ? "var(--gradient-primary)" : undefined, borderColor: "var(--primary)" }
                    : undefined
                }
                aria-label={`Go to ${s.label}`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
                {s.hasIssue && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                    <AlertCircle className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onSelect?.(i)}
                className={cn(
                  "text-[11px] mt-1.5 font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                  clickable && "cursor-pointer hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            </div>
            {i < items.length - 1 && (
              <div
                className={cn("flex-1 h-0.5 mx-2", done ? "bg-primary" : "bg-border")}
                style={done ? { background: "var(--gradient-primary)" } : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
