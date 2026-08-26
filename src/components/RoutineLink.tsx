import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RoutineDialog } from "@/components/RoutineDialog";
import type { RoutineScope } from "@/components/RoutineView";

type Target =
  | { kind: "teacher"; id: string }
  | { kind: "room"; id: string }
  | { kind: "section"; id: string };

const RoutineLinkCtx = createContext<((t: Target) => void) | null>(null);

/** Mounted once (in AppLayout) so any teacher short-name, room number or section
 *  label anywhere in the app can open that entity's full routine, without every
 *  page wiring up its own dialog + state. */
export function RoutineLinkProvider({ children }: { children: ReactNode }) {
  const data = useStore();
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target) => setTarget(t), []);

  const resolved = useMemo((): { scope: RoutineScope; title: string; subtitle?: string } | null => {
    if (!target) return null;
    if (target.kind === "teacher") {
      const t = data.teachers.find((x) => x.id === target.id);
      if (!t) return null;
      return {
        scope: { kind: "teacher", teacher_id: t.id },
        title: `${t.short_name} — ${t.name}`,
        subtitle: t.designation,
      };
    }
    if (target.kind === "room") {
      const r = data.rooms.find((x) => x.id === target.id);
      if (!r) return null;
      return {
        scope: { kind: "room", room_id: r.id },
        title: `Room ${r.name}`,
        subtitle: `${r.room_type} · capacity ${r.capacity}`,
      };
    }
    const s = data.sections.find((x) => x.id === target.id);
    if (!s) return null;
    return {
      scope: { kind: "section", section_id: s.id },
      title: `Section ${s.name}`,
      subtitle: `Level ${s.level}, Term ${s.term} · ${s.total_students} students`,
    };
  }, [target, data.teachers, data.rooms, data.sections]);

  return (
    <RoutineLinkCtx.Provider value={open}>
      {children}
      <RoutineDialog
        open={!!resolved}
        onOpenChange={(v) => !v && setTarget(null)}
        scope={resolved?.scope ?? null}
        title={resolved?.title ?? ""}
        subtitle={resolved?.subtitle}
      />
    </RoutineLinkCtx.Provider>
  );
}

export function useRoutineLink() {
  return useContext(RoutineLinkCtx);
}

/** Generic clickable label that opens the routine of a teacher / room / section.
 *  Falls back to a plain span (keeping `className`) when there is no id or no
 *  provider above, so it is always safe to drop in. */
export function RoutineLink({
  kind,
  id,
  className,
  title,
  children,
}: {
  kind: Target["kind"];
  id?: string | null;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const open = useRoutineLink();
  if (!id || !open) return <span className={className}>{children}</span>;
  const label =
    title ?? (kind === "teacher" ? "View teacher routine" : kind === "room" ? "View room routine" : "View section routine");
  return (
    <button
      type="button"
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        open({ kind, id } as Target);
      }}
      className={cn("cursor-pointer hover:underline underline-offset-2 transition-colors", className)}
    >
      {children}
    </button>
  );
}

export function TeacherRoutineLink(p: { teacherId?: string | null; className?: string; title?: string; children: ReactNode }) {
  return <RoutineLink kind="teacher" id={p.teacherId} className={p.className} title={p.title}>{p.children}</RoutineLink>;
}

export function RoomRoutineLink(p: { roomId?: string | null; className?: string; title?: string; children: ReactNode }) {
  return <RoutineLink kind="room" id={p.roomId} className={p.className} title={p.title}>{p.children}</RoutineLink>;
}

export function SectionRoutineLink(p: { sectionId?: string | null; className?: string; title?: string; children: ReactNode }) {
  return <RoutineLink kind="section" id={p.sectionId} className={p.className} title={p.title}>{p.children}</RoutineLink>;
}
