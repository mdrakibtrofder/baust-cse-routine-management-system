import { createFileRoute } from "@tanstack/react-router";
import { CTSchedulePage } from "@/features/ct-schedule/CTSchedulePage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule")({
  head: () => ({ meta: [{ title: "CT Schedule · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTSchedulePage />
    </AppShell>
  ),
});
