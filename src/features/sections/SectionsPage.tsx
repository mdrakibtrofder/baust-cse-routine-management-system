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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Section } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";

const empty: Omit<Section, "id"> = { level: 1, term: "I", name: "A", total_students: 50 };

export function SectionsPage() {
  const { sections, addSection, updateSection, deleteSection, replaceSections } = useStore();
  const confirmDialog = useConfirm();
  const [editing, setEditing] = useState<Section | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Section, "id">>(empty);

  const grouped = useMemo(() => {
    const m = new Map<string, Section[]>();
    for (const s of [...sections].sort((a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name))) {
      const k = `Level ${s.level}, Term ${s.term}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [sections]);

  const submit = () => {
    if (!form.name.trim()) return toast.error("Section name required");
    if (editing) { updateSection(editing.id, form); toast.success("Updated"); }
    else { addSection(form); toast.success("Added"); }
    setOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Sections"
        subtitle={`${sections.length} sections across all level-terms`}
        onImport={(rows) => {
          const list: Section[] = rows.map(r => ({
            id: crypto.randomUUID(),
            level: Number(r["Section Level"] ?? r.level) || 1,
            term: String(r["Section Term"] ?? r.term ?? "I").trim(),
            name: String(r["Section"] ?? r.name ?? "A").trim(),
            total_students: Number(r["Total Students"] ?? r.total_students) || 0,
          })).filter(s => s.name);
          replaceSections(list);
        }}
        exportRows={() => sections.map(s => ({
          "Section Level": s.level, "Section Term": s.term, Section: s.name, "Total Students": s.total_students,
        }))}
        exportName="sections.xlsx"
        rightSlot={
          <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Section
          </Button>
        }
      />
      <div className="p-4 sm:p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...grouped.entries()].map(([title, list]) => (
          <div key={title} className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b font-semibold text-sm" style={{ background: "var(--gradient-soft)" }}>
              {title}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">Section {s.name}</TableCell>
                    <TableCell className="text-right">{s.total_students}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setForm(s); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={async () => {
                        const ok = await confirmDialog({
                          title: `Delete Section ${s.name}?`,
                          description: `Level ${s.level}, Term ${s.term}, ${s.total_students} students. This cannot be undone.`,
                          destructive: true, confirmLabel: "Delete",
                        });
                        if (ok) { deleteSection(s.id); toast.success("Deleted"); }
                      }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit section" : "Add section"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Level</Label>
              <Select value={String(form.level)} onValueChange={(v) => setForm({ ...form, level: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term</Label>
              <Select value={form.term} onValueChange={(v) => setForm({ ...form, term: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="I">I</SelectItem><SelectItem value="II">II</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Section name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Total students</Label><Input type="number" value={form.total_students}
              onChange={(e) => setForm({ ...form, total_students: Number(e.target.value) || 0 })} /></div>
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
