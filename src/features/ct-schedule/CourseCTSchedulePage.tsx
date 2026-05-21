import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BookOpen } from "lucide-react";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { CTAssignment } from "@/lib/types";
import { toast } from "sonner";

export function CourseCTSchedulePage() {
  const { active_semester_id, sections } = useStore();
  const [assignments, setAssignments] = useState<CTAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");

  useEffect(() => {
    if (active_semester_id) {
      loadAssignments();
    }
  }, [active_semester_id]);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const res = await api.get<CTAssignment[]>(`/ct-schedule/assignments/${active_semester_id}`);
      setAssignments(res);
    } catch (error) {
      toast.error("Failed to load CT assignments");
    } finally {
      setLoading(false);
    }
  };

  const filteredAssignments = useMemo(() => {
    if (selectedSectionId === "all") return assignments;
    return assignments.filter(a => a.section_id === selectedSectionId);
  }, [assignments, selectedSectionId]);

  const groupedAssignments = useMemo(() => {
    const grouped: Record<string, CTAssignment[]> = {};
    filteredAssignments.forEach(a => {
      const key = `${a.course?.code} - ${a.course?.name}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });
    // Sort CTs by number
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.ct_number - b.ct_number);
    });
    return grouped;
  }, [filteredAssignments]);

  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.level - b.level || a.term.localeCompare(b.term) || a.name.localeCompare(b.name));
  }, [sections]);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader title="Course-wise CT Schedule" subtitle="View class test dates for each course" />
      
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center gap-4 bg-card p-4 rounded-xl border">
          <BookOpen className="h-5 w-5 text-primary" />
          <div className="flex-1 max-w-sm">
            <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {sortedSections.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    Level {s.level}, Term {s.term} · Section {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {Object.keys(groupedAssignments).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(groupedAssignments).map(([courseLabel, cts]) => (
              <div key={courseLabel} className="bg-card rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-muted/50 p-4 border-b">
                  <h4 className="font-bold text-sm truncate">{courseLabel}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Level {cts[0].course?.level}, Term {cts[0].course?.term} · Section {cts[0].section?.name}
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {cts.map(ct => (
                    <div key={ct.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {ct.ct_number}
                        </div>
                        <span className="font-medium">Class Test {ct.ct_number}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{format(parseISO(ct.date), "dd MMM yyyy")}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Room {ct.room?.name} · Week {ct.week_number}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
            <p>No CT assignments found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
