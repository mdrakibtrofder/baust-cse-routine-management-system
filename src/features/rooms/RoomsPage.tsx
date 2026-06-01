import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Plus, Search, CalendarDays, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Room } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { roomDependencies } from "@/lib/conflicts";
import { BlockedDeleteDialog } from "@/components/BlockedDeleteDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { UnavailabilityDialog } from "@/components/UnavailabilityDialog";

const empty: Omit<Room, "id"> = { name: "", room_type: "Theory", capacity: 50 };

export function RoomsPage() {
  const data = useStore();
  const { rooms, addRoom, updateRoom, deleteRoom, replaceRooms } = data;
  const confirmDialog = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [blocked, setBlocked] = useState<{ room: Room; deps: ReturnType<typeof roomDependencies> } | null>(null);
  const [routineFor, setRoutineFor] = useState<Room | null>(null);
  const [unavailFor, setUnavailFor] = useState<Room | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(
    () => rooms.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.room_type.toLowerCase().includes(q.toLowerCase())),
    [rooms, q]
  );

  const dup = (name: string, ignoreId?: string) =>
    rooms.some(r => r.id !== ignoreId && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Room name required");
    if (dup(form.name, editing?.id)) return toast.error(`Room name "${form.name}" already exists`);
    setSubmitting(true);
    try {
      if (editing) {
        await updateRoom(editing.id, form);
        toast.success("Room updated");
      } else {
        await addRoom(form);
        toast.success("Room added");
      }
      setOpen(false);
      await data.init(); // Refresh data to reflect changes
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const tryDelete = async (r: Room) => {
    const deps = roomDependencies(data, r.id);
    if (deps.length > 0) {
      setBlocked({ room: r, deps });
      return;
    }
    const ok = await confirmDialog({
      title: `Delete room ${r.name}?`,
      description: `${r.room_type} room (capacity ${r.capacity}) has no scheduled classes and will be permanently removed.`,
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) { deleteRoom(r.id); toast.success("Deleted"); }
  };

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle={`${rooms.length} rooms · capacity & type`}
        onImport={(rows) => {
          const seen = new Set<string>();
          const list: Room[] = [];
          for (const r of rows) {
            const name = String(r["Room Name"] ?? r.name ?? "").trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({
              id: crypto.randomUUID(),
              name,
              room_type: (String(r["Room Type"] ?? r.room_type ?? "Theory") as any),
              capacity: Number(r["Capacity"] ?? r.capacity ?? 0) || 0,
            });
          }
          replaceRooms(list);
        }}
        exportRows={() => rooms.map(r => ({ "Room Name": r.name, "Room Type": r.room_type, Capacity: r.capacity }))}
        exportName="rooms.xlsx"
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search rooms..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Room
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Capacity</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const deps = roomDependencies(data, r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Badge variant={r.room_type === "Sessional" ? "default" : "secondary"}>{r.room_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.capacity}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{deps.length}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="View routine"
                        onClick={() => setRoutineFor(r)}>
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Manage unavailability"
                        onClick={() => setUnavailFor(r)}>
                        <Clock className="h-3.5 w-3.5 text-warning" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        setEditing(r);
                        setForm({ name: r.name, room_type: r.room_type, capacity: r.capacity });
                        setOpen(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => tryDelete(r)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit room" : "Add room"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Room name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {form.name && dup(form.name, editing?.id) && (
                <p className="text-[11px] text-destructive mt-1">Room name already in use</p>
              )}
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.room_type} onValueChange={(v: any) => setForm({ ...form, room_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Theory">Theory</SelectItem>
                  <SelectItem value="Sessional">Sessional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input 
                type="number" 
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button 
              onClick={submit} 
              disabled={submitting}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BlockedDeleteDialog
        open={!!blocked}
        onOpenChange={(v) => !v && setBlocked(null)}
        title="this room"
        entityLabel={blocked ? `Room ${blocked.room.name}` : ""}
        dependencies={blocked?.deps ?? []}
        hint="Reassign or remove the listed classes (in Course Load), then try again."
      />

      <RoutineDialog
        open={!!routineFor}
        onOpenChange={(v) => !v && setRoutineFor(null)}
        scope={routineFor ? { kind: "room", room_id: routineFor.id } : null}
        title={routineFor ? `Room ${routineFor.name}` : ""}
        subtitle={routineFor ? `${routineFor.room_type} · capacity ${routineFor.capacity}` : ""}
      />

      <UnavailabilityDialog
        open={!!unavailFor}
        onOpenChange={(v) => !v && setUnavailFor(null)}
        mode="room"
        entityId={unavailFor?.id ?? null}
        entityLabel={unavailFor ? `Room ${unavailFor.name}` : ""}
      />
    </div>
  );
}
