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
import { Pencil, Trash2, Plus, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import type { Section, DepartmentalType, Department } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { sectionDependencies } from "@/lib/conflicts";
import { BlockedDeleteDialog } from "@/components/BlockedDeleteDialog";
import { RoutineDialog } from "@/components/RoutineDialog";
import { cn, tagColorClasses } from "@/lib/utils";
import { HOME_DEPT_SHORT_NAME } from "@/lib/constants";

const empty: Omit<Section, "id"> = { level: 1, term: "I", name: "A", total_students: 50, departmental_type: "Departmental", department_id: null };

export function SectionsPage() {
  const data = useStore();
  const { sections, addSection, updateSection, deleteSection, replaceSections } = data;
  const confirmDialog = useConfirm();
  const [editing, setEditing] = useState<Section | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [blocked, setBlocked] = useState<{ section: Section; deps: ReturnType<typeof sectionDependencies> } | null>(null);
  const [routineFor, setRoutineFor] = useState<Section | null>(null);

  const homeDept = useMemo(
    () => data.departments.find((d) => d.short_name.trim().toUpperCase() === HOME_DEPT_SHORT_NAME),
    [data.departments],
  );

  /** Sections grouped by Level+Term within a single department's sections list. */
  const groupByLevelTerm = (list: Section[]) => {
    const m = new Map<string, Section[]>();
    for (const s of [...list].sort((a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name))) {
      const k = `Level ${s.level}, Term ${s.term}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  };

  /** Sections organized department-first: the home department (CSE) — including legacy
   *  sections with no department_id set — comes first, then every other department,
   *  each as its own block, each internally grouped by Level+Term. */
  const departmentBlocks = useMemo(() => {
    const isHome = (s: Section) => !s.department_id || s.department_id === homeDept?.id;
    const home = sections.filter(isHome);
    const otherDeptIds = [...new Set(sections.filter((s) => !isHome(s)).map((s) => s.department_id as string))];
    const otherDepts = otherDeptIds
      .map((id) => data.departments.find((d) => d.id === id))
      .filter(Boolean)
      .sort((a, b) => a!.short_name.localeCompare(b!.short_name)) as Department[];

    const blocks: { dept: Department | null; list: Section[] }[] = [{ dept: homeDept ?? null, list: home }];
    for (const dept of otherDepts) {
      blocks.push({ dept, list: sections.filter((s) => s.department_id === dept.id) });
    }
    return blocks.filter((b) => b.list.length > 0);
  }, [sections, data.departments, homeDept]);

  /** Section name must be unique within (level, term, department) */
  const dup = (name: string, level: number, term: string, department_id: string | null | undefined, ignoreId?: string) =>
    sections.some(s => s.id !== ignoreId && s.level === level && s.term === term &&
      (s.department_id ?? null) === (department_id ?? null) &&
      s.name.trim().toLowerCase() === name.trim().toLowerCase());

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Section name required");
    if (dup(form.name, form.level, form.term, form.department_id, editing?.id))
      return toast.error(`Section ${form.name} already exists in Level ${form.level}, Term ${form.term} for this department`);

    try {
      if (editing) { 
        await updateSection(editing.id, form); 
        toast.success("Updated"); 
      }
      else { 
        await addSection(form); 
        toast.success("Added"); 
      }
      setOpen(false);
      await data.init(); // Refresh data to ensure UI is in sync
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    }
  };

  const tryDelete = async (s: Section) => {
    const deps = sectionDependencies(data, s.id);
    if (deps.length > 0) { setBlocked({ section: s, deps }); return; }
    const ok = await confirmDialog({
      title: `Delete Section ${s.name}?`,
      description: `Level ${s.level}, Term ${s.term}, ${s.total_students} students. No dependencies. This cannot be undone.`,
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) { deleteSection(s.id); toast.success("Deleted"); }
  };

  return (
    <div>
      <PageHeader
        title="Sections"
        subtitle={`${sections.length} sections across all level-terms`}
        onImport={(rows) => {
          const seen = new Set<string>();
          const list: Section[] = [];
          for (const r of rows) {
            const level = Number(r["Section Level"] ?? r.level) || 1;
            const term = String(r["Section Term"] ?? r.term ?? "I").trim();
            const name = String(r["Section"] ?? r.name ?? "A").trim();
            if (!name) continue;
            const key = `${level}|${term}|${name.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({
              id: crypto.randomUUID(), level, term, name,
              total_students: Number(r["Total Students"] ?? r.total_students) || 0,
              departmental_type: "Departmental",
              department_id: null,
            });
          }
          replaceSections(list);
        }}
        exportRows={() => sections.map(s => ({
          "Section Level": s.level, "Section Term": s.term, Section: s.name, "Total Students": s.total_students,
        }))}
        exportName="sections.xlsx"
        rightSlot={
          <Button onClick={() => { setEditing(null); setForm({ ...empty, department_id: homeDept?.id ?? null }); setOpen(true); }}
            style={{ background: "var(--gradient-primary)", color: "var(--primary-foreground)" }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Section
          </Button>
        }
      />
      <div className="p-4 sm:p-6 space-y-6">
        {departmentBlocks.map(({ dept, list }) => (
          <div key={dept?.id ?? "__home__"} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold",
                tagColorClasses(dept?.id),
              )}>
                {dept?.short_name ?? HOME_DEPT_SHORT_NAME}
              </span>
              {dept?.full_name && <span className="text-xs text-muted-foreground">{dept.full_name}</span>}
              <span className="text-xs text-muted-foreground ml-auto">{list.length} section{list.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...groupByLevelTerm(list).entries()].map(([title, group]) => (
                <div key={title} className="rounded-lg border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b font-semibold text-sm" style={{ background: "var(--gradient-soft)" }}>
                    {title}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead className="text-right">Students</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">Section {s.name}</TableCell>
                          <TableCell className="text-right">{s.total_students}</TableCell>
                          <TableCell>
                            {(() => {
                              const sDept = s.department_id ? data.departments.find(d => d.id === s.department_id) : null;
                              const label = sDept?.short_name ?? (s.department_id ? null : HOME_DEPT_SHORT_NAME);
                              if (!label) return <span className="text-xs text-muted-foreground">—</span>;
                              return (
                                <span className={cn(
                                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                                  tagColorClasses(sDept?.id ?? homeDept?.id),
                                )}>
                                  {label}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" title="View routine"
                              onClick={() => setRoutineFor(s)}>
                              <CalendarDays className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setForm(s); setOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => tryDelete(s)}>
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
            <div>
              <Label>Section name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {form.name && dup(form.name, form.level, form.term, form.department_id, editing?.id) && (
                <p className="text-[11px] text-destructive mt-1">Already exists in this level-term for this department</p>
              )}
            </div>
            <div>
              <Label>Total students</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.total_students}
                onChange={(e) => setForm({ ...form, total_students: Math.max(1, Math.trunc(Number(e.target.value))) || 1 })}
              />
            </div>
            <div>
              <Label>Dept. Type</Label>
              <Select
                value={form.departmental_type ?? "Departmental"}
                onValueChange={(v: DepartmentalType) =>
                  setForm({
                    ...form,
                    departmental_type: v,
                    department_id:
                      v === "Departmental"
                        ? (homeDept?.id ?? form.department_id ?? null)
                        : form.department_id === homeDept?.id
                          ? null
                          : form.department_id,
                  })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Departmental">Departmental</SelectItem>
                  <SelectItem value="Non-Departmental">Non-Departmental</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.department_id ?? ""} onValueChange={(v) => setForm({ ...form, department_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {data.departments
                    .filter((d) => form.departmental_type !== "Non-Departmental" || d.id !== homeDept?.id)
                    .map(d => <SelectItem key={d.id} value={d.id}>{d.short_name} – {d.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
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

      <BlockedDeleteDialog
        open={!!blocked}
        onOpenChange={(v) => !v && setBlocked(null)}
        title="this section"
        entityLabel={blocked ? `Section ${blocked.section.name} (L${blocked.section.level} T${blocked.section.term})` : ""}
        dependencies={blocked?.deps ?? []}
        hint="Remove this section's classes and teacher assignments first."
      />

      <RoutineDialog
        open={!!routineFor}
        onOpenChange={(v) => !v && setRoutineFor(null)}
        scope={routineFor ? { kind: "section", section_id: routineFor.id } : null}
        title={routineFor ? `Section ${routineFor.name}` : ""}
        subtitle={routineFor ? `Level ${routineFor.level}, Term ${routineFor.term} · ${routineFor.total_students} students` : ""}
      />
    </div>
  );
}
