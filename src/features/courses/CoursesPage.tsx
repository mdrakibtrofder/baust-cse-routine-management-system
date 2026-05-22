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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Course, CourseType, DepartmentalType } from "@/lib/types";
import { COURSE_TYPE_INFO } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { courseDependencies } from "@/lib/conflicts";
import { BlockedDeleteDialog } from "@/components/BlockedDeleteDialog";

const empty: Omit<Course, "id"> = {
  code: "", name: "", credit: 3, course_type: "theory_3.0",
  departmental_type: "Departmental",
  level: 1, term: "I", theory: 3, sessional: 0,
};

const TYPES: CourseType[] = ["theory_2.0", "theory_3.0", "sessional_1.5", "sessional_0.75"];
const DEPT_TYPES: DepartmentalType[] = ["Departmental", "Non-Departmental"];

export function CoursesPage() {
  const data = useStore();
  const { courses, addCourse, updateCourse, deleteCourse } = data;
  const confirmDialog = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Course, "id">>(empty);
  const [blocked, setBlocked] = useState<{ course: Course; deps: ReturnType<typeof courseDependencies> } | null>(null);

  const filtered = useMemo(
    () => courses.filter(c => `${c.code} ${c.name}`.toLowerCase().includes(q.toLowerCase())),
    [courses, q]
  );

  /** Course code must be unique (case-insensitive, global) */
  const dup = (code: string, ignoreId?: string) =>
    courses.some(c => c.id !== ignoreId && c.code.trim().toLowerCase() === code.trim().toLowerCase());

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error("Code and name required");
    if (dup(form.code, editing?.id)) return toast.error(`Course code "${form.code}" already exists`);
    try {
      if (editing) { 
        await updateCourse(editing.id, form); 
        toast.success("Updated"); 
      }
      else { 
        await addCourse(form); 
        toast.success("Added"); 
      }
      setOpen(false);
      data.init();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Operation failed");
    }
  };

  const tryDelete = async (c: Course) => {
    const deps = courseDependencies(data, c.id);
    if (deps.length > 0) { setBlocked({ course: c, deps }); return; }
    const ok = await confirmDialog({
      title: `Delete course ${c.code}?`,
      description: `${c.name} (Level ${c.level}, Term ${c.term}, ${c.credit} cr) has no schedule. This cannot be undone.`,
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) { 
      try {
        await deleteCourse(c.id); 
        toast.success("Deleted"); 
        data.init();
      } catch (err: any) {
        toast.error(err.response?.data?.message || err.message || "Deletion failed");
      }
    }
  };

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle={`${courses.length} courses across all level-terms`}
        exportRows={() => courses.map(c => ({
          "Course Code": c.code, 
          "Course Title": c.name, 
          Theory: c.theory, 
          Sessional: c.sessional,
          "Total Cr.": c.credit, 
          Level: c.level, 
          Term: c.term, 
          Type: COURSE_TYPE_INFO[c.course_type].label,
          "Dept. Type": c.departmental_type,
        }))}
        exportName="courses.xlsx"
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search code or name..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Course
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Level-Term</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dept. Type</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered
                .sort((a,b) => a.level - b.level || a.term.localeCompare(b.term) || a.code.localeCompare(b.code))
                .map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell><Badge variant="outline">L{c.level} T{c.term}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{c.credit}</TableCell>
                  <TableCell>
                    <Badge variant={c.sessional > 0 ? "default" : "secondary"}>
                      {COURSE_TYPE_INFO[c.course_type].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      c.departmental_type === "Departmental" ? "border-primary text-primary" : "border-muted-foreground text-muted-foreground"
                    )}>
                      {c.departmental_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { 
                      setEditing(c); 
                      setForm({
                        code: c.code,
                        name: c.name,
                        credit: c.credit,
                        course_type: c.course_type,
                        departmental_type: c.departmental_type,
                        level: c.level,
                        term: c.term,
                        theory: c.theory,
                        sessional: c.sessional
                      }); 
                      setOpen(true); 
                    }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => tryDelete(c)}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit course" : "Add course"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              {form.code && dup(form.code, editing?.id) && (
                <p className="text-[11px] text-destructive mt-1">Code already in use</p>
              )}
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.course_type} onValueChange={(v: CourseType) => {
                const info = COURSE_TYPE_INFO[v];
                const credit = v === "theory_2.0" ? 2 : v === "theory_3.0" ? 3 : v === "sessional_1.5" ? 1.5 : 0.75;
                setForm({
                  ...form, course_type: v, credit,
                  theory: info.roomKind === "theory" ? credit : 0,
                  sessional: info.roomKind === "sessional" ? credit : 0,
                });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{COURSE_TYPE_INFO[t].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dept. Type</Label>
              <Select value={form.departmental_type} onValueChange={(v: DepartmentalType) => setForm({ ...form, departmental_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPT_TYPES.map(dt => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Title</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
            <div><Label>Credit</Label><Input type="number" step="0.25" value={form.credit}
              onChange={(e) => setForm({ ...form, credit: Number(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BlockedDeleteDialog
        open={!!blocked}
        onOpenChange={(v) => !v && setBlocked(null)}
        title="this course"
        entityLabel={blocked ? `${blocked.course.code} — ${blocked.course.name}` : ""}
        dependencies={blocked?.deps ?? []}
        hint="Clear all schedules and teacher assignments for this course in Course Load."
      />
    </div>
  );
}
