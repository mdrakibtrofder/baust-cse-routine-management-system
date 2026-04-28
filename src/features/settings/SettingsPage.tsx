import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ConfirmDialog";
import { periodDependencies, dayDependencies } from "@/lib/conflicts";
import { BlockedDeleteDialog } from "@/components/BlockedDeleteDialog";
import type { Period } from "@/lib/types";

function minutes(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

export function SettingsPage() {
  const data = useStore();
  const { periods, days, addPeriod, updatePeriod, deletePeriod, addDay, deleteDay } = data;
  const confirmDialog = useConfirm();
  const [p, setP] = useState({ start: "08:00", end: "09:00", kind: "theory" as "theory" | "sessional" });
  const [dayName, setDayName] = useState("");
  const [editing, setEditing] = useState<{ id: string; start: string; end: string } | null>(null);
  const [blockedPeriod, setBlockedPeriod] = useState<{ period: Period; deps: ReturnType<typeof periodDependencies> } | null>(null);
  const [blockedDay, setBlockedDay] = useState<{ name: string; deps: ReturnType<typeof dayDependencies> } | null>(null);

  /** Uniqueness checks */
  const periodDup = (start: string, end: string, ignoreId?: string) =>
    periods.some(p => p.id !== ignoreId && p.start === start && p.end === end);
  const dayDup = (name: string) =>
    days.some(d => d.name.trim().toLowerCase() === name.trim().toLowerCase());

  const saveEdit = () => {
    if (!editing) return;
    const old = periods.find(x => x.id === editing.id);
    if (!old) return;
    const dur = minutes(editing.start, editing.end);
    if (dur <= 0) return toast.error("End must be after start");
    if (periodDup(editing.start, editing.end, editing.id))
      return toast.error("Another period already uses this exact time");
    updatePeriod(editing.id, {
      start: editing.start, end: editing.end, duration: dur,
      name: `${editing.start}-${editing.end}`,
    });
    toast.success(`Period updated. Existing classes at ${old.start}-${old.end} were shifted to ${editing.start}-${editing.end}.`);
    setEditing(null);
  };

  const tryDeletePeriod = async (p: Period) => {
    const deps = periodDependencies(data, p.id);
    if (deps.length > 0) { setBlockedPeriod({ period: p, deps }); return; }
    const ok = await confirmDialog({
      title: `Delete period ${p.start}–${p.end}?`,
      description: "No classes use this period. It will be permanently removed.",
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) deletePeriod(p.id);
  };

  const tryDeleteDay = async (d: { id: string; name: string }) => {
    const deps = dayDependencies(data, d.name);
    if (deps.length > 0) { setBlockedDay({ name: d.name, deps }); return; }
    const ok = await confirmDialog({
      title: `Delete day ${d.name}?`,
      description: "No classes are scheduled on this day.",
      destructive: true, confirmLabel: "Delete",
    });
    if (ok) deleteDay(d.id);
  };

  return (
    <div>
      <PageHeader title="Periods & Days" subtitle="Configure available time slots and class days. Editing a period's time auto-updates every existing class using that period." />
      <div className="p-4 sm:p-6 grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold" style={{ background: "var(--gradient-soft)" }}>Class Days</div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {days.map(d => (
                <Badge key={d.id} variant="secondary" className="px-3 py-1.5 text-sm gap-2">
                  {d.name}
                  <button onClick={() => tryDeleteDay(d)} className="hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="e.g. FRI" value={dayName} onChange={(e) => setDayName(e.target.value.toUpperCase())} />
              <Button onClick={() => {
                const n = dayName.trim();
                if (!n) return;
                if (dayDup(n)) return toast.error(`Day "${n}" already exists`);
                addDay(n); setDayName(""); toast.success("Day added");
              }}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold" style={{ background: "var(--gradient-soft)" }}>Periods</div>
          <div className="p-4 space-y-3">
            <div className="space-y-1.5 max-h-72 overflow-auto">
              {periods.map(p => {
                const isEdit = editing?.id === p.id;
                const deps = periodDependencies(data, p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm gap-2">
                    {isEdit ? (
                      <>
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input type="time" className="h-7 text-xs" value={editing!.start}
                            onChange={(e) => setEditing({ ...editing!, start: e.target.value })} />
                          <span>–</span>
                          <Input type="time" className="h-7 text-xs" value={editing!.end}
                            onChange={(e) => setEditing({ ...editing!, end: e.target.value })} />
                        </div>
                        <Button size="icon" variant="ghost" onClick={saveEdit}>
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditing(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-mono">{p.start}–{p.end}</span>
                          <Badge variant={p.kind === "sessional" ? "default" : "secondary"} className="text-[10px]">{p.kind}</Badge>
                          <span className="text-xs text-muted-foreground">{p.duration} min</span>
                          {deps.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">· {deps.length} class{deps.length === 1 ? "" : "es"}</span>
                          )}
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setEditing({ id: p.id, start: p.start, end: p.end })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => tryDeletePeriod(p)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Start</Label><Input type="time" value={p.start} onChange={(e) => setP({ ...p, start: e.target.value })} /></div>
              <div><Label className="text-xs">End</Label><Input type="time" value={p.end} onChange={(e) => setP({ ...p, end: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Kind</Label>
                <Select value={p.kind} onValueChange={(v: any) => setP({ ...p, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="theory">Theory</SelectItem><SelectItem value="sessional">Sessional</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={() => {
              const dur = minutes(p.start, p.end);
              if (dur <= 0) return toast.error("End must be after start");
              if (periodDup(p.start, p.end)) return toast.error("A period with this exact time already exists");
              addPeriod({ name: `${p.start}-${p.end}`, start: p.start, end: p.end, duration: dur, kind: p.kind });
              toast.success("Period added");
            }}><Plus className="h-4 w-4 mr-1.5" /> Add Period</Button>
          </div>
        </div>
      </div>

      <BlockedDeleteDialog
        open={!!blockedPeriod}
        onOpenChange={(v) => !v && setBlockedPeriod(null)}
        title="this period"
        entityLabel={blockedPeriod ? `Period ${blockedPeriod.period.start}–${blockedPeriod.period.end}` : ""}
        dependencies={blockedPeriod?.deps ?? []}
        hint="Reschedule the listed classes to a different period first."
      />
      <BlockedDeleteDialog
        open={!!blockedDay}
        onOpenChange={(v) => !v && setBlockedDay(null)}
        title="this day"
        entityLabel={blockedDay ? `Day ${blockedDay.name}` : ""}
        dependencies={blockedDay?.deps ?? []}
        hint="Move the listed classes to another day first."
      />
    </div>
  );
}
