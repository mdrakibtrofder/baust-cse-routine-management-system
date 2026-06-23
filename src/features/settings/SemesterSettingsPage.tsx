import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Plus, Trash2, Edit2, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

export function SemesterSettingsPage() {
  const {
    years, addYear, updateYear, deleteYear,
    semester_types, addSemesterType, updateSemesterType, deleteSemesterType,
    semesters, addSemester, updateSemester, deleteSemester
  } = useStore();
  const confirm = useConfirm();

  const [yearSearch, setYearSearch] = useState("");
  const [typeSearch, setTypeSearch] = useState("");
  const [semesterSearch, setSemesterSearch] = useState("");

  const [newYear, setNewYear] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  
  const [selectedYearId, setSelectedYearId] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState("");

  const filteredYears = years.filter(y => y.value.toString().includes(yearSearch));
  const filteredTypes = semester_types.filter(t => t.name.toLowerCase().includes(typeSearch.toLowerCase()));
  const filteredSemesters = semesters.filter(s => s.name.toLowerCase().includes(semesterSearch.toLowerCase()));

  /** A year is identified by its numeric value — only one entry per year. */
  const yearDup = (value: number, ignoreId?: string) =>
    years.some(y => y.id !== ignoreId && y.value === value);

  /** A semester type is identified by its name (case-insensitive). */
  const typeDup = (name: string, ignoreId?: string) =>
    semester_types.some(t => t.id !== ignoreId && t.name.trim().toLowerCase() === name.trim().toLowerCase());

  /** A semester is identified by its year + type combination — you can't have two
   *  "Spring 2026" semesters, for example. */
  const semesterDup = (yearId: string, typeId: string, ignoreId?: string) =>
    semesters.some(s => s.id !== ignoreId && s.year_id === yearId && s.type_id === typeId);

  const handleAddYear = async () => {
    const val = parseInt(newYear);
    if (isNaN(val) || val < 2026 || val > 2100) {
      toast.error("Please enter a valid year between 2026 and 2100");
      return;
    }
    if (yearDup(val)) {
      toast.error(`Year ${val} already exists — duplicate years aren't allowed.`);
      return;
    }
    try {
      await addYear(val);
      setNewYear("");
      toast.success(`Year ${val} added`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to add year");
    }
  };

  const handleAddType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    if (typeDup(name)) {
      toast.error(`Semester type "${name}" already exists — duplicate types aren't allowed.`);
      return;
    }
    try {
      await addSemesterType(name);
      setNewTypeName("");
      toast.success(`Semester type "${name}" added`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to add semester type");
    }
  };

  const handleCreateSemester = async () => {
    if (!selectedYearId || !selectedTypeId) {
      toast.error("Please select both a year and a type");
      return;
    }
    const year = years.find(y => y.id === selectedYearId);
    const type = semester_types.find(t => t.id === selectedTypeId);
    if (!year || !type) return;

    const name = `${type.name} ${year.value}`;
    if (semesterDup(selectedYearId, selectedTypeId)) {
      toast.error(`"${name}" already exists — this year and type combination is already a semester.`);
      return;
    }
    try {
      await addSemester({
        name,
        year_id: selectedYearId,
        type_id: selectedTypeId,
        is_active: semesters.length === 0
      });
      toast.success(`Semester "${name}" created`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create semester");
    }
  };

  const toggleActive = async (id: string) => {
    await updateSemester(id, { is_active: true });
    toast.success("Active semester updated");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Semester Settings"
        subtitle="Manage academic years, semester types, and active sessions"
      />

      <Tabs defaultValue="semesters" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="semesters">Semesters</TabsTrigger>
          <TabsTrigger value="years">Years</TabsTrigger>
          <TabsTrigger value="types">Types</TabsTrigger>
        </TabsList>

        {/* Semesters Tab */}
        <TabsContent value="semesters" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Create New Semester</CardTitle>
              <CardDescription>Combine a year and a type to create a specific semester session.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-end gap-4">
              <div className="grid gap-2 flex-1">
                <Label>Year</Label>
                <Select value={selectedYearId} onValueChange={setSelectedYearId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y.id} value={y.id}>{y.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 flex-1">
                <Label>Semester Type</Label>
                <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {semester_types.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateSemester}>
                <Plus className="h-4 w-4 mr-2" />
                Create Semester
              </Button>
            </CardContent>
            {selectedYearId && selectedTypeId && semesterDup(selectedYearId, selectedTypeId) && (
              <p className="text-[11px] text-destructive px-6 pb-3 -mt-2">
                This year and type combination is already a semester.
              </p>
            )}
          </Card>

          <div className="flex items-center gap-2 max-w-sm mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search semesters..."
              value={semesterSearch}
              onChange={(e) => setSemesterSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semester Name</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSemesters.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.year_ref?.value}</TableCell>
                    <TableCell>{s.type_ref?.name}</TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(s.id)}>
                          Set Active
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (await confirm({ title: "Delete Semester", description: `Are you sure you want to delete ${s.name}? This cannot be undone.`, destructive: true })) {
                            await deleteSemester(s.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Years Tab */}
        <TabsContent value="years" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Academic Year</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-4">
              <div className="grid gap-2 flex-1 max-w-xs">
                <Label>Year</Label>
                <Input
                  type="number"
                  placeholder="2026"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                />
                {newYear && !isNaN(parseInt(newYear)) && yearDup(parseInt(newYear)) && (
                  <p className="text-[11px] text-destructive">Year {parseInt(newYear)} already exists</p>
                )}
              </div>
              <Button onClick={handleAddYear}>Add Year</Button>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 max-w-sm mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search years..." 
              value={yearSearch}
              onChange={(e) => setYearSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year Value</TableHead>
                  <TableHead>Used In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredYears.map((y) => (
                  <TableRow key={y.id}>
                    <TableCell className="font-medium">{y.value}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {semesters.filter(s => s.year_id === y.id).length} semesters
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (await confirm({ title: "Delete Year", description: `Delete year ${y.value}?`, destructive: true })) {
                            await deleteYear(y.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Types Tab */}
        <TabsContent value="types" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Add Semester Type</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-4">
              <div className="grid gap-2 flex-1 max-w-xs">
                <Label>Type Name</Label>
                <Input
                  placeholder="e.g. Winter, Summer, Special"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                />
                {newTypeName.trim() && typeDup(newTypeName.trim()) && (
                  <p className="text-[11px] text-destructive">"{newTypeName.trim()}" already exists</p>
                )}
              </div>
              <Button onClick={handleAddType}>Add Type</Button>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 max-w-sm mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search types..." 
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Used In</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {semesters.filter(s => s.type_id === t.id).length} semesters
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (await confirm({ title: "Delete Type", description: `Delete semester type "${t.name}"?`, destructive: true })) {
                            await deleteSemesterType(t.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
