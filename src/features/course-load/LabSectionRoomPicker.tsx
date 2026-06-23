import { useState } from "react";
import { useStore } from "@/lib/store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, X, MapPin } from "lucide-react";
import type { Course, CourseLabSection } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import { cn, roomSupportsKind } from "@/lib/utils";

/** Same room-picker UX as RoomPicker, but for a lab section's own primary_room_id
 *  instead of a course_section_teachers row — lets Room & Time Mapping assign a
 *  room per lab section exactly like it does for regular sections. */
export function LabSectionRoomPicker({ course, labSection }: {
  course: Course; labSection: CourseLabSection;
}) {
  const data = useStore();
  const selected = data.rooms.find(r => r.id === labSection.primary_room_id);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const info = COURSE_TYPE_INFO[course.course_type];
  const setRoom = (rid: string | null) => {
    data.updateLabSection(labSection.id, { primary_room_id: rid });
  };

  const list = data.rooms
    .filter(r => roomSupportsKind(r.room_type, info.roomKind))
    .filter(r => {
      if (!q) return true;
      return r.name.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-7 px-2 rounded text-xs flex items-center gap-1.5 border transition-colors min-w-[64px]",
            selected ? "bg-card hover:border-primary" : "border-dashed text-muted-foreground hover:border-primary hover:text-foreground"
          )}
          title={selected ? `${labSection.label} Room: ${selected.name}` : `Set ${labSection.label} Room`}
        >
          {selected ? (
            <>
              <MapPin className="h-3 w-3 text-orange-500" />
              <span className="font-mono font-medium">{selected.name}</span>
            </>
          ) : (
            <span>+ Room</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <Input autoFocus placeholder="Search room..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
        </div>
        <div className="max-h-60 overflow-auto">
          {selected && (
            <button
              onClick={() => { setRoom(null); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-muted text-destructive border-b"
            >
              <X className="h-3.5 w-3.5" /> Clear room
            </button>
          )}
          {list.length === 0 && (
            <div className="p-4 text-center text-xs text-muted-foreground italic">
              No compatible rooms found.
            </div>
          )}
          {list.map(r => {
            const isSelected = labSection.primary_room_id === r.id;
            return (
              <button
                key={r.id}
                onClick={() => { setRoom(r.id); setOpen(false); }}
                className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-orange-500" />
                    <span className="font-mono font-semibold">{r.name}</span>
                    <span className="text-muted-foreground truncate">({r.room_type})</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span>Capacity: {r.capacity}</span>
                  </div>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
