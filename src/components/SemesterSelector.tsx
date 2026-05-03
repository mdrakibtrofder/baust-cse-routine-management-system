import { useStore } from "@/lib/store";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarRange } from "lucide-react";

export function SemesterSelector({ compact = false }: { compact?: boolean }) {
  const semesters = useStore((s) => s.semesters);
  const active = useStore((s) => s.active_semester_id);
  const setActive = useStore((s) => s.setActiveSemester);

  // group by year for cleaner dropdown
  const byYear = new Map<number, typeof semesters>();
  for (const s of semesters) {
    const yearVal = s.year_ref?.value || 0;
    if (!byYear.has(yearVal)) byYear.set(yearVal, []);
    byYear.get(yearVal)!.push(s);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a); // descending order for years

  return (
    <div className={compact ? "flex items-center gap-1.5" : "space-y-1"}>
      {!compact && (
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          <CalendarRange className="h-3 w-3" /> Active Semester
        </div>
      )}
      <Select value={active} onValueChange={setActive}>
        <SelectTrigger className={compact ? "h-8 w-[170px] text-xs" : "h-9 w-full"}>
          {compact && <CalendarRange className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[60vh]">
          {years.map((y) => (
            <SelectGroup key={y}>
              <SelectLabel className="text-[10px] uppercase">{y}</SelectLabel>
              {byYear.get(y)!.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
