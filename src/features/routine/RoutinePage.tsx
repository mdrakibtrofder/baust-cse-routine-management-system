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
  const [teacherId, setTeacherId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");

  useMemo(() => {
    if (!teacherId && data.teachers.length > 0) setTeacherId(data.teachers[0].id);
    if (!roomId && data.rooms.length > 0) setRoomId(data.rooms[0].id);
    if (!sectionId && data.sections.length > 0) {
      const sorted = [...data.sections].sort(
        (a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name)
      );
      setSectionId(sorted[0].id);
    }
  }, [data]);

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
      return r ? `Room ${r.name} (capacity ${r.capacity}, ${r.room_type})` : "";
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
                        {r.room_type} · capacity {r.capacity}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="section" className="mt-3">
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger className="w-[380px] max-w-full">
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent className="max-h-[60vh] w-[380px]">
                  {[...sectionsByLT.entries()].map(([label, list]) => (
                    <SelectGroup key={label}>
                      <SelectLabel className="text-[10px] uppercase font-bold text-primary px-3 py-2 bg-muted/50">{label}</SelectLabel>
                      {list.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex flex-col gap-0.5 py-1">
                            <div className="font-semibold text-sm">
                              Level {s.level}, Term {s.term} · Section {s.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium">
                              {s.total_students} Students · CSE Dept
                            </div>
                          </div>
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
