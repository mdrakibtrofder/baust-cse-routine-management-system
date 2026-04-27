import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center w-full">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground"
                )}
                style={done || active ? { background: done ? "var(--gradient-primary)" : undefined, borderColor: "var(--primary)" } : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className={cn("text-[11px] mt-1.5 font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                {s}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-0.5 mx-2", done ? "bg-primary" : "bg-border")}
                style={done ? { background: "var(--gradient-primary)" } : undefined} />
            )}
          </div>
        );
      })}
    </div>
  );
}
