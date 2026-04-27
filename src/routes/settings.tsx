import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});
