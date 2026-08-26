import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RoutineDialog } from "@/components/RoutineDialog";

type OpenFn = (teacherId: string) => void;

const TeacherRoutineCtx = createContext<OpenFn | null>(null);

/** Mounted once (in AppLayout) so any teacher short-name anywhere in the app —
 *  routine grid cells, summaries, course load, dialogs — can open the same
 *  teacher routine view without each page wiring its own dialog. */
export function TeacherRoutineProvider({ children }: { children: ReactNode }) {
  const data = useStore();
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const open = useCallback<OpenFn>((id) => setTeacherId(id), []);
  const teacher = useMemo(
    () => (teacherId ? data.teachers.find((t) => t.id === teacherId) ?? null : null),
    [teacherId, data.teachers],
  );

  return (
    <TeacherRoutineCtx.Provider value={open}>
      {children}
      <RoutineDialog
        open={!!teacher}
        onOpenChange={(v) => !v && setTeacherId(null)}
        scope={teacher ? { kind: "teacher", teacher_id: teacher.id } : null}
        title={teacher ? `${teacher.short_name} — ${teacher.name}` : ""}
        subtitle={teacher?.designation}
      />
    </TeacherRoutineCtx.Provider>
  );
}

/** Returns an opener, or null when rendered outside the provider. */
export function useTeacherRoutine() {
  return useContext(TeacherRoutineCtx);
}

/** Wraps a teacher short-name (or any teacher label) so clicking it opens that
 *  teacher's full routine. Falls back to plain content when there's no teacher
 *  id or no provider above, so it is always safe to use. */
export function TeacherRoutineLink({
  teacherId,
  className,
  title,
  children,
}: {
  teacherId?: string | null;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const open = useTeacherRoutine();
  if (!teacherId || !open) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      title={title ?? "View teacher routine"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        open(teacherId);
      }}
      className={cn("cursor-pointer hover:underline underline-offset-2 transition-colors", className)}
    >
      {children}
    </button>
  );
}
