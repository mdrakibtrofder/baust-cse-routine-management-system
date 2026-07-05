import { createFileRoute } from "@tanstack/react-router";
import { LockedClassesPage } from "@/features/locked-classes/LockedClassesPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/locked-classes")({
  head: () => ({ meta: [{ title: "Locked Classes · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <LockedClassesPage />
    </AppShell>
  ),
});
