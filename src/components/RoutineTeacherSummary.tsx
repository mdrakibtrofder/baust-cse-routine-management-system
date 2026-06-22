import { useStore } from "@/lib/store";
import { Users } from "lucide-react";
import { buildRoutineTeacherSummary } from "@/lib/routine-summary";
import type { RoutineScope } from "@/components/RoutineView";

/** Small Teacher Details table shown beneath the Course Summary on every routine view. */
export function RoutineTeacherSummary({ scope }: { scope: RoutineScope }) {
  const data = useStore();
  const rows = buildRoutineTeacherSummary(data, scope);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden mt-4">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Teacher Details</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} teacher{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Short Form</th>
              <th className="text-left px-3 py-2 font-semibold">Teachers Name</th>
              <th className="text-left px-3 py-2 font-semibold">Designation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teacher.id} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-mono font-semibold text-primary">{r.teacher.short_name}</td>
                <td className="px-3 py-2">{r.teacher.name}</td>
                <td className="px-3 py-2 text-foreground/80">
                  {r.teacher.designation}{r.teacher.department ? `, ${r.teacher.department}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
