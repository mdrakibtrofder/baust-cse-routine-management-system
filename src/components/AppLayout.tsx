import { useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid,
  Users,
  DoorOpen,
  Boxes,
  BookOpen,
  Settings,
  GraduationCap,
  CalendarDays,
  UserSearch,
  BarChart3,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SemesterSelector } from "@/components/SemesterSelector";
import { useStore } from "@/lib/store";

const nav = [
  { to: "/", label: "Course Load", icon: LayoutGrid },
  { to: "/routine", label: "Routine View", icon: CalendarDays },
  { to: "/availability", label: "Teacher Availability", icon: UserSearch },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/teachers", label: "Teachers", icon: Users },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/sections", label: "Sections", icon: Boxes },
  { to: "/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/settings", label: "Periods & Days", icon: Settings },
  { to: "/semester-settings", label: "Semester Settings", icon: CalendarDays },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const init = useStore((s) => s.init);
  const isLoading = useStore((s) => s.isLoading);
  const activeSemester = useStore((s) =>
    s.semesters.find((x) => x.id === s.active_semester_id),
  );

  useEffect(() => {
    init();
  }, [init]);

  return (
    <ConfirmProvider>
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 shrink-0 border-r bg-card flex-col">
        <div className="px-5 py-5 border-b flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-primary-foreground shadow-md"
              style={{ background: "var(--gradient-primary)" }}
            >
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">Routine Manager</div>
              <div className="text-[11px] text-muted-foreground">CSE · {activeSemester?.name ?? "—"}</div>
            </div>
          </Link>
        </div>
        <div className="px-3 pt-3">
          <SemesterSelector />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active =
              item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                style={
                  active
                    ? { background: "var(--gradient-soft)", color: "var(--primary)" }
                    : undefined
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t space-y-3">
          <div className="px-2 py-1 text-[11px] text-muted-foreground flex items-center gap-2">
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            Connected to PostgreSQL
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden border-b bg-card px-4 py-3 flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <GraduationCap className="h-4 w-4" />
          </div>
          <div className="font-semibold flex-1 truncate">Routine Manager</div>
          <SemesterSelector compact />
        </header>
        <nav className="md:hidden border-b bg-card px-2 py-1 flex gap-1 overflow-x-auto">
          {nav.map((item) => {
            const active =
              item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs whitespace-nowrap",
                  active
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
