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
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Room } from "@/lib/types";

const empty: Omit<Room, "id"> = { name: "", room_type: "Theory", capacity: 50 };

export function RoomsPage() {
  const { rooms, addRoom, updateRoom, deleteRoom, replaceRooms } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Room | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Room, "id">>(empty);

  const filtered = useMemo(
    () => rooms.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) || r.room_type.toLowerCase().includes(q.toLowerCase())),
    [rooms, q]
  );

  const submit = () => {
    if (!form.name.trim()) return toast.error("Room name required");
    if (editing) { updateRoom(editing.id, form); toast.success("Room updated"); }
    else { addRoom(form); toast.success("Room added"); }
    setOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Rooms"
        subtitle={`${rooms.length} rooms · capacity & type`}
        onImport={(rows) => {
          const list: Room[] = rows.map(r => ({
            id: crypto.randomUUID(),
            name: String(r["Room Name"] ?? r.name ?? "").trim(),
            room_type: (String(r["Room Type"] ?? r.room_type ?? "Theory") as any),
            capacity: Number(r["Capacity"] ?? r.capacity ?? 0) || 0,
          })).filter(r => r.name);
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
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.room_type === "Sessional" ? "default" : "secondary"}>{r.room_type}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.capacity}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setForm(r); setOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm(`Delete room ${r.name}?`)) { deleteRoom(r.id); toast.success("Deleted"); }
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit room" : "Add room"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Room name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
            <div><Label>Capacity</Label><Input type="number" value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
