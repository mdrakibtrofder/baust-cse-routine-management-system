import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface NonDepartmentalToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  className?: string;
  /** Override the wording so the same control can gate CTs, teachers, rooms, … */
  label?: string;
  hint?: string;
  title?: string;
}

/** Switch controlling whether non-departmental class tests appear. It governs the
 *  on-screen list *and* the downloads produced from that same filtered list, so
 *  turning it off removes those CTs from exported schedules too. */
export function NonDepartmentalToggle({
  checked,
  onChange,
  className,
  label = "Show non-departmental CTs",
  hint = "(view & download)",
  title = "Applies to the view and to downloaded schedules",
}: NonDepartmentalToggleProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted/50",
        className
      )}
      title={title}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
      {hint && <span className="text-[10px] font-semibold text-muted-foreground">{hint}</span>}
    </label>
  );
}
