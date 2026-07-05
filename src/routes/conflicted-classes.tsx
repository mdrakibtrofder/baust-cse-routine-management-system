import { createFileRoute } from "@tanstack/react-router";
import { ConflictedClassesPage } from "@/features/conflicted-classes/ConflictedClassesPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/conflicted-classes")({
  head: () => ({ meta: [{ title: "Conflicted Classes · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <ConflictedClassesPage />
    </AppShell>
  ),
});
