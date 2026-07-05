import { createFileRoute } from "@tanstack/react-router";
import { PriorityClassesPage } from "@/features/priority-classes/PriorityClassesPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/priority-classes")({
  head: () => ({ meta: [{ title: "Priority Classes · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <PriorityClassesPage />
    </AppShell>
  ),
});
