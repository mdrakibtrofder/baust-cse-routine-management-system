import { createFileRoute } from "@tanstack/react-router";
import { SemesterSettingsPage } from "@/features/settings/SemesterSettingsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/semester-settings")({
  head: () => ({ meta: [{ title: "Semester Settings · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <SemesterSettingsPage />
    </AppShell>
  ),
});
