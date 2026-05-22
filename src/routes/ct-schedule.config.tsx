import { createFileRoute } from "@tanstack/react-router";
import { CTScheduleConfigPage } from "@/features/ct-schedule/CTSchedulePage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/config")({
  head: () => ({ meta: [{ title: "CT Schedule Configuration · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTScheduleConfigPage />
    </AppShell>
  ),
});
