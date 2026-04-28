import { createFileRoute } from "@tanstack/react-router";
import { RoutinePage } from "@/features/routine/RoutinePage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/routine")({
  head: () => ({ meta: [{ title: "Routine View · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <RoutinePage />
    </AppShell>
  ),
});
