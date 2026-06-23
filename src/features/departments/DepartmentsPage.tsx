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
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Department } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn, tagColorClasses } from "@/lib/utils";
import { departmentDependencies } from "@/lib/conflicts";
import { BlockedDeleteDialog } from "@/components/BlockedDeleteDialog";

const empty: Omit<Department, "id"> = { short_name: "", full_name: "", faculty_name: "" };

export function DepartmentsPage() {
  const data = useStore();
  const { departments, addDepartment, updateDepartment, deleteDepartment } = data;
  const confirmDialog = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<{ department: Department; deps: ReturnType<typeof departmentDependencies> } | null>(null);

  const filtered = useMemo(
    () => departments.filter(d => 
      d.short_name.toLowerCase().includes(q.toLowerCase()) ||
      d.full_name.toLowerCase().includes(q.toLowerCase()) ||
      d.faculty_name.toLowerCase().includes(q.toLowerCase())
    ),
    [departments, q]
  );

  const dup = (shortName: string, ignoreId?: string) =>
    departments.some(d => d.id !== ignoreId && d.short_name.trim().toLowerCase() === shortName.trim().toLowerCase());

  const submit = async () => {
    if (!form.short_name.trim()) return toast.error("Short name required");
    if (!form.full_name.trim()) return toast.error("Full name required");
    if (!form.faculty_name.trim()) return toast.error("Faculty name required");
    if (dup(form.short_name, editing?.id)) return toast.error(`Short name "${form.short_name}" already exists`);
    setSubmitting(true);
    try {
      if (editing) {
        await updateDepartment(editing.id, form);
        toast.success("Department updated");
      } else {
        await addDepartment(form);
        toast.success("Department added");
      }
      setOpen(false);
      await data.init(); // Refresh data to reflect changes
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const tryDelete = async (d: Department) => {
    const deps = departmentDependencies(data, d.id);
    if (deps.length > 0) { setBlocked({ department: d, deps }); return; }
    const ok = await confirmDialog({
      title: `Delete department ${d.short_name}?`,
      description: `${d.full_name} (${d.faculty_name}) will be permanently removed.`,
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) {
      try {
        await deleteDepartment(d.id);
        toast.success("Deleted");
      } catch (err: any) {
        toast.error(err.response?.data?.message || err.message || "Deletion failed");
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle={`${departments.length} departments`}
        onImport={(rows) => {
          const seen = new Set<string>();
          for (const r of rows) {
            const shortName = String(r["Short Name"] ?? r.short_name ?? "").trim();
            if (!shortName) continue;
            const key = shortName.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            addDepartment({
              short_name: shortName,
              full_name: String(r["Full Name"] ?? r.full_name ?? "").trim(),
              faculty_name: String(r["Faculty Name"] ?? r.faculty_name ?? "").trim(),
            });
          }
        }}
        exportRows={() => departments.map(d => ({ 
          "Short Name": d.short_name, 
          "Faculty Name": d.faculty_name, 
          "Full Name": d.full_name, 
        }))}
        exportName="departments.xlsx"
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search departments..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Department
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Short Name</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Faculty</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(d => {
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-semibold",
                        tagColorClasses(d.id, d.short_name),
                      )}>
                        {d.short_name}
                      </span>
                    </TableCell>
                    <TableCell>{d.full_name}</TableCell>
                    <TableCell>{d.faculty_name}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => {
                        setEditing(d);
                        setForm({ short_name: d.short_name, full_name: d.full_name, faculty_name: d.faculty_name });
                        setOpen(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => tryDelete(d)}>
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
          <DialogHeader><DialogTitle>{editing ? "Edit department" : "Add department"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Short Name</Label>
              <Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} />
              {form.short_name && dup(form.short_name, editing?.id) && (
                <p className="text-[11px] text-destructive mt-1">Short name already in use</p>
              )}
            </div>
            <div>
              <Label>Faculty Name</Label>
              <Input value={form.faculty_name} onChange={(e) => setForm({ ...form, faculty_name: e.target.value })} />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}
              style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {submitting && <Search className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BlockedDeleteDialog
        open={!!blocked}
        onOpenChange={(v) => !v && setBlocked(null)}
        title="this department"
        entityLabel={blocked ? `Department ${blocked.department.short_name}` : ""}
        dependencies={blocked?.deps ?? []}
        hint="Reassign or remove the listed courses, sections, and rooms first, then try again."
      />
    </div>
  );
}
