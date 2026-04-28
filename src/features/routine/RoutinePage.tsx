import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { RoutineView, type RoutineScope } from "@/components/RoutineView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Users, DoorOpen, Boxes } from "lucide-react";

type Mode = "teacher" | "room" | "section";

export function RoutinePage() {
  const data = useStore();
  const [mode, setMode] = useState<Mode>("section");
  const [teacherId, setTeacherId] = useState<string>(data.teachers[0]?.id ?? "");
  const [roomId, setRoomId] = useState<string>(data.rooms[0]?.id ?? "");
  const [sectionId, setSectionId] = useState<string>(data.sections[0]?.id ?? "");

  const sectionsByLT = useMemo(() => {
    const m = new Map<string, typeof data.sections>();
    for (const s of [...data.sections].sort(
      (a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name),
    )) {
      const k = `Level ${s.level}, Term ${s.term}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [data.sections]);

  const scope: RoutineScope =
    mode === "teacher"
      ? { kind: "teacher", teacher_id: teacherId }
      : mode === "room"
      ? { kind: "room", room_id: roomId }
      : { kind: "section", section_id: sectionId };

  const subtitle = useMemo(() => {
    if (mode === "teacher") {
      const t = data.teachers.find((x) => x.id === teacherId);
      return t ? `${t.short_name} — ${t.name}` : "";
    }
    if (mode === "room") {
      const r = data.rooms.find((x) => x.id === roomId);
      return r ? `Room ${r.name} (cap ${r.capacity}, ${r.room_type})` : "";
    }
    const s = data.sections.find((x) => x.id === sectionId);
    return s ? `Level ${s.level}, Term ${s.term} · Section ${s.name} · ${s.total_students} students` : "";
  }, [mode, teacherId, roomId, sectionId, data]);

  return (
    <div>
      <PageHeader title="Routine View" subtitle="Class routine grouped by teacher, room, or section" />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4 text-primary" /> View by
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="teacher" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Teacher
              </TabsTrigger>
              <TabsTrigger value="room" className="gap-1.5">
                <DoorOpen className="h-3.5 w-3.5" /> Room
              </TabsTrigger>
              <TabsTrigger value="section" className="gap-1.5">
                <Boxes className="h-3.5 w-3.5" /> Section
              </TabsTrigger>
            </TabsList>

            <TabsContent value="teacher" className="mt-3">
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Choose a teacher" />
                </SelectTrigger>
                <SelectContent>
                  {data.teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono mr-2">{t.short_name}</span>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="room" className="mt-3">
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Choose a room" />
                </SelectTrigger>
                <SelectContent>
                  {data.rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono mr-2">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {r.room_type} · cap {r.capacity}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="section" className="mt-3">
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent className="max-h-[60vh]">
                  {[...sectionsByLT.entries()].map(([label, list]) => (
                    <SelectGroup key={label}>
                      <SelectLabel className="text-[10px] uppercase">{label}</SelectLabel>
                      {list.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          Section {s.name} · {s.total_students} students
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>
        </div>

        <RoutineView scope={scope} subtitle={subtitle} />
      </div>
    </div>
  );
}
