import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ConfirmDialog";

export function SettingsPage() {
  const { periods, days, addPeriod, deletePeriod, addDay, deleteDay } = useStore();
  const confirmDialog = useConfirm();
  const [p, setP] = useState({ start: "08:00", end: "09:00", kind: "theory" as "theory" | "sessional" });
  const [dayName, setDayName] = useState("");

  const minutes = (a: string, b: string) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return (bh * 60 + bm) - (ah * 60 + am);
  };

  return (
    <div>
      <PageHeader title="Periods & Days" subtitle="Configure available time slots and class days" />
      <div className="p-4 sm:p-6 grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold" style={{ background: "var(--gradient-soft)" }}>Class Days</div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {days.map(d => (
                <Badge key={d.id} variant="secondary" className="px-3 py-1.5 text-sm gap-2">
                  {d.name}
                  <button onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete day ${d.name}?`,
                      description: "Existing classes assigned to this day may become invalid.",
                      destructive: true, confirmLabel: "Delete",
                    });
                    if (ok) deleteDay(d.id);
                  }} className="hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="e.g. FRI" value={dayName} onChange={(e) => setDayName(e.target.value.toUpperCase())} />
              <Button onClick={() => {
                if (!dayName.trim()) return;
                addDay(dayName.trim()); setDayName(""); toast.success("Day added");
              }}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold" style={{ background: "var(--gradient-soft)" }}>Periods</div>
          <div className="p-4 space-y-3">
            <div className="space-y-1.5 max-h-72 overflow-auto">
              {periods.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{p.start}–{p.end}</span>
                    <Badge variant={p.kind === "sessional" ? "default" : "secondary"} className="text-[10px]">{p.kind}</Badge>
                    <span className="text-xs text-muted-foreground">{p.duration} min</span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Delete period ${p.start}–${p.end}?`,
                      description: "Existing classes assigned to this period may become invalid.",
                      destructive: true, confirmLabel: "Delete",
                    });
                    if (ok) deletePeriod(p.id);
                  }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
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
              addPeriod({ name: `${p.start}-${p.end}`, start: p.start, end: p.end, duration: dur, kind: p.kind });
              toast.success("Period added");
            }}><Plus className="h-4 w-4 mr-1.5" /> Add Period</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
