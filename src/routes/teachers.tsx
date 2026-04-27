import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/features/teachers/TeachersPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/teachers")({
  head: () => ({ meta: [{ title: "Teachers · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <TeachersPage />
    </AppShell>
  ),
});
