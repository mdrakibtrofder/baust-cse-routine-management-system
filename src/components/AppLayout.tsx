import { useEffect, useState } from "react";
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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { SemesterSelector } from "@/components/SemesterSelector";
import { useStore } from "@/lib/store";

const nav = [
  { to: "/", label: "Course Load", icon: LayoutGrid },
  { to: "/routine", label: "Routine View", icon: CalendarDays },
  {
    label: "CT Schedule",
    icon: CalendarDays,
    sub: [
      { to: "/ct-schedule/config", label: "Configuration" },
      { to: "/ct-schedule/table", label: "Table View" },
      { to: "/ct-schedule/view", label: "Course View" },
    ],
  },
  { to: "/mapping", label: "Room & Time Mapping", icon: Boxes },
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
  const [openSub, setOpenSub] = useState<string | null>("CT Schedule");

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
            if ("sub" in item) {
              const isOpen = openSub === item.label;
              const Icon = item.icon;
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    onClick={() => setOpenSub(isOpen ? null : item.label)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  {isOpen && (
                    <div className="pl-9 space-y-1">
                      {item.sub.map((sub) => {
                        const active = loc.pathname.startsWith(sub.to);
                        return (
                          <Link
                            key={sub.to}
                            to={sub.to}
                            className={cn(
                              "block px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                              active
                                ? "bg-accent text-primary font-semibold"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
            if ("sub" in item) {
               return item.sub.map(sub => {
                  const active = loc.pathname.startsWith(sub.to);
                  return (
                    <Link
                      key={sub.to}
                      to={sub.to}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs whitespace-nowrap",
                        active
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {sub.label}
                    </Link>
                  )
               })
            }
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

