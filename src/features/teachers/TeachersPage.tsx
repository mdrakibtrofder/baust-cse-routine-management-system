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
import { Pencil, Trash2, Plus, Search, ArrowRightLeft, CalendarDays, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { teacherAssignedCreditUsed, teacherDependencies } from "@/lib/conflicts";
import type { Teacher } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { TeacherMoveDialog } from "@/components/TeacherMoveDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { UnavailabilityDialog } from "@/components/UnavailabilityDialog";
import { rankInfoFor } from "@/lib/teacher-rank";
import { cn } from "@/lib/utils";

const empty: Omit<Teacher, "id"> = {
  short_name: "", name: "", designation: "", department: "CSE",
  status: "", assigned_credit_hours: 0,
};

export function TeachersPage() {
  const data = useStore();
  const { teachers, addTeacher, updateTeacher, deleteTeacher, replaceTeachers } = data;
  const confirmDialog = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [moveTarget, setMoveTarget] = useState<Teacher | null>(null);
  const [routineFor, setRoutineFor] = useState<Teacher | null>(null);
  const [unavailFor, setUnavailFor] = useState<Teacher | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  /** Uniqueness check: short_name must be unique (case-insensitive) */
  const shortDuplicate = (sn: string, ignoreId?: string) =>
    teachers.some(t => t.id !== ignoreId && t.short_name.trim().toLowerCase() === sn.trim().toLowerCase());

  const submit = async () => {
    if (!form.short_name.trim() || !form.name.trim()) {
      toast.error("Short name and full name required");
      return;
    }
    if (shortDuplicate(form.short_name, editing?.id)) {
      toast.error(`Short name "${form.short_name}" is already used by another teacher`);
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateTeacher(editing.id, form);
        toast.success("Teacher updated");
      } else {
        await addTeacher(form);
        toast.success("Teacher added");
      }
      setOpen(false);
      await data.init(); // Refresh data to reflect changes
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const tryDelete = async (t: Teacher) => {
    const deps = teacherDependencies(data, t.id);
    if (deps.length > 0) {
      // Offer migration instead of blocking outright
      const ok = await confirmDialog({
        title: `${t.short_name} has ${deps.length} active assignment${deps.length === 1 ? "" : "s"}`,
        description: `This teacher is currently assigned to courses. Deleting them will cause conflicts. We recommend moving their classes to another teacher first.`,
        confirmLabel: "Move classes…",
      });
      if (ok) setMoveTarget(t);
      return;
    }
    const ok = await confirmDialog({
      title: `Delete teacher ${t.short_name}?`,
      description: `${t.name} (${t.designation || "Faculty"}) will be permanently removed.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (ok) {
      try {
        await deleteTeacher(t.id);
        toast.success("Teacher deleted successfully");
        data.init();
      } catch (err: any) {
        const msg = err.response?.data?.message || err.message || "Deletion failed";
        toast.error(msg);
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle={`${teachers.length} teachers · total credits & status`}
        onImport={(rows) => {
          const seen = new Set<string>();
          const list: Teacher[] = [];
          for (const r of rows) {
            const sn = String(r["Short Name"] ?? r.short_name ?? "").trim();
            if (!sn) continue;
            const key = sn.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({
              id: crypto.randomUUID(),
              short_name: sn,
              name: String(r["Full Name"] ?? r.name ?? "").trim(),
              designation: String(r["Designation"] ?? r.designation ?? "").trim(),
              department: String(r["Department"] ?? r.department ?? "").trim(),
              status: String(r["Status"] ?? r.status ?? "").trim(),
              assigned_credit_hours:
                Number(
                  r["Credit Hours"] ??
                    r["Credits"] ??
                    r["assigned_credit_hours"] ??
                    r["assigned_credit"] ??
                    0,
                ) || 0,
            });
          }
          replaceTeachers(list);
        }}
        exportRows={() => teachers.map(t => ({
          "Short Name": t.short_name, "Full Name": t.name,
          Designation: t.designation, Department: t.department,
          Status: t.status, "Credit Hours": t.assigned_credit_hours,
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
                <TableHead className="text-right">Total Credit</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
                <TableHead className="text-right w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const used = teacherAssignedCreditUsed(data, t.id);
                const over = t.assigned_credit_hours > 0 && used > t.assigned_credit_hours + 0.001;
                const depCount = teacherDependencies(data, t.id).length;
                const rank = rankInfoFor(t.designation);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-medium">{t.short_name}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-6 w-7 rounded-md flex items-center justify-center text-[10px] font-bold border",
                            rank.className,
                          )}
                          title={rank.label}
                        >
                          {rank.short}
                        </span>
                        <span>{t.designation || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.department || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{t.status || "-"}</TableCell>
                    <TableCell className="text-right">{Number(t.assigned_credit_hours || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={over ? "text-destructive font-semibold" : used >= (t.assigned_credit_hours || 0) && (t.assigned_credit_hours || 0) > 0 ? "text-warning font-semibold" : ""}>
                        {Number(used || 0).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="View routine"
                        onClick={() => setRoutineFor(t)}>
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="relative" title="Manage unavailability"
                        onClick={() => setUnavailFor(t)}>
                        <Clock className="h-3.5 w-3.5 text-warning" />
                        {(() => {
                          const count = data.teacher_unavailability.filter((u) => u.teacher_id === t.id).length;
                          if (count === 0) return null;
                          return (
                            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                              {count}
                            </span>
                          );
                        })()}
                      </Button>
                      {depCount > 0 && (
                        <Button size="icon" variant="ghost" title={`Move ${depCount} assignment(s) to another teacher`}
                          onClick={() => setMoveTarget(t)}>
                          <ArrowRightLeft className="h-3.5 w-3.5 text-warning" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => tryDelete(t)}>
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
              {form.short_name && shortDuplicate(form.short_name, editing?.id) && (
                <p className="text-[11px] text-destructive mt-1">Short name already in use</p>
              )}
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
              <Label>Total credit</Label>
              <Input 
                type="number" 
                step="0.25" 
                value={form.assigned_credit_hours}
                onChange={(e) => setForm({ ...form, assigned_credit_hours: e.target.value })} 
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

      <TeacherMoveDialog
        open={!!moveTarget}
        onOpenChange={(v) => !v && setMoveTarget(null)}
        fromTeacher={moveTarget}
        dependencies={moveTarget ? teacherDependencies(data, moveTarget.id) : []}
        onMoved={() => toast.success("Classes moved. Old teacher record kept.")}
      />

      <RoutineDialog
        open={!!routineFor}
        onOpenChange={(v) => !v && setRoutineFor(null)}
        scope={routineFor ? { kind: "teacher", teacher_id: routineFor.id } : null}
        title={routineFor ? `${routineFor.short_name} — ${routineFor.name}` : ""}
        subtitle={routineFor?.designation}
      />

      <UnavailabilityDialog
        open={!!unavailFor}
        onOpenChange={(v) => !v && setUnavailFor(null)}
        mode="teacher"
        entityId={unavailFor?.id ?? null}
        entityLabel={unavailFor ? `${unavailFor.short_name} (${unavailFor.name})` : ""}
      />
    </div>
  );
}
