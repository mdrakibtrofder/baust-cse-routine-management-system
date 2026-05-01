import { useStore } from "@/lib/store";
import { BookOpen, FlaskConical, CreditCard, Clock } from "lucide-react";
import { buildRoutineCourseSummary } from "@/lib/routine-summary";
import type { RoutineScope } from "@/components/RoutineView";

/** Small Course Summary table shown beneath every routine view. */
export function RoutineCourseSummary({ scope }: { scope: RoutineScope }) {
  const data = useStore();
  const { rows, totals } = buildRoutineCourseSummary(data, scope);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden mt-4">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Course Summary</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} course{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Course Code</th>
              <th className="text-left px-3 py-2 font-semibold">Course Name</th>
              <th className="text-center px-3 py-2 font-semibold">Theory</th>
              <th className="text-center px-3 py-2 font-semibold">Sessional</th>
              <th className="text-center px-3 py-2 font-semibold">Credit Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSess = r.sessional > 0;
              return (
                <tr key={r.course.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-mono font-semibold text-primary">{r.course.code}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isSess ? (
                        <FlaskConical className="h-3 w-3 text-purple-600" />
                      ) : (
                        <BookOpen className="h-3 w-3 text-blue-600" />
                      )}
                      <span>{r.course.name}</span>
                    </div>
                  </td>
                  <td className="text-center px-3 py-2 text-foreground/80">
                    {r.theory > 0 ? r.theory : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="text-center px-3 py-2 text-foreground/80">
                    {r.sessional > 0 ? Number(r.sessional).toFixed(2) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="text-center px-3 py-2">
                    <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-amber-100 text-amber-900 font-semibold border border-amber-200">
                      {Number(r.credit).toFixed(2)}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t bg-muted/40 font-semibold">
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right uppercase text-[11px] tracking-wide">Total</td>
              <td className="text-center px-3 py-2">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {totals.theory}
                </span>
              </td>
              <td className="text-center px-3 py-2">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <FlaskConical className="h-3 w-3 text-purple-600" />
                  {Number(totals.sessional).toFixed(2)}
                </span>
              </td>
              <td className="text-center px-3 py-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-amber-400 text-amber-950 border border-amber-500">
                  <CreditCard className="h-3 w-3" />
                  {Number(totals.credit).toFixed(2)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
