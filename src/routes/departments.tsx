import { createFileRoute } from "@tanstack/react-router";
import { DepartmentsPage } from "@/features/departments/DepartmentsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/departments")({
  head: () => ({ meta: [{ title: "Departments · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <DepartmentsPage />
    </AppShell>
  ),
});
