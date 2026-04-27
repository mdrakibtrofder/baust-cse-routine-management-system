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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { teacherAssignedCreditUsed } from "@/lib/conflicts";
import type { Teacher } from "@/lib/types";

const empty: Omit<Teacher, "id"> = {
  short_name: "", name: "", designation: "", department: "CSE",
  status: "", assigned_credit: 0,
};

export function TeachersPage() {
  const data = useStore();
  const { teachers, addTeacher, updateTeacher, deleteTeacher, replaceTeachers } = data;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Teacher, "id">>(empty);

  const filtered = useMemo(
    () => teachers.filter(t =>
      [t.short_name, t.name, t.designation, t.department, t.status]
        .join(" ").toLowerCase().includes(q.toLowerCase())
    ),
    [teachers, q]
  );

  const startEdit = (t: Teacher) => {
    setEditing(t);
    setForm({ ...t });
    setOpen(true);
  };
  const startAdd = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };
  const submit = () => {
    if (!form.short_name.trim() || !form.name.trim()) {
      toast.error("Short name and full name required");
      return;
    }
    if (editing) {
      updateTeacher(editing.id, form);
      toast.success("Teacher updated");
    } else {
      addTeacher(form);
      toast.success("Teacher added");
    }
    setOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle={`${teachers.length} teachers · assigned credits & status`}
        onImport={(rows) => {
          const list: Teacher[] = rows.map(r => ({
            id: crypto.randomUUID(),
            short_name: String(r["Short Name"] ?? r.short_name ?? "").trim(),
            name: String(r["Full Name"] ?? r.name ?? "").trim(),
            designation: String(r["Designation"] ?? r.designation ?? "").trim(),
            department: String(r["Department"] ?? r.department ?? "").trim(),
            status: String(r["Status"] ?? r.status ?? "").trim(),
            assigned_credit: Number(r["Credits"] ?? r["assigned_credit"] ?? 0) || 0,
          })).filter(t => t.short_name);
          replaceTeachers(list);
        }}
        exportRows={() => teachers.map(t => ({
          "Short Name": t.short_name, "Full Name": t.name,
          Designation: t.designation, Department: t.department,
          Status: t.status, Credits: t.assigned_credit,
        }))}
        exportName="teachers.xlsx"
        showReset
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search teachers..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={startAdd} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Teacher
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Short</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const used = teacherAssignedCreditUsed(data, t.id);
                const over = t.assigned_credit > 0 && used > t.assigned_credit + 0.001;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-medium">{t.short_name}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.designation}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.department || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{t.status || "-"}</TableCell>
                    <TableCell className="text-right">{t.assigned_credit}</TableCell>
                    <TableCell className="text-right">
                      <span className={over ? "text-destructive font-semibold" : used >= t.assigned_credit && t.assigned_credit > 0 ? "text-warning font-semibold" : ""}>
                        {used.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (confirm(`Delete teacher ${t.short_name}?`)) {
                          deleteTeacher(t.id);
                          toast.success("Deleted");
                        }
                      }}>
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
          <DialogHeader>
            <DialogTitle>{editing ? "Edit teacher" : "Add teacher"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Short name</Label>
              <Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Full name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Assigned credit</Label>
              <Input type="number" step="0.25" value={form.assigned_credit}
                onChange={(e) => setForm({ ...form, assigned_credit: Number(e.target.value) || 0 })} />
            </div>
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
