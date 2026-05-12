import { createFileRoute } from "@tanstack/react-router";
import { RoutineGeneratorPage } from "@/features/routine/RoutineGeneratorPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/generate-routine")({
  component: () => (
    <AppShell>
      <RoutineGeneratorPage />
    </AppShell>
  ),
});
